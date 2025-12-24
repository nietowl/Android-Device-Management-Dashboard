import { requireAdmin } from "@/lib/admin/utils";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createErrorResponse, ApiErrors } from "@/lib/api/error-handler";
import { generateLicenseId } from "@/lib/utils/license-id";

export async function GET(request: Request) {
  try {
    const { supabase } = await requireAdmin();
    const { searchParams } = new URL(request.url);
    
    // Parse and validate pagination parameters with proper defaults
    const pageParam = searchParams.get("page");
    const limitParam = searchParams.get("limit");
    
    // Parse with validation - handle NaN and invalid values
    let page = 1;
    if (pageParam) {
      const parsedPage = parseInt(pageParam, 10);
      if (!isNaN(parsedPage) && parsedPage >= 1) {
        page = parsedPage;
      }
    }
    
    let limit = 50;
    if (limitParam) {
      const parsedLimit = parseInt(limitParam, 10);
      if (!isNaN(parsedLimit) && parsedLimit >= 1 && parsedLimit <= 200) {
        limit = parsedLimit;
      }
    }
    
    const offset = (page - 1) * limit;

    // Validate pagination parameters (double-check after parsing)
    // Reduced limit for production security (max 200 per page)
    if (page < 1 || limit < 1 || limit > 200) {
      throw ApiErrors.validationError(
        "Invalid pagination parameters. Page must be >= 1, limit must be between 1 and 200"
      );
    }

    // Get all users with their profiles
    // For admin stats, allow getting all users when limit is 200 (max allowed)
    const shouldGetAll = limit >= 200;
    
    let profiles, error, count, countError;
    
    if (shouldGetAll) {
      // Get all users without pagination for stats
      const { data, error: fetchError } = await supabase
        .from("user_profiles")
        .select("*")
        .order("created_at", { ascending: false });

      profiles = data;
      error = fetchError;
      
      // Count is just the length of the array
      count = profiles?.length || 0;
    } else {
      // Get paginated users
      const { data, error: fetchError } = await supabase
        .from("user_profiles")
        .select("*")
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      profiles = data;
      error = fetchError;

      // Get total count
      const { count: totalCount, error: countErr } = await supabase
        .from("user_profiles")
        .select("*", { count: "exact", head: true });

      count = totalCount || 0;
      countError = countErr;
    }

    if (error) {
      console.error("Error fetching users:", error);
      throw ApiErrors.internalServerError(
        `Failed to fetch users: ${error.message}`,
        { databaseError: error }
      );
    }

    if (countError) {
      console.error("Error fetching user count:", countError);
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

    const { email, password, role, subscription_tier, subscription_status, subscription_start_date, subscription_end_date, license_key_validity, max_devices } = body;

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

    // Check for duplicate email (case-insensitive)
    const normalizedEmail = email.toLowerCase().trim();
    const { data: existingUser } = await supabase
      .from("user_profiles")
      .select("id, email")
      .ilike("email", normalizedEmail)
      .limit(1)
      .single();
    
    if (existingUser) {
      throw ApiErrors.validationError(
        `An account with email "${existingUser.email}" already exists. Please use a different email or merge the accounts.`
      );
    }

    // Also check auth.users for duplicates
    const { data: existingAuthUser } = await supabase.auth.admin.listUsers();
    const duplicateAuthUser = existingAuthUser?.users?.find(
      (u) => u.email?.toLowerCase().trim() === normalizedEmail
    );
    
    if (duplicateAuthUser) {
      throw ApiErrors.validationError(
        `An account with email "${duplicateAuthUser.email}" already exists in the authentication system.`
      );
    }

    // Validate password strength (production-ready policy)
    if (password.length < 12) {
      throw ApiErrors.validationError("Password must be at least 12 characters");
    }
    
    // Require password complexity
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /[0-9]/.test(password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
    
    if (!hasUpperCase || !hasLowerCase || !hasNumbers || !hasSpecialChar) {
      throw ApiErrors.validationError(
        "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character"
      );
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

    // ALWAYS generate license ID for new user (25 alphanumeric + "=" = 26 characters)
    // This is required - the trigger should also generate it, but we ensure it here too
    const licenseId = generateLicenseId();

    // Prepare profile data - ALWAYS include license_id
    const profileData: any = {
      id: authData.user.id,
      email,
      role: role || "user",
      subscription_tier: subscription_tier || "free",
      subscription_status: subscription_status || "trial",
      max_devices: max_devices || 1,
      is_active: true,
      license_id: licenseId, // ALWAYS include license_id - it's required
    };

    // If profile already exists (created by trigger), preserve existing license_id if valid
    if (existingProfile && existingProfile.license_id) {
      // Validate existing license_id format (26 chars: 25 alphanumeric + "=")
      const isValidFormat = existingProfile.license_id.length === 26 && 
                           /^[A-Za-z0-9]{25}=$/.test(existingProfile.license_id);
      if (isValidFormat) {
        // Keep existing valid license_id
        profileData.license_id = existingProfile.license_id;
      }
      // Otherwise use the newly generated one
    }

    // Handle subscription dates
    if (subscription_start_date) {
      profileData.subscription_start_date = subscription_start_date;
    } else {
      profileData.subscription_start_date = new Date().toISOString();
    }

    if (subscription_end_date) {
      profileData.subscription_end_date = subscription_end_date;
    } else {
      // Default to 14-day trial if no end date specified
      profileData.subscription_end_date = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    }

    // Handle license key validity
    if (license_key_validity) {
      profileData.license_key_validity = license_key_validity;
    }

    let profile;
    let profileError;

    if (existingProfile) {
      // Profile already exists (created by trigger), update it
      // Use adminClient to bypass RLS
      // Try to update with license_id, if it fails, update without it
      let updateData = { ...profileData };
      
      // Update with license_id (it should always exist now)
      const { data: updatedProfile, error: updateError } = await adminClient
        .from("user_profiles")
        .update(updateData)
        .eq("id", authData.user.id)
        .select()
        .single();
      
      // If update fails due to license_id, log error but don't retry without it
      // The trigger should have generated it, so this shouldn't happen
      if (updateError && updateError.message?.includes('license_id')) {
        console.error("Failed to update license_id - this should not happen if trigger is working:", updateError);
        // Still try to update other fields, but log the issue
        const { data: retryProfile, error: retryError } = await adminClient
          .from("user_profiles")
          .update({ ...updateData, license_id: licenseId }) // Force include license_id
          .eq("id", authData.user.id)
          .select()
          .single();
        
        profile = retryProfile;
        profileError = retryError;
      } else {
        profile = updatedProfile;
        profileError = updateError;
      }
    } else {
      // Profile doesn't exist, insert it
      // Use adminClient to bypass RLS
      // Insert with license_id (it should always exist now)
      let insertData = { ...profileData };
      
      const { data: insertedProfile, error: insertError } = await adminClient
        .from("user_profiles")
        .insert(insertData)
        .select()
        .single();
      
      // If insert fails due to license_id, log error
      // The trigger should have generated it, so this shouldn't happen
      if (insertError && insertError.message?.includes('license_id')) {
        console.error("Failed to insert license_id - this should not happen if trigger is working:", insertError);
        // The trigger should have created the profile, so try to fetch it
        const { data: triggerProfile } = await adminClient
          .from("user_profiles")
          .select("*")
          .eq("id", authData.user.id)
          .single();
        
        if (triggerProfile) {
          profile = triggerProfile;
          profileError = null;
        } else {
          profile = null;
          profileError = insertError;
        }
      } else {
        profile = insertedProfile;
        profileError = insertError;
      }
    }

    if (profileError || !profile) {
      // If profile creation/update fails, try to delete the auth user
      await adminClient.auth.admin.deleteUser(authData.user.id);
      throw ApiErrors.internalServerError(
        profileError?.message || "Failed to create/update user profile",
        { profileError }
      );
    }
    
    // If license_id column exists but wasn't set, try to update it separately
    if (profile && !profile.license_id && licenseId) {
      try {
        await adminClient
          .from("user_profiles")
          .update({ license_id: licenseId })
          .eq("id", authData.user.id);
        
        // Refresh profile to get updated license_id
        const { data: refreshedProfile } = await adminClient
          .from("user_profiles")
          .select("*")
          .eq("id", authData.user.id)
          .single();
        
        if (refreshedProfile) {
          profile = refreshedProfile;
        }
      } catch (error) {
        // Column doesn't exist, that's okay
        // Use console.error as fallback since console.warn may not be available in all environments
        if (typeof console !== 'undefined' && typeof console.warn === 'function') {
          console.warn("Could not update license_id - column may not exist");
        } else if (typeof console !== 'undefined' && typeof console.error === 'function') {
          console.error("Could not update license_id - column may not exist");
        }
      }
    }

    // Log the activity
    await supabase.from("admin_activity_logs").insert({
      admin_id: adminId,
      action: "create_user",
      target_user_id: authData.user.id,
      details: {
        email,
        license_id: licenseId,
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

