import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createErrorResponse, ApiErrors } from "@/lib/api/error-handler";

/**
 * GET /api/auth/user
 * 
 * Proxies supabase.auth.getUser() to hide Supabase URL from network tab.
 * Returns the current authenticated user.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error) {
      // Return 401 for auth errors, but don't expose Supabase-specific error details
      if (error.message?.includes("JWT") || error.message?.includes("token")) {
        throw ApiErrors.unauthorized("Invalid or expired session");
      }
      throw ApiErrors.unauthorized();
    }

    if (!user) {
      throw ApiErrors.unauthorized();
    }

    // Return user data without exposing Supabase URL
    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        email_confirmed_at: user.email_confirmed_at,
        created_at: user.created_at,
        updated_at: user.updated_at,
        app_metadata: user.app_metadata,
        user_metadata: user.user_metadata,
      },
    });
  } catch (error) {
    return createErrorResponse(error, "Failed to get user");
  }
}

