import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createErrorResponse, ApiErrors } from "@/lib/api/error-handler";

/**
 * GET /api/user/license-id
 * 
 * Returns the current authenticated user's license ID.
 * SECURITY: User ID is fetched from session, never exposed in request.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      throw ApiErrors.unauthorized();
    }

    // Get user's license_id - user ID comes from session, not request
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("license_id")
      .eq("id", user.id)
      .single();

    if (profileError) {
      throw ApiErrors.internalServerError(
        `Failed to fetch license ID: ${profileError.message}`,
        { databaseError: profileError }
      );
    }

    if (!profile?.license_id) {
      throw ApiErrors.notFound("License ID not found for user");
    }

    return NextResponse.json({ license_id: profile.license_id });
  } catch (error) {
    return createErrorResponse(error, "Failed to fetch license ID");
  }
}

