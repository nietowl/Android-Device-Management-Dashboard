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
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [passwordResetSent, setPasswordResetSent] = useState(false);
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
          // Single getUser call includes session info - more efficient than getSession + getUser
          const { data: { user } } = await supabase.auth.getUser();
          if (user?.email_confirmed_at) {
            // Clean up URL and redirect to dashboard immediately
            window.history.replaceState({}, "", window.location.pathname);
            setSuccess("Email verified successfully! Redirecting...");
            // Redirect immediately - session is already established
            router.push("/dashboard");
            router.refresh();
            return;
          }
        } catch (err) {
          console.error("Session check failed:", err);
        }
      }
      
      try {
        // Single getUser call includes session info - more efficient than getSession + getUser
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // Check if email is verified
          if (user.email_confirmed_at) {
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
        // Sign up new user via server-side API route for better error handling
        const response = await fetch("/api/auth/signup", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: email.trim(),
            password: password,
          }),
        });

        // Check if response is JSON before parsing
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          // If we got HTML or other non-JSON response, it's likely a redirect or error page
          const text = await response.text();
          console.error("Non-JSON response received:", {
            status: response.status,
            statusText: response.statusText,
            contentType,
            url: response.url,
            preview: text.substring(0, 200),
          });
          
          if (response.status === 401 || response.status === 403) {
            throw new Error("Authentication failed. Please check your credentials and try again.");
          } else if (response.status >= 500) {
            throw new Error("Server error. Please try again later.");
          } else if (response.redirected || response.url !== "/api/auth/signup") {
            throw new Error("Request was redirected. This may indicate a configuration issue. Please contact support.");
          } else {
            throw new Error("Unexpected response from server. Please try again or contact support if the problem persists.");
          }
        }

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Failed to create account");
        }

        if (result.success && result.user) {
          // Log signup response for debugging
          console.log("Signup response:", result);

          // Check if email confirmation is required
          if (result.requiresEmailVerification && result.emailSent) {
            // Email confirmation is required and email should have been sent
            setSuccess(
              "Account created successfully! Please check your email (including spam folder) to verify your account before signing in. If you don't receive an email within a few minutes, please use the 'Resend Verification Email' button below."
            );
            setNeedsVerification(true);
          } else if (result.configurationWarning) {
            // Email confirmations are disabled in Supabase
            console.warn("⚠️ Email confirmations are DISABLED in Supabase settings.");
            console.warn("⚠️ To enable email verification:", "https://app.supabase.com/project/_/auth/providers");
            
            // Show warning but still try to sign in
            setError(
              "Account created, but email confirmations are disabled in Supabase settings. " +
              "Please enable email confirmations in your Supabase dashboard (Authentication → Providers → Email). " +
              "Attempting to sign you in..."
            );
            
            // Try to sign in the user since email is auto-confirmed
            const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
              email: email.trim(),
              password: password,
            });

            if (signInError || !signInData.user) {
              setError("Account created but automatic sign-in failed. Please sign in manually.");
              setIsSignUp(false);
              return;
            }

            setSuccess("Account created and signed in! Redirecting...");
            // Redirect immediately - session is already established
            router.push("/dashboard");
            router.refresh();
            return;
          } else {
            // Unexpected state - email should have been sent but wasn't
            console.error("⚠️ Unexpected signup state:", result);
            setError(
              "Account created, but there may be an issue with email verification. " +
              "Please check your Supabase settings (Authentication → Providers → Email → Enable email confirmations). " +
              "You can try using 'Resend Verification Email' below."
            );
            setNeedsVerification(true);
          }
          
          // Clear form
          setEmail("");
          setPassword("");
        } else {
          throw new Error("Failed to create account. Please try again.");
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
            // Optionally resend verification email with proxy endpoint to hide Supabase URL
            const proxyRedirectUrl = `${window.location.origin}/api/auth/verify?type=signup&redirect=/dashboard`;
            await supabase.auth.resend({
              type: "signup",
              email: email.trim(),
              options: {
                emailRedirectTo: proxyRedirectUrl,
              },
            });
            setSuccess("Verification email resent. Please check your inbox.");
            return;
          }

          setSuccess("Login successful! Redirecting...");
          
          // Redirect immediately - session is already established after signInWithPassword
          router.push("/dashboard");
          router.refresh();
        }
      }
    } catch (error: any) {
      console.error("Auth error:", error);
      
      // Handle specific error cases
      if (error.message?.includes("Invalid login credentials")) {
        setError("Invalid email or password. Please try again.\n\nIf you've forgotten your password, click 'Forgot Password?' below to reset it.");
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
    setSuccess(null);

    try {
      // Use proxy endpoint to hide Supabase URL from email links
      const proxyRedirectUrl = `${window.location.origin}/api/auth/verify?type=signup&redirect=/dashboard`;
      const { data, error: resendError } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
        options: {
          emailRedirectTo: proxyRedirectUrl,
        },
      });

      if (resendError) {
        // Provide more specific error messages
        if (resendError.message?.includes("rate limit") || resendError.message?.includes("too many")) {
          throw new Error("Too many requests. Please wait a few minutes before requesting another verification email.");
        } else if (resendError.message?.includes("not found") || resendError.message?.includes("does not exist")) {
          throw new Error("No account found with this email. Please sign up first.");
        } else {
          throw resendError;
        }
      }

      setSuccess("Verification email sent! Please check your inbox (including spam/junk folder).");
    } catch (error: any) {
      console.error("Resend verification error:", error);
      setError(error.message || "Failed to resend verification email. Please check your Supabase email configuration.");
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!supabase || !email) {
      setError("Please enter your email address first.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);
    setPasswordResetSent(false);

    try {
      // Use proxy endpoint to hide Supabase URL from email links
      const proxyRedirectUrl = `${window.location.origin}/api/auth/verify?type=recovery&redirect=/reset-password`;
      const { data, error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: proxyRedirectUrl,
      });

      if (resetError) {
        // Provide more specific error messages
        if (resetError.message?.includes("rate limit") || resetError.message?.includes("too many")) {
          throw new Error("Too many requests. Please wait a few minutes before requesting another password reset email.");
        } else if (resetError.message?.includes("not found") || resetError.message?.includes("does not exist")) {
          throw new Error("No account found with this email. Please sign up first.");
        } else {
          throw resetError;
        }
      }

      setPasswordResetSent(true);
      setSuccess("Password reset email sent! Please check your inbox (including spam/junk folder) for instructions to reset your password.");
    } catch (error: any) {
      console.error("Password reset error:", error);
      setError(error.message || "Failed to send password reset email. Please check your Supabase email configuration.");
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
      <form 
        onSubmit={handleSubmit} 
        action="#" 
        method="post"
        className="space-y-4"
      >
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
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-sm font-medium">
                Password
              </Label>
              {!isSignUp && (
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordReset(!showPasswordReset);
                    setError(null);
                    setSuccess(null);
                    setPasswordResetSent(false);
                  }}
                  className="text-xs text-primary hover:underline"
                >
                  Forgot Password?
                </button>
              )}
            </div>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={!showPasswordReset}
              disabled={showPasswordReset}
              className="h-10"
            />
          </div>
          {showPasswordReset && !isSignUp && (
            <div className="text-sm text-amber-600 dark:text-amber-400 p-3 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <p className="mb-2 font-medium">Reset your password</p>
              <p className="mb-3 text-xs">Enter your email address and we&apos;ll send you a link to reset your password.</p>
              {passwordResetSent ? (
                <div className="text-green-600 dark:text-green-400">
                  <p className="mb-2">✓ Password reset email sent!</p>
                  <p className="text-xs">Check your inbox (including spam folder) for the reset link.</p>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handlePasswordReset}
                  disabled={loading || !email}
                  className="w-full"
                >
                  {loading ? "Sending..." : "Send Password Reset Email"}
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowPasswordReset(false);
                  setPasswordResetSent(false);
                  setError(null);
                  setSuccess(null);
                }}
                className="w-full mt-2"
              >
                Back to Sign In
              </Button>
            </div>
          )}
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
              <p className="mb-2 font-medium">Email verification required.</p>
              <p className="mb-3 text-xs">Please check your inbox (and spam folder) for the verification link.</p>
              <details className="mb-3 text-xs">
                <summary className="cursor-pointer font-medium hover:underline">Troubleshooting: Not receiving emails?</summary>
                <div className="mt-2 space-y-2 pl-2">
                  <div>
                    <p className="font-semibold mb-1">1. Enable Email Confirmations (MOST IMPORTANT):</p>
                    <p className="pl-2">Go to: <a href="https://app.supabase.com/project/_/auth/providers" target="_blank" rel="noopener noreferrer" className="underline">Supabase Dashboard → Authentication → Providers → Email</a></p>
                    <p className="pl-2">Toggle <strong>&quot;Enable email confirmations&quot;</strong> to <strong>ON</strong></p>
                    <p className="pl-2 text-red-600 dark:text-red-400">⚠️ If this is OFF, emails will NOT be sent!</p>
                  </div>
                  <div>
                    <p className="font-semibold mb-1">2. Whitelist Redirect URLs:</p>
                    <p className="pl-2">Go to: Authentication → URL Configuration</p>
                    <p className="pl-2">Add this URL to Redirect URLs:</p>
                    <code className="block pl-4 text-xs bg-amber-100 dark:bg-amber-900/30 p-1 rounded mt-1">{window.location.origin}/auth/callback</code>
                  </div>
                  <div>
                    <p className="font-semibold mb-1">3. Check Email Service:</p>
                    <p className="pl-2">Go to: Project Settings → Auth → SMTP Settings</p>
                    <p className="pl-2">Ensure SMTP is configured or use Supabase&apos;s default email service</p>
                  </div>
                  <div>
                    <p className="font-semibold mb-1">4. Check Logs:</p>
                    <p className="pl-2">Go to: Supabase Dashboard → Logs → Auth Logs</p>
                    <p className="pl-2">Look for email delivery errors or rate limit messages</p>
                  </div>
                  <div>
                    <p className="font-semibold mb-1">5. ProtonMail Users (Important!):</p>
                    <p className="pl-2 text-red-600 dark:text-red-400">⚠️ ProtonMail often blocks Supabase emails!</p>
                    <p className="pl-2">• Check Spam folder (not just Inbox)</p>
                    <p className="pl-2">• Whitelist: *@mail.app.supabase.io in ProtonMail filters</p>
                    <p className="pl-2">• Try a different email provider (Gmail/Outlook) to test</p>
                    <p className="pl-2">• Consider using custom SMTP in Supabase settings</p>
                  </div>
                  <div className="mt-2 p-2 bg-amber-100 dark:bg-amber-900/30 rounded text-xs">
                    <p className="font-semibold">💡 Tip:</p>
                    <p>Open browser console (F12) to see detailed signup logs and diagnostics.</p>
                  </div>
                </div>
              </details>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResendVerification}
                disabled={loading}
                className="w-full"
              >
                {loading ? "Sending..." : "Resend Verification Email"}
              </Button>
            </div>
          )}
          {!showPasswordReset && (
            <Button type="submit" className="w-full h-10" disabled={loading}>
              {loading ? "Processing..." : isSignUp ? "Create Account" : "Sign In"}
            </Button>
          )}
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

