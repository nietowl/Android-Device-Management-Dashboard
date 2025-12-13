"use client";

import { useState, useEffect } from "react";
import { createClientSupabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const router = useRouter();
  
  // Safely create Supabase client with error handling
  let supabase: ReturnType<typeof createClientSupabase> | undefined;
  try {
    supabase = createClientSupabase();
  } catch (err: any) {
    // Configuration error - environment variables missing
    if (err.message?.includes("Missing Supabase")) {
      setConfigError(err.message);
    }
  }

  // Check for existing session and URL parameters
  useEffect(() => {
    const checkSession = async () => {
      if (!supabase) return;
      
      // Check for URL parameters (from email verification callback)
      const urlParams = new URLSearchParams(window.location.search);
      const verified = urlParams.get("verified");
      const error = urlParams.get("error");
      
      if (error === "auth_failed") {
        setError("Email verification failed. Please try again or request a new verification link.");
        // Clean up URL
        window.history.replaceState({}, "", window.location.pathname);
      } else if (verified === "false") {
        setError("Email verification is still pending. Please check your inbox and click the verification link.");
        setNeedsVerification(true);
        // Clean up URL
        window.history.replaceState({}, "", window.location.pathname);
      } else if (verified === "true") {
        // Email was just verified, check session and redirect
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            const { data: { user } } = await supabase.auth.getUser();
            if (user?.email_confirmed_at) {
              // Clean up URL and redirect to dashboard
              window.history.replaceState({}, "", window.location.pathname);
              setSuccess("Email verified successfully! Redirecting...");
              // Refresh and redirect
              setTimeout(() => {
                router.push("/dashboard");
                router.refresh();
              }, 500);
              return;
            }
          }
        } catch (err) {
          console.error("Session check failed:", err);
        }
      }
      
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          // Check if email is verified
          const { data: { user } } = await supabase.auth.getUser();
          if (user?.email_confirmed_at) {
            router.push("/dashboard");
            router.refresh();
          } else {
            setNeedsVerification(true);
            if (!error && verified !== "false") {
              setError("Please verify your email address before accessing the dashboard.");
            }
          }
        }
      } catch (err) {
        // Session check failed, user needs to login
        console.error("Session check failed:", err);
      }
    };
    
    checkSession();
  }, [supabase, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!supabase) {
      setError("Supabase client not initialized. Please check your configuration.");
      return;
    }
    
    setLoading(true);
    setError(null);
    setSuccess(null);
    setNeedsVerification(false);

    try {
      if (isSignUp) {
        // Sign up new user
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password: password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
          },
        });

        if (signUpError) {
          throw signUpError;
        }

        if (data.user) {
          setSuccess(
            "Account created successfully! Please check your email to verify your account before signing in."
          );
          setNeedsVerification(true);
          // Clear form
          setEmail("");
          setPassword("");
        }
      } else {
        // Sign in existing user
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password,
        });

        if (signInError) {
          throw signInError;
        }

        if (data.user) {
          // Check if email is verified
          if (!data.user.email_confirmed_at) {
            setError("Please verify your email address before signing in. Check your inbox for the verification link.");
            setNeedsVerification(true);
            // Optionally resend verification email
            await supabase.auth.resend({
              type: "signup",
              email: email.trim(),
            });
            setSuccess("Verification email resent. Please check your inbox.");
            return;
          }

          setSuccess("Login successful! Redirecting...");
          
          // Wait a moment for session to be established, then redirect
          setTimeout(() => {
            router.push("/dashboard");
            router.refresh();
          }, 1000);
        }
      }
    } catch (error: any) {
      console.error("Auth error:", error);
      
      // Handle specific error cases
      if (error.message?.includes("Invalid login credentials")) {
        setError("Invalid email or password. Please try again.");
      } else if (error.message?.includes("Email not confirmed")) {
        setError("Please verify your email address before signing in.");
        setNeedsVerification(true);
      } else if (error.message?.includes("User already registered")) {
        setError("An account with this email already exists. Please sign in instead.");
        setIsSignUp(false);
      } else if (error.message?.includes("Password")) {
        setError("Password must be at least 6 characters long.");
      } else {
        setError(error.message || "An error occurred. Please try again.");
      }
      setSuccess(null);
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!supabase || !email) {
      setError("Please enter your email address first.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
      });

      if (resendError) {
        throw resendError;
      }

      setSuccess("Verification email sent! Please check your inbox.");
    } catch (error: any) {
      setError(error.message || "Failed to resend verification email.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 rounded-lg border bg-card">
      <div className="space-y-1 pb-4 mb-4 border-b">
        <h2 className="text-xl font-semibold">
          {isSignUp ? "Create Account" : "Sign In"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {isSignUp
            ? "Enter your credentials to create an account"
            : "Enter your credentials to sign in"}
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="user@domain.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-10"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-10"
            />
          </div>
          {configError && (
            <div className="text-sm text-red-600 dark:text-red-400 p-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <strong>Configuration Error:</strong> {configError}
              <p className="mt-2 text-xs">
                Please create a <code className="bg-red-100 dark:bg-red-900 px-1 rounded">.env.local</code> file with your Supabase credentials.
              </p>
            </div>
          )}
          {error && (
            <div className="text-sm text-red-600 dark:text-red-400 p-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 whitespace-pre-line">
              {error}
            </div>
          )}
          {success && (
            <div className="text-sm text-green-600 dark:text-green-400 p-3 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              {success}
            </div>
          )}
          {needsVerification && (
            <div className="text-sm text-amber-600 dark:text-amber-400 p-3 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <p className="mb-2">Email verification required. Please check your inbox for the verification link.</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResendVerification}
                disabled={loading}
                className="w-full"
              >
                Resend Verification Email
              </Button>
            </div>
          )}
          <Button type="submit" className="w-full h-10" disabled={loading}>
            {loading ? "Processing..." : isSignUp ? "Create Account" : "Sign In"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full h-10"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError(null);
              setSuccess(null);
              setNeedsVerification(false);
            }}
          >
            {isSignUp
              ? "Already have an account? Sign In"
              : "Don't have an account? Sign Up"}
          </Button>
        </form>
    </div>
  );
}

