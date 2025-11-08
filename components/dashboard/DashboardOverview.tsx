"use client";

import { useMemo } from "react";
import { AndroidDevice } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Smartphone, 
  Wifi, 
  HardDrive, 
  Activity,
  Plus,
  RefreshCw,
  Bell,
  TrendingUp,
  Battery
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface DashboardOverviewProps {
  devices: AndroidDevice[];
  onDeviceSelect: (device: AndroidDevice) => void;
  onAddDevice: () => void;
}

export default function DashboardOverview({ 
  devices, 
  onDeviceSelect,
  onAddDevice 
}: DashboardOverviewProps) {
  // Memoize stats calculation
  const stats = useMemo(() => {
    const online = devices.filter(d => d.status === "online").length;
    const offline = devices.filter(d => d.status === "offline").length;
    const totalStorage = devices.length * 64;
    const usedStorage = devices.length * 32;
    
    return {
      total: devices.length,
      online,
      offline,
      totalStorage,
      usedStorage,
    };
  }, [devices]);

  const recentDevices = useMemo(() => 
    devices
      .sort((a, b) => new Date(b.last_sync).getTime() - new Date(a.last_sync).getTime())
      .slice(0, 6),
    [devices]
  );

  return (
    <div className="p-4 space-y-4 h-full overflow-hidden flex flex-col">
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 flex-shrink-0">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            Dashboard
          </h1>
          <p className="text-muted-foreground text-sm">
            Manage and monitor your Android devices
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="shadow-sm text-xs h-8">
            <RefreshCw className="h-3 w-3 mr-1.5" />
            Sync All
          </Button>
          <Button onClick={onAddDevice} size="sm" className="shadow-md text-xs h-8">
            <Plus className="h-3 w-3 mr-1.5" />
            Add Device
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
        <Card className="border-l-2 border-l-primary">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Total Devices
            </CardTitle>
            <div className="p-1.5 bg-primary/10 rounded-md">
              <Smartphone className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-[10px] text-muted-foreground font-medium mt-0.5">
              {stats.online} online, {stats.offline} offline
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-2 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Online
            </CardTitle>
            <div className="p-1.5 bg-green-500/10 rounded-md">
              <Wifi className="h-4 w-4 text-green-500" />
            </div>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-2xl font-bold text-green-600">
              {stats.online}
            </div>
            <p className="text-[10px] text-muted-foreground font-medium mt-0.5">
              {stats.total > 0 ? Math.round((stats.online / stats.total) * 100) : 0}% of total
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-2 border-l-yellow-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Storage
            </CardTitle>
            <div className="p-1.5 bg-yellow-500/10 rounded-md">
              <HardDrive className="h-4 w-4 text-yellow-500" />
            </div>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-2xl font-bold text-yellow-600">
              {stats.usedStorage}GB
            </div>
            <p className="text-[10px] text-muted-foreground font-medium mt-0.5">
              of {stats.totalStorage}GB total
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-2 border-l-purple-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Activity
            </CardTitle>
            <div className="p-1.5 bg-purple-500/10 rounded-md">
              <Activity className="h-4 w-4 text-purple-500" />
            </div>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-2xl font-bold text-purple-600">
              {devices.length > 0 ? devices.length : 0}
            </div>
            <p className="text-[10px] text-muted-foreground font-medium mt-0.5">
              devices synced today
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Device Grid */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex items-center justify-between mb-3 flex-shrink-0">
          <h2 className="text-lg font-bold">Your Devices</h2>
          {devices.length > 6 && (
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground text-xs h-7">
              View All
            </Button>
          )}
        </div>
        
        {devices.length === 0 ? (
          <Card className="border-dashed flex-shrink-0">
            <CardContent className="flex flex-col items-center justify-center py-8">
              <div className="p-3 bg-muted/50 rounded-full mb-3">
                <Smartphone className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-1">No Devices Yet</h3>
              <p className="text-xs text-muted-foreground mb-4 text-center max-w-md">
                Add your first device to get started
              </p>
              <Button onClick={onAddDevice} size="sm" className="shadow-md">
                <Plus className="h-3 w-3 mr-1.5" />
                Add First Device
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 overflow-y-auto flex-1 min-h-0">
            {recentDevices.map((device) => (
              <Card
                key={device.id}
                className="cursor-pointer hover:shadow-lg hover:scale-[1.01] transition-all duration-300 border-l-2 border-l-primary group flex-shrink-0"
                onClick={() => onDeviceSelect(device)}
              >
                <CardHeader className="pb-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-sm mb-1 group-hover:text-primary transition-colors truncate">{device.name}</CardTitle>
                      <p className="text-xs text-muted-foreground font-medium truncate">{device.model}</p>
                    </div>
                    <Badge
                      variant={device.status === "online" ? "success" : "secondary"}
                      className="ml-2 shadow-sm text-[10px] px-1.5 py-0 h-4 flex-shrink-0"
                    >
                      {device.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 p-3 pt-0">
                  <div className="flex items-center justify-between text-xs py-1.5 px-2 bg-muted/50 rounded-md">
                    <span className="text-muted-foreground font-medium">Last Sync</span>
                    <span className="font-semibold text-[10px]">
                      {formatDistanceToNow(new Date(device.last_sync), { addSuffix: true })}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
                    <div className="flex items-center gap-1.5 p-1.5 bg-green-500/5 rounded-md">
                      <div className="p-1 bg-green-500/10 rounded">
                        <Battery className="h-3 w-3 text-green-600" />
                      </div>
                      <span className="text-[10px] font-semibold">85%</span>
                    </div>
                    <div className="flex items-center gap-1.5 p-1.5 bg-primary/5 rounded-md">
                      <div className="p-1 bg-primary/10 rounded">
                        <HardDrive className="h-3 w-3 text-primary" />
                      </div>
                      <span className="text-[10px] font-semibold">32/64 GB</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
