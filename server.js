const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { initializeSocketIO } = require("./lib/socket/server.js");

const dev = process.env.NODE_ENV !== "production";
// Use localhost in dev mode to avoid Next.js chunk loading issues
// In production, you can set HOSTNAME env var to "0.0.0.0" for network access
const hostname = process.env.HOSTNAME || (dev ? "localhost" : "0.0.0.0");
const port = parseInt(process.env.PORT || "3000", 10);

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

