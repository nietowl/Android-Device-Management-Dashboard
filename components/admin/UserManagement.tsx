"use client";

import { useState, useEffect } from "react";
import { UserProfile } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Edit2, Trash2, Shield, User, UserPlus } from "lucide-react";
import UserEditModal from "./UserEditModal";
import CreateUserModal from "./CreateUserModal";

interface UserManagementProps {
  onUpdate?: () => void;
}

export default function UserManagement({ onUpdate }: UserManagementProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/users?limit=100");
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

  const handleEdit = (user: UserProfile) => {
    setSelectedUser(user);
    setIsEditModalOpen(true);
  };

  const handleDelete = async (userId: string) => {
    if (!confirm("Are you sure you want to deactivate this user?")) return;

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        loadUsers();
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

  const filteredUsers = users.filter(
    (user) =>
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

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

  const getDaysRemaining = (endDate: string | null) => {
    if (!endDate) return null;
    const end = new Date(endDate);
    const now = new Date();
    const days = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return days;
  };

  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-xl">User Management</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Manage user accounts, roles, and subscriptions
              </p>
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-initial">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search users..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 w-full sm:w-64 h-9"
                />
              </div>
              <Button
                onClick={() => setIsCreateModalOpen(true)}
                className="h-9 gap-2"
              >
                <UserPlus className="h-4 w-4" />
                <span className="hidden sm:inline">Create User</span>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
              <p className="text-sm text-muted-foreground mt-4">Loading users...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-12">
              <User className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <p className="text-sm text-muted-foreground">No users found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredUsers.map((user) => {
                const daysRemaining = getDaysRemaining(user.subscription_end_date);
                return (
                  <div
                    key={user.id}
                    className="group flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className={`flex-shrink-0 p-2 rounded-lg ${
                        user.role === "admin" 
                          ? "bg-blue-100 dark:bg-blue-900/30" 
                          : "bg-gray-100 dark:bg-gray-800"
                      }`}>
                        {user.role === "admin" ? (
                          <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        ) : (
                          <User className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-semibold text-sm truncate">{user.email}</p>
                          <Badge 
                            variant={user.role === "admin" ? "default" : "secondary"}
                            className="text-xs"
                          >
                            {user.role}
                          </Badge>
                          {!user.is_active && (
                            <Badge variant="destructive" className="text-xs">Inactive</Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span className="capitalize">{user.subscription_tier}</span>
                          <Badge 
                            variant={getSubscriptionBadgeVariant(user.subscription_status)}
                            className="text-xs"
                          >
                            {user.subscription_status}
                          </Badge>
                          {daysRemaining !== null && (
                            <span className={daysRemaining > 0 ? "" : "text-red-600 dark:text-red-400"}>
                              {daysRemaining > 0
                                ? `${daysRemaining} days left`
                                : "Expired"}
                            </span>
                          )}
                          <span>{user.max_devices} device{user.max_devices !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(user)}
                        className="h-8 w-8 p-0 hover:bg-accent"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      {user.role !== "admin" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(user.id)}
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

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
            onUpdate?.();
            setIsEditModalOpen(false);
            setSelectedUser(null);
          }}
        />
      )}

      {isCreateModalOpen && (
        <CreateUserModal
          open={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onSave={() => {
            loadUsers();
            onUpdate?.();
            setIsCreateModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
