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

  // Check for existing session (bypass mode)
  useEffect(() => {
    const isAuthenticated = localStorage.getItem("is_authenticated");
    if (isAuthenticated === "true") {
      window.location.href = "/dashboard";
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // BYPASS: Direct login without Supabase validation
      // Just accept any credentials and set a local session
      console.log("Bypassing Supabase authentication - direct login");
      
      // Store a simple session token in localStorage
      const sessionData = {
        email: email,
        userId: `user-${Date.now()}`,
        timestamp: Date.now(),
        bypass: true
      };
      
      localStorage.setItem("auth_session", JSON.stringify(sessionData));
      localStorage.setItem("is_authenticated", "true");
      
      setSuccess("Login successful! Redirecting...");
      
      // Redirect to dashboard
      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 100);
      
    } catch (error: any) {
      setError(error.message || "An error occurred. Please try again.");
      setSuccess(null);
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
          <Button type="submit" className="w-full h-10" disabled={loading}>
            {loading ? "Processing..." : isSignUp ? "Create Account" : "Sign In"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full h-10"
            onClick={() => setIsSignUp(!isSignUp)}
          >
            {isSignUp
              ? "Already have an account? Sign In"
              : "Don't have an account? Sign Up"}
          </Button>
        </form>
    </div>
  );
}

