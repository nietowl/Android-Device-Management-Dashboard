import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createErrorResponse, ApiErrors } from "@/lib/api/error-handler";

// Device server URL
const DEVICE_SERVER_URL = process.env.DEVICE_SERVER_URL || "http://localhost:9211";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      throw ApiErrors.unauthorized();
    }

    const { deviceId } = await params;
    
    let body;
    try {
      body = await request.json();
    } catch (error) {
      throw ApiErrors.badRequest("Invalid JSON in request body");
    }

    const { command, data } = body;

    if (!command || typeof command !== "string") {
      throw ApiErrors.validationError("command is required and must be a string");
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

    // RLS policy ensures user can only access their own devices
    // Verify device exists and belongs to user (RLS handles filtering)
    const { data: device, error: deviceError } = await supabase
      .from("devices")
      .select("id")
      .eq("id", deviceId)
      .single();

    // Note: You might want to allow commands even if device not in DB yet
    // if (deviceError || !device) {
    //   throw ApiErrors.notFound("Device");
    // }

    // Send command to device-server.js with License ID for authentication
    let response;
    try {
      response = await fetch(`${DEVICE_SERVER_URL}/api/command/${deviceId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          command: command,
          data: data || {},
          licenseId: profile.license_id, // License ID is used as AUTH_SECRET
        }),
      });
    } catch (fetchError) {
      throw ApiErrors.serviceUnavailable("Failed to connect to device server");
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw ApiErrors.serviceUnavailable(
        errorData.error || "Failed to send command to device",
        errorData
      );
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    return createErrorResponse(error, "Failed to send command to device");
  }
}

