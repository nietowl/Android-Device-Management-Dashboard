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

    const { username, email } = body;

    // Handle username update
    if (username !== undefined) {
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
    }

    // Handle email update
    if (email !== undefined) {
      if (!email || typeof email !== "string" || email.trim().length === 0) {
        throw ApiErrors.validationError("Email is required and must be a non-empty string");
      }

      // Update email in auth.users (this will trigger email verification)
      // Note: emailRedirectTo is configured in Supabase dashboard, but we can try to pass it
      // The verification link will include type=email_change automatically by Supabase
      const { error: updateEmailError } = await supabase.auth.updateUser({
        email: email.trim(),
      });

      if (updateEmailError) {
        throw ApiErrors.internalServerError(
          `Failed to update email: ${updateEmailError.message}`,
          { databaseError: updateEmailError }
        );
      }

      // Generate email hash using database function
      const { data: emailHash, error: hashError } = await supabase.rpc("generate_email_hash", {
        email_address: email.trim(),
      });

      if (hashError) {
        throw ApiErrors.internalServerError(
          `Failed to generate email hash: ${hashError.message}`,
          { databaseError: hashError }
        );
      }

      // Update email and email_hash in user_profiles
      const { data: profile, error: profileError } = await supabase
        .from("user_profiles")
        .update({ 
          email: email.trim(),
          email_hash: emailHash 
        })
        .eq("id", user.id)
        .select()
        .single();

      if (profileError) {
        throw ApiErrors.internalServerError(
          `Failed to update email hash: ${profileError.message}`,
          { databaseError: profileError }
        );
      }

      return NextResponse.json({ 
        success: true, 
        message: "Email updated. Please verify your new email address.",
        profile: profile 
      });
    }

    throw ApiErrors.badRequest("Either username or email must be provided");
  } catch (error) {
    return createErrorResponse(error, "Failed to update user profile");
  }
}

