// Development Reverse Proxy
// Mirrors production nginx setup for local development
// Routes both Next.js app and device-server through a single entry point

const http = require('http');
const { createProxyMiddleware } = require('http-proxy-middleware');
const express = require('express');

const app = express();
const PORT = process.env.DEV_PROXY_PORT || 8080;
const NEXT_APP_URL = process.env.NEXT_APP_URL || 'http://localhost:3000';
const DEVICE_SERVER_URL = process.env.DEVICE_SERVER_URL || 'http://localhost:9211';

console.log('🚀 [Dev Proxy] Starting development reverse proxy...');
console.log(`   Port: ${PORT}`);
console.log(`   Next.js App: ${NEXT_APP_URL}`);
console.log(`   Device Server: ${DEVICE_SERVER_URL}`);
console.log('');

// Proxy configuration for Next.js app (main routes)
const nextAppProxy = createProxyMiddleware({
  target: NEXT_APP_URL,
  changeOrigin: true,
  ws: true, // Enable WebSocket support
  logLevel: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
  onProxyReq: (proxyReq, req, res) => {
    // Log proxied requests in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`📥 [Dev Proxy] → Next.js: ${req.method} ${req.url}`);
    }
  },
  onError: (err, req, res) => {
    console.error(`❌ [Dev Proxy] Next.js proxy error:`, err.message);
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Proxy error', 
        message: 'Next.js app is not running. Start it with: npm run dev' 
      });
    }
  },
});

// Proxy configuration for device-server (Socket.IO and REST API)
const deviceServerProxy = createProxyMiddleware({
  target: DEVICE_SERVER_URL,
  changeOrigin: true,
  ws: true, // Enable WebSocket support for Socket.IO
  logLevel: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
  onProxyReq: (proxyReq, req, res) => {
    // Log proxied requests in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`📥 [Dev Proxy] → Device Server: ${req.method} ${req.url}`);
    }
  },
  onError: (err, req, res) => {
    console.error(`❌ [Dev Proxy] Device server proxy error:`, err.message);
    if (!res.headersSent) {
      res.status(503).json({ 
        error: 'Service unavailable', 
        message: 'Device server is not running. Start it with: npm run dev:device' 
      });
    }
  },
});

// Route: Device server Socket.IO (must come before general routes)
app.use('/socket.io', deviceServerProxy);

// Route: Device server REST API endpoints
app.use('/devices', deviceServerProxy);
app.use('/api/health', deviceServerProxy);
app.use('/api/command', deviceServerProxy);
app.use('/api/socket-status', deviceServerProxy);

// Route: All other routes to Next.js app
app.use('/', nextAppProxy);

// Create HTTP server for WebSocket support
const server = http.createServer(app);

// Handle WebSocket upgrades
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  
  // Route Socket.IO WebSocket upgrades to device-server
  if (url.pathname.startsWith('/socket.io')) {
    console.log(`🔌 [Dev Proxy] WebSocket upgrade: ${url.pathname} → Device Server`);
    deviceServerProxy.upgrade(req, socket, head);
  } else {
    // Route other WebSocket upgrades to Next.js app
    console.log(`🔌 [Dev Proxy] WebSocket upgrade: ${url.pathname} → Next.js`);
    nextAppProxy.upgrade(req, socket, head);
  }
});

// Error handling
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ [Dev Proxy] Port ${PORT} is already in use!`);
    console.error(`   Try using a different port: DEV_PROXY_PORT=8081 npm run dev:proxy`);
    process.exit(1);
  } else {
    console.error(`❌ [Dev Proxy] Server error:`, err);
    process.exit(1);
  }
});

// Start server
server.listen(PORT, () => {
  console.log(`✅ [Dev Proxy] Development proxy running on http://localhost:${PORT}`);
  console.log('');
  console.log('📋 [Dev Proxy] Routing:');
  console.log(`   / → Next.js App (${NEXT_APP_URL})`);
  console.log(`   /socket.io → Device Server (${DEVICE_SERVER_URL})`);
  console.log(`   /devices → Device Server (${DEVICE_SERVER_URL})`);
  console.log(`   /api/health → Device Server (${DEVICE_SERVER_URL})`);
  console.log(`   /api/command/* → Device Server (${DEVICE_SERVER_URL})`);
  console.log('');
  console.log('💡 [Dev Proxy] Access your app at: http://localhost:' + PORT);
  console.log('   Make sure Next.js app and device-server are running!');
  console.log('   Run: npm run dev:all (to start all services)');
});

