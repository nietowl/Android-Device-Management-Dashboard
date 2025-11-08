"use client";

import { AndroidDevice } from "@/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Smartphone, MessageSquare, Folder, Phone, Camera, Monitor, Shield, User, Settings, LogOut, ChevronLeft, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useEffect, useState } from "react";
import { checkIsAdmin } from "@/lib/admin/client";
import { useRouter } from "next/navigation";
import { createClientSupabase } from "@/lib/supabase/client";
import { getUserProfileClient } from "@/lib/admin/client";
import { UserProfile } from "@/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SidebarProps {
  devices: AndroidDevice[];
  selectedDevice: AndroidDevice | null;
  selectedView: string | null;
  onDeviceSelect: (device: AndroidDevice) => void;
  onViewSelect: (view: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function Sidebar({
  devices,
  selectedDevice,
  selectedView,
  onDeviceSelect,
  onViewSelect,
  collapsed = false,
  onToggleCollapse,
}: SidebarProps) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClientSupabase();

  useEffect(() => {
    // Lazy load admin check and user data in parallel
    Promise.all([
      checkIsAdmin().then(setIsAdmin),
      loadUser(),
    ]);
    
    // Load username from localStorage synchronously
    if (typeof window !== "undefined") {
      const savedUsername = localStorage.getItem("user_display_username");
      setUsername(savedUsername);
    }
  }, []);

  const loadUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUser(user);
      const userProfile = await getUserProfileClient();
      setProfile(userProfile);
    }
    // Reload username from localStorage
    if (typeof window !== "undefined") {
      const savedUsername = localStorage.getItem("user_display_username");
      setUsername(savedUsername);
    }
  };

  const getDisplayName = () => {
    if (username) {
      return username;
    }
    return "User";
  };

  const getDisplayInitial = () => {
    if (username) {
      return username.charAt(0).toUpperCase();
    }
    return "U";
  };

  const deviceViews = [
    { id: "sms", label: "SMS Manager", icon: MessageSquare },
    { id: "files", label: "File Manager", icon: Folder },
    { id: "calls", label: "Calls/Contacts", icon: Phone },
    { id: "camera", label: "Camera", icon: Camera },
    { id: "control", label: "Full Control", icon: Monitor },
  ];

  return (
    <div className="h-full flex flex-col relative bg-card/50">
      {/* Collapse Toggle Button */}
      {onToggleCollapse && (
        <button
          onClick={onToggleCollapse}
          className="absolute -right-3 top-4 z-20 p-1.5 border border-border bg-card hover:shadow-lg transition-all duration-200 hover:bg-accent flex items-center justify-center rounded-lg shadow-sm"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4 text-foreground" />
          ) : (
            <ChevronLeft className="h-4 w-4 text-foreground" />
          )}
        </button>
      )}

      {/* Admin Panel Button */}
      {isAdmin && (
        <div className="p-4 border-b border-border/50">
          <Button
            variant="default"
            className={`w-full transition-all duration-200 shadow-md hover:shadow-lg ${
              collapsed ? "px-2" : ""
            }`}
            onClick={() => router.push("/dashboard/admin")}
          >
            <Shield className={`h-4 w-4 ${collapsed ? "" : "mr-2"}`} />
            {!collapsed && "Admin Panel"}
          </Button>
        </div>
      )}

      <div className="p-4 border-b border-border/50">
        {!collapsed && (
          <h2 className="text-lg font-bold mb-4 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            Devices
          </h2>
        )}
        {devices.length === 0 ? (
          !collapsed && <p className="text-sm text-muted-foreground">No devices registered</p>
        ) : (
          <div className="space-y-2">
            {devices.map((device) => (
              <Card
                key={device.id}
                className={`p-2 cursor-pointer transition-all duration-200 ${
                  selectedDevice?.id === device.id
                    ? "bg-primary/10 border-primary shadow-md scale-[1.01] border-2"
                    : "hover:bg-accent/50 hover:scale-[1.005] hover:shadow-sm"
                } ${collapsed ? "p-1.5" : ""}`}
                onClick={() => onDeviceSelect(device)}
                title={collapsed ? device.name : undefined}
              >
                <div className={`flex items-center justify-between gap-2 ${collapsed ? "flex-col items-center gap-1.5" : ""}`}>
                  <div className={`flex items-center gap-2 flex-1 min-w-0 ${collapsed ? "flex-col items-center w-full" : ""}`}>
                    <div className={`p-1.5 transition-colors rounded-md shadow-sm flex-shrink-0 ${
                      device.status === "online" 
                        ? "bg-green-500/10"
                        : "bg-muted"
                    }`}>
                      <Smartphone className="h-4 w-4 text-primary" />
                    </div>
                    {!collapsed && (
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-xs truncate">{device.name}</p>
                          <Badge
                            variant={device.status === "online" ? "success" : "secondary"}
                            className="text-[10px] px-1.5 py-0 h-4 flex-shrink-0"
                          >
                            {device.status}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate mt-0.5">{device.model}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {formatDistanceToNow(new Date(device.last_sync), { addSuffix: true })}
                        </p>
                      </div>
                    )}
                  </div>
                  {collapsed && (
                    <div className={`w-full h-1 rounded ${
                      device.status === "online" ? "bg-green-500" : "bg-muted"
                    }`} />
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {selectedDevice && (
        <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
          {!collapsed && (
            <h3 className="text-sm font-bold mb-4 uppercase tracking-wider text-muted-foreground">
              Device Options
            </h3>
          )}
          <div className="space-y-2">
            {deviceViews.map((view) => {
              const Icon = view.icon;
              return (
                <Button
                  key={view.id}
                  variant={selectedView === view.id ? "default" : "outline"}
                  className={`w-full transition-all duration-200 shadow-sm hover:shadow-md ${
                    collapsed ? "justify-center px-2" : "justify-start gap-2"
                  } ${selectedView === view.id ? "border-2" : ""}`}
                  onClick={() => onViewSelect(view.id)}
                  title={collapsed ? view.label : undefined}
                >
                  <Icon className="h-4 w-4" />
                  {!collapsed && view.label}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {/* User Profile Section - Bottom */}
      <div className="mt-auto border-t border-border/50 p-4 bg-card/50 backdrop-blur-sm">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full outline-none">
              <div className={`flex items-center gap-3 p-3 hover:bg-accent/50 transition-all duration-200 cursor-pointer group rounded-lg shadow-sm hover:shadow-md border border-transparent hover:border-border ${
                collapsed ? "justify-center" : ""
              }`}>
                <div className="h-12 w-12 bg-gradient-to-br from-primary via-primary/90 to-primary/80 text-primary-foreground flex items-center justify-center text-base font-bold flex-shrink-0 transition-all shadow-md group-hover:shadow-lg rounded-xl group-hover:scale-105">
                  {getDisplayInitial()}
                </div>
                {!collapsed && (
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-bold truncate group-hover:text-primary transition-colors">
                      {getDisplayName()}
                    </p>
                    {!username && (
                      <p className="text-xs text-muted-foreground truncate font-medium">
                        Set username
                      </p>
                    )}
                  </div>
                )}
                {!collapsed && (
                  <div className="flex-shrink-0 opacity-50 group-hover:opacity-100 transition-opacity">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                )}
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-64 mb-2 shadow-xl">
            <DropdownMenuLabel>
              <div className="flex items-center gap-3 py-1">
                <div className="h-10 w-10 bg-gradient-to-br from-primary via-primary/90 to-primary/80 text-primary-foreground flex items-center justify-center text-sm font-bold rounded-lg shadow-md">
                  {getDisplayInitial()}
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="font-bold text-base truncate">{username || "User"}</span>
                  {!username && (
                    <span className="text-xs text-muted-foreground truncate mt-0.5">
                      Click to set username
                    </span>
                  )}
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/dashboard/settings")} className="cursor-pointer">
              <Settings className="h-4 w-4 mr-3 text-muted-foreground" />
              <span className="font-medium">Settings</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={async () => {
                await supabase.auth.signOut();
                router.push("/");
              }} 
              className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
            >
              <LogOut className="h-4 w-4 mr-3" />
              <span className="font-medium">Logout</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

