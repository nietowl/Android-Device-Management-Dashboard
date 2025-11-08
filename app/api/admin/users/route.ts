import { requireAdmin } from "@/lib/admin/utils";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: Request) {
  try {
    const { supabase } = await requireAdmin();
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = (page - 1) * limit;

    // Get all users with their profiles
    const { data: profiles, error } = await supabase
      .from("user_profiles")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get total count
    const { count } = await supabase
      .from("user_profiles")
      .select("*", { count: "exact", head: true });

    return NextResponse.json({
      users: profiles || [],
      total: count || 0,
      page,
      limit,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Unauthorized" },
      { status: error.message === "Forbidden: Admin access required" ? 403 : 401 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { adminId, supabase } = await requireAdmin();
    const body = await request.json();
    const { email, password, role, subscription_tier, subscription_status, subscription_end_date, max_devices } = body;

    // Validate required fields
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    // Validate password length
    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    // Use service role key to create user (admin only)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Create the user in auth.users
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
    });

    if (authError || !authData.user) {
      return NextResponse.json(
        { error: authError?.message || "Failed to create user" },
        { status: 500 }
      );
    }

    // Create user profile
    const profileData: any = {
      id: authData.user.id,
      email,
      role: role || "user",
      subscription_tier: subscription_tier || "free",
      subscription_status: subscription_status || "trial",
      max_devices: max_devices || 1,
      is_active: true,
    };

    if (subscription_end_date) {
      profileData.subscription_end_date = subscription_end_date;
      profileData.subscription_start_date = new Date().toISOString();
    } else {
      // Default to 14-day trial if no end date specified
      profileData.subscription_start_date = new Date().toISOString();
      profileData.subscription_end_date = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    }

    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .insert(profileData)
      .select()
      .single();

    if (profileError) {
      // If profile creation fails, try to delete the auth user
      await adminClient.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json(
        { error: profileError.message || "Failed to create user profile" },
        { status: 500 }
      );
    }

    // Log the activity
    await supabase.from("admin_activity_logs").insert({
      admin_id: adminId,
      action: "create_user",
      target_user_id: authData.user.id,
      details: {
        email,
        role: role || "user",
        subscription_tier: subscription_tier || "free",
      },
    });

    return NextResponse.json({
      success: true,
      user: profile,
    });
  } catch (error: any) {
    console.error("Error creating user:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create user" },
      { status: 500 }
    );
  }
}

