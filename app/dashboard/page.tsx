"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, Suspense, useMemo, useCallback, useRef } from "react";
import { AndroidDevice } from "@/types";
import dynamic from "next/dynamic";
import { io, Socket } from "socket.io-client";
import { createClientSupabase } from "@/lib/supabase/client";
import { proxyDeviceQuery } from "@/lib/utils/api-proxy";

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
  const supabase = createClientSupabase();
  const socketRef = useRef<Socket | null>(null);
  
  // Device server URL - only used for socket.io connections (cannot be proxied)
  // Note: Socket.io WebSocket connections require direct connection, so URL may be visible
  const DEVICE_SERVER_URL = process.env.NEXT_PUBLIC_DEVICE_SERVER_URL || "http://localhost:9211";

  const loadDevices = useCallback(async (): Promise<AndroidDevice[] | null> => {
    try {
      // Check Supabase authentication
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        console.error("Authentication error:", authError);
        router.push("/");
        return null;
      }
      
      // Check if email is verified
      if (!user.email_confirmed_at) {
        console.warn("Email not verified");
        router.push("/?verified=false");
        return null;
      }

      // STRICT: Get user's license_id - required for device access
      const { data: profile, error: profileError } = await supabase
        .from("user_profiles")
        .select("license_id")
        .eq("id", user.id)
        .single();

      if (profileError || !profile?.license_id) {
        console.error("❌ Failed to retrieve user license_id:", profileError);
        console.warn("⚠️ User does not have a license_id - cannot fetch devices");
        return [];
      }

      // Try to fetch from device-server.js with license_id via proxy
      try {
        if (process.env.NODE_ENV === 'development') {
          console.log(`🔍 Attempting to fetch devices via proxy...`);
        }
        
        // STRICT: Pass license_id as query parameter - required by device-server
        let response: Response | null = null;
        let lastError: any = null;
        
        try {
          response = await proxyDeviceQuery({
            licenseId: profile.license_id,
          });
        } catch (err) {
          lastError = err;
          if (process.env.NODE_ENV === 'development') {
            console.error("Failed to fetch from device server:", err);
          }
        }

        if (response && response.ok) {
          const serverData = await response.json();
          if (process.env.NODE_ENV === 'development') {
            console.log("📱 Fetched devices from device-server.js:", serverData);
          }
          const serverDevices = serverData.devices || [];
          
          if (process.env.NODE_ENV === 'development') {
            console.log(`📊 Found ${serverDevices.length} devices in response for user ${user.id}`);
          }
          
          if (serverDevices.length === 0) {
            if (process.env.NODE_ENV === 'development') {
              console.log("ℹ️ No devices found for this user's license_id");
            }
            // Return empty array - user has no devices
            return [];
          }
          
          // Transform device-server.js format to AndroidDevice format
          // Filter out offline devices - only show online devices
          const transformedDevices: AndroidDevice[] = serverDevices
            .filter((device: any) => device.isOnline === true) // Only include online devices
            .map((device: any) => {
              const info = device.info || {};
              const deviceName = info.model 
                ? `${info.manufacturer || ''} ${info.model}`.trim() 
                : info.manufacturer 
                ? `${info.manufacturer} Device`
                : `Device ${device.uuid.substring(0, 8)}`;
              
              if (process.env.NODE_ENV === 'development') {
                console.log(`  🔄 Transforming device ${device.uuid}:`, {
                  hasInfo: !!device.info,
                  isOnline: device.isOnline,
                  name: deviceName,
                  manufacturer: info.manufacturer,
                  model: info.model
                });
              }
              
              // Use lastSeen if timestamp is not available
              const lastSeen = device.lastSeen || info.timestamp || Date.now();
              
              return {
                id: device.uuid,
                user_id: user.id as string,
                name: deviceName,
                model: info.model || deviceName || "Unknown",
                status: "online" as const, // All devices are online after filtering
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
            
            // If 401, license_id is invalid or doesn't match
            if (response.status === 401) {
              console.error("❌ License ID validation failed - user's license_id does not match or is invalid");
              return [];
            }
          }
        }
      } catch (deviceServerError: any) {
        if (process.env.NODE_ENV === 'development') {
          console.warn("⚠️ Could not fetch from device-server.js:", deviceServerError.message);
          console.warn("   Make sure device-server.js is running");
        }
      }

      // BYPASS: No Supabase fallback, return empty array if device server is not available
      return [];
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Error loading devices:", error);
      }
      return [];
    }
  }, []);

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
      if (process.env.NODE_ENV === 'development') {
        console.error("Failed to connect to device-server.js:", error);
      }
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

  // Handle email verification redirect - check URL params and refresh
  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const verified = urlParams.get("verified");
      const emailUpdated = urlParams.get("email_updated");
      
      if (verified === "true" || emailUpdated === "true") {
        // Clean up URL parameters
        window.history.replaceState({}, "", window.location.pathname);
        // Refresh the page to ensure all data is up to date
        router.refresh();
      }
    }
  }, [router]);

  // BYPASS: Check localStorage authentication
  useEffect(() => {
    let mounted = true;
    
    const init = async () => {
      if (!mounted) return;

      // Check Supabase authentication
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        console.error("Authentication error:", authError);
        router.push("/");
        return;
      }

      // Check if email is verified
      if (!user.email_confirmed_at) {
        console.warn("Email not verified");
        router.push("/?verified=false");
        return;
      }

      // Store userId for Socket.IO connections
      setUserId(user.id);

      // Load devices
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
      setupSocketConnection(user.id);
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
  }, [router, loadDevices, setupSocketConnection, supabase]);

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

  // Automatic periodic check for device status (every 30 seconds)
  useEffect(() => {
    if (loading) return; // Don't poll while initial loading
    
    const checkDeviceStatus = async () => {
      try {
        const devicesResult = await loadDevices();
        if (devicesResult) {
          // Only update if there are actual changes to avoid unnecessary re-renders
          setDevices((prevDevices) => {
            // Check if device list has changed
            const prevIds = new Set(prevDevices.map(d => d.id));
            const newIds = new Set(devicesResult.map(d => d.id));
            
            // If sets are different sizes or have different IDs, update
            if (prevIds.size !== newIds.size || 
                [...prevIds].some(id => !newIds.has(id)) ||
                [...newIds].some(id => !prevIds.has(id))) {
              console.log(`🔄 Device list changed: ${prevDevices.length} -> ${devicesResult.length} devices`);
              return devicesResult;
            }
            
            // Check if any device info has changed (like last_sync)
            const hasChanges = prevDevices.some(prevDevice => {
              const newDevice = devicesResult.find(d => d.id === prevDevice.id);
              if (!newDevice) return true; // Device removed
              return prevDevice.last_sync !== newDevice.last_sync ||
                     prevDevice.name !== newDevice.name ||
                     prevDevice.model !== newDevice.model;
            });
            
            if (hasChanges) {
              console.log(`🔄 Device info updated`);
              return devicesResult;
            }
            
            return prevDevices; // No changes, keep previous state
          });
          
          // If selected device went offline, deselect it
          setSelectedDevice((prevSelected) => {
            if (prevSelected) {
              const stillOnline = devicesResult.find(d => d.id === prevSelected.id);
              if (!stillOnline) {
                console.log(`🔌 Selected device ${prevSelected.id} went offline, deselecting`);
                return null;
              }
            }
            return prevSelected;
          });
        }
      } catch (error) {
        console.error("Error checking device status:", error);
      }
    };
    
    // Initial check after a short delay
    const initialTimeout = setTimeout(checkDeviceStatus, 5000);
    
    // Set up periodic polling (every 30 seconds)
    const interval = setInterval(checkDeviceStatus, 30000);
    
    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [loading, loadDevices]);

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

