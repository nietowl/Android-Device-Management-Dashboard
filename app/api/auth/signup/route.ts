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
    
    // Final validation: ensure origin is valid and not empty
    if (!origin || origin.trim() === '') {
      console.error("⚠️ Invalid origin detected. NEXT_PUBLIC_SITE_URL must be set.");
      return NextResponse.json(
        { error: "Server configuration error: Invalid site URL configuration" },
        { status: 500 }
      );
    }
    
    // Additional security: ensure production uses HTTPS
    // Allow HTTP only in development or when explicitly allowed via environment variable
    const allowHttpInProduction = process.env.ALLOW_HTTP_IN_PRODUCTION === 'true';
    if (!isDevelopment && !origin.startsWith('https://') && !allowHttpInProduction) {
      console.error("⚠️ Production URL must use HTTPS. Current origin:", origin);
      console.error("⚠️ Set NEXT_PUBLIC_SITE_URL to use https:// (e.g., https://yourdomain.com)");
      console.error("⚠️ For local testing, you can set ALLOW_HTTP_IN_PRODUCTION=true (not recommended for real production)");
      return NextResponse.json(
        { 
          error: "Server configuration error: Production URL must use HTTPS",
          details: `Current URL: ${origin}. Please set NEXT_PUBLIC_SITE_URL to use https:// (e.g., https://yourdomain.com). For local testing only, you can set ALLOW_HTTP_IN_PRODUCTION=true in your environment variables.`
        },
        { status: 500 }
      );
    }
    
    // Log the origin being used (for debugging)
    console.log(`✅ Using redirect URL origin: ${origin}`);
    console.log(`✅ NEXT_PUBLIC_SITE_URL value: ${process.env.NEXT_PUBLIC_SITE_URL || 'NOT SET'}`);
    console.log(`✅ NODE_ENV: ${process.env.NODE_ENV || 'development'}`);

    // Use proxy endpoint to hide Supabase URL from email links
    // The proxy endpoint will forward verification to Supabase server-side
    const redirectUrl = `${origin}/api/auth/verify?type=signup&redirect=/dashboard`;
    console.log(`✅ Final redirectUrl being sent to Supabase (via proxy): ${redirectUrl}`);
    
    // Check if user already exists before attempting signup
    // This prevents duplicate accounts and handles unverified users properly
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    // CRITICAL: Always check for duplicates - don't proceed if check fails
    let duplicateCheckPassed = false;
    let existingUser: any = null;
    
    if (supabaseUrl && supabaseServiceKey) {
      try {
        const adminClient = createAdminClient(supabaseUrl, supabaseServiceKey, {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        });

        const normalizedEmail = email.toLowerCase().trim();

        // Check if a user with this email already exists in auth.users
        const { data: usersData, error: listUsersError } = await adminClient.auth.admin.listUsers();
        
        if (listUsersError) {
          console.error("Error listing users for duplicate check:", listUsersError);
          // Don't proceed if we can't check - this prevents duplicate creation
          return NextResponse.json(
            { 
              error: "Unable to verify account status. Please try again in a moment.",
            },
            { status: 503 } // Service Unavailable
          );
        }

        existingUser = usersData?.users?.find(
          (u) => u.email?.toLowerCase().trim() === normalizedEmail
        );

        // Also check user_profiles table for duplicate emails (extra safety)
        const { data: existingProfile, error: profileCheckError } = await adminClient
          .from("user_profiles")
          .select("id, email")
          .ilike("email", normalizedEmail)
          .limit(1)
          .maybeSingle();

        if (profileCheckError) {
          console.error("Error checking user_profiles for duplicates:", profileCheckError);
          // Don't proceed if we can't check profiles
          return NextResponse.json(
            { 
              error: "Unable to verify account status. Please try again in a moment.",
            },
            { status: 503 }
          );
        }

        // If profile exists but auth user doesn't, that's a data inconsistency - still prevent signup
        if (existingProfile && !existingUser) {
          console.warn(
            `⚠️ Data inconsistency: Profile exists for "${email}" but no auth user found. Preventing duplicate signup.`
          );
          return NextResponse.json(
            { 
              error: "An account with this email already exists. Please sign in instead.",
            },
            { status: 400 }
          );
        }

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

        // No duplicate found - mark check as passed
        duplicateCheckPassed = true;
      } catch (adminCheckError: any) {
        // If admin check fails, DO NOT proceed - this prevents duplicate creation
        console.error("Critical error during duplicate check:", adminCheckError);
        return NextResponse.json(
          { 
            error: "Unable to verify account status. Please try again in a moment.",
            details: process.env.NODE_ENV === "development" ? adminCheckError.message : undefined,
          },
          { status: 503 } // Service Unavailable
        );
      }
    } else {
      // Service role key not available - cannot safely check for duplicates
      console.error("⚠️ Service role key not available - cannot perform duplicate check");
      return NextResponse.json(
        { 
          error: "Server configuration error: Unable to verify account status.",
        },
        { status: 500 }
      );
    }

    // Only proceed with signup if duplicate check passed
    if (!duplicateCheckPassed) {
      return NextResponse.json(
        { 
          error: "Unable to complete signup. Please try again.",
        },
        { status: 500 }
      );
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

    // Post-signup verification: Check for duplicate profiles (safety check)
    // This ensures no duplicate was created despite our pre-signup checks
    if (supabaseUrl && supabaseServiceKey && data.user.email) {
      try {
        const adminClient = createAdminClient(supabaseUrl, supabaseServiceKey, {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        });

        const normalizedEmail = data.user.email.toLowerCase().trim();
        const { data: duplicateProfiles, error: postCheckError } = await adminClient
          .from("user_profiles")
          .select("id, email")
          .ilike("email", normalizedEmail);

        if (!postCheckError && duplicateProfiles && duplicateProfiles.length > 1) {
          // Multiple profiles with same email found - this shouldn't happen but log it
          console.error(
            `⚠️ CRITICAL: Multiple profiles found for email "${data.user.email}" after signup. ` +
            `This indicates a duplicate account was created. Profile IDs: ${duplicateProfiles.map(p => p.id).join(", ")}`
          );
          // Don't fail the signup, but log the issue for admin review
        }
      } catch (postCheckError: any) {
        // Log but don't fail - this is just a safety check
        console.warn("Post-signup duplicate check failed (non-critical):", postCheckError);
      }
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

