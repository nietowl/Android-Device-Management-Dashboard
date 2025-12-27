import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createErrorResponse, ApiErrors } from "@/lib/api/error-handler";

/**
 * GET /api/auth/session
 * 
 * Proxies supabase.auth.getSession() to hide Supabase URL from network tab.
 * Returns the current session.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) {
      throw ApiErrors.unauthorized();
    }

    if (!session) {
      return NextResponse.json({ session: null });
    }

    // Return session data without exposing Supabase URL
    return NextResponse.json({
      session: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: session.expires_in,
        expires_at: session.expires_at,
        token_type: session.token_type,
        user: {
          id: session.user.id,
          email: session.user.email,
          email_confirmed_at: session.user.email_confirmed_at,
          created_at: session.user.created_at,
          updated_at: session.user.updated_at,
          app_metadata: session.user.app_metadata,
          user_metadata: session.user.user_metadata,
        },
      },
    });
  } catch (error) {
    return createErrorResponse(error, "Failed to get session");
  }
}

