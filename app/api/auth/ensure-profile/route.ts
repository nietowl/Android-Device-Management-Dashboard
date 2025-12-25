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

    // Check if profile exists
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

    // Profile doesn't exist - create it using service role to bypass RLS
    console.log(`Creating user profile for user ${user.id} (${user.email})`);

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

