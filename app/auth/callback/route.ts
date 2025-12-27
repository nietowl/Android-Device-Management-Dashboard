import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") || "/dashboard";
  const type = requestUrl.searchParams.get("type"); // Can be "email_change", "signup", or "recovery"

  // Helper function to get site URL, prioritizing NEXT_PUBLIC_SITE_URL
  // Prevents localhost redirects in production
  const getSiteUrl = (): string => {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    const isProduction = process.env.NODE_ENV === "production";
    
    if (siteUrl) {
      // Remove trailing slash if present
      const cleanUrl = siteUrl.replace(/\/$/, "");
      
      // In production, validate that it's not localhost
      if (isProduction && (cleanUrl.includes("localhost") || cleanUrl.includes("127.0.0.1"))) {
        console.error("⚠️ NEXT_PUBLIC_SITE_URL contains localhost in production. This is not allowed.");
        throw new Error("NEXT_PUBLIC_SITE_URL cannot contain localhost in production");
      }
      
      return cleanUrl;
    }
    
    // Fallback to requestUrl.origin only if not in production
    if (isProduction) {
      console.error("⚠️ NEXT_PUBLIC_SITE_URL is not set in production. This is required.");
      throw new Error("NEXT_PUBLIC_SITE_URL must be set in production");
    }
    
    // Development: allow localhost fallback but warn
    console.warn("⚠️ NEXT_PUBLIC_SITE_URL is not set, falling back to request origin:", requestUrl.origin);
    return requestUrl.origin;
  };

  // Get site URL for all redirects
  let siteUrl: string;
  try {
    siteUrl = getSiteUrl();
  } catch (error: any) {
    console.error("⚠️ Site URL configuration error:", error.message);
    // Use requestUrl.origin as fallback for error redirects only
    siteUrl = requestUrl.origin;
  }

  if (code) {
    const supabase = await createClient();
    
    // Exchange the code for a session
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error) {
      // Get the user to check if email is verified
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user?.email_confirmed_at) {
        // Email is verified - redirect immediately
        // Profile check/creation happens in background (non-blocking)
        // Database trigger should handle profile creation, but if it doesn't,
        // we'll create it asynchronously without blocking the redirect
        
        // Start profile check/creation in background (don't await)
        if (user.email) {
          (async () => {
            try {
              // Quick check if profile exists
              const { data: existingProfile, error: profileError } = await supabase
                .from("user_profiles")
                .select("id")
                .eq("id", user.id)
                .single();

              if (!existingProfile && user.email) {
                // Profile doesn't exist for this user.id - check for duplicate email before creating
                console.log("⚠️ User profile not found, checking for duplicate email before creating...");
                
                const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
                const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

                if (supabaseUrl && supabaseServiceKey) {
                  const adminClient = createAdminClient(supabaseUrl, supabaseServiceKey, {
                    auth: {
                      autoRefreshToken: false,
                      persistSession: false,
                    },
                  });

                  // Check for existing profile with same email (case-insensitive)
                  const normalizedEmail = user.email.toLowerCase().trim();
                  const { data: duplicateProfile, error: duplicateCheckError } = await adminClient
                    .from("user_profiles")
                    .select("id, email")
                    .ilike("email", normalizedEmail)
                    .limit(1)
                    .maybeSingle();

                  if (duplicateProfile) {
                    // Duplicate email found - log warning and skip creation
                    console.warn(
                      `⚠️ Duplicate email detected: Profile already exists for email "${duplicateProfile.email}" with id ${duplicateProfile.id}. ` +
                      `Skipping profile creation for user ${user.id} to prevent duplicate account.`
                    );
                    return; // Exit early - don't create duplicate profile
                  }

                  // No duplicate found - proceed with profile creation
                  console.log("✅ No duplicate email found, creating profile via service role (background)...");

                  // Generate email hash and license ID using RPC functions
                  const { data: emailHash } = await adminClient.rpc("generate_email_hash", {
                    email_address: user.email,
                  });

                  const { data: licenseId } = await adminClient.rpc("generate_unique_license_id");

                  // Insert profile with all required fields
                  // Use ON CONFLICT to handle race conditions gracefully
                  const { data: newProfile, error: insertError } = await adminClient
                    .from("user_profiles")
                    .insert({
                      id: user.id,
                      email: user.email,
                      email_hash: emailHash,
                      license_id: licenseId,
                      role: "user",
                      subscription_tier: "free",
                      subscription_status: "trial",
                      subscription_start_date: new Date().toISOString(),
                      subscription_end_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 14 days from now
                    })
                    .select()
                    .single();

                  if (insertError) {
                    // Check if error is due to unique constraint violation (duplicate email)
                    if (insertError.code === "23505" || insertError.message?.includes("duplicate") || insertError.message?.includes("unique")) {
                      console.warn(
                        `⚠️ Unique constraint violation: Profile with email "${user.email}" already exists. ` +
                        `This may indicate a duplicate account. Skipping profile creation.`
                      );
                      return; // Exit early - duplicate detected
                    }

                    console.error("Failed to create user profile:", insertError);
                    // Try fallback insert without email_hash and license_id (they might be generated by trigger)
                    const { error: fallbackError } = await adminClient
                      .from("user_profiles")
                      .insert({
                        id: user.id,
                        email: user.email,
                        role: "user",
                        subscription_tier: "free",
                        subscription_status: "trial",
                        subscription_start_date: new Date().toISOString(),
                        subscription_end_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
                      })
                      .select()
                      .single();

                    if (fallbackError) {
                      // Check if fallback error is also a duplicate
                      if (fallbackError.code === "23505" || fallbackError.message?.includes("duplicate") || fallbackError.message?.includes("unique")) {
                        console.warn(
                          `⚠️ Unique constraint violation in fallback: Profile with email "${user.email}" already exists. Skipping.`
                        );
                      } else {
                        console.error("Fallback profile creation also failed:", fallbackError);
                      }
                    } else {
                      console.log("✅ User profile created successfully (fallback method)");
                    }
                  } else {
                    console.log("✅ User profile created successfully");
                  }
                } else {
                  console.error("⚠️ Service role key not available - cannot create profile fallback");
                }
              } else if (existingProfile) {
                console.log("✅ User profile already exists");
              }
            } catch (profileCheckError: any) {
              console.error("Error checking/creating user profile (background):", profileCheckError);
              // Continue anyway - user can still access the app
            }
          })();
        }

        // Check if this is a password recovery flow
        if (type === "recovery") {
          // Redirect to password reset page
          const resetUrl = new URL("/reset-password", siteUrl);
          return NextResponse.redirect(resetUrl);
        }
        
        // Email is verified, redirect immediately without waiting for profile check
        // Add verified=true parameter to trigger auto-refresh and login
        const redirectUrl = new URL(next, siteUrl);
        redirectUrl.searchParams.set("verified", "true");
        
        // Check if this is an email change verification
        // Supabase includes type=email_change in the URL for email change verifications
        if (type === "email_change" || type === "email") {
          redirectUrl.searchParams.set("email_updated", "true");
        }
        
        // Redirect immediately - profile creation happens in background
        return NextResponse.redirect(redirectUrl);
      } else {
        // Email not verified yet, redirect to home with message
        const redirectUrl = new URL("/?verified=false", siteUrl);
        return NextResponse.redirect(redirectUrl);
      }
    } else {
      // Error exchanging code, redirect to home with error
      console.error("Error exchanging code for session:", error);
      const redirectUrl = new URL("/?error=auth_failed", siteUrl);
      return NextResponse.redirect(redirectUrl);
    }
  }

  // No code provided, redirect to home
  return NextResponse.redirect(new URL("/", siteUrl));
}

