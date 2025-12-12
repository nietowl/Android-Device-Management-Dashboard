"use client";

import { useState, useEffect, useMemo, memo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useSocket } from "@/lib/socket/client";
import { WebhookEvent } from "@/types";

interface WebhookEventViewerProps {
  deviceId?: string;
  userId?: string;
  maxEvents?: number;
}

export default function WebhookEventViewer({
  deviceId,
  userId,
  maxEvents = 100,
}: WebhookEventViewerProps) {
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const { socket, isConnected } = useSocket({
    userId,
    deviceId,
    autoConnect: true,
  });

  useEffect(() => {
    if (!socket) return;

    const handleDeviceEvent = (event: WebhookEvent) => {
      // Filter by deviceId if specified
      if (deviceId && event.device_id !== deviceId) return;

      // Add event to list (most recent first)
      setEvents((prev) => [event, ...prev].slice(0, maxEvents));
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
  }, [socket, deviceId, maxEvents]);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  const getEventBadgeVariant = useCallback((eventType: string) => {
    switch (eventType) {
      case "device_status":
        return "default";
      case "sms_received":
      case "sms_sent":
        return "secondary";
      case "call_logged":
        return "outline";
      case "file_uploaded":
        return "default";
      case "battery_status":
        return "secondary";
      case "device_sync":
        return "default";
      default:
        return "outline";
    }
  }, []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Real-Time Events
          <Badge variant={isConnected ? "default" : "secondary"} className="ml-2">
            {isConnected ? "Live" : "Offline"}
          </Badge>
        </CardTitle>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={clearEvents}
            className="h-8 text-xs"
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Clear
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">
              {isConnected
                ? "Waiting for events..."
                : "Not connected. Events will appear here when connected."}
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto scrollbar-thin" style={{ contain: 'layout style paint', willChange: 'scroll-position' }}>
            {events.slice(0, maxEvents).map((event) => (
              <EventItem
                key={`${event.device_id}-${event.timestamp}-${event.event}`}
                event={event}
                getBadgeVariant={getEventBadgeVariant}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Memoized event item component for better performance
const EventItem = memo(function EventItem({
  event,
  getBadgeVariant,
}: {
  event: WebhookEvent;
  getBadgeVariant: (eventType: string) => "default" | "secondary" | "outline";
}) {
  const formattedData = useMemo(() => {
    if (!event.data || Object.keys(event.data).length === 0) return null;
    return JSON.stringify(event.data, null, 2);
  }, [event.data]);

  const formattedTime = useMemo(() => {
    return formatDistanceToNow(new Date(event.timestamp), {
      addSuffix: true,
    });
  }, [event.timestamp]);

  const formattedEventName = useMemo(() => {
    return event.event.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  }, [event.event]);

  return (
    <div className="p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant={getBadgeVariant(event.event)} className="text-xs">
              {event.event}
            </Badge>
            <span className="text-xs text-muted-foreground font-mono truncate">
              {event.device_id}
            </span>
          </div>
          <div className="text-sm font-medium mb-1">{formattedEventName}</div>
          {formattedData && (
            <div className="text-xs text-muted-foreground font-mono bg-muted/50 p-2 rounded mt-1 overflow-x-auto">
              <pre className="whitespace-pre-wrap break-words">{formattedData}</pre>
            </div>
          )}
          <div className="text-xs text-muted-foreground mt-2">{formattedTime}</div>
        </div>
      </div>
    </div>
  );
});

