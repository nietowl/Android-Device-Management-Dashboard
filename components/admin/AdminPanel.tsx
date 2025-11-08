"use client";

import { useState, useEffect } from "react";
import { UserProfile } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, Shield, Calendar, Activity, TrendingUp, AlertCircle, Clock, BarChart3, Smartphone, Layers } from "lucide-react";
import dynamic from "next/dynamic";

// Lazy load admin sub-components
const UserManagement = dynamic(() => import("@/components/admin/UserManagement"));
const SubscriptionOverview = dynamic(() => import("@/components/admin/SubscriptionOverview"));
const ActivityLogs = dynamic(() => import("@/components/admin/ActivityLogs"));
const AnalyticsDashboard = dynamic(() => import("@/components/admin/AnalyticsDashboard"));
const DeviceManagement = dynamic(() => import("@/components/admin/DeviceManagement"));
const BulkOperations = dynamic(() => import("@/components/admin/BulkOperations"));

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState<"users" | "subscriptions" | "activity" | "analytics" | "devices" | "bulk">("users");
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeSubscriptions: 0,
    expiredSubscriptions: 0,
    trialUsers: 0,
  });

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const response = await fetch("/api/admin/users?limit=1000");
      const data = await response.json();
      
      if (data.users) {
        const users = data.users as UserProfile[];
        setStats({
          totalUsers: users.length,
          activeSubscriptions: users.filter(u => u.subscription_status === "active").length,
          expiredSubscriptions: users.filter(u => u.subscription_status === "expired").length,
          trialUsers: users.filter(u => u.subscription_status === "trial").length,
        });
      }
    } catch (error) {
      console.error("Error loading stats:", error);
    }
  };

  const tabs = [
    { id: "users" as const, label: "Users", icon: Users },
    { id: "analytics" as const, label: "Analytics", icon: BarChart3 },
    { id: "devices" as const, label: "Devices", icon: Smartphone },
    { id: "subscriptions" as const, label: "Subscriptions", icon: Calendar },
    { id: "bulk" as const, label: "Bulk Ops", icon: Layers },
    { id: "activity" as const, label: "Activity", icon: Activity },
  ];

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

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-blue-500 dark:border-l-blue-400">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.totalUsers}</div>
              <p className="text-xs text-muted-foreground mt-1">All registered users</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-green-500 dark:border-l-green-400">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600 dark:text-green-400">{stats.activeSubscriptions}</div>
              <p className="text-xs text-muted-foreground mt-1">Active subscriptions</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-red-500 dark:border-l-red-400">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Expired</CardTitle>
              <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-600 dark:text-red-400">{stats.expiredSubscriptions}</div>
              <p className="text-xs text-muted-foreground mt-1">Expired subscriptions</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-yellow-500 dark:border-l-yellow-400">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Trial</CardTitle>
              <Clock className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">{stats.trialUsers}</div>
              <p className="text-xs text-muted-foreground mt-1">Trial users</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <div className="border-b border-border">
          <nav className="flex space-x-1" aria-label="Tabs">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors
                    border-b-2 ${
                      isActive
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
                    }
                  `}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="mt-6">
          {activeTab === "users" && <UserManagement onUpdate={loadStats} />}
          {activeTab === "analytics" && <AnalyticsDashboard />}
          {activeTab === "devices" && <DeviceManagement />}
          {activeTab === "subscriptions" && <SubscriptionOverview />}
          {activeTab === "bulk" && <BulkOperations onUpdate={loadStats} />}
          {activeTab === "activity" && <ActivityLogs />}
        </div>
      </div>
    </div>
  );
}

