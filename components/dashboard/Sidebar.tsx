"use client";

import { AndroidDevice } from "@/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Smartphone, MessageSquare, Folder, Phone, Camera, Monitor, Shield, 
  Settings, LogOut, ChevronLeft, ChevronRight, Search, X, 
  Activity, Battery, Wifi, MoreVertical, Plus, Filter, CheckCircle2
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useEffect, useState, useMemo } from "react";
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
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline">("all");
  const router = useRouter();
  const supabase = createClientSupabase();

  useEffect(() => {
    Promise.all([
      checkIsAdmin().then(setIsAdmin),
      loadUser(),
    ]);
    
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
    if (typeof window !== "undefined") {
      const savedUsername = localStorage.getItem("user_display_username");
      setUsername(savedUsername);
    }
  };

  // Filter devices
  const filteredDevices = useMemo(() => {
    return devices.filter((device) => {
      const matchesSearch = 
        !searchQuery.trim() ||
        device.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        device.model.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus = 
        statusFilter === "all" || device.status === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
  }, [devices, searchQuery, statusFilter]);

  // Device statistics
  const deviceStats = useMemo(() => {
    const online = devices.filter(d => d.status === "online").length;
    const offline = devices.filter(d => d.status === "offline").length;
    return { total: devices.length, online, offline };
  }, [devices]);

  const getDisplayName = () => {
    if (username) return username;
    return "User";
  };

  const getDisplayInitial = () => {
    if (username) return username.charAt(0).toUpperCase();
    return "U";
  };

  const deviceViews = [
    { id: "sms", label: "SMS Manager", icon: MessageSquare, color: "text-blue-500" },
    { id: "files", label: "File Manager", icon: Folder, color: "text-purple-500" },
    { id: "calls", label: "Calls & Contacts", icon: Phone, color: "text-green-500" },
    { id: "control", label: "Full Control", icon: Monitor, color: "text-orange-500" },
  ];

  return (
    <div className="h-full flex flex-col relative bg-card">
      {/* Collapse Toggle Button */}
      {onToggleCollapse && (
        <button
          onClick={onToggleCollapse}
          className="absolute -right-3 top-4 z-20 p-1.5 border bg-card hover:bg-accent rounded-md"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      )}

      {/* Header Section */}
      {!collapsed && (
        <div className="p-4 border-b">
          <div className="flex items-center gap-2 mb-3">
            <Smartphone className="h-5 w-5 text-muted-foreground" />
            <div>
              <h2 className="text-base font-semibold">Devices</h2>
              <p className="text-xs text-muted-foreground">
                {deviceStats.online} of {deviceStats.total} online
              </p>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-9 h-9 text-sm"
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

          {/* Status Filter */}
          {deviceStats.total > 0 && (
            <div className="flex items-center gap-1 mt-2">
              <Button
                variant={statusFilter === "all" ? "default" : "ghost"}
                size="sm"
                onClick={() => setStatusFilter("all")}
                className="h-7 text-xs flex-1"
              >
                All
              </Button>
              <Button
                variant={statusFilter === "online" ? "default" : "ghost"}
                size="sm"
                onClick={() => setStatusFilter("online")}
                className="h-7 text-xs flex-1"
              >
                Online
              </Button>
              <Button
                variant={statusFilter === "offline" ? "default" : "ghost"}
                size="sm"
                onClick={() => setStatusFilter("offline")}
                className="h-7 text-xs flex-1"
              >
                Offline
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Devices List */}
      <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-2">
        {filteredDevices.length === 0 ? (
          !collapsed && (
            <div className="text-center py-8">
              <Smartphone className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-medium">
                {searchQuery || statusFilter !== "all" ? "No devices found" : "No devices"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {searchQuery || statusFilter !== "all" 
                  ? "Try adjusting filters" 
                  : "Connect a device to get started"}
              </p>
            </div>
          )
        ) : (
          filteredDevices.map((device) => {
            const isSelected = selectedDevice?.id === device.id;
            return (
              <div
                key={device.id}
                className={`p-3 rounded-md cursor-pointer transition-colors border-l-2 ${
                  isSelected
                    ? "bg-primary/10 border-primary"
                    : "border-transparent hover:bg-accent/50 hover:border-primary/50"
                } ${collapsed ? "p-2" : ""}`}
                onClick={() => onDeviceSelect(device)}
                title={collapsed ? device.name : undefined}
              >
                <div className={`flex items-start gap-3 ${collapsed ? "flex-col items-center gap-2" : ""}`}>
                  {/* Device Icon */}
                  <div className={`flex-shrink-0 ${
                    device.status === "online" 
                      ? "text-green-600 dark:text-green-400"
                      : "text-muted-foreground"
                  }`}>
                    <Smartphone className={`h-4 w-4 ${collapsed ? "h-5 w-5" : ""}`} />
                  </div>

                  {!collapsed && (
                    <div className="flex-1 min-w-0 space-y-1">
                      {/* Device Name and Status */}
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-sm truncate">{device.name}</p>
                        <Badge
                          variant={device.status === "online" ? "success" : "secondary"}
                          className="text-xs flex-shrink-0"
                        >
                          {device.status}
                        </Badge>
                      </div>

                      {/* Device Model */}
                      <p className="text-xs text-muted-foreground truncate">{device.model}</p>

                      {/* Last Sync */}
                      <p className="text-xs text-muted-foreground truncate">
                        {formatDistanceToNow(new Date(device.last_sync), { addSuffix: true })}
                      </p>
                    </div>
                  )}

                  {collapsed && (
                    <div className={`w-full h-1 rounded-full ${
                      device.status === "online" ? "bg-green-500" : "bg-muted"
                    }`} />
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>


      {/* User Profile Section - Bottom */}
      <div className="mt-auto border-t p-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full outline-none">
              <div className={`flex items-center gap-3 p-2 hover:bg-accent rounded-md cursor-pointer ${
                collapsed ? "justify-center" : ""
              }`}>
                <div className="h-9 w-9 bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium flex-shrink-0 rounded-md">
                  {getDisplayInitial()}
                </div>
                {!collapsed && (
                  <>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-medium truncate">
                        {getDisplayName()}
                      </p>
                      {profile && (
                        <p className="text-xs text-muted-foreground truncate">
                          {profile.subscription_tier}
                        </p>
                      )}
                    </div>
                    <MoreVertical className="h-4 w-4 text-muted-foreground" />
                  </>
                )}
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-56 mb-2">
            <DropdownMenuLabel>
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium rounded-md">
                  {getDisplayInitial()}
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="font-medium text-sm truncate">{username || "User"}</span>
                  {profile && (
                    <span className="text-xs text-muted-foreground truncate">
                      {profile.subscription_tier}
                    </span>
                  )}
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/dashboard/profile")} className="cursor-pointer">
              <Smartphone className="h-4 w-4 mr-2" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/dashboard/settings")} className="cursor-pointer">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </DropdownMenuItem>
            {isAdmin && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push("/dashboard/admin")} className="cursor-pointer">
                  <Shield className="h-4 w-4 mr-2" />
                  Admin Panel
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={async () => {
                await supabase.auth.signOut();
                router.push("/");
              }} 
              className="cursor-pointer text-destructive focus:text-destructive"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
