"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Users, DollarSign, Activity, ArrowUp, ArrowDown } from "lucide-react";
import { format } from "date-fns";

interface AnalyticsData {
  userGrowth: Array<{ date: string; count: number }>;
  conversions: {
    trial_to_active: number;
    total_trials: number;
    total_active: number;
    total_expired: number;
  };
  revenueMetrics: {
    mrr: number;
    arr: number;
    by_tier: {
      free: number;
      basic: number;
      premium: number;
      enterprise: number;
    };
  };
  recentSignups: Array<{
    email: string;
    date: string;
    tier: string;
    status: string;
  }>;
  statusBreakdown: {
    active: number;
    trial: number;
    expired: number;
    cancelled: number;
  };
  totalUsers: number;
}

export default function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("30");

  useEffect(() => {
    loadAnalytics();
  }, [period]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/analytics?period=${period}`);
      const analyticsData = await response.json();
      if (analyticsData.userGrowth) {
        setData(analyticsData);
      }
    } catch (error) {
      console.error("Error loading analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
        <p className="text-sm text-muted-foreground mt-4">Loading analytics...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-muted-foreground">No analytics data available</p>
      </div>
    );
  }

  const conversionRate =
    data.conversions.total_trials > 0
      ? ((data.conversions.trial_to_active / data.conversions.total_trials) * 100).toFixed(1)
      : "0";

  // Calculate growth percentage
  const growthData = data.userGrowth;
  const currentGrowth = growthData[growthData.length - 1]?.count || 0;
  const previousGrowth = growthData[Math.max(0, growthData.length - 8)]?.count || 0;
  const growthPercentage =
    previousGrowth > 0 ? (((currentGrowth - previousGrowth) / previousGrowth) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Analytics & Reports</h2>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="365">Last year</option>
        </select>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.totalUsers}</div>
            <div className="flex items-center text-xs text-muted-foreground mt-1">
              {parseFloat(growthPercentage) >= 0 ? (
                <ArrowUp className="h-3 w-3 text-green-600 mr-1" />
              ) : (
                <ArrowDown className="h-3 w-3 text-red-600 mr-1" />
              )}
              <span>{Math.abs(parseFloat(growthPercentage))}% growth</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${data.revenueMetrics.mrr.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              ARR: ${data.revenueMetrics.arr.toFixed(2)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{conversionRate}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              {data.conversions.trial_to_active} of {data.conversions.total_trials} trials converted
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Subscriptions</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.conversions.total_active}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {data.statusBreakdown.trial} trials, {data.statusBreakdown.expired} expired
            </p>
          </CardContent>
        </Card>
      </div>

      {/* User Growth Chart */}
      <Card>
        <CardHeader>
          <CardTitle>User Growth</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-end justify-between gap-1">
            {data.userGrowth.map((point, index) => {
              const maxCount = Math.max(...data.userGrowth.map((p) => p.count));
              const height = maxCount > 0 ? (point.count / maxCount) * 100 : 0;
              return (
                <div
                  key={index}
                  className="flex-1 flex flex-col items-center group"
                  title={`${point.date}: ${point.count} users`}
                >
                  <div
                    className="w-full bg-primary rounded-t transition-all hover:bg-primary/80 cursor-pointer"
                    style={{ height: `${height}%` }}
                  />
                  {index % Math.ceil(data.userGrowth.length / 7) === 0 && (
                    <span className="text-xs text-muted-foreground mt-1 transform -rotate-45 origin-top-left whitespace-nowrap">
                      {format(new Date(point.date), "MMM d")}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Subscription Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Subscription Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(data.statusBreakdown).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between">
                  <span className="text-sm capitalize">{status}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-32 bg-muted rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${
                          status === "active"
                            ? "bg-green-600"
                            : status === "trial"
                            ? "bg-yellow-600"
                            : status === "expired"
                            ? "bg-red-600"
                            : "bg-gray-600"
                        }`}
                        style={{
                          width: `${(count / data.totalUsers) * 100}%`,
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

        <Card>
          <CardHeader>
            <CardTitle>Subscription Tiers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(data.revenueMetrics.by_tier).map(([tier, count]) => (
                <div key={tier} className="flex items-center justify-between">
                  <span className="text-sm capitalize">{tier}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-32 bg-muted rounded-full h-2">
                      <div
                        className="h-2 rounded-full bg-blue-600"
                        style={{
                          width: `${(count / data.totalUsers) * 100}%`,
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
      </div>

      {/* Recent Signups */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Signups</CardTitle>
        </CardHeader>
        <CardContent>
          {data.recentSignups.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No recent signups</p>
          ) : (
            <div className="space-y-2">
              {data.recentSignups.map((signup, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card"
                >
                  <div>
                    <p className="text-sm font-medium">{signup.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(signup.date), "MMM d, yyyy h:mm a")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs capitalize px-2 py-1 rounded bg-muted">
                      {signup.tier}
                    </span>
                    <span className="text-xs capitalize px-2 py-1 rounded bg-muted">
                      {signup.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

