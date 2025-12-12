"use client";

import { useMemo, useEffect, useState, useCallback, useRef } from "react";
import { AndroidDevice, DeviceInfo } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Smartphone, 
  Wifi, 
  HardDrive, 
  Plus,
  RefreshCw,
  Battery,
  AlertCircle
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { io, Socket } from "socket.io-client";

interface DashboardOverviewProps {
  devices: AndroidDevice[];
  onDeviceSelect: (device: AndroidDevice) => void;
  onAddDevice: () => void;
}

interface DeviceWithInfo extends AndroidDevice {
  deviceInfo?: DeviceInfo;
}

export default function DashboardOverview({ 
  devices, 
  onDeviceSelect,
  onAddDevice 
}: DashboardOverviewProps) {
  const [deviceInfos, setDeviceInfos] = useState<Map<string, DeviceInfo>>(new Map());
  const [loadingInfos, setLoadingInfos] = useState<Set<string>>(new Set());
  const socketRef = useRef<Socket | null>(null);
  
  const DEVICE_SERVER_URL = process.env.NEXT_PUBLIC_DEVICE_SERVER_URL || "http://localhost:9211";

  // Setup Socket.IO to fetch device info
  useEffect(() => {
    if (!socketRef.current) {
      const socket = io(DEVICE_SERVER_URL, {
        transports: ["websocket", "polling"],
        reconnection: true,
      });

      socket.on("connect", () => {
        console.log("✅ Dashboard connected to device-server.js");
      });

      // Listen for device info updates
      socket.on("device_event", (event: any) => {
        if (event.event === "device_info" && event.data) {
          const deviceId = event.device_id;
          setDeviceInfos(prev => {
            const newMap = new Map(prev);
            newMap.set(deviceId, event.data);
            return newMap;
          });
          setLoadingInfos(prev => {
            const newSet = new Set(prev);
            newSet.delete(deviceId);
            return newSet;
          });
        }
      });

      socketRef.current = socket;
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [DEVICE_SERVER_URL]);

  // Fetch device info for online devices
  const fetchDeviceInfo = useCallback((deviceId: string) => {
    if (!socketRef.current?.connected || loadingInfos.has(deviceId)) return;
    
    setLoadingInfos(prev => new Set(prev).add(deviceId));
    socketRef.current.emit("send-command", {
      deviceId,
      command: "getinfo",
      param: "",
    });
  }, [loadingInfos]);

  // Auto-fetch info for online devices
  useEffect(() => {
    devices
      .filter(d => d.status === "online")
      .forEach(device => {
        if (!deviceInfos.has(device.id)) {
          fetchDeviceInfo(device.id);
        }
      });
  }, [devices, deviceInfos, fetchDeviceInfo]);

  // Enhanced stats calculation
  const stats = useMemo(() => {
    const online = devices.filter(d => d.status === "online").length;
    const offline = devices.filter(d => d.status === "offline").length;
    
    // Calculate real storage from device info
    let totalStorage = 0;
    let usedStorage = 0;
    let totalBattery = 0;
    let batteryCount = 0;
    
    devices.forEach(device => {
      const info = deviceInfos.get(device.id);
      if (info) {
        if (info.internal_total_storage) {
          totalStorage += info.internal_total_storage;
          usedStorage += (info.internal_total_storage - (info.internal_free_storage || 0));
        }
        if (info.battery_level !== undefined) {
          totalBattery += info.battery_level;
          batteryCount++;
        }
      }
    });

    const avgBattery = batteryCount > 0 ? Math.round(totalBattery / batteryCount) : null;
    const storageUsedPercent = totalStorage > 0 ? Math.round((usedStorage / totalStorage) * 100) : 0;

    // Calculate devices synced today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const syncedToday = devices.filter(d => {
      const syncDate = new Date(d.last_sync);
      return syncDate >= today;
    }).length;

    // Calculate uptime (devices online for more than 1 hour)
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const stableDevices = devices.filter(d => {
      if (d.status !== "online") return false;
      const syncDate = new Date(d.last_sync);
      return syncDate < hourAgo;
    }).length;

    return {
      total: devices.length,
      online,
      offline,
      totalStorage,
      usedStorage,
      storageUsedPercent,
      avgBattery,
      syncedToday,
      stableDevices,
      onlinePercent: devices.length > 0 ? Math.round((online / devices.length) * 100) : 0,
    };
  }, [devices, deviceInfos]);

  // Get recent/important devices (show top 6 most recent)
  const recentDevicesWithInfo = useMemo(() => {
    return devices
      .sort((a, b) => new Date(b.last_sync).getTime() - new Date(a.last_sync).getTime())
      .slice(0, 6)
      .map(device => ({
        ...device,
        deviceInfo: deviceInfos.get(device.id),
      })) as DeviceWithInfo[];
  }, [devices, deviceInfos]);

  // Recent activity (devices synced in last 24h)
  const recentActivity = useMemo(() => {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return devices
      .filter(d => new Date(d.last_sync) >= last24h)
      .sort((a, b) => new Date(b.last_sync).getTime() - new Date(a.last_sync).getTime())
      .slice(0, 5);
  }, [devices]);

  // Format storage
  const formatStorage = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Dashboard Overview
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor and manage all your Android devices
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="gap-2"
            onClick={() => {
              devices.forEach(d => {
                if (d.status === "online") fetchDeviceInfo(d.id);
              });
            }}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button onClick={onAddDevice} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Device
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Devices */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Smartphone className="h-4 w-4" />
            <span className="text-sm font-medium">Total Devices</span>
          </div>
          <div className="text-3xl font-semibold">{stats.total}</div>
          <p className="text-sm text-muted-foreground">
            {stats.online} online • {stats.offline} offline
          </p>
        </div>

        {/* Online Status */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Wifi className="h-4 w-4" />
            <span className="text-sm font-medium">Online</span>
          </div>
          <div className="text-3xl font-semibold text-green-600 dark:text-green-400">
            {stats.online}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-green-500 rounded-full"
                style={{ width: `${stats.onlinePercent}%` }}
              />
            </div>
            <span className="text-sm text-muted-foreground">
              {stats.onlinePercent}%
            </span>
          </div>
        </div>

        {/* Storage */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <HardDrive className="h-4 w-4" />
            <span className="text-sm font-medium">Storage</span>
          </div>
          <div className="text-3xl font-semibold">
            {stats.totalStorage > 0 ? formatStorage(stats.usedStorage) : "—"}
          </div>
          {stats.totalStorage > 0 ? (
            <p className="text-sm text-muted-foreground">
              of {formatStorage(stats.totalStorage)} ({stats.storageUsedPercent}%)
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No data
            </p>
          )}
        </div>

        {/* Battery */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Battery className="h-4 w-4" />
            <span className="text-sm font-medium">Avg Battery</span>
          </div>
          {stats.avgBattery !== null ? (
            <>
              <div className="text-3xl font-semibold">
                {stats.avgBattery}%
              </div>
              <p className="text-sm text-muted-foreground">
                {stats.syncedToday} synced today
              </p>
            </>
          ) : (
            <>
              <div className="text-3xl font-semibold">—</div>
              <p className="text-sm text-muted-foreground">
                No data
              </p>
            </>
          )}
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Devices - Takes 2 columns */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b">
            <div>
              <h2 className="text-lg font-semibold">Recent Devices</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Select a device from the sidebar to manage it
              </p>
            </div>
            {devices.length > 6 && (
              <span className="text-xs text-muted-foreground">
                {devices.length} total
              </span>
            )}
          </div>

          {devices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed rounded-lg">
              <Smartphone className="h-12 w-12 text-muted-foreground mb-3" />
              <h3 className="text-base font-semibold mb-1">No Devices Yet</h3>
              <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
                Add your first device to get started
              </p>
              <Button onClick={onAddDevice} className="gap-2">
                <Plus className="h-4 w-4" />
                Add First Device
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recentDevicesWithInfo.map((device) => {
                const info = device.deviceInfo;
                const batteryLevel = info?.battery_level;
                const storageUsed = info?.internal_total_storage 
                  ? info.internal_total_storage - (info.internal_free_storage || 0)
                  : null;
                const storageTotal = info?.internal_total_storage || null;
                const storagePercent = storageTotal && storageUsed 
                  ? Math.round((storageUsed / storageTotal) * 100)
                  : null;

                return (
                  <div
                    key={device.id}
                    className="p-4 rounded-lg hover:bg-accent/50 cursor-pointer transition-colors border-l-2 border-transparent hover:border-primary"
                    onClick={() => onDeviceSelect(device)}
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-medium mb-1 truncate">
                          {device.name}
                        </h3>
                        <p className="text-sm text-muted-foreground truncate">
                          {device.model}
                        </p>
                      </div>
                      <Badge
                        variant={device.status === "online" ? "success" : "secondary"}
                        className="text-xs flex-shrink-0"
                      >
                        {device.status}
                      </Badge>
                    </div>

                    {/* Last Sync */}
                    <div className="flex items-center justify-between text-xs mb-3 pb-3 border-b">
                      <span className="text-muted-foreground">Last Sync</span>
                      <span className="font-medium">
                        {formatDistanceToNow(new Date(device.last_sync), { addSuffix: true })}
                      </span>
                    </div>

                    {/* Device Metrics */}
                    <div className="grid grid-cols-2 gap-4">
                      {/* Battery */}
                      <div className="flex items-center gap-2">
                        <Battery className="h-4 w-4 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium">
                            {batteryLevel !== undefined ? `${batteryLevel}%` : "—"}
                          </p>
                          <p className="text-xs text-muted-foreground">Battery</p>
                        </div>
                      </div>

                      {/* Storage */}
                      <div className="flex items-center gap-2">
                        <HardDrive className="h-4 w-4 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium">
                            {storageTotal ? formatStorage(storageUsed || 0) : "—"}
                          </p>
                          <p className="text-xs text-muted-foreground">Storage</p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          
          {devices.length > 6 && (
            <div className="text-center pt-4">
              <p className="text-sm text-muted-foreground">
                Use the sidebar to view and search all {devices.length} devices
              </p>
            </div>
          )}
        </div>

        {/* Sidebar - Recent Activity & Stats */}
        <div className="space-y-6">
          {/* Recent Activity */}
          <div>
            <h3 className="text-base font-semibold mb-3 pb-2 border-b">Recent Activity</h3>
            <div className="space-y-2">
              {recentActivity.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-sm text-muted-foreground">No recent activity</p>
                </div>
              ) : (
                recentActivity.map((device) => (
                  <div
                    key={device.id}
                    className="flex items-center gap-2 p-2 rounded-md hover:bg-accent/50 cursor-pointer transition-colors"
                    onClick={() => onDeviceSelect(device)}
                  >
                    <Smartphone className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{device.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(device.last_sync), { addSuffix: true })}
                      </p>
                    </div>
                    <Badge variant={device.status === "online" ? "success" : "secondary"} className="text-xs">
                      {device.status}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Quick Stats */}
          <div>
            <h3 className="text-base font-semibold mb-3 pb-2 border-b">Quick Stats</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Online Rate</span>
                <span className="font-medium">{stats.onlinePercent}%</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Synced Today</span>
                <span className="font-medium">{stats.syncedToday}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Stable</span>
                <span className="font-medium">{stats.stableDevices}</span>
              </div>
              {stats.avgBattery !== null && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Avg Battery</span>
                  <span className="font-medium">{stats.avgBattery}%</span>
                </div>
              )}
            </div>
          </div>

          {/* System Status */}
          {stats.offline > 0 && (
            <div className="p-3 rounded-lg bg-yellow-500/5 border-l-2 border-yellow-500">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <h3 className="text-sm font-semibold">Offline Devices</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                {stats.offline} device{stats.offline !== 1 ? "s" : ""} offline
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
