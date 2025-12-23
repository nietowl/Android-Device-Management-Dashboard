// Load environment variables from .env.local, .env.production, or .env file
// Use process.cwd() for consistent path resolution (more reliable than __dirname)
const fs = require("fs");
const path = require("path");
let dotenvLoaded = false;

try {
  const dotenv = require("dotenv");
  const projectRoot = process.cwd();
  const isProduction = process.env.NODE_ENV === "production";
  
  // Priority order:
  // 1. Production: .env.production
  // 2. Development: .env.local
  // 3. Fallback: .env
  const envProductionPath = path.join(projectRoot, ".env.production");
  const envLocalPath = path.join(projectRoot, ".env.local");
  const envPath = path.join(projectRoot, ".env");
  
  if (isProduction && fs.existsSync(envProductionPath)) {
    const result = dotenv.config({ path: envProductionPath });
    if (!result.error) {
      console.log("✅ Environment variables loaded from .env.production");
      dotenvLoaded = true;
    } else if (result.error.code !== "ENOENT") {
      console.warn("⚠️ Error loading .env.production:", result.error.message);
    }
  }
  
  if (!dotenvLoaded && fs.existsSync(envLocalPath)) {
    const result = dotenv.config({ path: envLocalPath });
    if (!result.error) {
      console.log("✅ Environment variables loaded from .env.local");
      dotenvLoaded = true;
    } else if (result.error.code !== "ENOENT") {
      console.warn("⚠️ Error loading .env.local:", result.error.message);
    }
  }
  
  if (!dotenvLoaded && fs.existsSync(envPath)) {
    const result = dotenv.config({ path: envPath });
    if (!result.error) {
      console.log("✅ Environment variables loaded from .env");
      dotenvLoaded = true;
    } else if (result.error.code !== "ENOENT") {
      console.warn("⚠️ Error loading .env:", result.error.message);
    }
  }
  
  if (!dotenvLoaded) {
    console.warn("⚠️ No .env file found. Using system environment variables.");
    if (isProduction) {
      console.warn("   Production mode: Expected .env.production file");
    }
  }
} catch (error) {
  if (error.code === "MODULE_NOT_FOUND") {
    console.warn("⚠️ dotenv package not installed. Run: npm install");
    console.warn("   Using system environment variables only.");
  } else {
    console.warn("⚠️ Error loading dotenv:", error.message);
    console.warn("   Using system environment variables");
  }
}

const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
// fs and path already required above

// Load Socket.IO server with error handling
let initializeSocketIO;
// Determine the project root - use process.cwd() as it's more reliable than __dirname
// __dirname can be wrong if the file is required from elsewhere
const projectRoot = process.cwd();
const socketServerPath = path.join(projectRoot, "lib", "socket", "server.js");

// Check if socket server file exists

if (!fs.existsSync(socketServerPath)) {
  console.error(`❌ Socket.IO server file not found`);
  console.error(`   Expected: ${socketServerPath}`);
  console.error(`   Project root: ${projectRoot}`);
  console.warn("⚠️ Socket.IO server not available - real-time features disabled");
  initializeSocketIO = (httpServer) => {
    console.warn("⚠️ Socket.IO server not available - real-time features disabled");
  };
} else {
  try {
    // Use absolute path for require to avoid path resolution issues
    const socketServer = require(socketServerPath);
    initializeSocketIO = socketServer.initializeSocketIO;
    if (!initializeSocketIO) {
      throw new Error("initializeSocketIO function not exported from socket server");
    }
    console.log("✅ Socket.IO server module loaded");
  } catch (error) {
    console.error("❌ Failed to load Socket.IO server:", error.message);
    console.error("   Error code:", error.code);
    if (error.requireStack) {
      console.error("   Require stack:", error.requireStack);
    }
    console.error(`   Tried to require: ${socketServerPath}`);
    
    // Create a dummy function to allow server to start without Socket.IO
    initializeSocketIO = (httpServer) => {
      console.warn("⚠️ Socket.IO server not available - real-time features disabled");
    };
  }
}

const dev = process.env.NODE_ENV !== "production";
// Use localhost in dev mode to avoid Next.js chunk loading issues
// In production, you can set HOSTNAME env var to "0.0.0.0" for network access
const hostname = process.env.HOSTNAME || (dev ? "localhost" : "0.0.0.0");
const port = parseInt(process.env.PORT || "3000", 10);

// Validate environment variables in production
if (process.env.NODE_ENV === "production") {
  // Use process.cwd() for consistent path resolution
  const projectRoot = process.cwd();
  const envValidationJsPath = path.join(projectRoot, "lib", "utils", "env-validation.js");
  const envValidationTsPath = path.join(projectRoot, "lib", "utils", "env-validation.ts");
  
  let validationLoaded = false;
  
  // Try to load JavaScript version first (compiled)
  if (fs.existsSync(envValidationJsPath)) {
    try {
      const { validateEnvironment } = require(envValidationJsPath);
      validateEnvironment();
      validationLoaded = true;
      console.log("✅ Environment validation passed (using compiled module)");
    } catch (error) {
      console.warn("⚠️ Failed to run validation module:", error.message);
    }
  }
  
  // If TypeScript version exists but JS doesn't, or if loading failed, do basic validation
  if (!validationLoaded) {
    if (fs.existsSync(envValidationTsPath)) {
      console.warn("⚠️ Environment validation module is TypeScript (not compiled)");
    } else {
      console.warn("⚠️ Environment validation module not found");
    }
    console.warn("   Performing basic environment variable checks...");
    
    // Basic validation
    const requiredVars = [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY"
    ];
    
    const missing = requiredVars.filter(v => !process.env[v]);
    if (missing.length > 0) {
      console.error("❌ Missing required environment variables:", missing.join(", "));
      console.error("   Please check your .env.production file");
      process.exit(1);
    } else {
      console.log("✅ Basic environment validation passed");
    }
  }
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  console.log('✅ Next.js is ready');
  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error occurred handling", req.url, err);
      res.statusCode = 500;
      res.end("internal server error");
    }
  });

  // Initialize Socket.IO
  initializeSocketIO(httpServer);

  httpServer
    .once("error", (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, hostname, () => {
      const publicIP = process.env.PUBLIC_IP || hostname;
      console.log(`> Ready on http://${hostname}:${port}`);
      if (publicIP !== hostname && publicIP !== "localhost") {
        console.log(`> Public URL: http://${publicIP}:${port}`);
      }
      console.log(`> Socket.IO initialized on /api/socket.io`);
    });
}).catch((err) => {
  console.error('❌ Failed to prepare Next.js:', err);
  process.exit(1);
});

