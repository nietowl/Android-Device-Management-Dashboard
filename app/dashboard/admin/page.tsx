"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { checkIsAdmin } from "@/lib/admin/client";
import dynamic from "next/dynamic";
import LogoutButton from "@/components/auth/LogoutButton";
import { Button } from "@/components/ui/button";
import { Shield } from "lucide-react";

// Lazy load heavy admin components
const AdminPanel = dynamic(() => import("@/components/admin/AdminPanel"), {
  loading: () => <div className="p-6">Loading Admin Panel...</div>,
});
const AdminDebug = dynamic(() => import("@/components/admin/AdminDebug"), {
  loading: () => <div className="p-6">Loading Debug Info...</div>,
});

export default function AdminDashboard() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const router = useRouter();

  useEffect(() => {
    checkIsAdmin().then((admin) => {
      setIsAdmin(admin);
      if (!admin) {
        console.log("User is not admin, redirecting...");
        // Don't redirect immediately, show debug info instead
        setShowDebug(true);
      }
    });
  }, [router]);

  if (isAdmin === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <div className="flex flex-col h-screen">
          <header className="h-16 border-b border-border flex items-center justify-between px-6 bg-card">
            <h1 className="text-xl font-semibold">Admin Access Denied</h1>
            <div className="flex items-center gap-4">
              <Button variant="outline" onClick={() => router.push("/dashboard")}>
                Back to Dashboard
              </Button>
              <LogoutButton />
            </div>
          </header>
          <div className="flex-1 overflow-y-auto">
            <AdminDebug />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="flex flex-col h-screen">
        <header className="h-16 border-b border-border flex items-center justify-between px-6 bg-card/50 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold">Admin Panel</h1>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/dashboard")}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-md hover:bg-accent"
            >
              Back to Dashboard
            </button>
            <LogoutButton />
          </div>
        </header>
        <div className="flex-1 overflow-y-auto">
          <AdminPanel />
        </div>
      </div>
    </div>
  );
}

