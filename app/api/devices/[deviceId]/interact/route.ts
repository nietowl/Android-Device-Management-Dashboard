import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { DeviceInteraction } from "@/types";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: DeviceInteraction = await request.json();
    const { deviceId } = await params;

    // Verify device belongs to user
    const { data: device, error: deviceError } = await supabase
      .from("devices")
      .select("id")
      .eq("id", deviceId)
      .eq("user_id", user.id)
      .single();

    if (deviceError || !device) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }

    // In a real app, this would forward the interaction to the Android device
    // via WebSocket or another communication channel
    console.log(`Sending interaction to device ${deviceId}:`, body);

    // Here you would implement the actual device communication
    // For example: await sendToDevice(deviceId, body);

    return NextResponse.json({ success: true, interaction: body });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

