import { requireAdmin } from "@/lib/admin/utils";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createErrorResponse, ApiErrors } from "@/lib/api/error-handler";

export async function GET(request: Request) {
  try {
    const { supabase } = await requireAdmin();
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = (page - 1) * limit;

    // Validate pagination parameters
    if (page < 1 || limit < 1 || limit > 100) {
      throw ApiErrors.validationError(
        "Invalid pagination parameters. Page must be >= 1, limit must be between 1 and 100"
      );
    }

    // Get all users with their profiles
    const { data: profiles, error } = await supabase
      .from("user_profiles")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw ApiErrors.internalServerError(
        `Failed to fetch users: ${error.message}`,
        { databaseError: error }
      );
    }

    // Get total count
    const { count, error: countError } = await supabase
      .from("user_profiles")
      .select("*", { count: "exact", head: true });

    if (countError) {
      throw ApiErrors.internalServerError(
        `Failed to fetch user count: ${countError.message}`,
        { databaseError: countError }
      );
    }

    return NextResponse.json({
      users: profiles || [],
      total: count || 0,
      page,
      limit,
    });
  } catch (error) {
    return createErrorResponse(error, "Failed to fetch users");
  }
}

export async function POST(request: Request) {
  try {
    const { adminId, supabase } = await requireAdmin();
    
    let body;
    try {
      body = await request.json();
    } catch (error) {
      throw ApiErrors.badRequest("Invalid JSON in request body");
    }

    const { email, password, role, subscription_tier, subscription_status, subscription_end_date, max_devices } = body;

    // Validate required fields
    if (!email || typeof email !== "string" || email.trim().length === 0) {
      throw ApiErrors.validationError("Email is required and must be a non-empty string");
    }

    if (!password || typeof password !== "string") {
      throw ApiErrors.validationError("Password is required");
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw ApiErrors.validationError("Invalid email format");
    }

    // Validate password length
    if (password.length < 6) {
      throw ApiErrors.validationError("Password must be at least 6 characters");
    }

    // Validate role if provided
    if (role && !["admin", "user"].includes(role)) {
      throw ApiErrors.validationError("Role must be either 'admin' or 'user'");
    }

    // Validate subscription tier if provided
    if (subscription_tier && !["free", "basic", "premium", "enterprise"].includes(subscription_tier)) {
      throw ApiErrors.validationError("Invalid subscription tier");
    }

    // Use service role key to create user (admin only)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      const missingVars = [];
      if (!supabaseUrl) missingVars.push("NEXT_PUBLIC_SUPABASE_URL");
      if (!supabaseServiceKey) missingVars.push("SUPABASE_SERVICE_ROLE_KEY");
      
      console.error(`Missing environment variables: ${missingVars.join(", ")}`);
      throw ApiErrors.internalServerError(
        `Server configuration error: Missing required environment variables (${missingVars.join(", ")}). Please check your .env.local file.`
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
      throw ApiErrors.internalServerError(
        authError?.message || "Failed to create user",
        { authError }
      );
    }

    // Wait a moment for the trigger to create the profile (if it hasn't already)
    // The trigger automatically creates a profile when a user is created in auth.users
    await new Promise(resolve => setTimeout(resolve, 500));

    // Check if profile already exists (created by trigger)
    // Use adminClient to bypass RLS
    const { data: existingProfile } = await adminClient
      .from("user_profiles")
      .select("*")
      .eq("id", authData.user.id)
      .single();

    // Prepare profile data
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

    let profile;
    let profileError;

    if (existingProfile) {
      // Profile already exists (created by trigger), update it
      // Use adminClient to bypass RLS
      const { data: updatedProfile, error: updateError } = await adminClient
        .from("user_profiles")
        .update(profileData)
        .eq("id", authData.user.id)
        .select()
        .single();
      
      profile = updatedProfile;
      profileError = updateError;
    } else {
      // Profile doesn't exist, insert it
      // Use adminClient to bypass RLS
      const { data: insertedProfile, error: insertError } = await adminClient
        .from("user_profiles")
        .insert(profileData)
        .select()
        .single();
      
      profile = insertedProfile;
      profileError = insertError;
    }

    if (profileError || !profile) {
      // If profile creation/update fails, try to delete the auth user
      await adminClient.auth.admin.deleteUser(authData.user.id);
      throw ApiErrors.internalServerError(
        profileError?.message || "Failed to create/update user profile",
        { profileError }
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
  } catch (error) {
    return createErrorResponse(error, "Failed to create user");
  }
}

