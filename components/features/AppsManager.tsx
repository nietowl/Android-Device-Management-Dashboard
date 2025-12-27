"use client";

import { AndroidDevice, App } from "@/types";
import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Package, 
  RefreshCw, 
  Loader2, 
  ChevronLeft, 
  ChevronRight,
  Smartphone,
  Settings,
  Trash2,
  Ban,
  Play,
  Copy,
  Check
} from "lucide-react";
import { io, Socket } from "socket.io-client";

const DEVICE_SERVER_URL = process.env.NEXT_PUBLIC_DEVICE_SERVER_URL || "http://localhost:9211";

interface AppsManagerProps {
  device: AndroidDevice;
}

type AppType = "user" | "system";

export default function AppsManager({ device }: AppsManagerProps) {
  const [activeTab, setActiveTab] = useState<AppType>("user");
  const [apps, setApps] = useState<App[]>([]);
  const [allApps, setAllApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedPackage, setCopiedPackage] = useState<string | null>(null);
  
  // Pagination state
  const [fetchLimit] = useState(50);
  const [displayLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [fetchOffset, setFetchOffset] = useState(0);
  const [totalApps, setTotalApps] = useState(0);
  
  const socketRef = useRef<Socket | null>(null);

  // Load apps from device
  const loadApps = useCallback(async (type: AppType, newOffset: number = 0) => {
    if (!socketRef.current || !socketRef.current.connected) {
      setTimeout(() => loadApps(type, newOffset), 1000);
      return;
    }

    setLoading(true);
    setError(null);
    setFetchOffset(newOffset);
    
    // Ensure type is either "user" or "system" - explicitly validate
    let appType: "user" | "system";
    if (type === "user") {
      appType = "user";
    } else if (type === "system") {
      appType = "system";
    } else {
      // Default fallback
      appType = "user";
      console.warn(`⚠️ [AppsManager] Invalid type "${type}", defaulting to "user"`);
    }
    
    // Format as pipe-separated string like SMS: "type|limit|offset"
    const param = `${appType}|${fetchLimit}|${newOffset}`;
    
    console.log(`📤 [AppsManager] ========== SENDING GETAPPS COMMAND ==========`);
    console.log(`📤 [AppsManager] Input type parameter: "${type}"`);
    console.log(`📤 [AppsManager] Resolved appType: "${appType}"`);
    console.log(`📤 [AppsManager] Limit: ${fetchLimit}`);
    console.log(`📤 [AppsManager] Offset: ${newOffset}`);
    console.log(`📤 [AppsManager] Param string: "${param}"`);
    console.log(`📤 [AppsManager] =============================================`);
    
    socketRef.current.emit("send-command", {
      deviceId: device.id,
      command: "getapps",
      param: param,
    });
  }, [device.id, fetchLimit]);

  // Setup Socket.IO connection
  useEffect(() => {
    console.log(`🔌 [AppsManager] Setting up socket for device: ${device.id}`);
    
    const socket = io(DEVICE_SERVER_URL, {
      path: "/socket.io", // Match device-server.js path
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("✅ AppsManager connected to device-server.js");
      if (device.status === "online") {
        loadApps(activeTab, 0);
      }
    });

    socket.on("disconnect", () => {
      console.log("❌ AppsManager disconnected from device-server.js");
    });

    socket.on("connect_error", (err) => {
      console.error("❌ AppsManager connection error:", err);
      // Don't show error immediately - device-server is optional
      if (process.env.NODE_ENV === 'development') {
        console.warn("⚠️ Device server not available. Apps manager features may be limited.");
      }
    });

    // Clean up previous listeners
    socket.off("device_event");
    socket.off("command-error");
    socket.off("command-sent");

    // Listen for app-result events
    socket.on("device_event", (event: any) => {
      console.log("📥 [AppsManager] Received device_event:", event);
      
      if (event.device_id !== device.id) return;

      // Handle app-result
      if (event.event === "app_result" && event.data) {
        console.log("📱 [AppsManager] Processing app-result:", event.data);
        
        try {
          const appData = event.data;
          
          // Handle both direct array and wrapped formats
          let appsArray: any[] = [];
          let total: number | undefined = undefined;
          
          if (Array.isArray(appData)) {
            appsArray = appData;
          } else if (appData.apps && Array.isArray(appData.apps)) {
            appsArray = appData.apps;
            total = appData.total;
          } else if (appData.data && Array.isArray(appData.data)) {
            appsArray = appData.data;
            total = appData.total;
          } else if (appData.items && Array.isArray(appData.items)) {
            appsArray = appData.items;
            total = appData.total;
          } else {
            console.warn("⚠️ [AppsManager] Unexpected app data format:", appData);
            setAllApps([]);
            setTotalApps(0);
            setLoading(false);
            return;
          }
          
          // Always check for total at root level if not already set
          if (total === undefined && typeof appData === "object" && !Array.isArray(appData)) {
            total = appData.total;
          }
          
          // Transform the data to App format
          const transformedApps: App[] = appsArray.map((app: any, index: number) => ({
            id: String(app.id || app.package_name || `app-${index}`),
            device_id: device.id,
            package_name: app.package_name || app.package || "",
            app_name: app.app_name || app.name || app.label || "Unknown App",
            version: app.version || app.version_name,
            version_code: app.version_code || app.versionCode,
            type: app.type || activeTab,
            icon: app.icon || "",
            is_system: app.is_system || false,
            ...app, // Include all other fields
          }));
          
          if (total !== undefined) {
            setTotalApps(total);
          } else {
            setTotalApps(transformedApps.length);
          }
          
          // Merge with existing apps (avoid duplicates)
          if (fetchOffset === 0) {
            setAllApps(transformedApps);
          } else {
            setAllApps((prev) => {
              const existingIds = new Set(prev.map(a => a.id));
              const newApps = transformedApps.filter(a => !existingIds.has(a.id));
              return [...prev, ...newApps];
            });
          }
          
          setLoading(false);
          setError(null);
        } catch (err: any) {
          console.error("❌ [AppsManager] Error processing app-result:", err);
          setError(`Failed to process apps: ${err.message}`);
          setLoading(false);
        }
      }
    });

    socket.on("command-error", (error: any) => {
      if (error.deviceId === device.id) {
        console.error("❌ [AppsManager] Command error:", error);
        setError(error.error || "Failed to send command");
        setLoading(false);
      }
    });

    socket.on("command-sent", (data: any) => {
      if (data.deviceId === device.id && data.command === "getapps") {
        console.log("✅ [AppsManager] Command sent, waiting for response...");
      }
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.off("device_event");
        socketRef.current.off("command-error");
        socketRef.current.off("command-sent");
        socketRef.current.disconnect();
      }
    };
  }, [device.id, DEVICE_SERVER_URL, fetchOffset, activeTab, loadApps]);

  // Load apps when device comes online or tab changes
  useEffect(() => {
    if (device.status === "online" && socketRef.current?.connected) {
      console.log(`🔄 [AppsManager] useEffect triggered - activeTab: ${activeTab}, deviceId: ${device.id}`);
      console.log(`🔄 [AppsManager] Will call loadApps with type: ${activeTab}`);
      setAllApps([]);
      setApps([]);
      setOffset(0);
      setFetchOffset(0);
      setTotalApps(0);
      // Use activeTab directly - it's already updated by handleTypeChange
      loadApps(activeTab, 0);
    }
  }, [device.id, device.status, activeTab, loadApps]);

  // Update displayed apps based on offset (like SMS Manager)
  useEffect(() => {
    const start = offset;
    const end = offset + displayLimit;
    const displayed = allApps.slice(start, end);
    setApps(displayed);
    
    // Auto-fetch more if needed (when scrolling/viewing near the end)
    if (end > allApps.length && end <= totalApps && !loading && totalApps > 0 && allApps.length < totalApps) {
      const nextFetchOffset = Math.floor(allApps.length / fetchLimit) * fetchLimit;
      if (nextFetchOffset !== fetchOffset && nextFetchOffset < totalApps) {
        console.log(`🔄 [AppsManager] Auto-fetching more apps: type=${activeTab}, offset=${nextFetchOffset}, current=${allApps.length}, total=${totalApps}`);
        loadApps(activeTab, nextFetchOffset);
      }
    }
  }, [offset, allApps, displayLimit, totalApps, loading, activeTab, fetchLimit, fetchOffset, loadApps]);

  const handleTypeChange = (type: AppType) => {
    console.log(`🔄 [AppsManager] ========== TAB CHANGED ==========`);
    console.log(`🔄 [AppsManager] New tab type: ${type}`);
    console.log(`🔄 [AppsManager] Previous activeTab: ${activeTab}`);
    
    // Update state
    setActiveTab(type);
    setOffset(0);
    setFetchOffset(0);
    setAllApps([]);
    setApps([]);
    setTotalApps(0);
    
    // Load apps immediately with the correct type
    if (device.status === "online" && socketRef.current?.connected) {
      console.log(`🔄 [AppsManager] Calling loadApps directly with type: ${type}`);
      loadApps(type, 0);
    } else {
      console.warn(`⚠️ [AppsManager] Device offline or socket not connected, will load when online`);
    }
  };

  const handlePreviousPage = () => {
    const prevOffset = Math.max(0, offset - displayLimit);
    setOffset(prevOffset);
  };

  const handleNextPage = () => {
    const nextOffset = offset + displayLimit;
    if (nextOffset < totalApps) {
      setOffset(nextOffset);
      
      // If we don't have enough data loaded, fetch more
      if (nextOffset + displayLimit > allApps.length && nextOffset < totalApps && !loading) {
        const nextFetchOffset = Math.floor(allApps.length / fetchLimit) * fetchLimit;
        if (nextFetchOffset < totalApps) {
          loadApps(activeTab, nextFetchOffset);
        }
      }
    }
  };

  const appsCurrentPage = Math.floor(offset / displayLimit) + 1;
  const appsTotalPages = totalApps > 0 ? Math.max(1, Math.ceil(totalApps / displayLimit)) : 1;
  const appsHasNextPage = offset + displayLimit < totalApps;
  const appsHasPrevPage = offset > 0;

  // Action handlers
  const handleUninstall = (packageName: string) => {
    if (!socketRef.current || !socketRef.current.connected) {
      alert("Error: Not connected to device");
      return;
    }

    if (!confirm(`Are you sure you want to uninstall ${packageName}?`)) {
      return;
    }

    socketRef.current.emit("send-command", {
      deviceId: device.id,
      command: "uninstallapp",
      param: packageName
    });

    console.log(`✅ Uninstall command sent for ${packageName}`);
  };

  const handleBlock = (packageName: string, appName: string) => {
    if (!socketRef.current || !socketRef.current.connected) {
      alert("Error: Not connected to device");
      return;
    }

    // Format: "packageName|appName"
    const param = `${packageName}|${appName}`;

    socketRef.current.emit("send-command", {
      deviceId: device.id,
      command: "blockapp",
      param: param
    });

    console.log(`✅ Block command sent for ${packageName} (${appName})`);
  };

  const handleUnblock = (packageName: string) => {
    if (!socketRef.current || !socketRef.current.connected) {
      alert("Error: Not connected to device");
      return;
    }

    socketRef.current.emit("send-command", {
      deviceId: device.id,
      command: "unblockapp",
      param: packageName
    });

    console.log(`✅ Unblock command sent for ${packageName}`);
  };

  const handleLaunch = (packageName: string) => {
    if (!socketRef.current || !socketRef.current.connected) {
      alert("Error: Not connected to device");
      return;
    }

    socketRef.current.emit("send-command", {
      deviceId: device.id,
      command: "launchapp",
      param: packageName
    });

    console.log(`✅ Launch command sent for ${packageName}`);
  };

  const handleCopyPackageName = (packageName: string) => {
    navigator.clipboard.writeText(packageName);
    setCopiedPackage(packageName);
    console.log(`✅ Copied package name: ${packageName}`);
    setTimeout(() => setCopiedPackage(null), 2000);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Installed Apps</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => loadApps(activeTab, fetchOffset)}
          disabled={loading || device.status !== "online"}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Loading...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </>
          )}
        </Button>
      </div>

      {error && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Tab Selection */}
      <div className="flex gap-1 border-0 bg-card/50 rounded-lg p-1">
        <Button
          variant={activeTab === "user" ? "default" : "ghost"}
          size="sm"
          onClick={() => handleTypeChange("user")}
          className="flex-1"
        >
          <Smartphone className="h-4 w-4 mr-2" />
          User Apps ({activeTab === "user" ? totalApps : "—"})
        </Button>
        <Button
          variant={activeTab === "system" ? "default" : "ghost"}
          size="sm"
          onClick={() => handleTypeChange("system")}
          className="flex-1"
        >
          <Settings className="h-4 w-4 mr-2" />
          System Apps ({activeTab === "system" ? totalApps : "—"})
        </Button>
      </div>

      <Card className="border-0 shadow-none bg-card/50">
        <CardHeader>
          <CardTitle>{activeTab === "user" ? "User Apps" : "System Apps"}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && apps.length === 0 && allApps.length === 0 ? (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading apps...</p>
            </div>
          ) : apps.length === 0 && !loading ? (
            <div className="text-center py-8 text-muted-foreground">No apps found</div>
          ) : (
            <>
              <div className="space-y-2">
                {apps.map((app) => {
                  // Handle base64 icon
                  const iconSrc = app.icon 
                    ? (app.icon.startsWith('data:image') 
                        ? app.icon 
                        : `data:image/png;base64,${app.icon}`)
                    : null;
                  
                  const isCopied = copiedPackage === app.package_name;
                  
                  return (
                    <div
                      key={app.id}
                      className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="flex-shrink-0">
                          {iconSrc ? (
                            <img 
                              src={iconSrc} 
                              alt={app.app_name}
                              className="h-10 w-10 rounded object-cover"
                              onError={(e) => {
                                // Fallback to icon if image fails to load
                                e.currentTarget.style.display = 'none';
                                e.currentTarget.nextElementSibling?.classList.remove('hidden');
                              }}
                            />
                          ) : null}
                          <Package className={`h-5 w-5 text-muted-foreground ${iconSrc ? 'hidden' : ''}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{app.app_name}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-xs text-muted-foreground truncate">
                              {app.package_name}
                            </span>
                            {app.version && (
                              <>
                                <span className="text-xs text-muted-foreground">•</span>
                                <Badge variant="secondary" className="text-xs">
                                  v{app.version}
                                </Badge>
                              </>
                            )}
                            {(app as any).is_system && (
                              <>
                                <span className="text-xs text-muted-foreground">•</span>
                                <Badge variant="outline" className="text-xs">
                                  System
                                </Badge>
                              </>
                            )}
                          </div>
                          {/* Show ID */}
                          <div className="mt-1">
                            <span className="text-xs text-muted-foreground font-mono">
                              ID: {app.id}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCopyPackageName(app.package_name)}
                          title="Copy Package Name"
                        >
                          {isCopied ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleLaunch(app.package_name)}
                          title="Launch App"
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                        {!(app as any).is_system && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleBlock(app.package_name, app.app_name)}
                              title="Block App"
                            >
                              <Ban className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleUninstall(app.package_name)}
                              title="Uninstall App"
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination */}
              {(appsHasPrevPage || appsHasNextPage) && (
                <div className="flex items-center justify-between mt-6 pt-4 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePreviousPage}
                    disabled={!appsHasPrevPage || loading}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {appsCurrentPage} of {appsTotalPages} • Showing {offset + 1}-{Math.min(offset + displayLimit, totalApps)} of {totalApps}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNextPage}
                    disabled={!appsHasNextPage || loading}
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

