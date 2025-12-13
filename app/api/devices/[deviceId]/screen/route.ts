import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { createErrorResponse, ApiErrors } from "@/lib/api/error-handler";

export async function GET(
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

    // RLS policy ensures user can only access their own devices
    // Verify device exists and belongs to user
    const { data: device, error: deviceError } = await supabase
      .from("devices")
      .select("*")
      .eq("id", deviceId)
      .single();

    if (deviceError || !device) {
      throw ApiErrors.notFound("Device");
    }

    // In a real app, this would fetch screen data from the device
    // For now, return mock data
    return NextResponse.json({
      screen: {
        width: 1080,
        height: 2340,
        data: null, // Base64 encoded screen data would go here
      },
    });
  } catch (error) {
    return createErrorResponse(error, "Failed to fetch device screen");
  }
}

