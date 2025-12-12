"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, Suspense, useMemo, useCallback, useRef } from "react";
import { AndroidDevice } from "@/types";
import dynamic from "next/dynamic";
import { io, Socket } from "socket.io-client";

// Lazy load all heavy components
const Sidebar = dynamic(() => import("@/components/dashboard/Sidebar"), {
  loading: () => <div className="w-80 bg-card/80 border-r border-border/50" />,
});
const MainContent = dynamic(() => import("@/components/dashboard/MainContent"), {
  loading: () => <div className="flex-1 bg-background/50" />,
});
const DashboardHeader = dynamic(() => import("@/components/dashboard/DashboardHeader"), {
  loading: () => <div className="h-16 border-b border-border/50 bg-card/50" />,
});
const DashboardOverview = dynamic(() => import("@/components/dashboard/DashboardOverview"), {
  loading: () => <div className="flex-1 overflow-y-auto p-6">Loading dashboard...</div>,
});

export default function Dashboard() {
  const [devices, setDevices] = useState<AndroidDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<AndroidDevice | null>(null);
  const [selectedView, setSelectedView] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const router = useRouter();
  // BYPASS: Removed Supabase dependency
  const socketRef = useRef<Socket | null>(null);
  
  // Device server URL - can be configured via env var
  // Default port is 9211
  const DEVICE_SERVER_URL = process.env.NEXT_PUBLIC_DEVICE_SERVER_URL || "http://localhost:9211";

  const loadDevices = useCallback(async (): Promise<AndroidDevice[] | null> => {
    try {
      // BYPASS: Check localStorage instead of Supabase
      const isAuthenticated = localStorage.getItem("is_authenticated");
      const sessionData = localStorage.getItem("auth_session");
      
      if (!isAuthenticated || !sessionData) {
        return null;
      }
      
      const session = JSON.parse(sessionData);
      const user = { id: session.userId || "bypass-user" };

      // Try to fetch from device-server.js first
      try {
        console.log(`🔍 Attempting to fetch from: ${DEVICE_SERVER_URL}/devices`);
        
        // Try primary port first, then fallback to 3000
        let response: Response | null = null;
        let lastError: any = null;
        
        try {
          response = await fetch(`${DEVICE_SERVER_URL}/devices`, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            mode: "cors",
          });
        } catch (err) {
          lastError = err;
          console.error("Failed to fetch from device server:", err);
        }

        if (response && response.ok) {
          const serverData = await response.json();
          console.log("📱 Fetched devices from device-server.js:", serverData);
          const serverDevices = serverData.devices || [];
          
          console.log(`📊 Found ${serverDevices.length} devices in response`);
          
          if (serverDevices.length === 0) {
            console.warn("⚠️ No devices found in device-server response");
            // Still return empty array to show "no devices" state
            return [];
          }
          
          // Transform device-server.js format to AndroidDevice format
          const transformedDevices: AndroidDevice[] = serverDevices.map((device: any) => {
            const info = device.info || {};
            const deviceName = info.model 
              ? `${info.manufacturer || ''} ${info.model}`.trim() 
              : info.manufacturer 
              ? `${info.manufacturer} Device`
              : `Device ${device.uuid.substring(0, 8)}`;
            
            console.log(`  🔄 Transforming device ${device.uuid}:`, {
              hasInfo: !!device.info,
              isOnline: device.isOnline,
              name: deviceName,
              manufacturer: info.manufacturer,
              model: info.model
            });
            
            // Use lastSeen if timestamp is not available
            const lastSeen = device.lastSeen || info.timestamp || Date.now();
            
            return {
              id: device.uuid,
              user_id: user.id,
              name: deviceName,
              model: info.model || deviceName || "Unknown",
              status: device.isOnline ? "online" : "offline",
              last_sync: new Date(lastSeen).toISOString(),
              created_at: new Date(lastSeen).toISOString(),
              updated_at: new Date().toISOString(),
            };
          });

          console.log(`✅ Transformed ${transformedDevices.length} devices for dashboard:`, transformedDevices);
          // Return devices even if empty - this helps with debugging
          return transformedDevices;
        } else {
          const errorText = response ? `${response.status} ${response.statusText}` : "No response";
          console.error(`❌ Failed to fetch devices: ${errorText}`);
          if (response) {
            const errorBody = await response.text().catch(() => "");
            console.error("Error response body:", errorBody);
          }
        }
      } catch (deviceServerError: any) {
        console.warn("⚠️ Could not fetch from device-server.js:", deviceServerError.message);
        console.warn("   Make sure device-server.js is running on", DEVICE_SERVER_URL);
      }

      // BYPASS: No Supabase fallback, return empty array if device server is not available
      return [];
    } catch (error) {
      console.error("Error loading devices:", error);
      return [];
    }
  }, [DEVICE_SERVER_URL]);

  // Setup Socket.IO connection to device-server.js for real-time updates
  const setupSocketConnection = useCallback((userId: string) => {
    if (socketRef.current?.connected) {
      return; // Already connected
    }

    try {
      const socket = io(DEVICE_SERVER_URL, {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
      });

      socket.on("connect", () => {
        console.log("✅ Connected to device-server.js");
      });

      socket.on("disconnect", () => {
        console.log("❌ Disconnected from device-server.js");
      });

      socket.on("device_registered", (data: { uuid: string; info: any }) => {
        console.log("📱 Device registered:", data);
        // Reload devices when a new device connects
        loadDevices().then((devices) => {
          if (devices) {
            setDevices(devices);
          }
        });
      });

      socket.on("device_disconnected", (data: { uuid: string }) => {
        console.log("🔌 Device disconnected:", data);
        // Reload devices when a device disconnects
        loadDevices().then((devices) => {
          if (devices) {
            setDevices(devices);
          }
        });
      });

      socketRef.current = socket;
    } catch (error) {
      console.error("Failed to connect to device-server.js:", error);
    }
  }, [loadDevices, DEVICE_SERVER_URL]);

  // Load sidebar state synchronously from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedState = localStorage.getItem("sidebarCollapsed");
      if (savedState !== null) {
        setSidebarCollapsed(savedState === "true");
      }
    }
  }, []);

  // BYPASS: Check localStorage authentication
  useEffect(() => {
    let mounted = true;
    
    const init = async () => {
      // Check localStorage for bypass authentication
      const isAuthenticated = localStorage.getItem("is_authenticated");
      const sessionData = localStorage.getItem("auth_session");
      
      if (!mounted) return;

      if (!isAuthenticated || !sessionData) {
        router.push("/");
        return;
      }

      const session = JSON.parse(sessionData);
      const userId = session.userId || "bypass-user";
      
      // Store userId for Socket.IO connections
      setUserId(userId);

      // BYPASS: Skip subscription checks
      const devicesResult = await loadDevices();

      if (devicesResult) {
        console.log(`📦 Setting ${devicesResult.length} devices in state:`, devicesResult);
        setDevices(devicesResult);
      } else {
        console.warn("⚠️ No devices result returned from loadDevices");
        setDevices([]);
      }
      setLoading(false);

      // Setup Socket.IO connection for real-time updates
      setupSocketConnection(userId);
    };

    init();

    return () => {
      mounted = false;
      // Cleanup socket connection
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [router, loadDevices, setupSocketConnection]);

  const handleDeviceSelect = useCallback((device: AndroidDevice) => {
    setSelectedDevice(device);
    setSelectedView(null);
  }, []);

  const handleViewSelect = useCallback((view: string) => {
    setSelectedView(view);
  }, []);

  const toggleSidebar = useCallback(() => {
    const newState = !sidebarCollapsed;
    setSidebarCollapsed(newState);
    if (typeof window !== "undefined") {
      localStorage.setItem("sidebarCollapsed", String(newState));
    }
  }, [sidebarCollapsed]);

  // Debug: Log devices changes
  useEffect(() => {
    console.log(`🔍 Devices state updated: ${devices.length} devices`, devices);
  }, [devices]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="flex h-screen">
        <div 
          className={`
            transition-all duration-300 ease-in-out
            ${sidebarCollapsed ? 'w-20' : 'w-80 lg:w-96'}
            border-r bg-card
            flex-shrink-0
          `}
        >
          <Suspense fallback={<div className="w-full h-full" />}>
            <Sidebar
              devices={devices}
              selectedDevice={selectedDevice}
              selectedView={selectedView}
              onDeviceSelect={handleDeviceSelect}
              onViewSelect={handleViewSelect}
              collapsed={sidebarCollapsed}
              onToggleCollapse={toggleSidebar}
            />
          </Suspense>
        </div>

        <div className="flex-1 flex flex-col bg-background min-w-0">
          <Suspense fallback={<div className="h-16 border-b" />}>
            <DashboardHeader />
          </Suspense>
          {selectedDevice ? (
            <Suspense fallback={<div className="flex-1" />}>
              <MainContent
                device={selectedDevice}
                view={selectedView}
                onViewSelect={handleViewSelect}
                userId={userId}
              />
            </Suspense>
          ) : (
            <div className="flex-1 overflow-hidden flex flex-col min-h-0">
              <Suspense fallback={<div className="p-6">Loading...</div>}>
                <DashboardOverview
                  devices={devices}
                  onDeviceSelect={handleDeviceSelect}
                  onAddDevice={() => {
                    console.log("Add device clicked");
                  }}
                />
              </Suspense>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

