import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
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
    // CRITICAL: Always use NEXT_PUBLIC_SITE_URL - never use request headers
    const isDevelopment = process.env.NODE_ENV === "development";
    
    // MANDATORY: NEXT_PUBLIC_SITE_URL must be set
    if (!process.env.NEXT_PUBLIC_SITE_URL) {
      const errorMsg = isDevelopment 
        ? "NEXT_PUBLIC_SITE_URL is not set in .env.local. Please set it to your production domain (e.g., https://yourdomain.com) to prevent localhost in verification emails."
        : "NEXT_PUBLIC_SITE_URL must be set in production. Please set it in your environment variables.";
      
      console.error(`⚠️ ${errorMsg}`);
      return NextResponse.json(
        { 
          error: "Server configuration error: NEXT_PUBLIC_SITE_URL is required. Please set it in your .env.local file.",
          details: isDevelopment 
            ? "Set it to your production domain (e.g., https://yourdomain.com) even in development to prevent localhost in verification emails."
            : "This prevents localhost from appearing in email verification links."
        },
        { status: 500 }
      );
    }
    
    let origin = process.env.NEXT_PUBLIC_SITE_URL.trim();
    // Remove trailing slash if present
    origin = origin.replace(/\/$/, '');
    
    // Validate URL format
    try {
      const url = new URL(origin);
      // Ensure it's a valid HTTP/HTTPS URL
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Invalid protocol');
      }
    } catch (urlError) {
      console.error("⚠️ NEXT_PUBLIC_SITE_URL is not a valid URL:", origin);
      return NextResponse.json(
        { error: "Server configuration error: NEXT_PUBLIC_SITE_URL must be a valid HTTP/HTTPS URL (e.g., https://yourdomain.com)" },
        { status: 500 }
      );
    }
    
    // STRICT: Block localhost in NEXT_PUBLIC_SITE_URL ONLY in production
    // In development, allow localhost but warn that production domain is recommended
    if (origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('0.0.0.0')) {
      if (!isDevelopment) {
        // Production: Never allow localhost
        console.error("⚠️ NEXT_PUBLIC_SITE_URL contains localhost in production. This is not allowed.");
        return NextResponse.json(
          { 
            error: "Server configuration error: NEXT_PUBLIC_SITE_URL cannot contain localhost in production. Please set it to your production domain (e.g., https://yourdomain.com).",
            details: "In production, verification emails must use your production domain, not localhost."
          },
          { status: 500 }
        );
      } else {
        // Development: Allow localhost but warn
        console.warn("⚠️ NEXT_PUBLIC_SITE_URL is set to localhost. This is allowed in development, but verification emails will contain localhost URLs.");
        console.warn("⚠️ For testing email verification, consider setting NEXT_PUBLIC_SITE_URL to your production domain even in development.");
      }
    }
    
    // Additional security: ensure production uses HTTPS
    if (!isDevelopment && !origin.startsWith('https://')) {
      console.error("⚠️ Production URL must use HTTPS. Current origin:", origin);
      return NextResponse.json(
        { error: "Server configuration error: Production URL must use HTTPS" },
        { status: 500 }
      );
    }

    // Final validation: ensure origin is valid and not empty
    if (!origin || origin.trim() === '') {
      console.error("⚠️ Invalid origin detected. NEXT_PUBLIC_SITE_URL must be set.");
      return NextResponse.json(
        { error: "Server configuration error: Invalid site URL configuration" },
        { status: 500 }
      );
    }
    
    // Additional security: ensure production uses HTTPS
    if (!isDevelopment && !origin.startsWith('https://')) {
      console.error("⚠️ Production URL must use HTTPS. Current origin:", origin);
      return NextResponse.json(
        { error: "Server configuration error: Production URL must use HTTPS" },
        { status: 500 }
      );
    }
    
    // Log the origin being used (for debugging)
    console.log(`✅ Using redirect URL origin: ${origin}`);
    console.log(`✅ NEXT_PUBLIC_SITE_URL value: ${process.env.NEXT_PUBLIC_SITE_URL || 'NOT SET'}`);
    console.log(`✅ NODE_ENV: ${process.env.NODE_ENV || 'development'}`);

    // Sign up the user with explicit email confirmation settings
    const redirectUrl = `${origin}/auth/callback?next=/dashboard`;
    console.log(`✅ Final redirectUrl being sent to Supabase: ${redirectUrl}`);
    
    // Check if user already exists before attempting signup
    // This prevents duplicate accounts and handles unverified users properly
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (supabaseUrl && supabaseServiceKey) {
      try {
        const adminClient = createAdminClient(supabaseUrl, supabaseServiceKey, {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        });

        // Check if a user with this email already exists
        const { data: usersData } = await adminClient.auth.admin.listUsers();
        const existingUser = usersData?.users?.find(
          (u) => u.email?.toLowerCase().trim() === email.toLowerCase().trim()
        );

        if (existingUser) {
          // User exists - check verification status
          if (existingUser.email_confirmed_at) {
            // User exists and is verified - return error, do not delete or create new account
            console.log(`Verified user already exists: ${email.split('@')[0]}@***`);
            return NextResponse.json(
              { 
                error: "An account with this email already exists and is verified. Please sign in instead. If you forgot your password, use the password reset option.",
              },
              { status: 400 }
            );
          } else {
            // User exists but not verified - resend verification email instead of creating new account
            console.log(`Unverified user exists. Resending verification email for: ${email.split('@')[0]}@***`);
            
            const { error: resendError } = await supabase.auth.resend({
              type: "signup",
              email: email.trim(),
              options: {
                emailRedirectTo: redirectUrl,
              },
            });

            if (!resendError) {
              console.log("✅ Verification email resent for existing unverified user");
              return NextResponse.json({
                success: true,
                user: {
                  email: email.trim(),
                  emailConfirmed: false,
                },
                requiresEmailVerification: true,
                emailSent: true,
                message: "An account with this email already exists but is not verified. A verification email has been sent to your email address. Please check your inbox (including spam folder) to verify your account.",
                resent: true,
              });
            } else {
              console.error("Failed to resend verification email:", resendError);
              return NextResponse.json(
                { 
                  error: "An account with this email already exists but is not verified. Please check your email for the verification link, or try signing in to resend it.",
                },
                { status: 400 }
              );
            }
          }
        }
        // If no existing user found, proceed with signup below
      } catch (adminCheckError) {
        // If admin check fails, proceed with normal signup flow
        // Supabase will handle duplicate detection during signup
        console.warn("Could not check for existing user, proceeding with signup:", adminCheckError);
      }
    }
    
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
      
      // Handle "User already registered" - account already exists
      if (error.message?.includes("User already registered") || error.message?.includes("already registered")) {
        console.log(`User already registered. Attempting to resend verification email for: ${email.split('@')[0]}@***`);
        
        // Try to resend verification email for existing unverified user
        const { error: resendError } = await supabase.auth.resend({
          type: "signup",
          email: email.trim(),
          options: {
            emailRedirectTo: redirectUrl,
          },
        });

        if (!resendError) {
          // Successfully resent verification email - user is unverified
          console.log("✅ Verification email resent for existing unverified user");
          return NextResponse.json({
            success: true,
            user: {
              email: email.trim(),
              emailConfirmed: false,
            },
            requiresEmailVerification: true,
            emailSent: true,
            message: "An account with this email already exists but is not verified. A verification email has been sent to your email address. Please check your inbox (including spam folder) to verify your account.",
            resent: true,
          });
        } else {
          // Resend failed - check if user is already verified
          console.error("Failed to resend verification email:", resendError);
          
          // Check if user exists and is verified using admin client
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
          const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          
          if (supabaseUrl && supabaseServiceKey) {
            try {
              const adminClient = createAdminClient(supabaseUrl, supabaseServiceKey, {
                auth: {
                  autoRefreshToken: false,
                  persistSession: false,
                },
              });

              // List users to find if this email exists
              const { data: usersData } = await adminClient.auth.admin.listUsers();
              const existingUser = usersData?.users?.find(
                (u) => u.email?.toLowerCase().trim() === email.toLowerCase().trim()
              );

              if (existingUser) {
                if (existingUser.email_confirmed_at) {
                  return NextResponse.json(
                    { 
                      error: "An account with this email already exists and is verified. Please sign in instead. If you forgot your password, use the password reset option.",
                    },
                    { status: 400 }
                  );
                } else {
                  // User exists but not verified - suggest they check email or try again
                  return NextResponse.json(
                    { 
                      error: "An account with this email already exists but is not verified. Please check your email for the verification link, or try signing in to resend it.",
                    },
                    { status: 400 }
                  );
                }
              }
            } catch (adminError) {
              console.error("Error checking existing user:", adminError);
            }
          }

          // Default error message
          return NextResponse.json(
            { 
              error: "An account with this email already exists. Please sign in instead, or check your email for a verification link.",
            },
            { status: 400 }
          );
        }
      } else if (error.message?.includes("Email rate limit") || error.message?.includes("rate limit")) {
        return NextResponse.json(
          { 
            error: "Too many signup attempts. Please wait a few minutes and try again.",
          },
          { status: 429 }
        );
      } else if (error.message?.includes("Invalid email")) {
        return NextResponse.json(
          { 
            error: "Invalid email address format.",
          },
          { status: 400 }
        );
      } else {
        return NextResponse.json(
          { 
            error: error.message || "An error occurred during signup. Please try again.",
            details: process.env.NODE_ENV === "development" ? {
              originalError: error.message,
              status: error.status,
              name: error.name,
            } : undefined,
          },
          { status: 400 }
        );
      }
    }

    if (!data.user) {
      console.error("Signup failed: No user data returned");
      return NextResponse.json(
        { error: "Failed to create user account. No user data returned." },
        { status: 500 }
      );
    }

    // Note: User profile will be created automatically:
    // 1. Via database trigger when user is created in auth.users (see migrations)
    // 2. As fallback in auth callback route after email verification (see app/auth/callback/route.ts)
    // We do NOT create the profile here to ensure it only happens after email verification

    // Check if email confirmation is required
    const requiresEmailVerification = data.session === null;
    const emailConfirmed = !!data.user.email_confirmed_at;

    // Log the response for debugging (without sensitive data)
    // Note: Logger is no-op in production, so no information leakage
    const logger = (await import("@/lib/utils/logger")).default;
    logger.log("Signup response details:", {
      userId: data.user.id,
      email: data.user.email ? `${data.user.email.split('@')[0]}@***` : 'no email', // Sanitize email
      emailConfirmed: emailConfirmed,
      hasSession: !!data.session,
      requiresEmailVerification: requiresEmailVerification,
      redirectDomain: new URL(redirectUrl).hostname, // Only log domain, not full URL
      timestamp: new Date().toISOString(),
    });

    // If email is already confirmed, that means email confirmations are disabled
    if (emailConfirmed && data.session) {
      logger.warn("⚠️ Email confirmations appear to be DISABLED in Supabase settings.");
      logger.warn("⚠️ User was auto-confirmed. No verification email was sent.");
      logger.warn("⚠️ To enable email verification, go to: Supabase Dashboard → Authentication → Providers → Email → Enable email confirmations");
    }

    // If session is null but email is not confirmed, email should have been sent
    if (requiresEmailVerification && !emailConfirmed) {
      logger.log("✅ Email confirmation required. Verification email should have been sent.");
      logger.log("✅ Check Supabase Auth Logs if email is not received.");
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

