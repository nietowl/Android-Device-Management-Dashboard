import { requireAdmin } from "@/lib/admin/utils";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: Request) {
  try {
    const { supabase } = await requireAdmin();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    // Use service role to bypass RLS for admin access
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Get all devices
    let query = adminClient
      .from("devices")
      .select(`
        *,
        user_profiles!devices_user_id_fkey (
          email,
          subscription_tier,
          subscription_status
        )
      `)
      .order("last_sync", { ascending: false });

    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data: devices, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Calculate device statistics
    const stats = {
      total: devices?.length || 0,
      online: devices?.filter((d) => d.status === "online").length || 0,
      offline: devices?.filter((d) => d.status === "offline").length || 0,
      by_model: {} as Record<string, number>,
    };

    devices?.forEach((device) => {
      const model = device.model || "Unknown";
      stats.by_model[model] = (stats.by_model[model] || 0) + 1;
    });

    return NextResponse.json({
      devices: devices || [],
      stats,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Unauthorized" },
      { status: error.message === "Forbidden: Admin access required" ? 403 : 401 }
    );
  }
}

