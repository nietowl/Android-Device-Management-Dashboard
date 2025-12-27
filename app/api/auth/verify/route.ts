import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";

/**
 * Proxy endpoint for email verification that hides Supabase URL from users.
 * 
 * This endpoint receives verification requests on your domain and forwards them
 * to Supabase server-side, ensuring users only see your domain in email links.
 * 
 * Flow:
 * 1. User clicks email link: https://yourdomain.com/api/auth/verify?token=xxx&type=signup
 * 2. This endpoint extracts token and makes server-side request to Supabase
 * 3. Supabase verifies and returns redirect with code
 * 4. This endpoint extracts code and redirects to /auth/callback
 */
export async function GET(request: NextRequest) {
  try {
    const requestUrl = new URL(request.url);
    const token = requestUrl.searchParams.get("token");
    const type = requestUrl.searchParams.get("type") || "signup"; // signup, recovery, email_change
    const redirect = requestUrl.searchParams.get("redirect") || "/dashboard";

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

    // Get site URL early to use for all redirects
    let siteUrl: string;
    try {
      siteUrl = getSiteUrl();
    } catch (error: any) {
      console.error("⚠️ Site URL configuration error:", error.message);
      // Use requestUrl.origin as fallback for error redirects only
      const errorUrl = new URL("/?error=config_error", requestUrl.origin);
      return NextResponse.redirect(errorUrl);
    }

    // Validate token is present
    if (!token) {
      console.error("⚠️ Verification request missing token");
      const errorUrl = new URL("/?error=invalid_token", siteUrl);
      return NextResponse.redirect(errorUrl);
    }

    // Validate token format (basic check - should be a string)
    if (typeof token !== "string" || token.trim().length === 0) {
      console.error("⚠️ Invalid token format");
      const errorUrl = new URL("/?error=invalid_token", siteUrl);
      return NextResponse.redirect(errorUrl);
    }

    // Validate type
    const validTypes = ["signup", "recovery", "email_change", "email"];
    if (!validTypes.includes(type)) {
      console.error("⚠️ Invalid verification type:", type);
      const errorUrl = new URL("/?error=invalid_type", siteUrl);
      return NextResponse.redirect(errorUrl);
    }

    // Validate redirect URL to prevent open redirects
    // Only allow relative paths or same-origin URLs
    let safeRedirect = redirect;
    try {
      const redirectUrl = new URL(redirect, requestUrl.origin);
      // Only allow same origin
      if (redirectUrl.origin !== requestUrl.origin) {
        console.error("⚠️ Redirect URL has different origin, using default");
        safeRedirect = "/dashboard";
      } else {
        // Use pathname + search to preserve query params if any
        safeRedirect = redirectUrl.pathname + redirectUrl.search;
      }
    } catch {
      // If redirect is not a valid URL, treat it as a path
      // Ensure it starts with / to prevent open redirects
      if (!redirect.startsWith("/")) {
        console.error("⚠️ Redirect path must start with /, using default");
        safeRedirect = "/dashboard";
      }
    }

    // Get Supabase URL from environment
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      console.error("⚠️ NEXT_PUBLIC_SUPABASE_URL is not set");
      const errorUrl = new URL("/?error=config_error", siteUrl);
      return NextResponse.redirect(errorUrl);
    }

    // Construct callback URL using site URL (not requestUrl.origin)
    const callbackUrl = `${siteUrl}/auth/callback?next=${encodeURIComponent(safeRedirect)}`;

    // Construct Supabase verify URL
    // Format: https://[PROJECT].supabase.co/auth/v1/verify?token=xxx&type=signup&redirect_to=...
    const supabaseVerifyUrl = new URL(`${supabaseUrl}/auth/v1/verify`);
    supabaseVerifyUrl.searchParams.set("token", token);
    supabaseVerifyUrl.searchParams.set("type", type);
    supabaseVerifyUrl.searchParams.set("redirect_to", callbackUrl);

    console.log(`✅ Proxying verification request to Supabase (type: ${type})`);

    // Make server-side request to Supabase verify endpoint
    // Supabase will return a redirect response with a code
    const verifyResponse = await fetch(supabaseVerifyUrl.toString(), {
      method: "GET",
      redirect: "manual", // Don't follow redirects automatically
      headers: {
        "User-Agent": "Next.js-Auth-Proxy/1.0",
      },
    });

    // Check if we got a redirect (status 302/307/308)
    if (verifyResponse.status >= 300 && verifyResponse.status < 400) {
      const location = verifyResponse.headers.get("location");
      
      if (location) {
        try {
          // Parse the redirect URL to extract the code
          const redirectUrl = new URL(location);
          const code = redirectUrl.searchParams.get("code");
          
          if (code) {
            // Successfully got code from Supabase redirect
            // Now redirect to our callback endpoint with the code
            const callbackUrlWithCode = new URL("/auth/callback", siteUrl);
            callbackUrlWithCode.searchParams.set("code", code);
            callbackUrlWithCode.searchParams.set("next", safeRedirect);
            
            // Preserve type for email_change and recovery flows
            if (type === "email_change" || type === "email" || type === "recovery") {
              callbackUrlWithCode.searchParams.set("type", type);
            }
            
            console.log(`✅ Verification successful, redirecting to callback with code`);
            return NextResponse.redirect(callbackUrlWithCode);
          } else {
            // No code in redirect - might be an error redirect
            console.error("⚠️ Supabase redirect missing code parameter");
            const errorUrl = new URL("/?error=verification_failed", siteUrl);
            return NextResponse.redirect(errorUrl);
          }
        } catch (urlError) {
          console.error("⚠️ Error parsing Supabase redirect URL:", urlError);
          const errorUrl = new URL("/?error=verification_failed", siteUrl);
          return NextResponse.redirect(errorUrl);
        }
      } else {
        // Redirect response but no location header
        console.error("⚠️ Supabase redirect response missing location header");
        const errorUrl = new URL("/?error=verification_failed", siteUrl);
        return NextResponse.redirect(errorUrl);
      }
    } else if (verifyResponse.ok) {
      // Got a 200 OK response (shouldn't happen, but handle it)
      console.warn("⚠️ Supabase verify returned 200 OK instead of redirect");
      // Try to extract code from response body or redirect anyway
      const errorUrl = new URL("/?error=verification_failed", siteUrl);
      return NextResponse.redirect(errorUrl);
    } else {
      // Error response from Supabase
      console.error(`⚠️ Supabase verify returned error: ${verifyResponse.status} ${verifyResponse.statusText}`);
      const errorUrl = new URL("/?error=verification_failed", siteUrl);
      return NextResponse.redirect(errorUrl);
    }
  } catch (error: any) {
    console.error("⚠️ Error in verification proxy:", error);
    // Try to get site URL for error redirect, fallback to request origin if needed
    let errorSiteUrl: string;
    try {
      const requestUrl = new URL(request.url);
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
      errorSiteUrl = siteUrl ? siteUrl.replace(/\/$/, "") : requestUrl.origin;
    } catch {
      errorSiteUrl = "http://localhost:3000"; // Last resort fallback
    }
    const errorUrl = new URL("/?error=verification_failed", errorSiteUrl);
    return NextResponse.redirect(errorUrl);
  }
}

