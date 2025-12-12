"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClientSupabase } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, LogOut, CreditCard } from "lucide-react";

export default function SubscriptionBlocked() {
  const router = useRouter();
  const supabase = createClientSupabase();

  useEffect(() => {
    // Double-check subscription status
    const checkSubscription = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/");
        return;
      }

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("subscription_status, is_active, role, subscription_tier")
        .eq("id", user.id)
        .single();

      if (profile) {
        const isAdmin = profile.role === "admin";
        const isCancelled = profile.subscription_status === "cancelled";
        const isExpired = profile.subscription_status === "expired";
        const isInactive = !profile.is_active;

        // If admin or subscription is now active and account is active, redirect to dashboard
        const isActive = profile.subscription_status === "active";
        if (isAdmin || (isActive && !isInactive && !isCancelled && !isExpired)) {
          router.push("/dashboard");
        }
      }
    };

    checkSubscription();
  }, [router, supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-xl border-2 border-destructive/20">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-4 p-4 bg-destructive/10 rounded-full w-20 h-20 flex items-center justify-center">
            <AlertCircle className="h-10 w-10 text-destructive" />
          </div>
          <CardTitle className="text-2xl">Subscription Blocked</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center space-y-2">
            <p className="text-muted-foreground">
              Your subscription has been cancelled or expired. You no longer have access to the platform.
            </p>
            <p className="text-sm text-muted-foreground">
              Please contact support or reactivate your subscription to continue using the service.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <Button
              onClick={() => router.push("/dashboard/settings")}
              variant="outline"
              className="w-full"
            >
              <CreditCard className="h-4 w-4 mr-2" />
              View Subscription Details
            </Button>
            <Button
              onClick={handleLogout}
              variant="destructive"
              className="w-full"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

