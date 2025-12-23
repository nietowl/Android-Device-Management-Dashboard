"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { WebhookEvent } from "@/types";
import { createClientSupabase } from "@/lib/supabase/client";

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

    // Get authentication token from Supabase
    const getAuthToken = async () => {
      try {
        const supabase = createClientSupabase();
        const { data: { session } } = await supabase.auth.getSession();
        return session?.access_token || null;
      } catch (error) {
        console.error("Failed to get auth token:", error);
        return null;
      }
    };

    const initSocket = async () => {
      const authToken = await getAuthToken();
      const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "/api/socket.io";
      const newSocket = io(socketUrl, {
        path: "/api/socket.io",
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
        auth: {
          token: authToken,
        },
        extraHeaders: authToken ? {
          Authorization: `Bearer ${authToken}`,
        } : {},
      });

      newSocket.on("connect", () => {
        console.log("Socket connected:", newSocket.id);
        setIsConnected(true);

        // Join user room if userId is provided
        if (userId) {
          newSocket.emit("join_user_room", userId);
        }

        // Join device room if deviceId is provided
        if (deviceId) {
          newSocket.emit("join_device_room", deviceId);
        }
      });

      newSocket.on("disconnect", () => {
        console.log("Socket disconnected");
        setIsConnected(false);
      });

      newSocket.on("connect_error", (error) => {
        console.error("Socket connection error:", error);
      });

      newSocket.on("auth-required", () => {
        console.warn("Socket authentication required");
        setIsConnected(false);
      });

      newSocket.on("auth-failed", (data) => {
        console.error("Socket authentication failed:", data);
        setIsConnected(false);
      });

    // Listen for device events
    newSocket.on("device_event", (event: WebhookEvent) => {
      console.log("Device event received:", event);
      setLastEvent(event);
    });

    // Listen for device-specific events
    if (deviceId) {
      newSocket.on(`device:${deviceId}`, (event: WebhookEvent) => {
        console.log(`Device ${deviceId} event:`, event);
        setLastEvent(event);
      });
    }

      // Listen for general device events
      newSocket.on("device_events", (event: WebhookEvent) => {
        console.log("General device event:", event);
        setLastEvent(event);
      });

      socketRef.current = newSocket;
      setSocket(newSocket);
    };

    initSocket();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
        setIsConnected(false);
      }
    };
  }, [autoConnect, userId, deviceId]);

  const connect = async () => {
    if (!socketRef.current || socketRef.current.disconnected) {
      // Get authentication token
      const supabase = createClientSupabase();
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token || null;

      const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "/api/socket.io";
      const newSocket = io(socketUrl, {
        path: "/api/socket.io",
        transports: ["websocket", "polling"],
        auth: {
          token: authToken,
        },
        extraHeaders: authToken ? {
          Authorization: `Bearer ${authToken}`,
        } : {},
      });

      newSocket.on("connect", () => {
        setIsConnected(true);
        if (userId) newSocket.emit("join_user_room", userId);
        if (deviceId) newSocket.emit("join_device_room", deviceId);
      });

      newSocket.on("auth-required", () => {
        console.warn("Socket authentication required");
        setIsConnected(false);
      });

      newSocket.on("auth-failed", (data) => {
        console.error("Socket authentication failed:", data);
        setIsConnected(false);
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

