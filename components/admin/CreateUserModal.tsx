"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";

interface CreateUserModalProps {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
}

interface CreateUserData {
  email: string;
  password: string;
  role: "admin" | "user";
  subscription_tier: "free" | "basic" | "premium" | "enterprise";
  subscription_status: "active" | "expired" | "cancelled" | "trial";
  subscription_end_date: string;
  max_devices: number;
}

export default function CreateUserModal({ open, onClose, onSave }: CreateUserModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<CreateUserData>({
    email: "",
    password: "",
    role: "user",
    subscription_tier: "free",
    subscription_status: "trial",
    subscription_end_date: "",
    max_devices: 1,
  });

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload: any = {
        email: formData.email,
        password: formData.password,
        role: formData.role,
        subscription_tier: formData.subscription_tier,
        subscription_status: formData.subscription_status,
        max_devices: formData.max_devices,
      };

      if (formData.subscription_end_date) {
        payload.subscription_end_date = new Date(formData.subscription_end_date).toISOString();
      }

      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok) {
        // Reset form
        setFormData({
          email: "",
          password: "",
          role: "user",
          subscription_tier: "free",
          subscription_status: "trial",
          subscription_end_date: "",
          max_devices: 1,
        });
        onSave();
      } else {
        setError(data.error || "Failed to create user");
      }
    } catch (error: any) {
      console.error("Error creating user:", error);
      setError("Failed to create user. Please try again.");
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
              <CardTitle className="text-xl">Create New User</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Create a new user account with custom settings
              </p>
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
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="email" className="text-sm font-medium">
                  Email <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="user@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="password" className="text-sm font-medium">
                  Password <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  minLength={6}
                />
                <p className="text-xs text-muted-foreground">
                  Must be at least 6 characters long
                </p>
              </div>

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
                <Label htmlFor="subscription_end_date" className="text-sm font-medium">
                  Subscription End Date
                </Label>
                <Input
                  id="subscription_end_date"
                  type="datetime-local"
                  value={formData.subscription_end_date}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      subscription_end_date: e.target.value,
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty for default 14-day trial period
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Creating..." : "Create User"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

