"use client";

import { useState, useEffect } from "react";
import { UserProfile } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, Shield, Calendar, Activity, TrendingUp, AlertCircle, Clock, BarChart3, Smartphone, Layers, Key } from "lucide-react";
import dynamic from "next/dynamic";

// Lazy load admin sub-components
const UserManagement = dynamic(() => import("@/components/admin/UserManagement"));
const UserDetailView = dynamic(() => import("@/components/admin/UserDetailView"));
const SubscriptionOverview = dynamic(() => import("@/components/admin/SubscriptionOverview"));
const ActivityLogs = dynamic(() => import("@/components/admin/ActivityLogs"));
const AnalyticsDashboard = dynamic(() => import("@/components/admin/AnalyticsDashboard"));
const DeviceManagement = dynamic(() => import("@/components/admin/DeviceManagement"));
const BulkOperations = dynamic(() => import("@/components/admin/BulkOperations"));
const LicenseManagement = dynamic(() => import("@/components/admin/LicenseManagement"));

export default function AdminPanel() {
  const [view, setView] = useState<"users" | "user-detail">("users");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeSubscriptions: 0,
    expiredSubscriptions: 0,
    trialUsers: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setLoading(true);
    setError(null);
    try {
      // Use max allowed limit (200) to get all users for stats
      const response = await fetch("/api/admin/users?limit=200");
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to fetch users" }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log("Admin stats data:", data);
      
      if (data.users && Array.isArray(data.users)) {
        const users = data.users as UserProfile[];
        setStats({
          totalUsers: data.total || users.length,
          activeSubscriptions: users.filter(u => u.subscription_status === "active").length,
          expiredSubscriptions: users.filter(u => u.subscription_status === "expired").length,
          trialUsers: users.filter(u => u.subscription_status === "trial").length,
        });
      } else {
        console.warn("No users data received:", data);
        setStats({
          totalUsers: 0,
          activeSubscriptions: 0,
          expiredSubscriptions: 0,
          trialUsers: 0,
        });
      }
    } catch (error) {
      console.error("Error loading stats:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to load statistics";
      setError(errorMessage);
      
      // Set default stats on error
      setStats({
        totalUsers: 0,
        activeSubscriptions: 0,
        expiredSubscriptions: 0,
        trialUsers: 0,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUserSelect = (userId: string) => {
    setSelectedUserId(userId);
    setView("user-detail");
  };

  const handleBackToUsers = () => {
    setSelectedUserId(null);
    setView("users");
    loadStats(); // Refresh stats when returning to users list
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
            <p className="text-muted-foreground mt-1">Manage users, subscriptions, and system activity</p>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <AlertCircle className="h-5 w-5" />
              <div>
                <p className="font-medium">Error loading statistics</p>
                <p className="text-sm mt-1">{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadStats}
                  className="mt-2"
                >
                  Retry
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-blue-500 dark:border-l-blue-400">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-3xl font-bold animate-pulse">...</div>
              ) : (
                <div className="text-3xl font-bold">{stats.totalUsers}</div>
              )}
              <p className="text-xs text-muted-foreground mt-1">All registered users</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-green-500 dark:border-l-green-400">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-3xl font-bold text-green-600 dark:text-green-400 animate-pulse">...</div>
              ) : (
                <div className="text-3xl font-bold text-green-600 dark:text-green-400">{stats.activeSubscriptions}</div>
              )}
              <p className="text-xs text-muted-foreground mt-1">Active subscriptions</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-red-500 dark:border-l-red-400">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Expired</CardTitle>
              <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-3xl font-bold text-red-600 dark:text-red-400 animate-pulse">...</div>
              ) : (
                <div className="text-3xl font-bold text-red-600 dark:text-red-400">{stats.expiredSubscriptions}</div>
              )}
              <p className="text-xs text-muted-foreground mt-1">Expired subscriptions</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-yellow-500 dark:border-l-yellow-400">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Trial</CardTitle>
              <Clock className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-3xl font-bold text-yellow-600 dark:text-yellow-400 animate-pulse">...</div>
              ) : (
                <div className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">{stats.trialUsers}</div>
              )}
              <p className="text-xs text-muted-foreground mt-1">Trial users</p>
            </CardContent>
          </Card>
        </div>

        {/* Content */}
        <div className="mt-6">
          {view === "users" && (
            <UserManagement 
              onUpdate={loadStats} 
              onUserSelect={handleUserSelect}
            />
          )}
          {view === "user-detail" && selectedUserId && (
            <UserDetailView 
              userId={selectedUserId}
              onBack={handleBackToUsers}
              onUpdate={loadStats}
            />
          )}
        </div>
      </div>
    </div>
  );
}

