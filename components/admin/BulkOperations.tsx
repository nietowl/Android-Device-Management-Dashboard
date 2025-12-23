"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { UserProfile } from "@/types";
import { Download, Upload, Users, AlertCircle } from "lucide-react";

interface BulkOperationsProps {
  users?: UserProfile[];
  onUpdate: () => void;
}

export default function BulkOperations({ users = [], onUpdate }: BulkOperationsProps) {
  const [allUsers, setAllUsers] = useState<UserProfile[]>(users);
  const [loadingUsers, setLoadingUsers] = useState(users.length === 0);

  useEffect(() => {
    if (users.length === 0) {
      loadUsers();
    } else {
      setAllUsers(users);
    }
  }, [users]);

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const response = await fetch("/api/admin/users?limit=200");
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to fetch users" }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log("Bulk operations users data:", data);
      
      if (data.users && Array.isArray(data.users)) {
        setAllUsers(data.users);
      } else {
        console.warn("No users data received:", data);
        setAllUsers([]);
      }
    } catch (error) {
      console.error("Error loading users:", error);
    } finally {
      setLoadingUsers(false);
    }
  };
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<string>("");
  const [showConfirm, setShowConfirm] = useState(false);

  const handleSelectAll = () => {
    if (selectedUsers.size === allUsers.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(allUsers.map((u) => u.id)));
    }
  };

  const handleSelectUser = (userId: string) => {
    const newSelected = new Set(selectedUsers);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUsers(newSelected);
  };

  const handleBulkAction = async () => {
    if (selectedUsers.size === 0 || !action) return;

    setLoading(true);
    try {
      const userIds = Array.from(selectedUsers);

      if (action === "activate") {
        await Promise.all(
          userIds.map((id) =>
            fetch(`/api/admin/users/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ is_active: true }),
            })
          )
        );
      } else if (action === "deactivate") {
        await Promise.all(
          userIds.map((id) =>
            fetch(`/api/admin/users/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ is_active: false }),
            })
          )
        );
      } else if (action === "delete") {
        await Promise.all(
          userIds.map((id) =>
            fetch(`/api/admin/users/${id}`, {
              method: "DELETE",
            })
          )
        );
      }

      setSelectedUsers(new Set());
      setAction("");
      setShowConfirm(false);
      onUpdate();
    } catch (error) {
      console.error("Error performing bulk action:", error);
      alert("Failed to perform bulk action");
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    const csvContent = [
      ["Email", "Role", "Subscription Tier", "Status", "Max Devices", "Created At"],
      ...allUsers.map((u) => [
        u.email,
        u.role,
        u.subscription_tier,
        u.subscription_status,
        u.max_devices.toString(),
        new Date(u.created_at).toLocaleDateString(),
      ]),
    ]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `users_export_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Bulk Operations
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Perform actions on multiple users at once
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Selection Controls */}
          <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={selectedUsers.size === allUsers.length && allUsers.length > 0}
                onChange={handleSelectAll}
              />
              <Label className="text-sm font-medium cursor-pointer">
                Select All ({selectedUsers.size} selected)
              </Label>
            </div>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>

          {loadingUsers && (
            <div className="text-center py-8">
              <div className="inline-block h-6 w-6 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
              <p className="text-sm text-muted-foreground mt-2">Loading users...</p>
            </div>
          )}

          {/* Bulk Actions */}
          {selectedUsers.size > 0 && (
            <div className="p-4 border rounded-lg bg-blue-50 dark:bg-blue-950/20">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium">
                  {selectedUsers.size} user{selectedUsers.size !== 1 ? "s" : ""} selected
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setAction("activate");
                    setShowConfirm(true);
                  }}
                  disabled={loading}
                >
                  Activate Selected
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setAction("deactivate");
                    setShowConfirm(true);
                  }}
                  disabled={loading}
                >
                  Deactivate Selected
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setAction("delete");
                    setShowConfirm(true);
                  }}
                  disabled={loading}
                >
                  Delete Selected
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedUsers(new Set())}
                >
                  Clear Selection
                </Button>
              </div>
            </div>
          )}

          {/* User List with Checkboxes */}
          {!loadingUsers && (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {allUsers.map((user) => (
              <div
                key={user.id}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedUsers.has(user.id)
                    ? "bg-primary/10 border-primary"
                    : "bg-card hover:bg-accent/50"
                }`}
                onClick={() => handleSelectUser(user.id)}
              >
                <Checkbox
                  checked={selectedUsers.has(user.id)}
                  onChange={() => handleSelectUser(user.id)}
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{user.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {user.role} • {user.subscription_tier} • {user.subscription_status}
                  </p>
                </div>
                {!user.is_active && (
                  <span className="text-xs text-red-600 dark:text-red-400">Inactive</span>
                )}
              </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Confirm Bulk Action</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Are you sure you want to {action} {selectedUsers.size} user
                {selectedUsers.size !== 1 ? "s" : ""}? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowConfirm(false);
                    setAction("");
                  }}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button
                  variant={action === "delete" ? "destructive" : "default"}
                  onClick={handleBulkAction}
                  disabled={loading}
                >
                  {loading ? "Processing..." : `Confirm ${action}`}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

