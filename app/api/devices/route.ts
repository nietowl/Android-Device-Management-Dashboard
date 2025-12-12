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

    const { data, error } = await supabase
      .from("devices")
      .select("*")
      .eq("user_id", user.id)
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

    return NextResponse.json({ device: data });
  } catch (error) {
    return createErrorResponse(error, "Failed to create device");
  }
}

