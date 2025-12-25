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
    const result = dotenv.config({ path: envProductionPath, override: true });
    if (!result.error) {
      console.log("✅ Environment variables loaded from .env.production");
      dotenvLoaded = true;
    } else if (result.error.code !== "ENOENT") {
      console.warn("⚠️ Error loading .env.production:", result.error.message);
    }
  }
  
  if (!dotenvLoaded && fs.existsSync(envLocalPath)) {
    const result = dotenv.config({ path: envLocalPath, override: true });
    if (!result.error) {
      console.log("✅ Environment variables loaded from .env.local");
      dotenvLoaded = true;
    } else if (result.error.code !== "ENOENT") {
      console.warn("⚠️ Error loading .env.local:", result.error.message);
    }
  }
  
  if (!dotenvLoaded && fs.existsSync(envPath)) {
    const result = dotenv.config({ path: envPath, override: true });
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
const { initializeSocketIO } = require("./lib/socket/server.js");

const dev = process.env.NODE_ENV !== "production";
// Use localhost in dev mode to avoid Next.js chunk loading issues
// In production, you can set HOSTNAME env var to "0.0.0.0" for network access
const hostname = process.env.HOSTNAME || (dev ? "localhost" : "0.0.0.0");
const port = parseInt(process.env.PORT || "3000", 10);

// Debug: Log the port being used
console.log(`🔍 [DEBUG] PORT from environment: ${process.env.PORT || 'not set (using default 3000)'}`);
console.log(`🔍 [DEBUG] Resolved port: ${port}`);

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

