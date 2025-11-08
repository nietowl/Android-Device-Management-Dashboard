"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClientSupabase } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Home, Save, Bell, Shield, Moon, Sun, Terminal, User, Key, Trash2, AlertCircle, UserCircle } from "lucide-react";
import { useTheme } from "@/components/theme/ThemeProvider";
import { getUserProfileClient } from "@/lib/admin/client";
import { UserProfile } from "@/types";

type TabType = "profile" | "preferences" | "security";

export default function SettingsPage() {
  const router = useRouter();
  const supabase = createClientSupabase();
  const { theme, colorMode, setTheme, setColorMode } = useTheme();
  const [activeTab, setActiveTab] = useState<TabType>("profile");
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  
  // Profile form data
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  
  // Preferences settings
  const [settings, setSettings] = useState({
    emailNotifications: true,
    deviceAlerts: true,
    lowBatteryAlert: true,
    storageAlert: true,
    language: "en",
  });
  
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    loadUser();
    loadSettings();
  }, []);

  const loadUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUser(user);
      setFormData({ ...formData, email: user.email || "" });
      const userProfile = await getUserProfileClient();
      setProfile(userProfile);
      const savedUsername = localStorage.getItem("user_display_username");
      if (savedUsername) {
        setFormData(prev => ({ ...prev, username: savedUsername }));
      }
    }
  };

  const loadSettings = () => {
    const savedSettings = localStorage.getItem("userSettings");
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setSettings(prev => ({ ...prev, ...parsed }));
      } catch (e) {
        console.error("Error loading settings:", e);
      }
    }
  };

  const handleUpdateUsername = () => {
    if (!formData.username || formData.username.trim().length === 0) {
      alert("Please enter a username");
      return;
    }

    const usernameRegex = /^[a-zA-Z0-9_-]{3,20}$/;
    if (!usernameRegex.test(formData.username.trim())) {
      alert("Username must be 3-20 characters and contain only letters, numbers, underscores, or hyphens");
      return;
    }

    localStorage.setItem("user_display_username", formData.username.trim());
    alert("Username saved successfully!");
    window.location.reload();
  };

  const handleChangePassword = async () => {
    if (!formData.currentPassword || !formData.newPassword) {
      alert("Please fill in all password fields");
      return;
    }

    if (formData.newPassword !== formData.confirmPassword) {
      alert("New passwords do not match");
      return;
    }

    if (formData.newPassword.length < 6) {
      alert("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: formData.currentPassword,
      });

      if (signInError) {
        alert("Current password is incorrect");
        return;
      }

      const { error } = await supabase.auth.updateUser({
        password: formData.newPassword,
      });

      if (error) throw error;

      alert("Password updated successfully!");
      setFormData({
        ...formData,
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    } catch (error: any) {
      alert(error.message || "Failed to update password");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!showDeleteConfirm) {
      setShowDeleteConfirm(true);
      return;
    }

    setLoading(true);
    try {
      await supabase.auth.signOut();
      router.push("/");
      alert("Account deletion requested. Please contact support for assistance.");
    } catch (error: any) {
      alert(error.message || "Failed to delete account");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setLoading(true);
    try {
      localStorage.setItem("userSettings", JSON.stringify(settings));
      alert("Settings saved successfully!");
    } catch (error) {
      console.error("Error saving settings:", error);
      alert("Failed to save settings");
    } finally {
      setLoading(false);
    }
  };

  const handleThemeChange = (newTheme: "normal" | "terminal") => {
    setTheme(newTheme);
    localStorage.setItem("appTheme", newTheme);
  };

  const tabs = [
    { id: "profile" as TabType, label: "Profile", icon: User },
    { id: "preferences" as TabType, label: "Preferences", icon: Moon },
    { id: "security" as TabType, label: "Security", icon: Shield },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-6 md:p-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              onClick={() => router.push("/dashboard")}
              className="shadow-md hover:shadow-lg"
            >
              <Home className="h-4 w-4 mr-2" />
              Dashboard Home
            </Button>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                Settings
              </h1>
              <p className="text-muted-foreground mt-2 text-base">
                Manage your account and preferences
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-border">
          <nav className="flex space-x-1" aria-label="Tabs">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    flex items-center gap-2 px-6 py-3 text-sm font-semibold transition-all duration-200
                    border-b-2 ${
                      isActive
                        ? "border-primary text-primary bg-primary/5"
                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted hover:bg-accent/30"
                    }
                  `}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="mt-6">
          {/* Profile Tab */}
          {activeTab === "profile" && (
            <div className="space-y-6">
              {/* Profile Information */}
              <Card className="hover:shadow-lg transition-all duration-300">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <div className="p-2 bg-primary/10 rounded-lg shadow-sm">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    Profile Information
                  </CardTitle>
                  <CardDescription className="text-base">Update your account details</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="username">
                      Display Username <span className="text-muted-foreground">(visible to others)</span>
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="username"
                        type="text"
                        placeholder="Choose a username"
                        value={formData.username}
                        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                        disabled={loading}
                        minLength={3}
                        maxLength={20}
                        pattern="[a-zA-Z0-9_-]+"
                      />
                      <Button onClick={handleUpdateUsername} disabled={loading} className="shadow-sm hover:shadow-md">
                        <Save className="h-4 w-4 mr-2" />
                        Update
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      3-20 characters, letters, numbers, underscores, or hyphens only. This is what others will see.
                    </p>
                    {!profile?.username && (
                      <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800">
                        <p className="text-sm text-yellow-800 dark:text-yellow-200">
                          <UserCircle className="h-4 w-4 inline mr-1" />
                          Please set a username to personalize your profile
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 pt-4 border-t">
                    <Label htmlFor="email">Email Address <span className="text-muted-foreground">(private)</span></Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      disabled={true}
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground">
                      Your email is private and used only for account management
                    </p>
                  </div>

                  {profile && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                      <div>
                        <Label>Account Type</Label>
                        <p className="text-sm font-medium capitalize mt-1">
                          {profile.role}
                        </p>
                      </div>
                      <div>
                        <Label>Subscription Tier</Label>
                        <p className="text-sm font-medium capitalize mt-1">
                          {profile.subscription_tier}
                        </p>
                      </div>
                      <div>
                        <Label>Member Since</Label>
                        <p className="text-sm font-medium mt-1">
                          {new Date(profile.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div>
                        <Label>Account Status</Label>
                        <p className="text-sm font-medium mt-1">
                          {profile.is_active ? (
                            <span className="text-green-600">Active</span>
                          ) : (
                            <span className="text-red-600">Inactive</span>
                          )}
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Danger Zone */}
              <Card className="border-2 border-red-200 dark:border-red-800 hover:shadow-lg transition-all duration-300">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-xl text-red-600 dark:text-red-400">
                    <div className="p-2 bg-red-500/10 rounded-lg shadow-sm">
                      <AlertCircle className="h-5 w-5" />
                    </div>
                    Danger Zone
                  </CardTitle>
                  <CardDescription className="text-base">Irreversible and destructive actions</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {showDeleteConfirm ? (
                    <div className="p-4 border border-red-200 dark:border-red-800 rounded-lg bg-red-50 dark:bg-red-950/20">
                      <p className="text-sm font-medium text-red-900 dark:text-red-100 mb-2">
                        Are you sure you want to delete your account?
                      </p>
                      <p className="text-xs text-red-700 dark:text-red-300 mb-4">
                        This action cannot be undone. All your data will be permanently deleted.
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={handleDeleteAccount}
                          disabled={loading}
                        >
                          Yes, Delete Account
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowDeleteConfirm(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Delete Account</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Permanently delete your account and all associated data
                        </p>
                      </div>
                      <Button
                        variant="destructive"
                        onClick={() => setShowDeleteConfirm(true)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Account
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Preferences Tab */}
          {activeTab === "preferences" && (
            <div className="space-y-6">
              {/* Notification Settings */}
              <Card className="hover:shadow-lg transition-all duration-300">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <div className="p-2 bg-primary/10 rounded-lg shadow-sm">
                      <Bell className="h-5 w-5 text-primary" />
                    </div>
                    Notifications
                  </CardTitle>
                  <CardDescription className="text-base">
                    Configure how and when you receive notifications
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-accent/30 transition-colors">
                    <div className="space-y-1">
                      <Label className="text-base font-semibold">Email Notifications</Label>
                      <p className="text-sm text-muted-foreground">
                        Receive notifications via email
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.emailNotifications}
                        onChange={(e) =>
                          setSettings({ ...settings, emailNotifications: e.target.checked })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary shadow-sm"></div>
                    </label>
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-accent/30 transition-colors">
                    <div className="space-y-1">
                      <Label className="text-base font-semibold">Device Alerts</Label>
                      <p className="text-sm text-muted-foreground">
                        Get alerts when devices go offline
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.deviceAlerts}
                        onChange={(e) =>
                          setSettings({ ...settings, deviceAlerts: e.target.checked })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary shadow-sm"></div>
                    </label>
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-accent/30 transition-colors">
                    <div className="space-y-1">
                      <Label className="text-base font-semibold">Low Battery Alerts</Label>
                      <p className="text-sm text-muted-foreground">
                        Alert when device battery is low
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.lowBatteryAlert}
                        onChange={(e) =>
                          setSettings({ ...settings, lowBatteryAlert: e.target.checked })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary shadow-sm"></div>
                    </label>
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-accent/30 transition-colors">
                    <div className="space-y-1">
                      <Label className="text-base font-semibold">Storage Alerts</Label>
                      <p className="text-sm text-muted-foreground">
                        Alert when device storage is full
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.storageAlert}
                        onChange={(e) =>
                          setSettings({ ...settings, storageAlert: e.target.checked })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary shadow-sm"></div>
                    </label>
                  </div>
                </CardContent>
              </Card>

              {/* Appearance Settings */}
              <Card className="hover:shadow-lg transition-all duration-300">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <div className="p-2 bg-primary/10 rounded-lg shadow-sm">
                      <Moon className="h-5 w-5 text-primary" />
                    </div>
                    Appearance
                  </CardTitle>
                  <CardDescription className="text-base">Customize the look and feel</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-3">
                    <Label className="text-base font-semibold">Color Mode</Label>
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        onClick={() => setColorMode("light")}
                        className={`p-6 border-2 rounded-xl transition-all duration-300 hover:shadow-lg hover:-translate-y-1 ${
                          colorMode === "light"
                            ? "border-primary bg-primary/10 shadow-lg scale-[1.02]"
                            : "border-border hover:border-primary/50 shadow-sm"
                        }`}
                      >
                        <div className="flex flex-col items-center gap-3">
                          <div className={`p-3 rounded-lg ${colorMode === "light" ? "bg-primary/20" : "bg-muted"}`}>
                            <Sun className="h-8 w-8" />
                          </div>
                          <span className="font-semibold text-base">Light</span>
                          <span className="text-xs text-muted-foreground">Bright & Clean</span>
                        </div>
                      </button>
                      <button
                        onClick={() => setColorMode("dark")}
                        className={`p-6 border-2 rounded-xl transition-all duration-300 hover:shadow-lg hover:-translate-y-1 ${
                          colorMode === "dark"
                            ? "border-primary bg-primary/10 shadow-lg scale-[1.02]"
                            : "border-border hover:border-primary/50 shadow-sm"
                        }`}
                      >
                        <div className="flex flex-col items-center gap-3">
                          <div className={`p-3 rounded-lg ${colorMode === "dark" ? "bg-primary/20" : "bg-muted"}`}>
                            <Moon className="h-8 w-8" />
                          </div>
                          <span className="font-semibold text-base">Dark</span>
                          <span className="text-xs text-muted-foreground">Easy on Eyes</span>
                        </div>
                      </button>
                    </div>
                  </div>
                  <div className="space-y-3 pt-4 border-t border-border/50">
                    <Label className="text-base font-semibold">Visual Theme</Label>
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        onClick={() => handleThemeChange("normal")}
                        className={`p-6 border-2 rounded-xl transition-all duration-300 hover:shadow-lg hover:-translate-y-1 ${
                          theme === "normal"
                            ? "border-primary bg-primary/10 shadow-lg scale-[1.02]"
                            : "border-border hover:border-primary/50 shadow-sm"
                        }`}
                      >
                        <div className="flex flex-col items-center gap-3">
                          <div className={`p-3 rounded-lg ${theme === "normal" ? "bg-primary/20" : "bg-muted"}`}>
                            <Moon className="h-8 w-8" />
                          </div>
                          <span className="font-semibold text-base">Normal</span>
                          <span className="text-xs text-muted-foreground">Modern & Clean</span>
                        </div>
                      </button>
                      <button
                        onClick={() => handleThemeChange("terminal")}
                        className={`p-6 border-2 rounded-xl transition-all duration-300 hover:shadow-lg hover:-translate-y-1 ${
                          theme === "terminal"
                            ? "border-primary bg-primary/10 shadow-lg scale-[1.02]"
                            : "border-border hover:border-primary/50 shadow-sm"
                        }`}
                      >
                        <div className="flex flex-col items-center gap-3">
                          <div className={`p-3 rounded-lg ${theme === "terminal" ? "bg-primary/20" : "bg-muted"}`}>
                            <Terminal className="h-8 w-8" />
                          </div>
                          <span className="font-semibold text-base">Terminal</span>
                          <span className="text-xs text-muted-foreground">Hacker Style</span>
                        </div>
                      </button>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <Label className="text-base font-semibold">Language</Label>
                    <select
                      value={settings.language}
                      onChange={(e) =>
                        setSettings({ ...settings, language: e.target.value })
                      }
                      className="flex h-12 w-full rounded-lg border border-input bg-background px-4 py-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shadow-sm hover:shadow-md transition-all"
                    >
                      <option value="en">English</option>
                      <option value="es">Spanish</option>
                      <option value="fr">French</option>
                      <option value="de">German</option>
                    </select>
                  </div>
                </CardContent>
              </Card>

              {/* Save Button */}
              <div className="flex justify-end">
                <Button onClick={handleSaveSettings} disabled={loading} className="shadow-md hover:shadow-lg px-8">
                  <Save className="h-4 w-4 mr-2" />
                  {loading ? "Saving..." : "Save Preferences"}
                </Button>
              </div>
            </div>
          )}

          {/* Security Tab */}
          {activeTab === "security" && (
            <div className="space-y-6">
              {/* Change Password */}
              <Card className="hover:shadow-lg transition-all duration-300">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <div className="p-2 bg-primary/10 rounded-lg shadow-sm">
                      <Key className="h-5 w-5 text-primary" />
                    </div>
                    Change Password
                  </CardTitle>
                  <CardDescription className="text-base">Update your account password</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="currentPassword">Current Password</Label>
                    <Input
                      id="currentPassword"
                      type="password"
                      value={formData.currentPassword}
                      onChange={(e) =>
                        setFormData({ ...formData, currentPassword: e.target.value })
                      }
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">New Password</Label>
                    <Input
                      id="newPassword"
                      type="password"
                      value={formData.newPassword}
                      onChange={(e) =>
                        setFormData({ ...formData, newPassword: e.target.value })
                      }
                      disabled={loading}
                    />
                    <p className="text-xs text-muted-foreground">
                      Must be at least 6 characters long
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm New Password</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={formData.confirmPassword}
                      onChange={(e) =>
                        setFormData({ ...formData, confirmPassword: e.target.value })
                      }
                      disabled={loading}
                    />
                  </div>
                  <Button onClick={handleChangePassword} disabled={loading} className="shadow-md hover:shadow-lg">
                    <Save className="h-4 w-4 mr-2" />
                    {loading ? "Updating..." : "Update Password"}
                  </Button>
                </CardContent>
              </Card>

              {/* Security Settings */}
              <Card className="hover:shadow-lg transition-all duration-300">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <div className="p-2 bg-primary/10 rounded-lg shadow-sm">
                      <Shield className="h-5 w-5 text-primary" />
                    </div>
                    Security Options
                  </CardTitle>
                  <CardDescription className="text-base">Manage your account security</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-accent/30 transition-colors">
                    <div className="space-y-1">
                      <Label className="text-base font-semibold">Two-Factor Authentication</Label>
                      <p className="text-sm text-muted-foreground">
                        Add an extra layer of security
                      </p>
                    </div>
                    <Button variant="outline" size="sm" className="shadow-sm hover:shadow-md">
                      Enable
                    </Button>
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-accent/30 transition-colors">
                    <div className="space-y-1">
                      <Label className="text-base font-semibold">Session Management</Label>
                      <p className="text-sm text-muted-foreground">
                        View and manage active sessions
                      </p>
                    </div>
                    <Button variant="outline" size="sm" className="shadow-sm hover:shadow-md">
                      Manage
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
