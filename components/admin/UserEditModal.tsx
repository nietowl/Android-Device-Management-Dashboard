"use client";

import { useState } from "react";
import { UserProfile, UserUpdateData } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";

interface UserEditModalProps {
  user: UserProfile;
  open: boolean;
  onClose: () => void;
  onSave: () => void;
}

export default function UserEditModal({ user, open, onClose, onSave }: UserEditModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<UserUpdateData>({
    role: user.role,
    subscription_tier: user.subscription_tier,
    subscription_status: user.subscription_status,
    subscription_end_date: user.subscription_end_date || undefined,
    max_devices: user.max_devices,
    is_active: user.is_active,
  });

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        onSave();
      } else {
        const data = await response.json();
        alert(data.error || "Failed to update user");
      }
    } catch (error) {
      console.error("Error updating user:", error);
      alert("Failed to update user");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border-2">
        <CardHeader className="flex-shrink-0 border-b bg-muted/50">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl">Edit User</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">{user.email}</p>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={onClose}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="role" className="text-sm font-medium">Role</Label>
                <select
                  id="role"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={formData.role}
                  onChange={(e) =>
                    setFormData({ ...formData, role: e.target.value as "admin" | "user" })
                  }
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subscription_tier" className="text-sm font-medium">Subscription Tier</Label>
                <select
                  id="subscription_tier"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={formData.subscription_tier}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      subscription_tier: e.target.value as any,
                    })
                  }
                >
                  <option value="free">Free</option>
                  <option value="basic">Basic</option>
                  <option value="premium">Premium</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subscription_status" className="text-sm font-medium">Status</Label>
                <select
                  id="subscription_status"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={formData.subscription_status}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      subscription_status: e.target.value as any,
                    })
                  }
                >
                  <option value="trial">Trial</option>
                  <option value="active">Active</option>
                  <option value="expired">Expired</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="max_devices" className="text-sm font-medium">Max Devices</Label>
                <Input
                  id="max_devices"
                  type="number"
                  min="1"
                  value={formData.max_devices}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      max_devices: parseInt(e.target.value) || 1,
                    })
                  }
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="subscription_end_date" className="text-sm font-medium">Subscription End Date</Label>
                <Input
                  id="subscription_end_date"
                  type="datetime-local"
                  value={
                    formData.subscription_end_date
                      ? new Date(formData.subscription_end_date).toISOString().slice(0, 16)
                      : ""
                  }
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      subscription_end_date: e.target.value
                        ? new Date(e.target.value).toISOString()
                        : undefined,
                    })
                  }
                />
              </div>

              <div className="flex items-center space-x-2 md:col-span-2 pt-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) =>
                    setFormData({ ...formData, is_active: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <Label htmlFor="is_active" className="text-sm font-medium cursor-pointer">
                  Account is active
                </Label>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

