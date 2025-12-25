const { Server: HTTPServer } = require("http");
const { Server: SocketIOServer } = require("socket.io");
const { createClient } = require("@supabase/supabase-js");
const logger = require("../utils/logger");

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
  logger.log("✅ [Socket Server] Supabase client initialized for License ID validation");
} else {
  logger.warn("⚠️ [Socket Server] Supabase credentials not found. Device authentication will be disabled.");
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
      : ['http://localhost:3000', 'http://127.0.0.1:3000']; // Default to localhost in development

  logger.log(`🔧 Socket.IO CORS allowed origins:`, allowedOrigins);

  io = new SocketIOServer(httpServer, {
    path: "/api/socket.io",
    cors: {
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) {
          logger.log(`✅ Socket.IO: Allowing connection with no origin`);
          return callback(null, true);
        }
        
        // Check if origin is in allowed list
        if (allowedOrigins.includes(origin)) {
          logger.log(`✅ Socket.IO: Allowing connection from origin: ${origin}`);
          callback(null, true);
        } else {
          // In development, be more permissive
          const isDevelopment = process.env.NODE_ENV !== 'production';
          if (isDevelopment && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
            logger.log(`⚠️ Socket.IO: Allowing localhost origin in development: ${origin}`);
            callback(null, true);
          } else {
            logger.warn(`❌ Socket.IO CORS: Blocked connection from origin: ${origin}`);
            logger.warn(`   Allowed origins:`, allowedOrigins);
            callback(new Error('Not allowed by CORS'));
          }
        }
      },
      methods: ["GET", "POST"],
      credentials: true,
    },
    // Add connection timeout settings
    connectTimeout: 45000, // 45 seconds
    pingTimeout: 20000, // 20 seconds
    pingInterval: 25000, // 25 seconds
  });

  io.on("connection", (socket) => {
    logger.log(`🔌 New Socket.IO connection: ${socket.id} from ${socket.handshake.address}`);
    logger.log(`   Origin: ${socket.handshake.headers.origin || 'no origin'}`);
    logger.log(`   User-Agent: ${socket.handshake.headers['user-agent'] || 'unknown'}`);
    
    let isAuthenticated = false;
    let clientType = null; // 'device' or 'web'

    // ===================== DEVICE AUTHENTICATION =====================
    socket.on("authenticate", async (data) => {
      const uuid = data?.uuid;
      const token = data?.token; // Device auth secret (stored per-user in database)

      if (!uuid || typeof uuid !== "string") {
        logger.log(`❌ Device authentication failed: Invalid UUID for ${socket.id}`);
        socket.emit("auth-failed", { error: "Invalid UUID" });
        socket.disconnect(true);
        return;
      }

      if (!token || typeof token !== "string" || token.trim().length === 0) {
        logger.log(`❌ Device authentication failed: Invalid token for ${socket.id}`);
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
            logger.log(`❌ Device authentication failed: Invalid token format for ${socket.id}`);
            socket.emit("auth-failed", { error: "Invalid token format - must be License ID (26 characters)" });
            socket.disconnect(true);
            return;
          }

          const { data: foundUserId, error } = await supabase.rpc("validate_license_id_for_device", {
            license_id_to_validate: token,
          });

          if (error) {
            logger.error(`❌ Error validating License ID:`, error.message);
            socket.emit("auth-failed", { error: "Authentication service error" });
            socket.disconnect(true);
            return;
          }

          if (foundUserId) {
            userId = foundUserId;
            logger.log(`✅ License ID validated for user: ${userId}`);
          } else {
            logger.log(`❌ Device authentication failed: Invalid License ID for ${socket.id}`);
            socket.emit("auth-failed", { error: "Invalid License ID or user inactive" });
            socket.disconnect(true);
            return;
          }
        } catch (error) {
          logger.error(`❌ Exception validating License ID:`, error.message);
          socket.emit("auth-failed", { error: "Authentication service error" });
          socket.disconnect(true);
          return;
        }
      } else {
        logger.error("❌ Supabase not configured - device authentication cannot proceed");
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
        logger.log(`♻️ Replaced old client for ${uuid}`);
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

      logger.log(`✅ Device authenticated: ${uuid} (User: ${userId}, Socket: ${socket.id})`);
      socket.emit("auth-success", { uuid });

      // Register per-UUID event listeners for device
      registerDeviceEvents(socket, uuid);
    });

    // ===================== DEVICE REGISTRATION =====================
    socket.on("add-new-device", (data) => {
      const client = clients.get(socket.uuid);
      if (client) {
        client.info = data;
        logger.log(`📱 Device registered: ${socket.uuid}`, data);

        // Broadcast device registration to web clients
        io.emit("device_registered", {
          uuid: socket.uuid,
          info: data,
          timestamp: new Date().toISOString(),
        });
      }
    });

    // ===================== WEB CLIENT CONNECTIONS =====================
    // Web clients don't need authentication, they just join rooms
    socket.on("join_user_room", (userId) => {
      if (!clientType) clientType = "web";
      socket.join(`user:${userId}`);
      logger.log(`🌐 Web client ${socket.id} joined user room: user:${userId}`);
    });

    socket.on("join_device_room", (deviceId) => {
      if (!clientType) clientType = "web";
      socket.join(`device:${deviceId}`);
      logger.log(`🌐 Web client ${socket.id} joined device room: device:${deviceId}`);
    });

    socket.on("leave_device_room", (deviceId) => {
      socket.leave(`device:${deviceId}`);
      logger.log(`🌐 Web client ${socket.id} left device room: device:${deviceId}`);
    });

    // ===================== DISCONNECT HANDLING =====================
    socket.on("disconnect", () => {
      logger.log(`🔌 Disconnected: ${socket.id}`);
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
    logger.log(`📥 [${uuid}] Command result:`, data);

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
    logger.log(`📥 [${uuid}] Device info:`, data);

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
    logger.log(`📥 [${uuid}] Device event:`, data);

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

