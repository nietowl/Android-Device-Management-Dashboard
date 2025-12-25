"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { WebhookEvent } from "@/types";
import logger from "@/lib/utils/logger";

interface UseSocketOptions {
  userId?: string;
  deviceId?: string;
  autoConnect?: boolean;
}

interface UseSocketReturn {
  socket: Socket | null;
  isConnected: boolean;
  lastEvent: WebhookEvent | null;
  connect: () => void;
  disconnect: () => void;
  joinUserRoom: (userId: string) => void;
  joinDeviceRoom: (deviceId: string) => void;
  leaveDeviceRoom: (deviceId: string) => void;
}

export function useSocket(options: UseSocketOptions = {}): UseSocketReturn {
  const { userId, deviceId, autoConnect = true } = options;
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<WebhookEvent | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!autoConnect) return;

    // Get the current origin for proper socket URL
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 
                     (typeof window !== 'undefined' ? window.location.origin : '') || 
                     "/api/socket.io";
    
    logger.log(`🔌 [Socket Client] Connecting to: ${socketUrl}`);
    
    const newSocket = io(socketUrl, {
      path: "/api/socket.io",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity, // Keep trying to reconnect
      timeout: 20000, // 20 seconds connection timeout
      forceNew: false, // Reuse existing connection if available
      upgrade: true, // Allow transport upgrades
      // Add extra headers for debugging
      extraHeaders: typeof window !== 'undefined' ? {
        'Origin': window.location.origin,
      } : {},
    });

    newSocket.on("connect", () => {
      logger.log("✅ [Socket Client] Connected successfully:", newSocket.id);
      logger.log(`   Transport: ${newSocket.io.engine.transport.name}`);
      setIsConnected(true);

      // Join user room if userId is provided
      if (userId) {
        logger.log(`   Joining user room: user:${userId}`);
        newSocket.emit("join_user_room", userId);
      }

      // Join device room if deviceId is provided
      if (deviceId) {
        logger.log(`   Joining device room: device:${deviceId}`);
        newSocket.emit("join_device_room", deviceId);
      }
    });

    newSocket.on("disconnect", () => {
      logger.log("Socket disconnected");
      setIsConnected(false);
    });

    newSocket.on("connect_error", (error) => {
      logger.error("❌ [Socket Client] Connection error:", error);
      logger.error(`   Error message: ${error.message}`);
      logger.error(`   Error type: ${(error as any).type || 'unknown'}`);
      logger.error(`   Socket URL: ${socketUrl}`);
      logger.error(`   Current origin: ${typeof window !== 'undefined' ? window.location.origin : 'N/A'}`);
      setIsConnected(false);
      
      // Log specific error types
      const errorType = (error as any).type;
      if (error.message?.includes("timeout") || errorType === "TransportError") {
        logger.error("⏱️ Socket connection timeout - server may be unreachable or slow");
        logger.error("   Check if server.js is running and accessible");
      } else if (error.message?.includes("xhr poll error") || error.message?.includes("polling error")) {
        logger.error("🔄 Socket polling error - check CORS and server status");
        logger.error("   Verify CORS settings in lib/socket/server.js allow your origin");
      } else if (error.message?.includes("websocket error") || error.message?.includes("WebSocket")) {
        logger.error("🔌 WebSocket error - falling back to polling");
      } else if (error.message?.includes("CORS") || error.message?.includes("Not allowed")) {
        logger.error("🚫 CORS error - origin not allowed");
        logger.error("   Add your origin to ALLOWED_ORIGINS in .env.local");
      } else {
        logger.error("❓ Unknown connection error - check server logs");
      }
    });

    newSocket.on("reconnect_attempt", (attemptNumber) => {
      logger.log(`🔄 Socket reconnection attempt ${attemptNumber}`);
    });

    newSocket.on("reconnect_failed", () => {
      logger.error("❌ Socket reconnection failed - server may be down");
      setIsConnected(false);
    });

    // Listen for device events
    newSocket.on("device_event", (event: WebhookEvent) => {
      logger.log("Device event received:", event);
      setLastEvent(event);
    });

    // Listen for device-specific events
    if (deviceId) {
      newSocket.on(`device:${deviceId}`, (event: WebhookEvent) => {
        logger.log(`Device ${deviceId} event:`, event);
        setLastEvent(event);
      });
    }

    // Listen for general device events
    newSocket.on("device_events", (event: WebhookEvent) => {
      logger.log("General device event:", event);
      setLastEvent(event);
    });

    socketRef.current = newSocket;
    setSocket(newSocket);

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
        setIsConnected(false);
      }
    };
  }, [autoConnect, userId, deviceId]);

  const connect = () => {
    if (!socketRef.current || socketRef.current.disconnected) {
      const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "/api/socket.io";
      const newSocket = io(socketUrl, {
        path: "/api/socket.io",
        transports: ["websocket", "polling"],
      });

      newSocket.on("connect", () => {
        setIsConnected(true);
        if (userId) newSocket.emit("join_user_room", userId);
        if (deviceId) newSocket.emit("join_device_room", deviceId);
      });

      socketRef.current = newSocket;
      setSocket(newSocket);
    }
  };

  const disconnect = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setSocket(null);
      setIsConnected(false);
    }
  };

  const joinUserRoom = (userId: string) => {
    if (socketRef.current) {
      socketRef.current.emit("join_user_room", userId);
    }
  };

  const joinDeviceRoom = (deviceId: string) => {
    if (socketRef.current) {
      socketRef.current.emit("join_device_room", deviceId);
    }
  };

  const leaveDeviceRoom = (deviceId: string) => {
    if (socketRef.current) {
      socketRef.current.emit("leave_device_room", deviceId);
    }
  };

  return {
    socket,
    isConnected,
    lastEvent,
    connect,
    disconnect,
    joinUserRoom,
    joinDeviceRoom,
    leaveDeviceRoom,
  };
}

