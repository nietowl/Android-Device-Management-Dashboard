"use client";

import { useState, useEffect } from "react";
import { createClientSupabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Mark this page as dynamic to prevent static generation
export const dynamic = 'force-dynamic';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const router = useRouter();
  
  const supabase = createClientSupabase();

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setError("Invalid or expired password reset link. Please request a new one.");
          setCheckingSession(false);
          return;
        }
        setCheckingSession(false);
      } catch (err) {
        console.error("Session check failed:", err);
        setError("Failed to verify session. Please try again.");
        setCheckingSession(false);
      }
    };
    
    checkSession();
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!password || !confirmPassword) {
      setError("Please fill in all fields");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) {
        throw updateError;
      }

      setSuccess("Password updated successfully! Redirecting to dashboard...");
      
      // Redirect to dashboard after a short delay
      setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 2000);
    } catch (error: any) {
      console.error("Password update error:", error);
      setError(error.message || "Failed to update password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-muted-foreground">Verifying reset link...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <div className="w-full max-w-md">
        <div className="p-6 rounded-lg border bg-card">
          <div className="space-y-1 pb-4 mb-4 border-b">
            <h2 className="text-xl font-semibold">Reset Your Password</h2>
            <p className="text-sm text-muted-foreground">
              Enter your new password below
            </p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">
                New Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-10"
                minLength={6}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-sm font-medium">
                Confirm New Password
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="h-10"
                minLength={6}
              />
            </div>
            {error && (
              <div className="text-sm text-red-600 dark:text-red-400 p-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                {error}
              </div>
            )}
            {success && (
              <div className="text-sm text-green-600 dark:text-green-400 p-3 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                {success}
              </div>
            )}
            <Button type="submit" className="w-full h-10" disabled={loading || checkingSession}>
              {loading ? "Updating..." : "Update Password"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full h-10"
              onClick={() => router.push("/")}
            >
              Back to Sign In
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

