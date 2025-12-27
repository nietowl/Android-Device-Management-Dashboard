/**
 * Unified Socket.IO connection utility
 * Provides consistent connection handling, error management, and fallback mechanisms
 */

import { io, Socket } from "socket.io-client";

export interface SocketConnectionOptions {
  url?: string;
  path?: string;
  transports?: ("websocket" | "polling")[];
  timeout?: number;
  reconnectionAttempts?: number;
  reconnectionDelay?: number;
  reconnectionDelayMax?: number;
  onConnect?: () => void;
  onDisconnect?: (reason: string) => void;
  onError?: (error: Error) => void;
  onReconnectAttempt?: (attemptNumber: number) => void;
  onReconnectFailed?: () => void;
}

export interface SocketConnectionStatus {
  isConnected: boolean;
  socketId: string | null;
  transport: string | null;
  error: string | null;
  reconnectAttempts: number;
}

/**
 * Creates a Socket.IO connection with improved error handling and diagnostics
 */
export function createSocketConnection(options: SocketConnectionOptions = {}): Socket {
  const {
    url,
    path = "/socket.io",
    transports = ["websocket", "polling"],
    timeout = 20000,
    reconnectionAttempts = Infinity,
    reconnectionDelay = 1000,
    reconnectionDelayMax = 5000,
    onConnect,
    onDisconnect,
    onError,
    onReconnectAttempt,
    onReconnectFailed,
  } = options;

  // Determine socket URL
  const socketUrl = url || 
    process.env.NEXT_PUBLIC_DEVICE_SERVER_URL || 
    (typeof window !== 'undefined' ? window.location.origin : '') ||
    "http://localhost:9211";

  console.log(`🔌 [Socket Connection] Creating connection to: ${socketUrl}`);
  console.log(`   Path: ${path}`);
  console.log(`   Transports: ${transports.join(", ")}`);
  console.log(`   Origin: ${typeof window !== 'undefined' ? window.location.origin : 'N/A'}`);

  const socket = io(socketUrl, {
    path,
    transports,
    reconnection: true,
    reconnectionDelay,
    reconnectionDelayMax,
    reconnectionAttempts,
    timeout,
    forceNew: false,
    upgrade: true,
    extraHeaders: typeof window !== 'undefined' ? {
      'Origin': window.location.origin,
    } : {},
  });

  // Connection event handlers
  socket.on("connect", () => {
    console.log(`✅ [Socket Connection] Connected successfully: ${socket.id}`);
    console.log(`   Transport: ${socket.io.engine.transport.name}`);
    console.log(`   URL: ${socketUrl}`);
    onConnect?.();
  });

  socket.on("disconnect", (reason) => {
    console.log(`🔌 [Socket Connection] Disconnected: ${reason}`);
    console.log(`   Socket ID: ${socket.id || 'N/A'}`);
    onDisconnect?.(reason);
  });

  socket.on("connect_error", (error) => {
    const errorAny = error as any;
    const errorDetails = {
      message: error.message,
      type: errorAny.type || 'unknown',
      description: errorAny.description || undefined,
      context: errorAny.context || undefined,
      url: socketUrl,
      origin: typeof window !== 'undefined' ? window.location.origin : 'N/A',
    };

    console.error(`❌ [Socket Connection] Connection error:`, errorDetails);
    
    // Provide specific error guidance
    const errorType = errorAny.type;
    if (process.env.NODE_ENV === 'development') {
      if (error.message?.includes("timeout") || errorType === "TransportError") {
        console.error(`⏱️ [Socket Connection] Connection timeout`);
        console.error(`   Possible causes:`);
        console.error(`   - Server at ${socketUrl} is not running`);
        console.error(`   - Firewall blocking connection`);
        console.error(`   - Network connectivity issues`);
        console.error(`   Fix: Ensure device server is running on port 9211`);
      } else if (error.message?.includes("xhr poll error") || error.message?.includes("polling error")) {
        console.error(`🔄 [Socket Connection] Polling error`);
        console.error(`   Possible causes:`);
        console.error(`   - CORS configuration blocking requests`);
        console.error(`   - Server not accessible from this origin`);
        console.error(`   Fix: Check ALLOWED_ORIGINS includes: ${typeof window !== 'undefined' ? window.location.origin : 'your origin'}`);
      } else if (error.message?.includes("websocket error") || error.message?.includes("WebSocket")) {
        console.error(`🔌 [Socket Connection] WebSocket error - will fallback to polling`);
      } else if (error.message?.includes("CORS") || error.message?.includes("Not allowed")) {
        console.error(`🚫 [Socket Connection] CORS error`);
        console.error(`   Your origin: ${typeof window !== 'undefined' ? window.location.origin : 'N/A'}`);
        console.error(`   Fix: Add your origin to ALLOWED_ORIGINS`);
      } else if (error.message?.includes("ECONNREFUSED")) {
        console.error(`🚫 [Socket Connection] Connection refused`);
        console.error(`   Server at ${socketUrl} is not running or not accessible`);
        console.error(`   Fix: Start device server with: npm run dev:device`);
      } else {
        console.error(`❓ [Socket Connection] Unknown error - check server logs`);
      }
    }

    onError?.(error);
  });

  socket.on("reconnect_attempt", (attemptNumber) => {
    console.log(`🔄 [Socket Connection] Reconnection attempt ${attemptNumber}`);
    onReconnectAttempt?.(attemptNumber);
  });

  socket.on("reconnect_failed", () => {
    if (process.env.NODE_ENV === 'development') {
      console.error(`❌ [Socket Connection] Reconnection failed - server may be down`);
      console.error(`   Server URL: ${socketUrl}`);
      console.error(`   Check if device server is running`);
    }
    onReconnectFailed?.();
  });

  socket.on("reconnect", (attemptNumber) => {
    console.log(`✅ [Socket Connection] Reconnected after ${attemptNumber} attempts`);
  });

  return socket;
}

/**
 * Checks if the socket server is accessible
 */
export async function checkSocketServerHealth(url?: string): Promise<boolean> {
  const serverUrl = url || 
    process.env.NEXT_PUBLIC_DEVICE_SERVER_URL || 
    "http://localhost:9211";
  
  const healthUrl = `${serverUrl}/api/health`;
  
  try {
    const response = await fetch(healthUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      // Add timeout to prevent hanging
      signal: AbortSignal.timeout(5000),
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log(`✅ [Socket Health Check] Server is healthy:`, data);
      return true;
    } else {
      console.warn(`⚠️ [Socket Health Check] Server returned status: ${response.status}`);
      return false;
    }
  } catch (error: any) {
    console.warn(`⚠️ [Socket Health Check] Server not accessible:`, error.message);
    return false;
  }
}

/**
 * Gets socket connection status
 */
export function getSocketStatus(socket: Socket | null): SocketConnectionStatus {
  if (!socket) {
    return {
      isConnected: false,
      socketId: null,
      transport: null,
      error: "Socket not initialized",
      reconnectAttempts: 0,
    };
  }

  const ioManager = socket.io as any;
  return {
    isConnected: socket.connected,
    socketId: socket.id || null,
    transport: socket.io?.engine?.transport?.name || null,
    error: null,
    reconnectAttempts: ioManager?._reconnecting ? (ioManager._reconnectionAttempts || 0) : 0,
  };
}

