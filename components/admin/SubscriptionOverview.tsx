"use client";

import { useState, useEffect } from "react";
import { UserProfile } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, AlertCircle, Clock } from "lucide-react";
import { format } from "date-fns";

export default function SubscriptionOverview() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/users?limit=1000");
      const data = await response.json();
      if (data.users) {
        setUsers(data.users);
      }
    } catch (error) {
      console.error("Error loading users:", error);
    } finally {
      setLoading(false);
    }
  };

  const getDaysRemaining = (endDate: string | null) => {
    if (!endDate) return null;
    const end = new Date(endDate);
    const now = new Date();
    const days = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return days;
  };

  const expiringSoon = users.filter((user) => {
    const days = getDaysRemaining(user.subscription_end_date);
    return (
      user.subscription_status === "active" &&
      days !== null &&
      days > 0 &&
      days <= 7
    );
  });

  const expired = users.filter(
    (user) => user.subscription_status === "expired" || !user.is_active
  );

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
        <p className="text-sm text-muted-foreground mt-4">Loading subscriptions...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Expiring Soon */}
      {expiringSoon.length > 0 && (
        <Card className="border-l-4 border-l-yellow-500 dark:border-l-yellow-400">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
              Expiring Soon (Next 7 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {expiringSoon.map((user) => {
                const days = getDaysRemaining(user.subscription_end_date);
                return (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800"
                  >
                    <div>
                      <p className="font-medium text-sm">{user.email}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {user.subscription_tier} • {days} days remaining
                      </p>
                    </div>
                    {user.subscription_end_date && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(user.subscription_end_date), "MMM d, yyyy")}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Expired */}
      {expired.length > 0 && (
        <Card className="border-l-4 border-l-red-500 dark:border-l-red-400">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              Expired Subscriptions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {expired.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                >
                  <div>
                    <p className="font-medium text-sm">{user.email}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {user.subscription_tier} • {user.subscription_status}
                    </p>
                  </div>
                  {user.subscription_end_date && (
                    <div className="text-xs text-muted-foreground">
                      Expired: {format(new Date(user.subscription_end_date), "MMM d, yyyy")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Active Subscriptions */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl">All Subscriptions</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Complete overview of all user subscriptions
          </p>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <p className="text-sm text-muted-foreground">No subscriptions found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {users.map((user) => {
                const days = getDaysRemaining(user.subscription_end_date);
                return (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex-1">
                      <p className="font-semibold text-sm mb-1">{user.email}</p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-xs capitalize">
                          {user.subscription_tier}
                        </Badge>
                        <Badge
                          variant={
                            user.subscription_status === "active"
                              ? "success"
                              : user.subscription_status === "expired"
                              ? "destructive"
                              : "secondary"
                          }
                          className="text-xs"
                        >
                          {user.subscription_status}
                        </Badge>
                        {days !== null && (
                          <span className={days > 0 ? "" : "text-red-600 dark:text-red-400 font-medium"}>
                            {days > 0 ? `${days} days left` : "Expired"}
                          </span>
                        )}
                      </div>
                    </div>
                    {user.subscription_end_date && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1 ml-4">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(user.subscription_end_date), "MMM d, yyyy")}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

