import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createErrorResponse, ApiErrors } from "@/lib/api/error-handler";

/**
 * GET /api/user/profile
 * 
 * Returns the current authenticated user's profile.
 * SECURITY: User ID is fetched from session, never exposed in request.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      throw ApiErrors.unauthorized();
    }

    // Get user's profile - user ID comes from session, not request
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profileError) {
      throw ApiErrors.internalServerError(
        `Failed to fetch user profile: ${profileError.message}`,
        { databaseError: profileError }
      );
    }

    if (!profile) {
      throw ApiErrors.notFound("User profile");
    }

    return NextResponse.json({ profile });
  } catch (error) {
    return createErrorResponse(error, "Failed to fetch user profile");
  }
}

