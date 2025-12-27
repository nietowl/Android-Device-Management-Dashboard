import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createErrorResponse, ApiErrors } from "@/lib/api/error-handler";
import { validateCommand } from "@/lib/utils/command-validation";

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

    // SECURITY: Device ID now comes from request body, not URL path
    // Path parameter is kept for route matching but ignored
    // SECURITY: Validate request size before parsing
    const contentLength = request.headers.get("content-length");
    const MAX_BODY_SIZE = 1024 * 1024; // 1MB for commands
    if (contentLength) {
      const size = parseInt(contentLength, 10);
      if (!isNaN(size) && size > MAX_BODY_SIZE) {
        throw ApiErrors.badRequest(
          `Request body too large. Maximum size: ${Math.round(MAX_BODY_SIZE / 1024)}KB`
        );
      }
    }
    
    let body;
    try {
      body = await request.json();
    } catch (error) {
      throw ApiErrors.badRequest("Invalid JSON in request body");
    }

    // Get deviceId from body (preferred) or header (fallback)
    const deviceId = body.deviceId || request.headers.get('X-Device-ID');
    
    if (!deviceId || typeof deviceId !== 'string') {
      throw ApiErrors.validationError("deviceId is required in request body or X-Device-ID header");
    }

    const { command, data } = body;

    if (!command || typeof command !== "string") {
      throw ApiErrors.validationError("command is required and must be a string");
    }

    // SECURITY: Validate command against whitelist and sanitize parameters
    try {
      validateCommand(command, undefined, data);
    } catch (validationError) {
      if (validationError instanceof Error) {
        throw ApiErrors.validationError(validationError.message);
      }
      throw ApiErrors.validationError("Invalid command");
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
      .select("id, user_id")
      .eq("id", deviceId)
      .single();

    // SECURITY: Always validate device ownership before allowing commands
    if (deviceError || !device) {
      throw ApiErrors.notFound("Device not found");
    }

    // Verify device belongs to the authenticated user
    if (device.user_id !== user.id) {
      throw ApiErrors.forbidden("You do not have permission to access this device");
    }

    // Send command to device-server.js with License ID in header (not visible in network tab)
    let response;
    try {
      response = await fetch(`${DEVICE_SERVER_URL}/api/command/${deviceId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-License-ID": profile.license_id, // Send in header instead of body
        },
        body: JSON.stringify({
          command: command,
          data: data || {},
        }),
      });
    } catch (fetchError) {
      throw ApiErrors.serviceUnavailable("Failed to connect to device server");
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error || "Failed to send command to device";
      const errorDetails = errorData.details ? ` Details: ${JSON.stringify(errorData.details)}` : "";
      throw ApiErrors.serviceUnavailable(
        `${errorMessage}${errorDetails}`
      );
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    return createErrorResponse(error, "Failed to send command to device");
  }
}

