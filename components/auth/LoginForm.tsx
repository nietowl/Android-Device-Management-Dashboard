"use client";

import { useState, useEffect } from "react";
import { createClientSupabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClientSupabase();

  // Check for email confirmation redirect
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        window.location.href = "/dashboard";
      }
    };
    
    checkSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });
        
        if (error) throw error;
        
        // Check if user is already authenticated (email confirmation disabled)
        if (data.user && data.session) {
          // User is automatically signed in (email confirmation disabled)
          setSuccess("Account created successfully! Redirecting...");
          
          // Use window.location for immediate redirect
          window.location.href = "/dashboard";
          return; // Exit early to prevent further execution
        } else if (data.user) {
          // Email confirmation required
          setSuccess("Account created! Please check your email for the confirmation link.");
          setError(null);
          // Switch to sign-in mode after successful signup
          setTimeout(() => {
            setIsSignUp(false);
            setSuccess(null);
          }, 3000);
        } else {
          throw new Error("Signup failed. Please try again.");
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        
        if (error) throw error;
        
        // Check if sign-in was successful
        if (data.user && data.session) {
          console.log("Sign in successful, redirecting...", { user: data.user.id, session: !!data.session });
          setSuccess("Sign in successful! Redirecting...");
          
          // Small delay to ensure UI updates, then redirect
          setTimeout(() => {
            console.log("Executing redirect to /dashboard");
            window.location.href = "/dashboard";
          }, 100);
          return; // Exit early to prevent further execution
        } else {
          throw new Error("Sign in failed. Please check your credentials.");
        }
      }
    } catch (error: any) {
      setError(error.message || "An error occurred");
      setSuccess(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {isSignUp ? "Create Account" : "Sign In"}
        </CardTitle>
        <CardDescription>
          {isSignUp
            ? "Enter your credentials to create an account"
            : "Enter your credentials to sign in"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="user@domain.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <div className="text-sm text-red-600 dark:text-red-400 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 shadow-sm">
              <strong className="font-semibold">Error:</strong> {error}
            </div>
          )}
          {success && (
            <div className="text-sm text-green-600 dark:text-green-400 p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 shadow-sm">
              <strong className="font-semibold">Success:</strong> {success}
            </div>
          )}
          <Button type="submit" className="w-full shadow-md hover:shadow-lg transition-all" disabled={loading}>
            {loading ? "Processing..." : isSignUp ? "Create Account" : "Sign In"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full border-2 hover:shadow-md transition-all"
            onClick={() => setIsSignUp(!isSignUp)}
          >
            {isSignUp
              ? "Already have an account? Sign In"
              : "Don't have an account? Sign Up"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

