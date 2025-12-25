import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    // Validate input
    if (!email || typeof email !== "string" || email.trim().length === 0) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    if (!password || typeof password !== "string" || password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    
    // Get the origin from the request to build the redirect URL
    const origin = request.headers.get("origin") || 
                   request.headers.get("referer")?.split("/").slice(0, 3).join("/") ||
                   process.env.NEXT_PUBLIC_SITE_URL ||
                   "http://localhost:3000";

    // Sign up the user with explicit email confirmation settings
    const redirectUrl = `${origin}/auth/callback?next=/dashboard`;
    
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password: password,
      options: {
        emailRedirectTo: redirectUrl,
        // Ensure email confirmation is requested
        captchaToken: undefined, // Remove if you're not using captcha
      },
    });

    if (error) {
      console.error("Supabase signup error:", {
        message: error.message,
        status: error.status,
        name: error.name,
      });
      
      // Provide more specific error messages
      let errorMessage = error.message;
      if (error.message?.includes("User already registered") || error.message?.includes("already registered")) {
        errorMessage = "An account with this email already exists. Please sign in instead.";
      } else if (error.message?.includes("Email rate limit") || error.message?.includes("rate limit")) {
        errorMessage = "Too many signup attempts. Please wait a few minutes and try again.";
      } else if (error.message?.includes("Invalid email")) {
        errorMessage = "Invalid email address format.";
      } else if (error.message?.includes("email")) {
        errorMessage = `Email error: ${error.message}`;
      }
      
      return NextResponse.json(
        { 
          error: errorMessage,
          details: process.env.NODE_ENV === "development" ? {
            originalError: error.message,
            status: error.status,
            name: error.name,
          } : undefined,
        },
        { status: 400 }
      );
    }

    if (!data.user) {
      console.error("Signup failed: No user data returned");
      return NextResponse.json(
        { error: "Failed to create user account. No user data returned." },
        { status: 500 }
      );
    }

    // Check if email confirmation is required
    const requiresEmailVerification = data.session === null;
    const emailConfirmed = !!data.user.email_confirmed_at;

    // Log the response for debugging
    console.log("Signup response details:", {
      userId: data.user.id,
      email: data.user.email,
      emailConfirmed: emailConfirmed,
      hasSession: !!data.session,
      requiresEmailVerification: requiresEmailVerification,
      redirectUrl: redirectUrl,
      timestamp: new Date().toISOString(),
    });

    // If email is already confirmed, that means email confirmations are disabled
    if (emailConfirmed && data.session) {
      console.warn("⚠️ Email confirmations appear to be DISABLED in Supabase settings.");
      console.warn("⚠️ User was auto-confirmed. No verification email was sent.");
      console.warn("⚠️ To enable email verification, go to: Supabase Dashboard → Authentication → Providers → Email → Enable email confirmations");
    }

    // If session is null but email is not confirmed, email should have been sent
    if (requiresEmailVerification && !emailConfirmed) {
      console.log("✅ Email confirmation required. Verification email should have been sent.");
      console.log("✅ Check Supabase Auth Logs if email is not received.");
    }

    // Return success response with detailed information
    return NextResponse.json({
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        emailConfirmed: emailConfirmed,
      },
      requiresEmailVerification: requiresEmailVerification,
      emailSent: requiresEmailVerification && !emailConfirmed,
      configurationWarning: emailConfirmed && data.session ? 
        "Email confirmations are disabled in Supabase. Enable them in Authentication → Providers → Email" : 
        null,
      message: requiresEmailVerification && !emailConfirmed
        ? "Account created! Please check your email (including spam folder) to verify your account."
        : emailConfirmed && data.session
        ? "Account created! Email confirmations are disabled in your Supabase settings."
        : "Account created successfully!",
    });
  } catch (error: any) {
    console.error("Signup API error:", error);
    return NextResponse.json(
      { 
        error: "An unexpected error occurred during signup",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

