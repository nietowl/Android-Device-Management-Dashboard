"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Smartphone, Wifi, WifiOff, User } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Device {
  id: string;
  user_id: string;
  name: string;
  model: string;
  status: "online" | "offline";
  last_sync: string;
  created_at: string;
  user_profiles?: {
    email: string;
    subscription_tier: string;
    subscription_status: string;
  };
}

interface DeviceStats {
  total: number;
  online: number;
  by_model: Record<string, number>;
}

export default function DeviceManagement() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [stats, setStats] = useState<DeviceStats>({
    total: 0,
    online: 0,
    by_model: {},
  });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    loadDevices();
  }, []);

  const loadDevices = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/devices");
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to fetch devices" }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log("Devices data:", data);
      
      if (data.devices) {
        setDevices(data.devices);
        setStats(data.stats || { total: 0, online: 0, by_model: {} });
      } else {
        console.warn("No devices data received:", data);
        setDevices([]);
        setStats({ total: 0, online: 0, by_model: {} });
      }
    } catch (error) {
      console.error("Error loading devices:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredDevices = devices.filter(
    (device) =>
      device.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      device.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
      device.user_profiles?.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Devices</CardTitle>
            <Smartphone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Online</CardTitle>
            <Wifi className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.online}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Device Models</CardTitle>
            <Smartphone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Object.keys(stats.by_model).length}</div>
            <p className="text-xs text-muted-foreground mt-1">Unique models</p>
          </CardContent>
        </Card>
      </div>

      {/* Device List */}
      <Card className="shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-xl">All Devices</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Manage and monitor all registered devices
              </p>
            </div>
            <div className="relative w-full sm:w-auto">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search devices..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 w-full sm:w-64 h-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
              <p className="text-sm text-muted-foreground mt-4">Loading devices...</p>
            </div>
          ) : filteredDevices.length === 0 ? (
            <div className="text-center py-12">
              <Smartphone className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <p className="text-sm text-muted-foreground">No devices found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredDevices.map((device) => (
                <div
                  key={device.id}
                  className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div
                      className={`flex-shrink-0 p-2 rounded-lg ${
                        device.status === "online"
                          ? "bg-green-100 dark:bg-green-900/30"
                          : "bg-gray-100 dark:bg-gray-800"
                      }`}
                    >
                      {device.status === "online" ? (
                        <Wifi className="h-5 w-5 text-green-600 dark:text-green-400" />
                      ) : (
                        <WifiOff className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-sm truncate">{device.name}</p>
                        <Badge
                          variant={device.status === "online" ? "success" : "secondary"}
                          className="text-xs"
                        >
                          {device.status}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span>{device.model}</span>
                        {device.user_profiles && (
                          <>
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {device.user_profiles.email}
                            </span>
                            <Badge variant="outline" className="text-xs capitalize">
                              {device.user_profiles.subscription_tier}
                            </Badge>
                          </>
                        )}
                        <span>
                          Last sync: {formatDistanceToNow(new Date(device.last_sync), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Device Models Breakdown */}
      {Object.keys(stats.by_model).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Device Models</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(stats.by_model)
                .sort(([, a], [, b]) => b - a)
                .map(([model, count]) => (
                  <div key={model} className="flex items-center justify-between">
                    <span className="text-sm">{model || "Unknown"}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-32 bg-muted rounded-full h-2">
                        <div
                          className="h-2 rounded-full bg-primary"
                          style={{
                            width: `${(count / stats.total) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-sm font-medium w-12 text-right">{count}</span>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

