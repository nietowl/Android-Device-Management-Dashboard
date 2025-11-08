"use client";

import { AndroidDevice } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Smartphone,
  Battery,
  HardDrive,
  Wifi,
  Signal,
  RefreshCw,
  Settings,
  Activity,
  Calendar,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface DeviceOverviewProps {
  device: AndroidDevice;
  onViewSelect: (view: string) => void;
}

export default function DeviceOverview({ device, onViewSelect }: DeviceOverviewProps) {
  // Mock device details (in real app, fetch from API)
  const deviceDetails = {
    battery: 85,
    storage: { used: 32, total: 64 },
    network: "Wi-Fi",
    signal: 4,
    androidVersion: "Android 13",
    lastActivity: device.last_sync,
  };

  const quickActions = [
    { id: "sms", label: "SMS Manager", icon: "💬" },
    { id: "files", label: "File Manager", icon: "📁" },
    { id: "calls", label: "Calls/Contacts", icon: "📞" },
    { id: "camera", label: "Camera", icon: "📷" },
    { id: "control", label: "Full Control", icon: "🖥️" },
  ];

  return (
    <div className="p-4 space-y-4 h-full overflow-hidden flex flex-col">
      {/* Device Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 flex-shrink-0">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              {device.name}
            </h1>
            <Badge variant={device.status === "online" ? "success" : "secondary"} className="shadow-sm text-[10px] px-1.5 py-0 h-5">
              {device.status}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm font-medium">{device.model} • {deviceDetails.androidVersion}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="shadow-sm hover:shadow-md text-xs h-8">
            <RefreshCw className="h-3 w-3 mr-1.5" />
            Sync Now
          </Button>
          <Button variant="outline" size="sm" className="shadow-sm hover:shadow-md text-xs h-8">
            <Settings className="h-3 w-3 mr-1.5" />
            Settings
          </Button>
        </div>
      </div>

      {/* Device Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 flex-shrink-0">
        <Card className="border-l-2 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Battery</CardTitle>
            <div className="p-1.5 bg-green-500/10 rounded-md">
              <Battery className="h-4 w-4 text-green-600" />
            </div>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-2xl font-bold mb-1.5">{deviceDetails.battery}%</div>
            <div className="w-full bg-muted rounded-full h-2 mt-2 overflow-hidden shadow-inner">
              <div
                className="bg-gradient-to-r from-green-500 to-green-600 h-2 rounded-full transition-all duration-500 shadow-sm"
                style={{ width: `${deviceDetails.battery}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-2 border-l-primary">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Storage</CardTitle>
            <div className="p-1.5 bg-primary/10 rounded-md">
              <HardDrive className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-2xl font-bold mb-1.5">
              {deviceDetails.storage.used}GB / {deviceDetails.storage.total}GB
            </div>
            <div className="w-full bg-muted rounded-full h-2 mt-2 overflow-hidden shadow-inner">
              <div
                className="bg-gradient-to-r from-primary to-primary/80 h-2 rounded-full transition-all duration-500 shadow-sm"
                style={{
                  width: `${(deviceDetails.storage.used / deviceDetails.storage.total) * 100}%`,
                }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5 font-medium">
              {deviceDetails.storage.total - deviceDetails.storage.used}GB available
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-2 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Network</CardTitle>
            <div className={`p-1.5 rounded-md ${deviceDetails.network === "Wi-Fi" ? "bg-green-500/10" : "bg-primary/10"}`}>
              {deviceDetails.network === "Wi-Fi" ? (
                <Wifi className="h-4 w-4 text-green-600" />
              ) : (
                <Signal className="h-4 w-4 text-primary" />
              )}
            </div>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-2xl font-bold mb-1.5">{deviceDetails.network}</div>
            <div className="flex items-center gap-1 mt-2">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 w-4 rounded transition-all duration-300 ${
                    i < deviceDetails.signal
                      ? "bg-green-500"
                      : "bg-muted"
                  }`}
                />
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5 font-medium">
              {deviceDetails.signal}/5 signal strength
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="bg-gradient-to-br from-card to-card/50 flex-shrink-0">
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-base font-bold">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {quickActions.map((action) => (
              <Button
                key={action.id}
                variant="outline"
                className="h-auto py-4 flex-col gap-2 hover:bg-primary hover:text-primary-foreground hover:shadow-md transition-all duration-200 border"
                onClick={() => onViewSelect(action.id)}
              >
                <span className="text-2xl">{action.icon}</span>
                <span className="text-xs font-semibold">{action.label}</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Device Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1 min-h-0 overflow-y-auto">
        <Card className="flex-shrink-0">
          <CardHeader className="p-3 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <div className="p-1.5 bg-primary/10 rounded-md">
                <Activity className="h-4 w-4 text-primary" />
              </div>
              Device Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 p-3 pt-0">
            <div className="flex justify-between items-center p-2 hover:bg-accent/50 transition-colors rounded-md border border-transparent hover:border-border">
              <span className="text-xs text-muted-foreground font-medium">Device Name</span>
              <span className="text-xs font-semibold">{device.name}</span>
            </div>
            <div className="flex justify-between items-center p-2 hover:bg-accent/50 transition-colors rounded-md border border-transparent hover:border-border">
              <span className="text-xs text-muted-foreground font-medium">Model</span>
              <span className="text-xs font-semibold">{device.model}</span>
            </div>
            <div className="flex justify-between items-center p-2 hover:bg-accent/50 transition-colors rounded-md border border-transparent hover:border-border">
              <span className="text-xs text-muted-foreground font-medium">Android Version</span>
              <span className="text-xs font-semibold">{deviceDetails.androidVersion}</span>
            </div>
            <div className="flex justify-between items-center p-2 hover:bg-accent/50 transition-colors rounded-md border border-transparent hover:border-border">
              <span className="text-xs text-muted-foreground font-medium">Status</span>
              <Badge variant={device.status === "online" ? "success" : "secondary"} className="shadow-sm text-[10px] px-1.5 py-0 h-4">
                {device.status}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="flex-shrink-0">
          <CardHeader className="p-3 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <div className="p-1.5 bg-primary/10 rounded-md">
                <Calendar className="h-4 w-4 text-primary" />
              </div>
              Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 p-3 pt-0">
            <div className="flex justify-between items-center p-2 hover:bg-accent/50 transition-colors rounded-md border border-transparent hover:border-border">
              <span className="text-xs text-muted-foreground font-medium">Last Sync</span>
              <span className="text-xs font-semibold">
                {formatDistanceToNow(new Date(device.last_sync), { addSuffix: true })}
              </span>
            </div>
            <div className="flex justify-between items-center p-2 hover:bg-accent/50 transition-colors rounded-md border border-transparent hover:border-border">
              <span className="text-xs text-muted-foreground font-medium">Registered</span>
              <span className="text-xs font-semibold">
                {formatDistanceToNow(new Date(device.created_at), { addSuffix: true })}
              </span>
            </div>
            <div className="flex justify-between items-center p-2 hover:bg-accent/50 transition-colors rounded-md border border-transparent hover:border-border">
              <span className="text-xs text-muted-foreground font-medium">Last Updated</span>
              <span className="text-xs font-semibold">
                {formatDistanceToNow(new Date(device.updated_at), { addSuffix: true })}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

