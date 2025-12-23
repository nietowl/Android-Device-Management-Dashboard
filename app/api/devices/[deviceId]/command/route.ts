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

    // Validate command format (security: prevent command injection)
    const commandLower = command.trim().toLowerCase();
    if (!/^[a-z0-9-]+$/.test(commandLower) || commandLower.length > 50) {
      throw ApiErrors.validationError("Invalid command format");
    }

    // Basic command whitelist validation
    const allowedCommands = [
      'getsms', 'sendsms', 'deletesms',
      'getfiles', 'uploadfile', 'downloadfile', 'deletefile',
      'getcalls', 'getcontacts', 'makecall',
      'startcamera', 'stopcamera', 'capture',
      'getscreen', 'screenshot',
      'getinfo', 'getdeviceinfo',
      'tap', 'swipe', 'scroll', 'type', 'back', 'home', 'menu',
      'getapps', 'launchapp', 'closeapp',
      'ping', 'status'
    ];
    
    if (!allowedCommands.includes(commandLower)) {
      throw ApiErrors.validationError(`Command '${commandLower}' is not allowed`);
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

    // CRITICAL: Always validate device ownership before allowing commands
    // RLS policy ensures user can only access their own devices
    // Verify device exists and belongs to user (RLS handles filtering)
    const { data: device, error: deviceError } = await supabase
      .from("devices")
      .select("id, user_id")
      .eq("id", deviceId)
      .single();

    // Enforce device validation - no commands to unregistered devices
    if (deviceError || !device) {
      throw ApiErrors.notFound("Device not found");
    }
    
    // Double-check device ownership (defense in depth)
    if (device.user_id !== user.id) {
      throw ApiErrors.forbidden("You do not have permission to access this device");
    }

    // Send command to device-server.js with License ID for authentication
    let response;
    try {
      response = await fetch(`${DEVICE_SERVER_URL}/api/command/${deviceId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cmd: commandLower, // device-server expects 'cmd' not 'command'
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

