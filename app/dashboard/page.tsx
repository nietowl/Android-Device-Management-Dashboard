"use client";

import { createClientSupabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState, Suspense, useMemo, useCallback } from "react";
import { AndroidDevice } from "@/types";
import dynamic from "next/dynamic";

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
  const router = useRouter();
  const supabase = useMemo(() => createClientSupabase(), []);

  // Load sidebar state synchronously from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedState = localStorage.getItem("sidebarCollapsed");
      if (savedState !== null) {
        setSidebarCollapsed(savedState === "true");
      }
    }
  }, []);

  // Parallelize auth check and device loading
  useEffect(() => {
    let mounted = true;
    
    const init = async () => {
      const [authResult, devicesResult] = await Promise.all([
        supabase.auth.getUser(),
        loadDevices(),
      ]);

      if (!mounted) return;

      if (!authResult.data.user) {
        router.push("/");
        return;
      }

      if (devicesResult) {
        setDevices(devicesResult);
      }
      setLoading(false);
    };

    init();

    return () => {
      mounted = false;
    };
  }, [router, supabase]);

  const loadDevices = async (): Promise<AndroidDevice[] | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from("devices")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error && error.code !== "PGRST116") {
        console.error("Error loading devices:", error);
      }

      if (!data || data.length === 0) {
        return [
          {
            id: "1",
            user_id: user.id,
            name: "Samsung Galaxy S21",
            model: "SM-G991B",
            status: "online",
            last_sync: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ];
      }
      return data;
    } catch (error) {
      console.error("Error loading devices:", error);
      return null;
    }
  };

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative">
      <div className="flex h-screen relative z-10">
        <div 
          className={`
            transition-all duration-300 ease-in-out
            ${sidebarCollapsed ? 'w-20' : 'w-80 lg:w-96'}
            border-r border-border/50 bg-card/80 backdrop-blur-md shadow-sm
            flex-shrink-0 relative z-10
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

        <div className="flex-1 flex flex-col bg-background/50 min-w-0">
          <Suspense fallback={<div className="h-16 border-b" />}>
            <DashboardHeader />
          </Suspense>
          {selectedDevice ? (
            <Suspense fallback={<div className="flex-1 bg-background/50" />}>
              <MainContent
                device={selectedDevice}
                view={selectedView}
                onViewSelect={handleViewSelect}
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

