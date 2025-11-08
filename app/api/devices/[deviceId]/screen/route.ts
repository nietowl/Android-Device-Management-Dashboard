import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { deviceId } = await params;

    // Verify device belongs to user
    const { data: device, error: deviceError } = await supabase
      .from("devices")
      .select("*")
      .eq("id", deviceId)
      .eq("user_id", user.id)
      .single();

    if (deviceError || !device) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
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
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

