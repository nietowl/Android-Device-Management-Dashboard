const { Server: HTTPServer } = require("http");
const { Server: SocketIOServer } = require("socket.io");
const { createClient } = require("@supabase/supabase-js");

let io = null;
const clients = new Map(); // uuid → { socket, socketId, info, downloads, userId }

// Initialize Supabase client for device auth secret validation
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;
if (supabaseUrl && supabaseServiceKey) {
  supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  console.log("✅ [Socket Server] Supabase client initialized for License ID validation");
} else {
  console.warn("⚠️ [Socket Server] Supabase credentials not found. Device authentication will be disabled.");
}

// Note: Device authentication uses License ID (stored per-user in user_profiles.license_id)
// No global DEVICE_AUTH_SECRET environment variable is required

function initializeSocketIO(httpServer) {
  if (io) {
    return io;
  }

  // CORS configuration - restrict to specific origins for security
  const allowedOrigins = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
    : process.env.NEXT_PUBLIC_APP_URL 
      ? [process.env.NEXT_PUBLIC_APP_URL]
      : ['http://localhost:3000']; // Default to localhost in development

  io = new SocketIOServer(httpServer, {
    path: "/api/socket.io",
    cors: {
      origin: (origin, callback) => {
        // In production, require origin for security
        const isProduction = process.env.NODE_ENV === "production";
        if (!origin) {
          if (isProduction) {
            console.warn(`⚠️ CORS: Blocked Socket.IO connection with no origin in production`);
            callback(new Error('Origin required in production'));
            return;
          }
          // Development only: Allow requests with no origin
          callback(null, true);
          return;
        }
        
        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          console.warn(`⚠️ CORS: Blocked Socket.IO connection from origin: ${origin}`);
          callback(new Error('Not allowed by CORS'));
        }
      },
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log(`🔌 New connection: ${socket.id}`);
    let isAuthenticated = false;
    let clientType = null; // 'device' or 'web'
    
    // Validate JWT token from socket handshake (for web clients)
    async function validateSocketAuth(authToken) {
      if (!supabase || !authToken) {
        return null;
      }

      try {
        // Verify JWT token with Supabase
        const { data: { user }, error } = await supabase.auth.getUser(authToken);
        
        if (error || !user) {
          console.warn(`⚠️ Socket authentication failed for ${socket.id}: ${error?.message || 'Invalid token'}`);
          return null;
        }

        // Check if user is active
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("id, license_id")
          .eq("id", user.id)
          .single();

        if (!profile) {
          console.warn(`⚠️ User profile not found for ${socket.id}: ${user.id}`);
          return null;
        }

        return { userId: user.id, user };
      } catch (error) {
        console.error(`❌ Error validating socket auth for ${socket.id}:`, error.message);
        return null;
      }
    }

    // Get auth token from handshake (for web clients)
    const authToken = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
    let authenticatedUser = null;

    // For web clients, validate authentication on connection
    // Device clients will authenticate via the "authenticate" event
    if (authToken) {
      authenticatedUser = await validateSocketAuth(authToken);
      if (authenticatedUser) {
        console.log(`✅ Socket authenticated: ${socket.id} (User: ${authenticatedUser.userId})`);
        clientType = "web";
      } else {
        // Don't disconnect immediately - allow device authentication to proceed
        // Web clients will be rejected when trying to join rooms
        console.warn(`⚠️ Socket authentication failed for ${socket.id}, will require auth for room joins`);
      }
    }

    // ===================== DEVICE AUTHENTICATION =====================
    socket.on("authenticate", async (data) => {
      const uuid = data?.uuid;
      const token = data?.token; // Device auth secret (stored per-user in database)

      if (!uuid || typeof uuid !== "string") {
        console.log(`❌ Device authentication failed: Invalid UUID for ${socket.id}`);
        socket.emit("auth-failed", { error: "Invalid UUID" });
        socket.disconnect(true);
        return;
      }

      if (!token || typeof token !== "string" || token.trim().length === 0) {
        console.log(`❌ Device authentication failed: Invalid token for ${socket.id}`);
        socket.emit("auth-failed", { error: "Invalid device auth secret" });
        socket.disconnect(true);
        return;
      }

      // Validate License ID against database
      // License ID is used as the device auth secret (stored per-user in user_profiles table)
      let userId = null;
      if (supabase) {
        try {
          // Validate token format first (License ID: 26 characters, 25 alphanumeric + "=")
          if (!token || typeof token !== "string" || token.length !== 26 || !/^[A-Za-z0-9]{25}=$/.test(token)) {
            console.log(`❌ Device authentication failed: Invalid token format for ${socket.id}`);
            socket.emit("auth-failed", { error: "Invalid token format - must be License ID (26 characters)" });
            socket.disconnect(true);
            return;
          }

          const { data: foundUserId, error } = await supabase.rpc("validate_license_id_for_device", {
            license_id_to_validate: token,
          });

          if (error) {
            console.error(`❌ Error validating License ID:`, error.message);
            socket.emit("auth-failed", { error: "Authentication service error" });
            socket.disconnect(true);
            return;
          }

          if (foundUserId) {
            userId = foundUserId;
            console.log(`✅ License ID validated for user: ${userId}`);
          } else {
            console.log(`❌ Device authentication failed: Invalid License ID for ${socket.id}`);
            socket.emit("auth-failed", { error: "Invalid License ID or user inactive" });
            socket.disconnect(true);
            return;
          }
        } catch (error) {
          console.error(`❌ Exception validating License ID:`, error.message);
          socket.emit("auth-failed", { error: "Authentication service error" });
          socket.disconnect(true);
          return;
        }
      } else {
        console.error("❌ Supabase not configured - device authentication cannot proceed");
        socket.emit("auth-failed", { error: "Server configuration error: Supabase not configured" });
        socket.disconnect(true);
        return;
      }

      isAuthenticated = true;
      clientType = "device";

      // Replace old client if exists
      if (clients.has(uuid)) {
        const oldClient = clients.get(uuid);
        try {
          oldClient.socket.disconnect(true);
        } catch {}
        console.log(`♻️ Replaced old client for ${uuid}`);
      }

      clients.set(uuid, {
        socket,
        socketId: socket.id,
        info: null,
        downloads: {},
        userId: userId,
      });
      socket.uuid = uuid;
      socket.clientType = "device";

      console.log(`✅ Device authenticated: ${uuid} (User: ${userId}, Socket: ${socket.id})`);
      socket.emit("auth-success", { uuid });

      // Register per-UUID event listeners for device
      registerDeviceEvents(socket, uuid);
    });

    // ===================== DEVICE REGISTRATION =====================
    socket.on("add-new-device", (data) => {
      const client = clients.get(socket.uuid);
      if (client) {
        client.info = data;
        console.log(`📱 Device registered: ${socket.uuid}`, data);

        // Broadcast device registration to web clients
        io.emit("device_registered", {
          uuid: socket.uuid,
          info: data,
          timestamp: new Date().toISOString(),
        });
      }
    });

    // ===================== WEB CLIENT CONNECTIONS =====================
    // Full authentication with JWT token validation via Supabase
    // Note: Device clients authenticate via "authenticate" event above
    
    socket.on("join_user_room", async (userId) => {
      if (!clientType) clientType = "web";
      
      // Require authentication for joining user rooms
      if (!authenticatedUser) {
        const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
        authenticatedUser = await validateSocketAuth(token);
        
        if (!authenticatedUser) {
          socket.emit("auth-required", { error: "Authentication required to join user room" });
          return;
        }
      }

      // Validate userId matches authenticated user
      if (authenticatedUser.userId !== userId) {
        console.warn(`⚠️ User ${socket.id} attempted to join room for different user: ${userId} (authenticated as ${authenticatedUser.userId})`);
        socket.emit("auth-failed", { error: "Unauthorized: Cannot join room for different user" });
        return;
      }
      
      // Validate userId format (should be UUID)
      if (!userId || typeof userId !== "string" || userId.length > 100) {
        console.warn(`⚠️ Invalid userId format from ${socket.id}: ${userId}`);
        return;
      }
      
      // Basic UUID format validation
      if (!/^[a-f0-9-]{36}$/i.test(userId)) {
        console.warn(`⚠️ Invalid userId UUID format from ${socket.id}: ${userId}`);
        return;
      }
      
      socket.join(`user:${userId}`);
      console.log(`🌐 Web client ${socket.id} joined user room: user:${userId}`);
    });

    socket.on("join_device_room", async (deviceId) => {
      if (!clientType) clientType = "web";
      
      // Require authentication for joining device rooms
      if (!authenticatedUser) {
        const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
        authenticatedUser = await validateSocketAuth(token);
        
        if (!authenticatedUser) {
          socket.emit("auth-required", { error: "Authentication required to join device room" });
          return;
        }
      }

      // Validate deviceId format
      if (!deviceId || typeof deviceId !== "string" || deviceId.length > 100) {
        console.warn(`⚠️ Invalid deviceId format from ${socket.id}: ${deviceId}`);
        return;
      }
      
      // Allow alphanumeric, hyphens, and underscores only
      if (!/^[a-zA-Z0-9_-]+$/.test(deviceId)) {
        console.warn(`⚠️ Invalid deviceId characters from ${socket.id}: ${deviceId}`);
        return;
      }

      // Verify device ownership before allowing room join
      if (supabase) {
        const { data: device, error } = await supabase
          .from("devices")
          .select("id, user_id")
          .eq("id", deviceId)
          .single();

        if (error || !device) {
          console.warn(`⚠️ Device not found or access denied: ${deviceId} for user ${authenticatedUser.userId}`);
          socket.emit("auth-failed", { error: "Device not found or access denied" });
          return;
        }

        if (device.user_id !== authenticatedUser.userId) {
          console.warn(`⚠️ User ${authenticatedUser.userId} attempted to access device ${deviceId} owned by ${device.user_id}`);
          socket.emit("auth-failed", { error: "Unauthorized: Device access denied" });
          return;
        }
      }
      
      socket.join(`device:${deviceId}`);
      console.log(`🌐 Web client ${socket.id} joined device room: device:${deviceId}`);
    });

    socket.on("leave_device_room", (deviceId) => {
      socket.leave(`device:${deviceId}`);
      console.log(`🌐 Web client ${socket.id} left device room: device:${deviceId}`);
    });

    // ===================== DISCONNECT HANDLING =====================
    socket.on("disconnect", () => {
      console.log(`🔌 Disconnected: ${socket.id}`);
      const client = clients.get(socket.uuid);
      if (client?.downloads) {
        Object.values(client.downloads).forEach((dl) => {
          dl.stream?.end();
          dl.progressBar?.stop();
        });
      }
      if (socket.uuid) {
        clients.delete(socket.uuid);
        // Notify web clients that device went offline
        io.emit("device_disconnected", {
          uuid: socket.uuid,
          timestamp: new Date().toISOString(),
        });
      }
    });
  });

  // Make io and clients available globally for webhook route
  global.io = io;
  global.deviceClients = clients;

  return io;
}

// ===================== DEVICE EVENT REGISTRATION =====================
function registerDeviceEvents(socket, uuid) {
  // Command result from device
  socket.on(`command-result-${uuid}`, (data) => {
    console.log(`📥 [${uuid}] Command result:`, data);

    // Forward to webhook endpoint (internal call)
    forwardDeviceEventToWebhook({
      event: "command_result",
      device_id: uuid,
      timestamp: new Date().toISOString(),
      data: data,
    });

    // Broadcast to web clients listening to this device
    io.to(`device:${uuid}`).emit("device_event", {
      event: "command_result",
      device_id: uuid,
      timestamp: new Date().toISOString(),
      data: data,
    });
  });

  // Device info update
  socket.on(`getinfo-${uuid}`, (data) => {
    console.log(`📥 [${uuid}] Device info:`, data);

    // Forward to webhook endpoint
    forwardDeviceEventToWebhook({
      event: "device_info",
      device_id: uuid,
      timestamp: new Date().toISOString(),
      data: data,
    });

    // Broadcast to web clients
    io.to(`device:${uuid}`).emit("device_event", {
      event: "device_info",
      device_id: uuid,
      timestamp: new Date().toISOString(),
      data: data,
    });
  });

  // Generic device event handler
  socket.on(`device-event-${uuid}`, (data) => {
    console.log(`📥 [${uuid}] Device event:`, data);

    const eventType = data.event || "device_event";
    
    // Forward to webhook endpoint
    forwardDeviceEventToWebhook({
      event: eventType,
      device_id: uuid,
      timestamp: data.timestamp || new Date().toISOString(),
      data: data.data || data,
    });

    // Broadcast to web clients
    io.to(`device:${uuid}`).emit("device_event", {
      event: eventType,
      device_id: uuid,
      timestamp: data.timestamp || new Date().toISOString(),
      data: data.data || data,
    });
  });
}

// Forward device events to webhook endpoint internally
function forwardDeviceEventToWebhook(eventData) {
  // This simulates calling the webhook endpoint internally
  // In production, you might want to use an internal HTTP call or direct function call
  if (global.io) {
    // Emit to webhook processing channel
    global.io.emit("webhook_event", eventData);
  }
}

// Function to send command to device
function sendCommandToDevice(uuid, command, data) {
  const client = clients.get(uuid);
  if (client && client.socket) {
    client.socket.emit(command, data);
    return true;
  }
  return false;
}

// Get device client info
function getDeviceClient(uuid) {
  return clients.get(uuid);
}

// Get all connected devices
function getAllDevices() {
  const deviceList = [];
  clients.forEach((client, uuid) => {
    deviceList.push({
      uuid,
      socketId: client.socketId,
      info: client.info,
      isOnline: client.socket?.connected || false,
    });
  });
  return deviceList;
}

function getSocketIO() {
  return io;
}

module.exports = {
  initializeSocketIO,
  getSocketIO,
  sendCommandToDevice,
  getDeviceClient,
  getAllDevices,
};

