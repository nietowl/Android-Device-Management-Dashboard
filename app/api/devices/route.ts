import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { createErrorResponse, ApiErrors } from "@/lib/api/error-handler";

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      throw ApiErrors.unauthorized();
    }

    // RLS policies automatically filter by user_id, so we don't need to manually filter
    const { data, error } = await supabase
      .from("devices")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw ApiErrors.internalServerError(
        `Failed to fetch devices: ${error.message}`,
        { databaseError: error }
      );
    }

    return NextResponse.json({ devices: data || [] });
  } catch (error) {
    return createErrorResponse(error, "Failed to fetch devices");
  }
}

export async function POST(request: Request) {
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

    const { name, model } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      throw ApiErrors.validationError("name is required and must be a non-empty string");
    }

    if (!model || typeof model !== "string" || model.trim().length === 0) {
      throw ApiErrors.validationError("model is required and must be a non-empty string");
    }

    // Get user's license ID for device-server authentication
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("license_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.license_id) {
      throw ApiErrors.internalServerError(
        "Failed to retrieve user license ID for device authentication"
      );
    }

    // RLS policy ensures user_id is set correctly, but we still need to provide it
    const { data, error } = await supabase
      .from("devices")
      .insert([
        {
          user_id: user.id,
          name: name.trim(),
          model: model.trim(),
          status: "offline",
          last_sync: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) {
      throw ApiErrors.internalServerError(
        `Failed to create device: ${error.message}`,
        { databaseError: error }
      );
    }

    if (!data) {
      throw ApiErrors.internalServerError("Device created but no data returned");
    }

    // Include license_id in response for device-server authentication
    return NextResponse.json({ 
      device: data,
      license_id: profile.license_id // License ID is used as AUTH_SECRET (token)
    });
  } catch (error) {
    return createErrorResponse(error, "Failed to create device");
  }
}

