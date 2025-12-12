import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createErrorResponse, ApiErrors } from "@/lib/api/error-handler";

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      throw ApiErrors.unauthorized();
    }

    let body;
    try {
      body = await request.json();
    } catch (error) {
      throw ApiErrors.badRequest("Invalid JSON in request body");
    }

    const { username } = body;

    if (!username || typeof username !== "string" || username.trim().length === 0) {
      throw ApiErrors.validationError("Username is required and must be a non-empty string");
    }

    // Validate username format (alphanumeric, underscore, hyphen, 3-20 chars)
    const usernameRegex = /^[a-zA-Z0-9_-]{3,20}$/;
    if (!usernameRegex.test(username)) {
      throw ApiErrors.validationError(
        "Username must be 3-20 characters and contain only letters, numbers, underscores, or hyphens"
      );
    }

    // Check if username is already taken
    const { data: existingUser, error: checkError } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("username", username)
      .neq("id", user.id)
      .single();

    if (checkError && checkError.code !== "PGRST116") {
      // PGRST116 is "no rows returned" which is expected if username is available
      throw ApiErrors.internalServerError(
        `Failed to check username availability: ${checkError.message}`,
        { databaseError: checkError }
      );
    }

    if (existingUser) {
      throw ApiErrors.conflict("Username is already taken");
    }

    // Update username
    const { data, error } = await supabase
      .from("user_profiles")
      .update({ username: username.trim() })
      .eq("id", user.id)
      .select()
      .single();

    if (error) {
      throw ApiErrors.internalServerError(
        `Failed to update username: ${error.message}`,
        { databaseError: error }
      );
    }

    if (!data) {
      throw ApiErrors.notFound("User profile");
    }

    return NextResponse.json({ success: true, profile: data });
  } catch (error) {
    return createErrorResponse(error, "Failed to update username");
  }
}

