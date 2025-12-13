"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, Calendar } from "lucide-react";

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
  subscription_start_date: string;
  subscription_end_date: string;
  license_key_validity: string;
  max_devices: number;
}

export default function CreateUserModal({ open, onClose, onSave }: CreateUserModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validityUnit, setValidityUnit] = useState<"days" | "months" | "years">("days");
  const [formData, setFormData] = useState<CreateUserData>({
    email: "",
    password: "",
    role: "user",
    subscription_tier: "free",
    subscription_status: "trial",
    subscription_start_date: "",
    subscription_end_date: "",
    license_key_validity: "",
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

      if (formData.subscription_start_date) {
        payload.subscription_start_date = new Date(formData.subscription_start_date).toISOString();
      }
      if (formData.subscription_end_date) {
        payload.subscription_end_date = new Date(formData.subscription_end_date).toISOString();
      }
      if (formData.license_key_validity) {
        payload.license_key_validity = new Date(formData.license_key_validity).toISOString();
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
          subscription_start_date: "",
          subscription_end_date: "",
          license_key_validity: "",
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

              <div className="space-y-2">
                <Label htmlFor="subscription_start_date" className="text-sm font-medium">
                  Subscription Start Date
                </Label>
                <div className="relative">
                  <Input
                    id="subscription_start_date"
                    type="datetime-local"
                    value={formData.subscription_start_date}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        subscription_start_date: e.target.value,
                      })
                    }
                    className="w-full pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => {
                      const input = document.getElementById("subscription_start_date") as HTMLInputElement | null;
                      if (input) {
                        if ('showPicker' in input && typeof (input as any).showPicker === 'function') {
                          (input as any).showPicker();
                        } else {
                          input.focus();
                          input.click();
                        }
                      }
                    }}
                  >
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subscription_end_date" className="text-sm font-medium">
                  Subscription End Date
                </Label>
                <div className="relative">
                  <Input
                    id="subscription_end_date"
                    type="datetime-local"
                    value={formData.subscription_end_date}
                    onChange={(e) => {
                      const newEndDate = e.target.value;
                      setFormData({
                        ...formData,
                        subscription_end_date: newEndDate,
                        license_key_validity: newEndDate,
                      });
                    }}
                    className="w-full pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => {
                      const input = document.getElementById("subscription_end_date") as HTMLInputElement | null;
                      if (input) {
                        if ('showPicker' in input && typeof (input as any).showPicker === 'function') {
                          (input as any).showPicker();
                        } else {
                          input.focus();
                          input.click();
                        }
                      }
                    }}
                  >
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="license_validity_duration" className="text-sm font-medium">
                  License Key Validity
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="license_validity_duration"
                    type="number"
                    min="1"
                    placeholder="30"
                    value={
                      formData.license_key_validity && formData.subscription_start_date
                        ? (() => {
                            const start = new Date(formData.subscription_start_date);
                            const validity = new Date(formData.license_key_validity);
                            
                            if (validityUnit === "days") {
                              const diffTime = validity.getTime() - start.getTime();
                              const days = Math.round(diffTime / (1000 * 60 * 60 * 24));
                              return days > 0 ? days.toString() : "";
                            } else if (validityUnit === "months") {
                              // Calculate months more accurately
                              let months = (validity.getFullYear() - start.getFullYear()) * 12;
                              months += validity.getMonth() - start.getMonth();
                              // Adjust if the day hasn't been reached yet this month
                              if (validity.getDate() < start.getDate()) {
                                months--;
                              }
                              return months > 0 ? months.toString() : "";
                            } else if (validityUnit === "years") {
                              let years = validity.getFullYear() - start.getFullYear();
                              // Adjust if the month/day hasn't been reached yet this year
                              if (validity.getMonth() < start.getMonth() || 
                                  (validity.getMonth() === start.getMonth() && validity.getDate() < start.getDate())) {
                                years--;
                              }
                              return years > 0 ? years.toString() : "";
                            }
                            return "";
                          })()
                        : ""
                    }
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 0;
                      if (value > 0 && formData.subscription_start_date) {
                        const startDate = new Date(formData.subscription_start_date);
                        const validityDate = new Date(startDate);
                        
                        if (validityUnit === "days") {
                          validityDate.setDate(validityDate.getDate() + value);
                        } else if (validityUnit === "months") {
                          validityDate.setMonth(validityDate.getMonth() + value);
                        } else if (validityUnit === "years") {
                          validityDate.setFullYear(validityDate.getFullYear() + value);
                        }
                        
                        setFormData({
                          ...formData,
                          license_key_validity: validityDate.toISOString(),
                        });
                      } else {
                        setFormData({
                          ...formData,
                          license_key_validity: "",
                        });
                      }
                    }}
                    className="flex-1"
                  />
                  <select
                    className="flex h-10 w-24 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={validityUnit}
                    onChange={(e) => {
                      const unit = e.target.value as "days" | "months" | "years";
                      setValidityUnit(unit);
                      
                      // Recalculate based on existing validity date
                      if (formData.license_key_validity && formData.subscription_start_date) {
                        const startDate = new Date(formData.subscription_start_date);
                        const validityDate = new Date(formData.license_key_validity);
                        
                        // Calculate the value in the new unit
                        let value = 0;
                        if (unit === "days") {
                          const diffTime = validityDate.getTime() - startDate.getTime();
                          value = Math.round(diffTime / (1000 * 60 * 60 * 24));
                        } else if (unit === "months") {
                          let months = (validityDate.getFullYear() - startDate.getFullYear()) * 12;
                          months += validityDate.getMonth() - startDate.getMonth();
                          if (validityDate.getDate() < startDate.getDate()) {
                            months--;
                          }
                          value = months;
                        } else if (unit === "years") {
                          let years = validityDate.getFullYear() - startDate.getFullYear();
                          if (validityDate.getMonth() < startDate.getMonth() || 
                              (validityDate.getMonth() === startDate.getMonth() && validityDate.getDate() < startDate.getDate())) {
                            years--;
                          }
                          value = years;
                        }
                        
                        // Update the input value display (it will recalculate on next render)
                        const daysInput = document.getElementById("license_validity_duration") as HTMLInputElement;
                        if (daysInput && value > 0) {
                          daysInput.value = value.toString();
                        }
                      }
                    }}
                  >
                    <option value="days">Days</option>
                    <option value="months">Months</option>
                    <option value="years">Years</option>
                  </select>
                </div>
                <p className="text-xs text-muted-foreground">
                  Validity period from subscription start date
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

