"use client";

import { useState, useEffect } from "react";
import { UserProfile } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, 
  Edit2, 
  Trash2, 
  Calendar, 
  Key, 
  Shield, 
  User,
  Clock,
  Mail,
  AlertCircle
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import UserEditModal from "./UserEditModal";

interface UserDetailViewProps {
  userId: string;
  onBack: () => void;
  onUpdate?: () => void;
}

export default function UserDetailView({ userId, onBack, onUpdate }: UserDetailViewProps) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [extendingSubscription, setExtendingSubscription] = useState(false);

  useEffect(() => {
    loadUserData();
  }, [userId]);

  const loadUserData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Load user profile
      const userResponse = await fetch(`/api/admin/users/${userId}`);
      if (!userResponse.ok) {
        const errorData = await userResponse.json().catch(() => ({ error: "Failed to fetch user data" }));
        throw new Error(errorData.error || "Failed to fetch user data");
      }
      const userData = await userResponse.json();
      setUser(userData.user);
    } catch (error) {
      console.error("Error loading user data:", error);
      setError(error instanceof Error ? error.message : "Failed to load user data");
    } finally {
      setLoading(false);
    }
  };

  const handleExtendSubscription = async (days: number) => {
    if (!user) {
      console.error("Cannot extend subscription: user is null");
      return;
    }
    
    console.log(`Extending subscription by ${days} days for user ${userId}`);
    setExtendingSubscription(true);
    
    try {
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
        await loadUserData();
        onUpdate?.();
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
    } finally {
      setExtendingSubscription(false);
    }
  };

  const handleDelete = async () => {
    if (!user || !confirm("Are you sure you want to deactivate this user?")) return;

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        onBack();
        onUpdate?.();
      } else {
        const data = await response.json();
        alert(data.error || "Failed to deactivate user");
      }
    } catch (error) {
      console.error("Error deactivating user:", error);
      alert("Failed to deactivate user");
    }
  };

  const getDaysRemaining = (endDate: string | null) => {
    if (!endDate) return null;
    const end = new Date(endDate);
    const now = new Date();
    const days = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return days;
  };

  const getSubscriptionBadgeVariant = (status: string) => {
    switch (status) {
      case "active":
        return "success";
      case "expired":
        return "destructive";
      case "trial":
        return "secondary";
      case "cancelled":
        return "outline";
      default:
        return "secondary";
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
        <p className="text-sm text-muted-foreground mt-4">Loading user data...</p>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Users
        </Button>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">
                {error || "User not found"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const daysRemaining = getDaysRemaining(user.subscription_end_date);

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Button variant="ghost" onClick={onBack} className="gap-2">
        <ArrowLeft className="h-4 w-4" />
        Back to Users
      </Button>

      {/* User Info Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-lg ${
                user.role === "admin" 
                  ? "bg-blue-100 dark:bg-blue-900/30" 
                  : "bg-gray-100 dark:bg-gray-800"
              }`}>
                {user.role === "admin" ? (
                  <Shield className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                ) : (
                  <User className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <div>
                <CardTitle className="text-2xl flex items-center gap-2">
                  {user.email}
                  <Badge 
                    variant={user.role === "admin" ? "default" : "secondary"}
                    className="text-xs"
                  >
                    {user.role}
                  </Badge>
                  {!user.is_active && (
                    <Badge variant="destructive" className="text-xs">Inactive</Badge>
                  )}
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Created {format(new Date(user.created_at), "MMM d, yyyy")}
                  {user.updated_at && user.updated_at !== user.created_at && (
                    <> • Updated {formatDistanceToNow(new Date(user.updated_at), { addSuffix: true })}</>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditModalOpen(true)}
                className="gap-2"
              >
                <Edit2 className="h-4 w-4" />
                Edit User
              </Button>
              {user.role !== "admin" && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDelete}
                  className="gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Deactivate
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Subscription Details */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Subscription Details</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExtendSubscription(30)}
                disabled={extendingSubscription}
              >
                +30 Days
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExtendSubscription(90)}
                disabled={extendingSubscription}
              >
                +90 Days
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Tier</p>
              <p className="text-lg font-semibold capitalize">{user.subscription_tier}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <Badge 
                variant={getSubscriptionBadgeVariant(user.subscription_status)}
                className="text-xs mt-1"
              >
                {user.subscription_status}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Start Date</p>
              <p className="text-sm font-medium">
                {user.subscription_start_date 
                  ? format(new Date(user.subscription_start_date), "MMM d, yyyy")
                  : "N/A"}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">End Date</p>
              <p className="text-sm font-medium">
                {user.subscription_end_date 
                  ? format(new Date(user.subscription_end_date), "MMM d, yyyy")
                  : "N/A"}
              </p>
            </div>
          </div>
          {daysRemaining !== null && (
            <div className="pt-4 border-t">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Time Remaining:</span>
                <span className={`text-sm font-semibold ${
                  daysRemaining > 0 ? "" : "text-red-600 dark:text-red-400"
                }`}>
                  {daysRemaining > 0
                    ? `${daysRemaining} day${daysRemaining !== 1 ? "s" : ""}`
                    : "Expired"}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* License Information */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-muted-foreground" />
            <CardTitle>License Information</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {user.license_id ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">License ID:</span>
                <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
                  {user.license_id}
                </code>
              </div>
              {user.email_hash && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Email Hash:</span>
                  <code className="text-xs font-mono bg-muted px-2 py-1 rounded opacity-70">
                    {user.email_hash.substring(0, 16)}...
                  </code>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground">No license assigned</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Modal */}
      {isEditModalOpen && user && (
        <UserEditModal
          user={user}
          open={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
          }}
          onSave={() => {
            loadUserData();
            onUpdate?.();
            setIsEditModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

