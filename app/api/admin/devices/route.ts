import { requireAdmin } from "@/lib/admin/utils";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createErrorResponse, ApiErrors } from "@/lib/api/error-handler";

export async function GET(request: Request) {
  try {
    const { supabase } = await requireAdmin();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const licenseId = searchParams.get("licenseId");

    // Use service role to bypass RLS for admin access
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw ApiErrors.internalServerError(
        "Server configuration error: Missing required environment variables"
      );
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
          subscription_status,
          license_id
        )
      `)
      .order("last_sync", { ascending: false });

    if (userId) {
      query = query.eq("user_id", userId);
    } else if (licenseId) {
      // If license ID is provided, find the user first, then filter devices
      const { data: userProfile } = await adminClient
        .from("user_profiles")
        .select("id")
        .eq("license_id", licenseId)
        .single();
      
      if (userProfile) {
        query = query.eq("user_id", userProfile.id);
      } else {
        // No user found with this license ID, return empty array
        return NextResponse.json({
          devices: [],
          stats: { total: 0, online: 0, by_model: {} },
        });
      }
    }

    const { data: devices, error } = await query;

    if (error) {
      throw ApiErrors.internalServerError(
        `Failed to fetch devices: ${error.message}`,
        { databaseError: error }
      );
    }

    // Filter out offline devices - only show online devices
    const onlineDevices = devices?.filter((d) => d.status === "online") || [];

    // Calculate device statistics (only for online devices)
    const stats = {
      total: onlineDevices.length,
      online: onlineDevices.length,
      by_model: {} as Record<string, number>,
    };

    onlineDevices.forEach((device) => {
      const model = device.model || "Unknown";
      stats.by_model[model] = (stats.by_model[model] || 0) + 1;
    });

    return NextResponse.json({
      devices: onlineDevices,
      stats,
    });
  } catch (error) {
    return createErrorResponse(error, "Failed to fetch devices");
  }
}

