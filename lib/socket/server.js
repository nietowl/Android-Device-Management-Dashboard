const { Server: HTTPServer } = require("http");
const { Server: SocketIOServer } = require("socket.io");

let io = null;
const AUTH_SECRET = process.env.DEVICE_AUTH_SECRET || "MySuperSecretToken";
const clients = new Map(); // uuid → { socket, socketId, info, downloads }

function initializeSocketIO(httpServer) {
  if (io) {
    return io;
  }

  io = new SocketIOServer(httpServer, {
    path: "/api/socket.io",
    cors: {
      origin: process.env.NEXT_PUBLIC_APP_URL || "*",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log(`🔌 New connection: ${socket.id}`);
    let isAuthenticated = false;
    let clientType = null; // 'device' or 'web'

    // ===================== DEVICE AUTHENTICATION =====================
    socket.on("authenticate", (data) => {
      const uuid = data?.uuid;
      if (data?.token === AUTH_SECRET && uuid) {
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
        });
        socket.uuid = uuid;
        socket.clientType = "device";

        console.log(`✅ Device authenticated: ${uuid} (${socket.id})`);
        socket.emit("auth-success");

        // Register per-UUID event listeners for device
        registerDeviceEvents(socket, uuid);
      } else {
        console.log(`❌ Device authentication failed for ${socket.id}`);
        socket.emit("auth-failed");
        socket.disconnect(true);
      }
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
    // Web clients don't need authentication, they just join rooms
    socket.on("join_user_room", (userId) => {
      if (!clientType) clientType = "web";
      socket.join(`user:${userId}`);
      console.log(`🌐 Web client ${socket.id} joined user room: user:${userId}`);
    });

    socket.on("join_device_room", (deviceId) => {
      if (!clientType) clientType = "web";
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

