import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") || "/dashboard";
  const type = requestUrl.searchParams.get("type"); // Can be "email_change", "signup", or "recovery"

  if (code) {
    const supabase = await createClient();
    
    // Exchange the code for a session
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error) {
      // Get the user to check if email is verified
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user?.email_confirmed_at) {
        // Email is verified, redirect to dashboard with refresh flag
        // Add verified=true parameter to trigger auto-refresh and login
        const redirectUrl = new URL(next, requestUrl.origin);
        redirectUrl.searchParams.set("verified", "true");
        
        // Check if this is an email change verification
        // Supabase includes type=email_change in the URL for email change verifications
        if (type === "email_change" || type === "email") {
          redirectUrl.searchParams.set("email_updated", "true");
        }
        
        // Redirect with session established - user is now logged in
        return NextResponse.redirect(redirectUrl);
      } else {
        // Email not verified yet, redirect to home with message
        const redirectUrl = new URL("/?verified=false", requestUrl.origin);
        return NextResponse.redirect(redirectUrl);
      }
    } else {
      // Error exchanging code, redirect to home with error
      console.error("Error exchanging code for session:", error);
      const redirectUrl = new URL("/?error=auth_failed", requestUrl.origin);
      return NextResponse.redirect(redirectUrl);
    }
  }

  // No code provided, redirect to home
  return NextResponse.redirect(new URL("/", requestUrl.origin));
}

