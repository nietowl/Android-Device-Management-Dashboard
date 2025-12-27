"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, Suspense, useMemo, useCallback, useRef } from "react";
import { AndroidDevice } from "@/types";
import dynamic from "next/dynamic";
import { io, Socket } from "socket.io-client";
import { proxyDeviceQuery } from "@/lib/utils/api-proxy";
import { getUser } from "@/lib/auth/client";

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
  const socketRef = useRef<Socket | null>(null);
  
  // Device server URL - only used for socket.io connections (cannot be proxied)
  // Note: Socket.io WebSocket connections require direct connection, so URL may be visible
  const DEVICE_SERVER_URL = process.env.NEXT_PUBLIC_DEVICE_SERVER_URL || "http://localhost:9211";

  const loadDevices = useCallback(async (): Promise<AndroidDevice[] | null> => {
    try {
      // SECURITY: Use API route to hide Supabase URL from network tab
      const { data: { user }, error: authError } = await getUser();
      
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

      // SECURITY: Get user's license_id via API route (hides user ID from network tab)
      let licenseId: string | null = null;
      try {
        const licenseResponse = await fetch('/api/user/license-id');
        if (licenseResponse.ok) {
          const data = await licenseResponse.json();
          licenseId = data.license_id;
        } else {
          console.error("❌ Failed to retrieve user license_id from API");
          return [];
        }
      } catch (error) {
        console.error("❌ Error fetching license ID:", error);
        return [];
      }

      if (!licenseId) {
        console.warn("⚠️ User does not have a license_id - cannot fetch devices");
        return [];
      }

      // Try to fetch from device-server.js with license_id via proxy
      try {
        if (process.env.NODE_ENV === 'development') {
          console.log(`🔍 Attempting to fetch devices via proxy...`);
        }
        
        // SECURITY: License ID is fetched server-side from user session, not passed in request
        // Add timeout to prevent hanging (5 seconds max)
        let response: Response | null = null;
        let lastError: any = null;
        
        try {
          // Create a timeout promise
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Device server request timeout')), 5000);
          });
          
          // Race between the fetch and timeout
          // SECURITY: License ID is fetched server-side from user session, not passed in request
          response = await Promise.race([
            proxyDeviceQuery(),
            timeoutPromise,
          ]);
        } catch (err) {
          lastError = err;
          // Don't log timeout errors as they're expected if device-server is slow/unavailable
          const errorMessage = err instanceof Error ? err.message : String(err);
          if (process.env.NODE_ENV === 'development' && !errorMessage.includes('timeout')) {
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
          if (!response) {
            // No response at all
            if (process.env.NODE_ENV === 'development') {
              console.warn("⚠️ No response from device server");
            }
            return [];
          }
          
          const errorText = `${response.status} ${response.statusText}`;
          let errorBody: any = {};
          try {
            errorBody = await response.json();
          } catch {
            // Try as text if not JSON
            const textBody = await response.text().catch(() => "");
            errorBody = { message: textBody || errorText };
          }
          
          // Check status code FIRST before logging anything
          // If 503, device-server is not available - this is expected/optional
          if (response.status === 503) {
            // Silently handle 503 - device-server is optional
            // Don't log anything - just return empty array
            return [];
          }
          
          // If 401, license_id is invalid or doesn't match
          if (response.status === 401) {
            console.error("❌ License ID validation failed - user's license_id does not match or is invalid");
            return [];
          }
          
          // Other errors (not 503) - log as error only in development
          if (process.env.NODE_ENV === 'development') {
            console.error(`❌ Failed to fetch devices: ${errorText}`);
            console.error("Error response body:", errorBody);
          }
        }
      } catch (deviceServerError: any) {
        const errorMsg = deviceServerError?.message || String(deviceServerError) || 'Unknown error';
        
        // Completely silence 503 errors - device-server is optional
        if (errorMsg.includes('503') || errorMsg.includes('Service Unavailable') || 
            errorMsg.includes('SERVICE_UNAVAILABLE') || errorMsg.includes('service unavailable')) {
          // Don't log anything for 503 errors - they're expected when device-server is off
          return [];
        }
        
        // Only log non-503 errors in development mode
        if (process.env.NODE_ENV === 'development') {
          if (process.env.NODE_ENV === 'development') {
            console.warn("⚠️ Could not fetch from device server:", errorMsg);
            console.warn(`   Server URL: ${DEVICE_SERVER_URL}`);
            
            // Check if it's a network/connection error
            if (errorMsg.includes('fetch') || errorMsg.includes('network') || errorMsg.includes('ECONNREFUSED')) {
              console.warn("   Device server is not running or not accessible");
              console.warn("   Note: This is normal if device server is not running");
              console.warn("   To enable device features: npm run dev:device");
            }
          }
        }
        
        // Return empty array - device-server is optional, app can work without it
        return [];
      }

      // BYPASS: No Supabase fallback, return empty array if device server is not available
      return [];
    } catch (error: any) {
      // Don't log 503 errors as errors - device-server is optional
      const errorMsg = error?.message || String(error);
      if (!errorMsg.includes('503') && !errorMsg.includes('Service Unavailable')) {
        // Only log non-503 errors
        if (process.env.NODE_ENV === 'development') {
          console.warn("⚠️ Error loading devices:", errorMsg);
        }
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
        path: "/socket.io", // Match device-server.js path
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

  // Optimized initialization: Show UI immediately, load data in background
  useEffect(() => {
    let mounted = true;
    
    const init = async () => {
      try {
        if (!mounted) return;

        // SECURITY: Use API route to hide Supabase URL from network tab
        const { data: { user }, error: authError } = await getUser();
        
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

        // Store userId immediately for Socket.IO connections
        setUserId(user.id);

        // Show UI immediately - don't wait for data loading
        if (mounted) {
          setLoading(false);
        }

        // Load data in background (non-blocking)
        // Profile check - don't block UI
        // SECURITY: Use API route to hide user ID from network tab
        (async () => {
          try {
            const profileResponse = await fetch("/api/user/profile");
            if (!profileResponse.ok && profileResponse.status === 404) {
              // Profile doesn't exist, try to create it in background
              console.warn("⚠️ User profile not found, attempting to create it...");
              fetch("/api/auth/ensure-profile", {
                method: "POST",
              }).then((ensureResponse) => {
                if (ensureResponse.ok) {
                  console.log("✅ User profile created successfully");
                } else {
                  console.error("❌ Failed to create user profile");
                }
              }).catch((err) => {
                console.error("Error creating profile:", err);
              });
            }
          } catch (profileCheckError) {
            console.error("Error checking user profile:", profileCheckError);
            // Continue anyway - user can still access the app
          }
        })();

        // Load devices in background
        loadDevices().then((devicesResult) => {
          if (!mounted) return;
          if (devicesResult) {
            console.log(`📦 Setting ${devicesResult.length} devices in state:`, devicesResult);
            setDevices(devicesResult);
          } else {
            console.warn("⚠️ No devices result returned from loadDevices");
            setDevices([]);
          }
        }).catch((error) => {
          console.error("Error loading devices:", error);
          if (mounted) {
            setDevices([]);
          }
        });

        // Setup Socket.IO connection for real-time updates (non-blocking)
        setupSocketConnection(user.id);
      } catch (error) {
        console.error("❌ Error initializing dashboard:", error);
        // Set empty devices array on error and show UI
        if (mounted) {
          setDevices([]);
          setLoading(false);
        }
      }
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
      } catch (error: any) {
        // Don't log 503 errors as errors - device-server is optional
        const errorMsg = error?.message || String(error);
        if (errorMsg.includes('503') || errorMsg.includes('Service Unavailable')) {
          // Silently handle 503 - device-server is optional
          return;
        }
        // Only log actual errors
        if (process.env.NODE_ENV === 'development') {
          console.warn("⚠️ Error checking device status:", errorMsg);
        }
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

