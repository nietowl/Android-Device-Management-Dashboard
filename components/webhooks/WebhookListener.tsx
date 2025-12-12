"use client";

import { useEffect } from "react";
import { useSocket } from "@/lib/socket/client";
import { WebhookEvent } from "@/types";

interface WebhookListenerProps {
  userId?: string;
  deviceId?: string;
  onEvent?: (event: WebhookEvent) => void;
}

/**
 * Example component showing how to listen for webhook events via Socket.IO
 * 
 * Usage:
 * <WebhookListener 
 *   userId="user-123" 
 *   deviceId="device-456"
 *   onEvent={(event) => console.log("Received:", event)}
 * />
 */
export default function WebhookListener({
  userId,
  deviceId,
  onEvent,
}: WebhookListenerProps) {
  const { socket, isConnected, lastEvent, joinUserRoom, joinDeviceRoom } =
    useSocket({
      userId,
      deviceId,
      autoConnect: true,
    });

  useEffect(() => {
    if (!socket) return;

    // Join rooms if not already joined
    if (userId) {
      joinUserRoom(userId);
    }
    if (deviceId) {
      joinDeviceRoom(deviceId);
    }

    // Listen for device events
    const handleDeviceEvent = (event: WebhookEvent) => {
      console.log("Device event received:", event);
      onEvent?.(event);
    };

    socket.on("device_event", handleDeviceEvent);
    socket.on("device_events", handleDeviceEvent);

    if (deviceId) {
      socket.on(`device:${deviceId}`, handleDeviceEvent);
    }

    return () => {
      socket.off("device_event", handleDeviceEvent);
      socket.off("device_events", handleDeviceEvent);
      if (deviceId) {
        socket.off(`device:${deviceId}`, handleDeviceEvent);
      }
    };
  }, [socket, userId, deviceId, joinUserRoom, joinDeviceRoom, onEvent]);

  useEffect(() => {
    if (lastEvent && onEvent) {
      onEvent(lastEvent);
    }
  }, [lastEvent, onEvent]);

  return (
    <div className="text-sm text-gray-500">
      Socket.IO: {isConnected ? "Connected" : "Disconnected"}
      {lastEvent && (
        <div className="mt-2 text-xs">
          Last event: {lastEvent.event} at {new Date(lastEvent.timestamp).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}

