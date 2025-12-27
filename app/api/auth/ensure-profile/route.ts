import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    
    // Get the authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Check if profile exists by user.id
    const { data: existingProfile, error: profileError } = await supabase
      .from("user_profiles")
      .select("id, email, license_id")
      .eq("id", user.id)
      .single();

    if (existingProfile) {
      // Profile exists, return it
      return NextResponse.json({
        success: true,
        profile: existingProfile,
        message: "Profile already exists",
      });
    }

    // Profile doesn't exist for this user.id - check for duplicate email before creating
    if (!user.email) {
      return NextResponse.json(
        { error: "User email is required to create profile" },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: "Server configuration error: Service role key not available" },
        { status: 500 }
      );
    }

    const adminClient = createAdminClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Check for existing profile with same email (case-insensitive) - CRITICAL duplicate prevention
    const normalizedEmail = user.email.toLowerCase().trim();
    const { data: duplicateProfile, error: duplicateCheckError } = await adminClient
      .from("user_profiles")
      .select("id, email")
      .ilike("email", normalizedEmail)
      .limit(1)
      .maybeSingle();

    if (duplicateCheckError) {
      console.error("Error checking for duplicate email:", duplicateCheckError);
      // Continue anyway - let the unique constraint handle it
    }

    if (duplicateProfile) {
      // Duplicate email found - return error instead of creating duplicate account
      console.warn(
        `⚠️ Duplicate email detected: Profile already exists for email "${duplicateProfile.email}" with id ${duplicateProfile.id}. ` +
        `Cannot create profile for user ${user.id} to prevent duplicate account.`
      );
      return NextResponse.json(
        {
          error: "An account with this email already exists",
          details: `A profile with email "${duplicateProfile.email}" already exists. Please contact support if you believe this is an error.`,
        },
        { status: 409 } // 409 Conflict
      );
    }

    // No duplicate found - proceed with profile creation
    console.log(`Creating user profile for user ${user.id} (${user.email})`);

    // Generate email hash and license ID using RPC functions
    let emailHash: string | null = null;
    let licenseId: string | null = null;

    if (user.email) {
      try {
        const { data: hashData, error: hashError } = await adminClient.rpc("generate_email_hash", {
          email_address: user.email,
        });
        if (!hashError) {
          emailHash = hashData;
        }
      } catch (e) {
        console.warn("Failed to generate email hash:", e);
      }

      try {
        const { data: licenseData, error: licenseError } = await adminClient.rpc("generate_unique_license_id");
        if (!licenseError) {
          licenseId = licenseData;
        }
      } catch (e) {
        console.warn("Failed to generate license ID:", e);
      }
    }

    // Insert profile with all required fields
    const profileData: any = {
      id: user.id,
      email: user.email,
      role: "user",
      subscription_tier: "free",
      subscription_status: "trial",
      subscription_start_date: new Date().toISOString(),
      subscription_end_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 14 days from now
    };

    if (emailHash) {
      profileData.email_hash = emailHash;
    }

    if (licenseId) {
      profileData.license_id = licenseId;
    }

    const { data: newProfile, error: insertError } = await adminClient
      .from("user_profiles")
      .insert(profileData)
      .select()
      .single();

    if (insertError) {
      // Check if error is due to unique constraint violation (duplicate email)
      if (insertError.code === "23505" || insertError.message?.includes("duplicate") || insertError.message?.includes("unique")) {
        console.warn(
          `⚠️ Unique constraint violation: Profile with email "${user.email}" already exists. ` +
          `This indicates a duplicate account was prevented.`
        );
        return NextResponse.json(
          {
            error: "An account with this email already exists",
            details: `A profile with email "${user.email}" already exists. This may indicate a duplicate account. Please contact support if you believe this is an error.`,
          },
          { status: 409 } // 409 Conflict
        );
      }

      console.error("Failed to create user profile:", insertError);
      
      // Try fallback insert without optional fields
      const fallbackData = {
        id: user.id,
        email: user.email,
        role: "user",
        subscription_tier: "free",
        subscription_status: "trial",
        subscription_start_date: new Date().toISOString(),
        subscription_end_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const { data: fallbackProfile, error: fallbackError } = await adminClient
        .from("user_profiles")
        .insert(fallbackData)
        .select()
        .single();

      if (fallbackError) {
        // Check if fallback error is also a duplicate
        if (fallbackError.code === "23505" || fallbackError.message?.includes("duplicate") || fallbackError.message?.includes("unique")) {
          return NextResponse.json(
            {
              error: "An account with this email already exists",
              details: `A profile with email "${user.email}" already exists. This may indicate a duplicate account. Please contact support if you believe this is an error.`,
            },
            { status: 409 } // 409 Conflict
          );
        }

        return NextResponse.json(
          { 
            error: "Failed to create user profile",
            details: process.env.NODE_ENV === "development" ? fallbackError.message : undefined,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        profile: fallbackProfile,
        message: "Profile created successfully (fallback method)",
      });
    }

    return NextResponse.json({
      success: true,
      profile: newProfile,
      message: "Profile created successfully",
    });
  } catch (error: any) {
    console.error("Ensure profile error:", error);
    return NextResponse.json(
      { 
        error: "An unexpected error occurred",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

