"use client";

import { useState, useEffect } from "react";
import { AdminActivityLog } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Clock } from "lucide-react";
import { format } from "date-fns";

export default function ActivityLogs() {
  const [logs, setLogs] = useState<AdminActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/activity?limit=100");
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to fetch activity logs" }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log("Activity logs data:", data);
      
      if (data.logs && Array.isArray(data.logs)) {
        setLogs(data.logs);
      } else {
        console.warn("No activity logs data received:", data);
        setLogs([]);
      }
    } catch (error) {
      console.error("Error loading activity logs:", error);
    } finally {
      setLoading(false);
    }
  };

  const getActionBadgeVariant = (action: string) => {
    if (action.includes("update")) return "default";
    if (action.includes("deactivate")) return "destructive";
    if (action.includes("create")) return "success";
    return "secondary";
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
        <p className="text-sm text-muted-foreground mt-4">Loading activity logs...</p>
      </div>
    );
  }

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Activity className="h-5 w-5" />
          Activity Logs
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Track all administrative actions and changes
        </p>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <div className="text-center py-12">
            <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-sm text-muted-foreground">No activity logs found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="flex-shrink-0 p-2 rounded-lg bg-muted">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={getActionBadgeVariant(log.action)} className="text-xs">
                      {log.action.replace(/_/g, " ")}
                    </Badge>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {format(new Date(log.created_at), "MMM d, yyyy h:mm a")}
                    </span>
                  </div>
                  {log.details && (
                    <div className="mt-2 p-2 rounded bg-muted/50 text-xs font-mono text-muted-foreground overflow-x-auto">
                      {JSON.stringify(log.details, null, 2)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

