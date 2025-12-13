"use client";

import { useState, useEffect } from "react";
import { UserProfile } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Calendar, AlertCircle, Clock, Edit2, Plus, Search } from "lucide-react";
import { format } from "date-fns";
import UserEditModal from "./UserEditModal";

export default function SubscriptionOverview() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/users?limit=5000");
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to fetch users" }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log("Subscription users data:", data);
      
      if (data.users && Array.isArray(data.users)) {
        setUsers(data.users);
      } else {
        console.warn("No users data received:", data);
        setUsers([]);
      }
    } catch (error) {
      console.error("Error loading users:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (user: UserProfile) => {
    setSelectedUser(user);
    setIsEditModalOpen(true);
  };

  const handleExtendSubscription = async (userId: string, days: number) => {
    console.log(`Extending subscription by ${days} days for user ${userId}`);
    
    try {
      const user = users.find(u => u.id === userId);
      if (!user) {
        console.error("User not found:", userId);
        alert("User not found");
        return;
      }

      const currentEndDate = user.subscription_end_date 
        ? new Date(user.subscription_end_date)
        : new Date();
      
      const newEndDate = new Date(currentEndDate);
      newEndDate.setDate(newEndDate.getDate() + days);

      // Also update license_key_validity to match the new end date
      const updatePayload: any = {
        subscription_end_date: newEndDate.toISOString(),
        subscription_status: "active",
        license_key_validity: newEndDate.toISOString(), // Sync license validity with subscription end date
      };

      console.log("Updating subscription with payload:", updatePayload);

      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updatePayload),
      });

      console.log("Response status:", response.status, response.statusText);

      if (response.ok) {
        const result = await response.json();
        console.log("Subscription extended successfully:", result);
        await loadUsers(); // Reload users to show updated data
      } else {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText || `HTTP ${response.status}: ${response.statusText}` };
        }
        console.error("Failed to extend subscription:", errorData);
        alert(errorData.error || `Failed to extend subscription. Status: ${response.status}`);
      }
    } catch (error) {
      console.error("Error extending subscription:", error);
      alert(`Failed to extend subscription: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  const getDaysRemaining = (endDate: string | null) => {
    if (!endDate) return null;
    const end = new Date(endDate);
    const now = new Date();
    const days = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return days;
  };

  const filteredUsers = users.filter((user) => {
    const matchesSearch = 
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.subscription_tier.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesFilter = 
      filterStatus === "all" ||
      user.subscription_status === filterStatus ||
      (filterStatus === "expiring" && getDaysRemaining(user.subscription_end_date) !== null && getDaysRemaining(user.subscription_end_date)! > 0 && getDaysRemaining(user.subscription_end_date)! <= 7);

    return matchesSearch && matchesFilter;
  });

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
      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by email or tier..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant={filterStatus === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterStatus("all")}
              >
                All
              </Button>
              <Button
                variant={filterStatus === "active" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterStatus("active")}
              >
                Active
              </Button>
              <Button
                variant={filterStatus === "expiring" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterStatus("expiring")}
              >
                Expiring
              </Button>
              <Button
                variant={filterStatus === "expired" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterStatus("expired")}
              >
                Expired
              </Button>
              <Button
                variant={filterStatus === "trial" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterStatus("trial")}
              >
                Trial
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Expiring Soon */}
      {expiringSoon.length > 0 && filterStatus === "all" && (
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
                    <div className="flex-1">
                      <p className="font-medium text-sm">{user.email}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {user.subscription_tier} • {days} days remaining
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {user.subscription_end_date && (
                        <div className="text-xs text-muted-foreground flex items-center gap-1 mr-2">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(user.subscription_end_date), "MMM d, yyyy")}
                        </div>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleExtendSubscription(user.id, 30)}
                        className="h-7 text-xs"
                      >
                        +30 days
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(user)}
                        className="h-7 w-7 p-0"
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Expired */}
      {expired.length > 0 && filterStatus === "all" && (
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
                  <div className="flex-1">
                    <p className="font-medium text-sm">{user.email}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {user.subscription_tier} • {user.subscription_status}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {user.subscription_end_date && (
                      <div className="text-xs text-muted-foreground mr-2">
                        Expired: {format(new Date(user.subscription_end_date), "MMM d, yyyy")}
                      </div>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleExtendSubscription(user.id, 30)}
                      className="h-7 text-xs"
                    >
                      Reactivate
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(user)}
                      className="h-7 w-7 p-0"
                    >
                      <Edit2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Subscriptions */}
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl">All Subscriptions</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Manage user subscriptions ({filteredUsers.length} {filterStatus !== "all" ? filterStatus : ""} subscriptions)
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredUsers.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <p className="text-sm text-muted-foreground">No subscriptions found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredUsers.map((user) => {
                const days = getDaysRemaining(user.subscription_end_date);
                return (
                  <div
                    key={user.id}
                    className="group flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm mb-1 truncate">{user.email}</p>
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
                        {user.max_devices && (
                          <span>{user.max_devices} device{user.max_devices !== 1 ? 's' : ''}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      {user.subscription_end_date && (
                        <div className="text-xs text-muted-foreground flex items-center gap-1 mr-2">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(user.subscription_end_date), "MMM d, yyyy")}
                        </div>
                      )}
                      {user.subscription_status === "active" && days !== null && days > 0 && days <= 30 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleExtendSubscription(user.id, 30)}
                          className="h-7 text-xs"
                        >
                          +30 days
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(user)}
                        className="h-8 w-8 p-0 hover:bg-accent"
                        title="Edit subscription"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Modal */}
      {isEditModalOpen && selectedUser && (
        <UserEditModal
          user={selectedUser}
          open={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setSelectedUser(null);
          }}
          onSave={() => {
            loadUsers();
            setIsEditModalOpen(false);
            setSelectedUser(null);
          }}
        />
      )}
    </div>
  );
}

