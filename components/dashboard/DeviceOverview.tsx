"use client";

import { AndroidDevice, DeviceInfo } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Smartphone,
  Battery,
  HardDrive,
  Wifi,
  RefreshCw,
  Settings,
  Cpu,
  Camera,
  Shield,
  Globe,
  MapPin,
  Clock,
  Info,
  Loader2,
  Monitor,
  CircuitBoard,
  Network,
  Box,
  Code,
  Building,
  User,
  Server,
  Signal,
  CheckCircle2,
  X,
  MessageSquare,
  FolderOpen,
  Phone,
  Video,
  Terminal,
  TrendingUp,
  Zap,
  ChevronDown,
  ChevronUp,
  MemoryStick,
  Thermometer,
  Calendar,
  SlidersHorizontal,
  Package,
  Fingerprint,
  Radio,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useState, useCallback, useRef, memo } from "react";
import { io, Socket } from "socket.io-client";
import { createClientSupabase } from "@/lib/supabase/client";
import { proxyDeviceQuery } from "@/lib/utils/api-proxy";

interface DeviceOverviewProps {
  device: AndroidDevice;
  onViewSelect: (view: string) => void;
  userId?: string | null;
}

// Helper function to format bytes
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
};

// Helper function to format Android version from SDK
const getAndroidVersion = (sdkInt: number | undefined): string => {
  if (!sdkInt) return "Unknown";
  const versions: Record<number, string> = {
    33: "Android 13",
    32: "Android 12L",
    31: "Android 12",
    30: "Android 11",
    29: "Android 10",
    28: "Android 9",
  };
  return versions[sdkInt] || `Android SDK ${sdkInt}`;
};

// Helper function to safely format values
const safeValue = (value: any, fallback: string = "—"): string => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "number") return value.toString();
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
};

// Helper function to format data state
const getDataState = (state: number | undefined): string => {
  if (state === undefined) return "—";
  const states: Record<number, string> = {
    0: "Disconnected",
    1: "Connecting",
    2: "Connected",
    3: "Suspended",
  };
  return states[state] || `Unknown (${state})`;
};

// Helper function to format timestamp
const formatTimestamp = (timestamp: number | undefined): string => {
  if (!timestamp) return "—";
  const date = new Date(timestamp);
  return date.toLocaleDateString() + " " + date.toLocaleTimeString();
};

export default function DeviceOverview({ device, onViewSelect, userId }: DeviceOverviewProps) {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const fetchingRef = useRef(false); // Prevent multiple simultaneous fetches
  const supabase = createClientSupabase();
  
  // Device server URL - only used for socket.io connections (cannot be proxied)
  // Note: Socket.io WebSocket connections require direct connection, so URL may be visible
  // Automatically detects local vs external access and uses appropriate URL
  const getDeviceServerUrl = () => {
    if (typeof window !== 'undefined') {
      const currentOrigin = window.location.origin;
      const isLocalAccess = currentOrigin.includes('localhost') || 
                           currentOrigin.includes('127.0.0.1') ||
                           currentOrigin.includes('0.0.0.0');
      
      if (isLocalAccess) {
        // When accessing locally, always use localhost device server
        return "http://localhost:9211";
      }
      
      // When accessing externally (via tunnel), we need to use the tunnel URL for device server
      // IMPORTANT: The device server must be exposed through a tunnel on port 9211
      const tunnelUrl = process.env.NEXT_PUBLIC_DEVICE_SERVER_URL;
      
      if (!tunnelUrl || tunnelUrl.includes('localhost') || tunnelUrl.includes('127.0.0.1')) {
        // If no tunnel URL is configured, try to construct it from current origin
        // This assumes the device server is on the same tunnel domain but port 9211
        const url = new URL(currentOrigin);
        const deviceServerTunnelUrl = `${url.protocol}//${url.hostname}:9211`;
        console.warn(`⚠️ [Device Server] No tunnel URL configured for device server`);
        console.warn(`   Current origin: ${currentOrigin}`);
        console.warn(`   Attempting to use: ${deviceServerTunnelUrl}`);
        console.warn(`   ⚠️ IMPORTANT: Make sure device-server.js is exposed through tunnel on port 9211`);
        console.warn(`   Set NEXT_PUBLIC_DEVICE_SERVER_URL in .env.local to your device server tunnel URL`);
        return deviceServerTunnelUrl;
      }
      
      return tunnelUrl;
    }
    // Server-side fallback
    return process.env.NEXT_PUBLIC_DEVICE_SERVER_URL || "http://localhost:9211";
  };
  
  const DEVICE_SERVER_URL = getDeviceServerUrl();
  
  // Detect if using tunnel - tunnels often don't support WebSocket, so prefer polling
  const isTunnel = DEVICE_SERVER_URL.includes('localtonet.com') || 
                   DEVICE_SERVER_URL.includes('localto.net') || 
                   DEVICE_SERVER_URL.includes('ngrok') || 
                   DEVICE_SERVER_URL.includes('localtunnel') ||
                   DEVICE_SERVER_URL.includes('tunnel');
  
  // Get appropriate socket configuration for tunnel vs local
  // For tunnels, use polling first (more reliable), then try websocket
  // For local connections, prefer websocket first
  const socketTransports = isTunnel ? ["polling", "websocket"] : ["websocket", "polling"];
  const socketTimeout = isTunnel ? 30000 : 20000; // Longer timeout for tunnels
  const allowUpgrade = !isTunnel; // Don't upgrade to websocket for tunnels

  const fetchDeviceInfo = useCallback(async () => {
    // Prevent multiple simultaneous fetches
    if (fetchingRef.current) {
      console.log("Already fetching device info, skipping...");
      return;
    }

    fetchingRef.current = true;

    if (device.status !== "online") {
      // Try to fetch from device server even if offline (might have cached info)
      // STRICT: Must pass license_id
      try {
        if (!userId) {
          setError("User ID is required");
          fetchingRef.current = false;
          return;
        }

        // Get user's license_id
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("license_id")
          .eq("id", userId)
          .single();

        if (!profile?.license_id) {
          setError("License ID not found");
          fetchingRef.current = false;
          return;
        }

        const response = await proxyDeviceQuery({
          licenseId: profile.license_id,
        });

        if (response.ok) {
          const data = await response.json();
          const deviceData = data.devices?.find((d: any) => d.uuid === device.id);
          if (deviceData?.info) {
            console.log("Found cached device info:", deviceData.info);
            setDeviceInfo(deviceData.info);
            setError(null);
            fetchingRef.current = false;
            return;
          }
        }
      } catch (err) {
        console.warn("Could not fetch cached device info:", err);
      }
      
      setError("Device is offline");
      fetchingRef.current = false;
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // First, try to get device info from device server (might already be cached)
      // STRICT: Must pass license_id
      try {
        if (!userId) {
          throw new Error("User ID is required");
        }

        // Get user's license_id
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("license_id")
          .eq("id", userId)
          .single();

        if (!profile?.license_id) {
          throw new Error("License ID not found");
        }

        // Use proxy to hide device-server URL
        const devicesResponse = await proxyDeviceQuery({
          licenseId: profile.license_id,
        });

        if (devicesResponse.ok) {
          const devicesData = await devicesResponse.json();
          const deviceData = devicesData.devices?.find((d: any) => d.uuid === device.id);
          if (deviceData?.info) {
            console.log("Found existing device info:", deviceData.info);
            setDeviceInfo(deviceData.info);
            setLoading(false);
            setError(null);
            // Still send command to get fresh data
          }
        }
      } catch (err) {
        console.warn("Could not fetch existing device info:", err);
      }

      // Send getinfo command to device via Socket.IO
      const sendCommand = () => {
        if (socketRef.current && socketRef.current.connected) {
          console.log("📤 Sending 'getinfo' command via Socket.IO to device:", device.id);
          socketRef.current.emit("send-command", {
            deviceId: device.id,
            command: "getinfo",
            payload: {},
          });
          // Command sent, wait for confirmation via socket events
          // The socket handlers will update state when device_info is received
        } else {
          console.warn("⚠️ Socket not connected yet, waiting...");
          // Wait for socket to connect, then send command
          const checkConnection = setInterval(() => {
            if (socketRef.current && socketRef.current.connected) {
              clearInterval(checkConnection);
              console.log("📤 Socket connected, sending 'getinfo' command");
              socketRef.current.emit("send-command", {
                deviceId: device.id,
                command: "getinfo",
                payload: {},
              });
            }
          }, 500);
          
          // Timeout after 10 seconds (increased from 5)
          setTimeout(() => {
            clearInterval(checkConnection);
            if (!socketRef.current?.connected) {
              const errorMsg = `Socket connection timeout. Device-server.js may not be running.\n\n` +
                `To fix this:\n` +
                `1. Open a new terminal\n` +
                `2. Run: npm run dev:device\n` +
                `3. Wait for "Device server ready" message\n` +
                `4. Refresh this page`;
              setError(errorMsg);
              setLoading(false);
              fetchingRef.current = false;
              console.error("⏱️ Socket connection timeout after 10 seconds");
              console.error("   Device-server.js URL:", DEVICE_SERVER_URL);
              console.error("   Make sure device-server.js is running on port 9211");
            }
          }, 10000); // Increased to 10 seconds
        }
      };

      sendCommand();

      // Wait for device info response via socket
      // The device will send the info back via getinfo event
      // We'll listen for it in the socket handler below
    } catch (err: any) {
      console.error("Error fetching device info:", err);
      setError(err.message || "Failed to fetch device info");
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [device.id, device.status]);

  // Fetch device info when component mounts or device changes
  useEffect(() => {
    console.log("🔄 Device selected/changed:", device.id, "Status:", device.status);
    
    // Reset state when device changes
    fetchingRef.current = false;
    setDeviceInfo(null); // Clear previous device info
    setError(null);
    setLoading(false);
    
    // If device is online, send getinfo command immediately
    if (device.status === "online") {
      setLoading(true);
      
      // Try to send command immediately if socket is ready
      const sendCommandImmediately = () => {
        if (socketRef.current && socketRef.current.connected) {
          console.log("📤 [Immediate] Sending 'getinfo' command to device:", device.id);
          socketRef.current.emit("send-command", {
            deviceId: device.id,
            command: "getinfo",
            payload: {},
          });
          fetchingRef.current = true;
        } else {
          // Socket not ready, will be sent when socket connects or via fetchDeviceInfo
          console.log("⚠️ Socket not ready, will send command when connected");
          fetchDeviceInfo();
        }
      };
      
      sendCommandImmediately();
    } else {
      // Device offline, try to get cached info
      fetchDeviceInfo();
    }
  }, [device.id, device.status]); // Include device.status to react to status changes

  // Setup socket connection to device-server.js (persistent connection)
  useEffect(() => {
    let currentDeviceId = device.id; // Capture current device ID
    let isMounted = true;
    
    // Only create socket if it doesn't exist
    if (!socketRef.current) {
      console.log("🔌 Creating new socket connection to device-server.js");
      console.log(`   URL: ${DEVICE_SERVER_URL}`);
      console.log(`   Tunnel detected: ${isTunnel ? 'Yes (using polling first)' : 'No (using websocket first)'}`);
      console.log(`   Transports: ${socketTransports.join(", ")}`);
      console.log(`   Timeout: ${socketTimeout}ms`);
      console.log(`   Allow upgrade: ${allowUpgrade}`);
      
      const socket = io(DEVICE_SERVER_URL, {
        path: "/socket.io", // Match device-server.js path
        transports: socketTransports, // Use appropriate transport order for tunnel vs local
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: Infinity,
        reconnectionDelayMax: 5000,
        timeout: socketTimeout, // Longer timeout for tunnels
        forceNew: false,
        upgrade: allowUpgrade, // Don't upgrade to websocket for tunnels (they often don't support it)
      });

      socket.on("connect", () => {
        console.log("✅ Socket connected to device-server.js");
        setSocketConnected(true);
        setError(null); // Clear any previous errors
        
        // When socket connects, automatically send getinfo if device is selected and online
        if (isMounted && currentDeviceId && device.status === "online") {
          console.log("📤 [Socket Connect] Auto-sending 'getinfo' command to device:", currentDeviceId);
          setLoading(true);
          socket.emit("send-command", {
            deviceId: currentDeviceId,
            command: "getinfo",
            payload: {},
          });
          fetchingRef.current = true;
        }
      });

      socket.on("disconnect", (reason) => {
        console.log(`❌ Socket disconnected from device-server.js: ${reason}`);
        setSocketConnected(false);
        if (reason === "io server disconnect") {
          // Server disconnected the socket, don't reconnect automatically
          console.warn("⚠️ Server disconnected socket - may need to reconnect manually");
        }
      });

      socket.on("connect_error", (error) => {
        console.error("❌ Socket connection error:", error);
        console.error("   Error details:", {
          message: error.message,
          type: error.type,
          description: error.description,
          context: error.context,
        });
        console.error("   Attempting to connect to:", DEVICE_SERVER_URL);
        console.error("   Current origin:", typeof window !== 'undefined' ? window.location.origin : 'N/A');
        console.error("   Error details:", {
          message: error.message,
          type: error.type,
          description: error.description,
          context: error.context,
        });
        
        setSocketConnected(false);
        
        // Don't show error immediately - device-server is optional
        // Only show error if user tries to use a feature that requires it
        // The connection will keep retrying in the background
        console.warn("⚠️ Device-server.js not available. Some features may be limited.");
        console.warn("   This is normal if device-server.js is not running.");
        console.warn("   To enable full features, run: npm run dev:device");
        
        // Only set error if we're actively trying to fetch device info
        if (fetchingRef.current || loading) {
          let errorMessage = "";
          const isTunnelUrl = DEVICE_SERVER_URL.includes('localtonet') || 
                             DEVICE_SERVER_URL.includes('localto.net') || 
                             DEVICE_SERVER_URL.includes('ngrok') || 
                             DEVICE_SERVER_URL.includes('localtunnel');
          
          if (error.message?.includes("xhr poll error") || error.message?.includes("polling error")) {
            if (isTunnelUrl) {
              const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'N/A';
              errorMessage = `⚠️ Cannot connect to device-server through tunnel\n\n` +
                `Device Server URL: ${DEVICE_SERVER_URL}\n` +
                `Current Origin: ${currentOrigin}\n\n` +
                `🔍 DIAGNOSIS:\n` +
                `The device-server.js must be exposed through a tunnel on port 9211.\n\n` +
                `Possible issues:\n` +
                `1. ❌ Device server tunnel not set up (port 9211 not exposed)\n` +
                `2. ❌ Tunnel URL incorrect in .env.local\n` +
                `3. ❌ CORS blocking the connection\n` +
                `4. ❌ Device server not running locally\n\n` +
                `✅ SOLUTIONS:\n` +
                `1. Set up tunnel for device-server.js (port 9211):\n` +
                `   - Go to localtonet.com/servermanager\n` +
                `   - Create tunnel for port 9211\n` +
                `   - Get the tunnel URL (e.g., https://kuchbhi.localto.net:9211)\n\n` +
                `2. Update .env.local:\n` +
                `   NEXT_PUBLIC_DEVICE_SERVER_URL=https://kuchbhi.localto.net:9211\n` +
                `   ALLOWED_ORIGINS=${currentOrigin},https://kuchbhi.localto.net:9211\n\n` +
                `3. Restart both servers:\n` +
                `   - Restart device-server.js\n` +
                `   - Restart Next.js app\n\n` +
                `4. Verify device-server is running:\n` +
                `   - Run: npm run dev:device\n` +
                `   - Check it's listening on port 9211`;
            } else {
              errorMessage = `⚠️ Socket polling error\n\n` +
                `Server URL: ${DEVICE_SERVER_URL}\n\n` +
                `Possible causes:\n` +
                `- Server not running\n` +
                `- CORS blocking connection\n` +
                `- Network/firewall issues\n\n` +
                `Fix: Check server status and CORS configuration`;
            }
          } else if (error.message?.includes("timeout") || error.type === "TransportError") {
            errorMessage = `⚠️ Connection timeout\n\n` +
              `Server URL: ${DEVICE_SERVER_URL}\n\n` +
              `The device-server may not be running or accessible.\n\n` +
              `To start it:\n` +
              `1. Open a new terminal\n` +
              `2. Run: npm run dev:device\n` +
              `3. Wait for "Device server ready" message\n` +
              `4. Refresh this page`;
          } else if (error.message?.includes("ECONNREFUSED") || error.message?.includes("refused")) {
            errorMessage = `⚠️ Connection refused\n\n` +
              `Server URL: ${DEVICE_SERVER_URL}\n\n` +
              `The device-server is not running or not accessible.\n\n` +
              `To fix:\n` +
              `1. Start device-server: npm run dev:device\n` +
              `2. Verify it's running on the correct port\n` +
              `3. Refresh this page`;
          } else if (error.message?.includes("CORS") || error.message?.includes("Not allowed")) {
            errorMessage = `⚠️ CORS Error\n\n` +
              `Your origin is not allowed by the device-server.\n\n` +
              `Fix: Add your origin to ALLOWED_ORIGINS in .env.local:\n` +
              `ALLOWED_ORIGINS=${typeof window !== 'undefined' ? window.location.origin : 'your-origin'},${DEVICE_SERVER_URL}\n\n` +
              `Then restart device-server.`;
          } else {
            errorMessage = `⚠️ Cannot connect to device-server\n\n` +
              `Server URL: ${DEVICE_SERVER_URL}\n\n` +
              `Error: ${error.message || 'Unknown error'}\n\n` +
              `Check:\n` +
              `1. Device-server is running\n` +
              `2. URL is correct\n` +
              `3. CORS is configured properly`;
          }
          setError(errorMessage);
        }
      });

      socket.on("reconnect_attempt", (attemptNumber) => {
        console.log(`🔄 Reconnecting to device-server.js (attempt ${attemptNumber})`);
      });

      socket.on("reconnect_failed", () => {
        console.error("❌ Failed to reconnect to device-server.js");
        setError("Failed to reconnect to device-server. Please check if device-server.js is running.");
      });

      socketRef.current = socket;
    }

    const socket = socketRef.current;

    // Remove old event listeners before adding new ones
    socket.off("device_event");
    socket.off("command-sent");
    socket.off("command-error");

    // Listen for device info events
    socket.on("device_event", (event: any) => {
      console.log("📥 Received device_event:", event);
      if (!isMounted) return;
      
      // Only process events for the current device
      if (event.event === "device_info" && event.device_id === currentDeviceId) {
        console.log("✅ Received device info for device:", currentDeviceId);
        console.log("📊 Device info data:", event.data);
        
        // Update device info state
        if (event.data) {
          setDeviceInfo(event.data);
          setLoading(false);
          setError(null);
          fetchingRef.current = false;
          console.log("✅ UI updated with device info");
        }
      }
    });

    // Listen for command confirmation
    socket.on("command-sent", (data: any) => {
      console.log("✅ Command sent confirmation:", data);
      if (!isMounted) return;
      
      if (data.deviceId === currentDeviceId && data.command === "getinfo") {
        console.log("📤 Command 'getinfo' sent successfully, waiting for response...");
        setLoading(true);
        setError(null);
        // Keep loading state, wait for device_info event
      }
    });

    // Listen for command errors
    socket.on("command-error", (error: any) => {
      console.error("❌ Command error:", error);
      if (!isMounted) return;
      
      if (error.deviceId === currentDeviceId) {
        setLoading(false);
        setError(error.error || "Failed to send command");
        fetchingRef.current = false;
        // If device not found, try to get cached info
        if (error.error?.includes("not found") || error.error?.includes("not connected")) {
          console.warn("Device not connected, using cached info if available");
        }
      }
    });

    return () => {
      isMounted = false;
      // Clean up event listeners when device changes
      socket.off("device_event");
      socket.off("command-sent");
      socket.off("command-error");
    };
  }, [device.id, device.status, DEVICE_SERVER_URL]);

  // Cleanup socket on component unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        console.log("Disconnecting socket on component unmount");
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  // Calculate derived values with proper null checks
  const storageUsed = deviceInfo && deviceInfo.internal_total_storage && deviceInfo.internal_free_storage
    ? deviceInfo.internal_total_storage - deviceInfo.internal_free_storage
    : 0;
  const storageTotal = deviceInfo?.internal_total_storage || 0;
  const storagePercent = storageTotal > 0 ? (storageUsed / storageTotal) * 100 : 0;
  const ramUsed = deviceInfo && deviceInfo.total_ram && deviceInfo.available_ram
    ? deviceInfo.total_ram - deviceInfo.available_ram
    : 0;
  const ramTotal = deviceInfo?.total_ram || 0;
  const ramPercent = ramTotal > 0 ? (ramUsed / ramTotal) * 100 : 0;
  const batteryLevel = deviceInfo?.battery_level ?? null;


  return (
    <div className="h-full overflow-y-auto bg-background" style={{ contain: 'layout style paint' }}>
      <div className="max-w-[1600px] mx-auto p-4 md:p-6 space-y-4">
        {/* Compact Device Header */}
        <div className="bg-card/50 p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {/* Status Indicator */}
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                device.status === "online" ? "bg-green-500" : "bg-gray-500"
              }`}>
                <Smartphone className="h-5 w-5 text-white" />
              </div>

              {/* Device Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold truncate">
                    {deviceInfo?.manufacturer && deviceInfo?.model
                      ? `${deviceInfo.manufacturer} ${deviceInfo.model}`
                      : device.name}
                  </h2>
                  <Badge 
                    variant="outline"
                    className={`px-2 py-0 h-5 text-xs ${
                      device.status === "online" 
                        ? "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20" 
                        : "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20"
                    }`}
                  >
                    {device.status === "online" ? "Online" : "Offline"}
                  </Badge>
                  {/* Socket Connection Status */}
                  <Badge 
                    variant="outline"
                    className={`px-2 py-0 h-5 text-xs ${
                      socketConnected 
                        ? "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20" 
                        : "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"
                    }`}
                    title={socketConnected ? "Connected to device-server.js" : "Not connected to device-server.js - Run: npm run dev:device"}
                  >
                    {socketConnected ? "🔌 Connected" : "❌ Disconnected"}
                  </Badge>
                </div>
                
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  {deviceInfo?.sdk_int && (
                    <span>{getAndroidVersion(deviceInfo.sdk_int)}</span>
                  )}
                  {deviceInfo && deviceInfo.battery_level !== null && deviceInfo.battery_level !== undefined && (
                    <>
                      <span>•</span>
                      <Battery className={`h-3 w-3 ${
                        deviceInfo.battery_level > 50 ? "text-green-500" : 
                        deviceInfo.battery_level > 20 ? "text-yellow-500" : "text-red-500"
                      }`} />
                      <span>{deviceInfo.battery_level}%</span>
                    </>
                  )}
                  {deviceInfo?.wifi_ssid && (
                    <>
                      <span>•</span>
                      <Wifi className="h-3 w-3 text-blue-500" />
                      <span className="truncate max-w-[120px]">{deviceInfo.wifi_ssid}</span>
                    </>
                  )}
                  {loading && (
                    <>
                      <span>•</span>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>Syncing</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Refresh Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={fetchDeviceInfo}
              disabled={loading || device.status !== "online"}
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>

        {/* Info Banner - Device Server Not Connected (Non-blocking) */}
        {!socketConnected && !error && (
          <div className="bg-blue-500/5 border border-blue-500/20 p-3 rounded-md">
            <div className="flex items-start gap-3">
              <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-blue-700 dark:text-blue-400 mb-1">
                  Device Server Not Connected
                </div>
                <div className="text-sm text-blue-600/90 dark:text-blue-400/90 mb-2">
                  The device-server.js is optional. The main app works without it, but device management features require it.
                </div>
                <div className="text-xs text-blue-600/80 dark:text-blue-400/80 bg-blue-500/10 p-2 rounded">
                  <strong>To enable device features:</strong><br />
                  1. Open a new terminal<br />
                  2. Run: <code className="bg-blue-500/20 px-1 rounded">npm run dev:device</code><br />
                  3. Wait for &quot;Device server ready&quot; message<br />
                  4. Refresh this page
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Error Message - Only show when actively trying to use features */}
        {error && (
          <div className="bg-amber-500/5 border border-amber-500/20 p-3 rounded-md">
            <div className="flex items-start gap-3">
              <Info className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-1">
                  Device Server Required
                </div>
                <div className="text-sm text-amber-600/90 dark:text-amber-400/90 whitespace-pre-line">{error}</div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => setError(null)}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          </div>
        )}


        {deviceInfo ? (
          <>
            {/* Stats Overview - Optimized Horizontal Space */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Battery */}
              <div className="bg-card/50 px-3 py-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <Battery className={`h-3.5 w-3.5 ${
                      batteryLevel !== null && batteryLevel > 50 ? "text-green-600" : 
                      batteryLevel !== null && batteryLevel > 20 ? "text-yellow-600" : "text-red-600"
                    }`} />
                    <span className="text-xs text-muted-foreground">Battery</span>
                  </div>
                  {deviceInfo.battery_charging && (
                    <Zap className="h-3.5 w-3.5 text-yellow-500" />
                  )}
                </div>
                <div className="flex items-baseline justify-between">
                  <div className="text-2xl font-bold">
                    {batteryLevel !== null ? `${batteryLevel}%` : "—"}
                  </div>
                  {batteryLevel !== null && (
                    <div className="text-[10px] text-muted-foreground">
                      {deviceInfo.battery_charging ? "Charging" : "On Battery"}
                    </div>
                  )}
                </div>
              </div>

              {/* Storage */}
              <div className="bg-card/50 px-3 py-2.5">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <HardDrive className="h-3.5 w-3.5 text-blue-600" />
                  <span className="text-xs text-muted-foreground">Storage</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <div className="text-2xl font-bold">
                    {storageTotal > 0 ? `${storagePercent.toFixed(0)}%` : "—"}
                  </div>
                  {storageTotal > 0 && (
                    <div className="text-[10px] text-muted-foreground text-right">
                      {formatBytes(storageUsed)}<br/>{formatBytes(storageTotal)}
                    </div>
                  )}
                </div>
              </div>

              {/* RAM */}
              <div className="bg-card/50 px-3 py-2.5">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <MemoryStick className="h-3.5 w-3.5 text-purple-600" />
                  <span className="text-xs text-muted-foreground">RAM</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <div className="text-2xl font-bold">
                    {ramTotal > 0 ? `${ramPercent.toFixed(0)}%` : "—"}
                  </div>
                  {ramTotal > 0 && (
                    <div className="text-[10px] text-muted-foreground text-right">
                      {formatBytes(ramUsed)}<br/>{formatBytes(ramTotal)}
                    </div>
                  )}
                </div>
              </div>

              {/* CPU */}
              <div className="bg-card/50 px-3 py-2.5">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Cpu className="h-3.5 w-3.5 text-orange-600" />
                  <span className="text-xs text-muted-foreground">Processor</span>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-bold truncate flex-1">
                    {safeValue(deviceInfo.cpu_abi, "—")}
                  </div>
                  <div className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {deviceInfo.cpu_cores ? `${deviceInfo.cpu_cores} Cores` : "—"}
                  </div>
                </div>
              </div>
            </div>

            {/* Device Details Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Hardware Information */}
              <Card className="border-0 shadow-none bg-card/50">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
                      <CircuitBoard className="h-4 w-4 text-white" />
                    </div>
                    <CardTitle className="text-lg">Hardware Information</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <InfoItem icon={Building} label="Manufacturer" value={safeValue(deviceInfo.manufacturer)} />
                    <InfoItem icon={Smartphone} label="Model" value={safeValue(deviceInfo.model)} />
                    <InfoItem icon={Building} label="Brand" value={safeValue(deviceInfo.brand)} />
                    <InfoItem icon={Smartphone} label="Device" value={safeValue(deviceInfo.device)} />
                    <InfoItem icon={Package} label="Product" value={safeValue(deviceInfo.product)} />
                    <InfoItem icon={Box} label="Hardware" value={safeValue(deviceInfo.hardware)} />
                    <InfoItem icon={CircuitBoard} label="Board" value={safeValue(deviceInfo.board)} />
                    <InfoItem icon={Monitor} label="Display" value={
                      deviceInfo.screen_width && deviceInfo.screen_height 
                        ? `${deviceInfo.screen_width} × ${deviceInfo.screen_height}` 
                        : "—"
                    } />
                    <InfoItem icon={Camera} label="Cameras" value={
                      deviceInfo.camera_count ? `${deviceInfo.camera_count} camera${deviceInfo.camera_count !== 1 ? 's' : ''}` : "—"
                    } />
                    <InfoItem icon={Fingerprint} label="UUID" value={safeValue(deviceInfo.uuid)} mono />
                    <InfoItem icon={Shield} label="Emulator" value={safeValue(deviceInfo.is_emulator)} />
                    <InfoItem icon={ShieldAlert} label="Rooted" value={safeValue(deviceInfo.is_rooted)} />
                  </div>
                </CardContent>
              </Card>

              {/* Network Information */}
              <Card className="border-0 shadow-none bg-card/50">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center">
                      <Network className="h-4 w-4 text-white" />
                    </div>
                    <CardTitle className="text-lg">Network Information</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <InfoItem icon={Globe} label="IP Address" value={safeValue(deviceInfo.ip_address)} mono />
                    <InfoItem icon={Signal} label="MAC Address" value={safeValue(deviceInfo.mac_address)} mono />
                    <InfoItem icon={Wifi} label="WiFi SSID" value={safeValue(deviceInfo.wifi_ssid)} />
                    <InfoItem icon={Radio} label="WiFi BSSID" value={safeValue(deviceInfo.wifi_bssid)} mono />
                    <InfoItem icon={Signal} label="Network Operator" value={safeValue(deviceInfo.network_operator)} />
                    <InfoItem icon={Signal} label="SIM Operator" value={safeValue(deviceInfo.sim_operator)} />
                    <InfoItem icon={Globe} label="SIM Country" value={safeValue(deviceInfo.sim_country)} />
                    <InfoItem icon={Network} label="Data State" value={getDataState(deviceInfo.data_state)} />
                    <InfoItem icon={MapPin} label="Roaming" value={safeValue(deviceInfo.is_roaming)} />
                  </div>
                </CardContent>
              </Card>

              {/* System Information */}
              <Card className="border-0 shadow-none bg-card/50 lg:col-span-2">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-purple-500 flex items-center justify-center">
                      <Settings className="h-4 w-4 text-white" />
                    </div>
                    <CardTitle className="text-lg">System Information</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <InfoItem icon={Code} label="Android Version" value={deviceInfo.sdk_int ? getAndroidVersion(deviceInfo.sdk_int) : "—"} />
                    <InfoItem icon={Code} label="SDK Int" value={safeValue(deviceInfo.sdk_int)} />
                    <InfoItem icon={Code} label="Build ID" value={safeValue(deviceInfo.build_id)} mono />
                    <InfoItem icon={Calendar} label="Build Time" value={formatTimestamp(deviceInfo.build_time)} />
                    <InfoItem icon={Monitor} label="Display Version" value={safeValue(deviceInfo.display)} mono />
                    <InfoItem icon={Code} label="Base OS" value={safeValue(deviceInfo.base_os)} mono />
                    <InfoItem icon={Code} label="Bootloader" value={safeValue(deviceInfo.bootloader)} mono />
                    <InfoItem icon={Server} label="Host" value={safeValue(deviceInfo.host)} mono />
                    <InfoItem icon={User} label="User" value={safeValue(deviceInfo.user)} />
                    <InfoItem icon={Globe} label="Locale" value={safeValue(deviceInfo.locale)} />
                    <InfoItem icon={Globe} label="Language" value={safeValue(deviceInfo.language)} />
                    <InfoItem icon={Clock} label="Timezone" value={safeValue(deviceInfo.timezone)} />
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        ) : (
          /* Fallback when no device info */
          !loading && device.status === "online" && (
            <Card className="border-0 shadow-none bg-card/30">
              <CardContent className="p-8 text-center">
                <div className="w-16 h-16 bg-muted/50 flex items-center justify-center mx-auto mb-4">
                  <Info className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No Device Information</h3>
                <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
                  Click the refresh button above to fetch detailed information from your device
                </p>
                <Button onClick={fetchDeviceInfo} size="lg">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Fetch Device Info
                </Button>
              </CardContent>
            </Card>
          )
        )}
      </div>
    </div>
  );
}

// InfoItem Component for displaying device information
const InfoItem = memo(function InfoItem({ 
  icon: Icon, 
  label, 
  value, 
  mono = false 
}: { 
  icon: any; 
  label: string; 
  value: string; 
  mono?: boolean 
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <div className={`text-sm font-medium truncate ${mono ? 'font-mono' : ''}`} title={value}>
        {value}
      </div>
    </div>
  );
});
