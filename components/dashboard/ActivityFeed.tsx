"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, X, CheckCircle, AlertCircle, Info, Wifi, WifiOff } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useSocket } from "@/lib/socket/client";
import { WebhookEvent } from "@/types";

interface Notification {
  id: string;
  type: "info" | "success" | "warning" | "error";
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

interface Activity {
  id: string;
  type: string;
  device: string;
  message: string;
  timestamp: string;
  event?: WebhookEvent;
}

interface ActivityFeedProps {
  deviceId?: string;
  userId?: string;
}

export default function ActivityFeed({ deviceId, userId }: ActivityFeedProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const { socket, isConnected } = useSocket({
    userId,
    deviceId,
    autoConnect: true,
  });

  // Convert webhook event to notification
  const createNotificationFromEvent = useCallback((event: WebhookEvent): Notification => {
    const eventType = event.event;
    let notification: Notification = {
      id: `${event.device_id}-${event.timestamp}-${Math.random()}`,
      type: "info" as const,
      title: "Device Event",
      message: `Event: ${eventType}`,
      timestamp: event.timestamp,
      read: false,
    };

    switch (eventType) {
      case "device_status":
        notification = {
          ...notification,
          type: event.data?.status === "online" ? "success" : "warning",
          title: "Device Status Changed",
          message: `Device ${event.data?.status === "online" ? "came online" : "went offline"}`,
        };
        break;
      case "sms_received":
        notification = {
          ...notification,
          type: "info",
          title: "New SMS Received",
          message: `From: ${event.data?.from || "Unknown"}`,
        };
        break;
      case "sms_sent":
        notification = {
          ...notification,
          type: "success",
          title: "SMS Sent",
          message: `To: ${event.data?.to || "Unknown"}`,
        };
        break;
      case "call_logged":
        notification = {
          ...notification,
          type: "info",
          title: "Call Logged",
          message: `${event.data?.type || "Call"} from ${event.data?.number || "Unknown"}`,
        };
        break;
      case "file_uploaded":
        notification = {
          ...notification,
          type: "success",
          title: "File Uploaded",
          message: event.data?.filename || "File uploaded successfully",
        };
        break;
      case "file_deleted":
        notification = {
          ...notification,
          type: "warning",
          title: "File Deleted",
          message: event.data?.filename || "File deleted",
        };
        break;
      case "battery_status":
        const batteryLevel = event.data?.level || 0;
        notification = {
          ...notification,
          type: batteryLevel < 20 ? "warning" : batteryLevel < 10 ? "error" : "info",
          title: "Battery Status",
          message: `Battery: ${batteryLevel}%`,
        };
        break;
      case "device_sync":
        notification = {
          ...notification,
          type: "success",
          title: "Device Synced",
          message: "Device synchronized successfully",
        };
        break;
      case "command_result":
        notification = {
          ...notification,
          type: event.data?.success ? "success" : "error",
          title: "Command Result",
          message: event.data?.message || "Command executed",
        };
        break;
      case "device_info":
        notification = {
          ...notification,
          type: "info",
          title: "Device Info Updated",
          message: "Device information refreshed",
        };
        break;
      default:
        notification = {
          ...notification,
          title: `Event: ${eventType}`,
          message: JSON.stringify(event.data).substring(0, 50),
        };
    }

    return notification;
  }, []);

  // Convert webhook event to activity
  const createActivityFromEvent = useCallback((event: WebhookEvent): Activity => {
    const eventType = event.event;
    let message = `Event: ${eventType}`;

    switch (eventType) {
      case "device_status":
        message = `Device ${event.data?.status === "online" ? "came online" : "went offline"}`;
        break;
      case "sms_received":
        message = `New SMS received from ${event.data?.from || "Unknown"}`;
        break;
      case "sms_sent":
        message = `SMS sent to ${event.data?.to || "Unknown"}`;
        break;
      case "call_logged":
        message = `${event.data?.type || "Call"} logged: ${event.data?.number || "Unknown"}`;
        break;
      case "file_uploaded":
        message = `File uploaded: ${event.data?.filename || "Unknown"}`;
        break;
      case "file_deleted":
        message = `File deleted: ${event.data?.filename || "Unknown"}`;
        break;
      case "battery_status":
        message = `Battery status: ${event.data?.level || 0}%`;
        break;
      case "device_sync":
        message = "Device synced successfully";
        break;
      case "command_result":
        message = `Command ${event.data?.success ? "succeeded" : "failed"}`;
        break;
      case "device_info":
        message = "Device info updated";
        break;
    }

    return {
      id: `${event.device_id}-${event.timestamp}-${Math.random()}`,
      type: eventType,
      device: event.device_id,
      message,
      timestamp: event.timestamp,
      event,
    };
  }, []);

  // Listen for webhook events via Socket.IO
  useEffect(() => {
    if (!socket) return;

    const handleDeviceEvent = (event: WebhookEvent) => {
      // Filter by deviceId if specified
      if (deviceId && event.device_id !== deviceId) return;

      // Add to activities
      const activity = createActivityFromEvent(event);
      setActivities((prev) => [activity, ...prev].slice(0, 50)); // Keep last 50

      // Add to notifications
      const notification = createNotificationFromEvent(event);
      setNotifications((prev) => [notification, ...prev].slice(0, 20)); // Keep last 20
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
  }, [socket, deviceId, createActivityFromEvent, createNotificationFromEvent]);

  const markNotificationAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "sync":
      case "device_sync":
        return "🔄";
      case "sms":
      case "sms_received":
      case "sms_sent":
        return "💬";
      case "file":
      case "file_uploaded":
      case "file_deleted":
        return "📁";
      case "call":
      case "call_logged":
        return "📞";
      case "device_status":
        return "📱";
      case "battery_status":
        return "🔋";
      case "command_result":
        return "⚡";
      case "device_info":
        return "ℹ️";
      default:
        return "📱";
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "success":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "warning":
        return <AlertCircle className="h-4 w-4 text-yellow-600" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Info className="h-4 w-4 text-blue-600" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isConnected ? (
                <>
                  <Wifi className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-green-600">Connected</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-4 w-4 text-red-600" />
                  <span className="text-sm font-medium text-red-600">Disconnected</span>
                </>
              )}
            </div>
            <Badge variant={isConnected ? "default" : "secondary"}>
              {isConnected ? "Live" : "Offline"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifications
          </CardTitle>
          <Badge variant="secondary">
            {notifications.filter((n) => !n.read).length} new
          </Badge>
        </CardHeader>
        <CardContent>
          {notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No notifications
            </p>
          ) : (
            <div className="space-y-2">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                    notification.read
                      ? "bg-card"
                      : "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800"
                  }`}
                >
                  <div className="mt-0.5">{getNotificationIcon(notification.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{notification.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {notification.message}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(notification.timestamp), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                      {!notification.read && (
                        <Badge variant="default" className="text-xs">
                          New
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Activity Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {activities.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No recent activity
            </p>
          ) : (
            <div className="space-y-4">
              {activities.map((activity, index) => (
                <div key={activity.id} className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="text-2xl">{getActivityIcon(activity.type)}</div>
                    {index < activities.length - 1 && (
                      <div className="w-0.5 h-full bg-border mt-2" />
                    )}
                  </div>
                  <div className="flex-1 pb-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium">{activity.message}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {activity.device}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap ml-4">
                        {formatDistanceToNow(new Date(activity.timestamp), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

