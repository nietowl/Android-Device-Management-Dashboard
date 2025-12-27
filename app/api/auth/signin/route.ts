import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createErrorResponse, ApiErrors } from "@/lib/api/error-handler";

/**
 * POST /api/auth/signin
 * 
 * Proxies supabase.auth.signInWithPassword() to hide Supabase URL from network tab.
 * Accepts email and password, returns user and session.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    // Validate input
    if (!email || typeof email !== "string" || email.trim().length === 0) {
      throw ApiErrors.validationError("Email is required");
    }

    if (!password || typeof password !== "string" || password.length === 0) {
      throw ApiErrors.validationError("Password is required");
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      // Map Supabase auth errors to generic errors without exposing Supabase details
      if (error.message?.includes("Invalid login credentials") || 
          error.message?.includes("Email not confirmed")) {
        throw ApiErrors.unauthorized("Invalid email or password");
      }
      throw ApiErrors.unauthorized(error.message || "Authentication failed");
    }

    if (!data.user || !data.session) {
      throw ApiErrors.unauthorized("Authentication failed");
    }

    // Return user and session data without exposing Supabase URL
    return NextResponse.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        email_confirmed_at: data.user.email_confirmed_at,
        created_at: data.user.created_at,
        updated_at: data.user.updated_at,
        app_metadata: data.user.app_metadata,
        user_metadata: data.user.user_metadata,
      },
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_in: data.session.expires_in,
        expires_at: data.session.expires_at,
        token_type: data.session.token_type,
      },
    });
  } catch (error) {
    return createErrorResponse(error, "Failed to sign in");
  }
}

