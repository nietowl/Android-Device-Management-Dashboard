"use client";

import { useState, useEffect } from "react";
import { UserProfile } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Key, Copy, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { validateLicenseId, generateLicenseId } from "@/lib/utils/license-id";

interface LicenseManagementProps {
  onUpdate?: () => void;
}

export default function LicenseManagement({ onUpdate }: LicenseManagementProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [newLicenseId, setNewLicenseId] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<{ success: boolean; message: string } | null>(null);

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
      console.log("License management users data:", data);
      
      if (data.users && Array.isArray(data.users)) {
        setUsers(data.users);
        console.log("Loaded users:", data.users.length);
        console.log("Users with license_id:", data.users.filter((u: UserProfile) => u.license_id).length);
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

  const handleGenerateLicense = () => {
    const newId = generateLicenseId(); // Generates 25 alphanumeric + "=" (26 characters total)
    setNewLicenseId(newId);
  };

  const handleUpdateLicense = async (userId: string, licenseId: string) => {
    if (!validateLicenseId(licenseId)) {
      setUpdateStatus({ success: false, message: "Invalid license ID format. Must be exactly 26 characters: 25 alphanumeric (uppercase, lowercase, numbers) + '=' at the end." });
      return;
    }

    setIsGenerating(true);
    setUpdateStatus(null);

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ license_id: licenseId }),
      });

      const data = await response.json();

      if (response.ok) {
        setUpdateStatus({ success: true, message: "License ID updated successfully!" });
        setNewLicenseId("");
        setSelectedUser(null);
        loadUsers();
        onUpdate?.();
        
        // Clear success message after 3 seconds
        setTimeout(() => setUpdateStatus(null), 3000);
      } else {
        setUpdateStatus({ success: false, message: data.error || "Failed to update license ID" });
      }
    } catch (error) {
      console.error("Error updating license:", error);
      setUpdateStatus({ success: false, message: "Failed to update license ID" });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyLicense = (licenseId: string) => {
    navigator.clipboard.writeText(licenseId);
    setCopiedId(licenseId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredUsers = users.filter(
    (user) =>
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.license_id && user.license_id.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (user.email_hash && user.email_hash.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                <Key className="h-5 w-5" />
                License Management
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Manage user license IDs and their connection to email hashes
              </p>
            </div>
            <div className="relative flex-1 sm:flex-initial">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by email, license ID, or email hash..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 w-full sm:w-64 h-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {updateStatus && (
            <div className={`mb-4 p-3 rounded-lg flex items-center gap-2 ${
              updateStatus.success 
                ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400" 
                : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"
            }`}>
              {updateStatus.success ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              <span className="text-sm">{updateStatus.message}</span>
            </div>
          )}

          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
              <p className="text-sm text-muted-foreground mt-4">Loading licenses...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-12">
              <Key className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <p className="text-sm text-muted-foreground">No users found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredUsers.map((user) => (
                <div
                  key={user.id}
                  className="group flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="flex-shrink-0 p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                      <Key className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-sm truncate">{user.email}</p>
                        {!user.license_id && (
                          <Badge variant="destructive" className="text-xs">No License</Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        {user.license_id ? (
                          <>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-semibold text-foreground">{user.license_id}</span>
                              <button
                                onClick={() => handleCopyLicense(user.license_id!)}
                                className="p-1 hover:bg-accent rounded transition-colors"
                                title="Copy license ID"
                              >
                                {copiedId === user.license_id ? (
                                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </button>
                            </div>
                          </>
                        ) : (
                          <span className="text-red-600 dark:text-red-400">No license assigned</span>
                        )}
                        {user.email_hash && (
                          <span className="font-mono text-[10px] opacity-70">
                            Hash: {user.email_hash.substring(0, 16)}...
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {selectedUser?.id === user.id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={newLicenseId}
                          onChange={(e) => setNewLicenseId(e.target.value)}
                          placeholder="Enter license ID"
                          className="h-8 w-48 font-mono text-xs"
                          maxLength={50}
                        />
                        <Button
                          size="sm"
                          onClick={() => handleUpdateLicense(user.id, newLicenseId)}
                          disabled={isGenerating || !newLicenseId}
                          className="h-8"
                        >
                          {isGenerating ? (
                            <RefreshCw className="h-3 w-3 animate-spin" />
                          ) : (
                            "Save"
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setSelectedUser(null);
                            setNewLicenseId("");
                          }}
                          className="h-8"
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedUser(user);
                            setNewLicenseId(user.license_id || generateLicenseId()); // Generates 25 alphanumeric + "=" (26 characters total)
                          }}
                          className="h-8 gap-1"
                        >
                          <RefreshCw className="h-3 w-3" />
                          {user.license_id ? "Update" : "Assign"}
                        </Button>
                      </>
                    )}
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

