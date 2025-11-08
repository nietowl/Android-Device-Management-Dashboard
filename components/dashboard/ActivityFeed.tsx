"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, X, CheckCircle, AlertCircle, Info } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Notification {
  id: string;
  type: "info" | "success" | "warning" | "error";
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

interface ActivityFeedProps {
  deviceId?: string;
}

export default function ActivityFeed({ deviceId }: ActivityFeedProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [activities, setActivities] = useState<any[]>([]);

  useEffect(() => {
    loadActivity();
  }, [deviceId]);

  const loadActivity = async () => {
    // Mock activity data (in real app, fetch from API)
    const mockActivities = [
      {
        id: "1",
        type: "sync",
        device: "Samsung Galaxy S21",
        message: "Device synced successfully",
        timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      },
      {
        id: "2",
        type: "sms",
        device: "Samsung Galaxy S21",
        message: "New SMS received",
        timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      },
      {
        id: "3",
        type: "file",
        device: "Samsung Galaxy S21",
        message: "File uploaded",
        timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      },
      {
        id: "4",
        type: "call",
        device: "Samsung Galaxy S21",
        message: "Missed call logged",
        timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      },
    ];

    setActivities(mockActivities);

    const mockNotifications: Notification[] = [
      {
        id: "1",
        type: "success",
        title: "Device Synced",
        message: "Samsung Galaxy S21 synced successfully",
        timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        read: false,
      },
      {
        id: "2",
        type: "warning",
        title: "Low Battery",
        message: "Samsung Galaxy S21 battery is below 20%",
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        read: false,
      },
      {
        id: "3",
        type: "info",
        title: "Storage Alert",
        message: "Device storage is 80% full",
        timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
        read: true,
      },
    ];

    setNotifications(mockNotifications);
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "sync":
        return "🔄";
      case "sms":
        return "💬";
      case "file":
        return "📁";
      case "call":
        return "📞";
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

