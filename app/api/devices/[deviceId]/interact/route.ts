import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { DeviceInteraction } from "@/types";
import { createErrorResponse, ApiErrors } from "@/lib/api/error-handler";

// Get socket.io functions from server
function getSocketFunctions() {
  if (typeof global !== "undefined") {
    const socketModule = require("@/lib/socket/server.js");
    return socketModule;
  }
  return null;
}

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

    let body: DeviceInteraction;
    try {
      body = await request.json();
    } catch (error) {
      throw ApiErrors.badRequest("Invalid JSON in request body");
    }

    // Validate interaction type
    if (!body.type || !["tap", "swipe", "long_press", "scroll"].includes(body.type)) {
      throw ApiErrors.validationError(
        "Invalid interaction type. Must be one of: tap, swipe, long_press, scroll"
      );
    }

    // Validate coordinates
    if (typeof body.x !== "number" || typeof body.y !== "number") {
      throw ApiErrors.validationError("x and y coordinates are required and must be numbers");
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
    // Verify device exists and belongs to user
    const { data: device, error: deviceError } = await supabase
      .from("devices")
      .select("id")
      .eq("id", deviceId)
      .single();

    if (deviceError || !device) {
      throw ApiErrors.notFound("Device");
    }

    // Send interaction to Android device via device-server.js
    const deviceServerUrl = process.env.DEVICE_SERVER_URL || "http://localhost:9211";
    
    // Map interaction type to device command
    let command = "device-interaction";
    let commandData: Record<string, any> = {};

    // Handle different interaction types
    switch (body.type) {
      case "tap":
        command = "tap";
        commandData = { x: body.x, y: body.y };
        break;
      case "swipe":
        command = "swipe";
        commandData = {
          x: body.x,
          y: body.y,
          deltaX: body.deltaX || 0,
          deltaY: body.deltaY || 0,
          duration: body.duration || 300,
        };
        break;
      case "long_press":
        command = "long-press";
        commandData = { x: body.x, y: body.y, duration: body.duration || 500 };
        break;
      case "scroll":
        command = "scroll";
        commandData = {
          x: body.x,
          y: body.y,
          deltaX: body.deltaX || 0,
          deltaY: body.deltaY || 0,
        };
        break;
    }

    // Send command to device-server.js with License ID for authentication
    try {
      const response = await fetch(`${deviceServerUrl}/api/command/${deviceId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          command: command,
          data: commandData,
          licenseId: profile.license_id, // License ID is used as AUTH_SECRET
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error(`Failed to send command to device-server:`, errorData);
        // Don't fail the request if device server is unavailable
        // In production, you might want to queue commands for retry
      } else {
        const result = await response.json();
        console.log(`Command sent to device ${deviceId}:`, result);
      }
    } catch (error) {
      console.error(`Error sending command to device-server:`, error);
      // Don't fail the request, just log the error
      // In production, you might want to queue commands for retry
    }

    return NextResponse.json({ success: true, interaction: body });
  } catch (error) {
    return createErrorResponse(error, "Failed to process device interaction");
  }
}
