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
  const socketRef = useRef<Socket | null>(null);
  const fetchingRef = useRef(false); // Prevent multiple simultaneous fetches
  
  // Device server URL - same as dashboard
  const DEVICE_SERVER_URL = process.env.NEXT_PUBLIC_DEVICE_SERVER_URL || "http://localhost:9211";

  const fetchDeviceInfo = useCallback(async () => {
    // Prevent multiple simultaneous fetches
    if (fetchingRef.current) {
      console.log("Already fetching device info, skipping...");
      return;
    }

    fetchingRef.current = true;

    if (device.status !== "online") {
      // Try to fetch from device server even if offline (might have cached info)
      try {
        const deviceServerUrl = process.env.NEXT_PUBLIC_DEVICE_SERVER_URL || "http://localhost:9211";
        const response = await fetch(`${deviceServerUrl}/devices`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          mode: "cors",
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
      try {
        const deviceServerUrl = process.env.NEXT_PUBLIC_DEVICE_SERVER_URL || "http://localhost:9211";
        const devicesResponse = await fetch(`${deviceServerUrl}/devices`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          mode: "cors",
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
          
          // Timeout after 5 seconds
          setTimeout(() => {
            clearInterval(checkConnection);
            if (!socketRef.current?.connected) {
              setError("Socket connection timeout");
              setLoading(false);
              fetchingRef.current = false;
            }
          }, 5000);
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
      const socket = io(DEVICE_SERVER_URL, {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: Infinity,
        reconnectionDelayMax: 5000,
      });

      socket.on("connect", () => {
        console.log("✅ Socket connected to device-server.js");
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

      socket.on("disconnect", () => {
        console.log("❌ Socket disconnected from device-server.js");
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

        {/* Error Message */}
        {error && (
          <div className="bg-red-500/5 p-3">
            <div className="flex items-start gap-3">
              <Info className="h-4 w-4 text-red-500 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-red-700 dark:text-red-400 mb-0.5">Connection Error</div>
                <div className="text-sm text-red-600/90 dark:text-red-400/90">{error}</div>
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
