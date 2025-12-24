import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { UserProfile } from "@/types";

/**
 * Check if a user is admin using service role to bypass RLS
 * This is safe because we're only reading the role, not modifying data
 */
async function isAdminWithServiceRole(userId: string): Promise<boolean> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing Supabase service role key for admin check");
      return false;
    }

    const serviceClient = createServiceClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data, error } = await serviceClient
      .from("user_profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (error) {
      console.error("Error fetching user profile with service role:", error);
      return false;
    }

    if (!data) {
      console.error("No profile found for user:", userId);
      return false;
    }

    return data.role === "admin";
  } catch (error) {
    console.error("Error checking admin status with service role:", error);
    return false;
  }
}

export async function isAdmin(userId: string): Promise<boolean> {
  try {
    // First try with regular client (respects RLS)
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (error) {
      console.error("Error fetching user profile for admin check:", error);
      console.error("User ID:", userId);
      // If RLS blocks it, try with service role
      console.log("Falling back to service role check...");
      return await isAdminWithServiceRole(userId);
    }

    if (!data) {
      console.error("No profile found for user:", userId);
      return false;
    }

    console.log(`Admin check for user ${userId}: role = "${data.role}"`);
    return data.role === "admin";
  } catch (error) {
    console.error("Error checking admin status:", error);
    // Fallback to service role check
    return await isAdminWithServiceRole(userId);
  }
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (error || !data) {
      return null;
    }

    return data as UserProfile;
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return null;
  }
}

export async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError) {
    console.error("[requireAdmin] Auth error:", authError);
    console.error("[requireAdmin] Error details:", JSON.stringify(authError, null, 2));
    throw new Error("Unauthorized: Authentication failed");
  }

  if (!user) {
    console.error("[requireAdmin] No user found in session");
    throw new Error("Unauthorized: No user session. Please log in again.");
  }

  console.log(`[requireAdmin] Checking admin status for user: ${user.id}, email: ${user.email || 'no email'}`);
  
  // Use service role to check admin status (bypasses RLS)
  const adminStatus = await isAdminWithServiceRole(user.id);
  
  if (!adminStatus) {
    // Get more details using service role
    let profile = null;
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      
      if (supabaseUrl && supabaseServiceKey) {
        const serviceClient = createServiceClient(supabaseUrl, supabaseServiceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        
        const { data } = await serviceClient
          .from("user_profiles")
          .select("role, email, is_active")
          .eq("id", user.id)
          .single();
        profile = data;
      }
    } catch (profileError) {
      console.error("[requireAdmin] Failed to fetch profile for error message:", profileError);
    }
    
    console.error(`[requireAdmin] ❌ Admin access denied for user ${user.id} (${user.email || 'no email'})`);
    console.error(`[requireAdmin] Profile data:`, profile);
    console.error(`[requireAdmin] Current role: ${profile?.role || 'unknown'}, is_active: ${profile?.is_active ?? 'unknown'}`);
    
    // Provide helpful error message
    const errorMsg = profile 
      ? `Forbidden: Admin access required. Your current role is "${profile.role}". Please update your role to "admin" in the database.`
      : `Forbidden: Admin access required. Could not verify your role. Please ensure your user profile exists and has role="admin".`;
    
    throw new Error(errorMsg);
  }

  console.log(`[requireAdmin] ✅ Admin access granted for user: ${user.id} (${user.email || 'no email'})`);
  return { user, adminId: user.id, supabase };
}

export function checkSubscriptionStatus(profile: UserProfile): {
  isActive: boolean;
  daysRemaining: number | null;
  isExpired: boolean;
} {
  if (profile.subscription_status === "expired" || !profile.is_active) {
    return { isActive: false, daysRemaining: null, isExpired: true };
  }

  if (!profile.subscription_end_date) {
    return { isActive: true, daysRemaining: null, isExpired: false };
  }

  const endDate = new Date(profile.subscription_end_date);
  const now = new Date();
  const daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  return {
    isActive: daysRemaining > 0 && profile.subscription_status === "active",
    daysRemaining: daysRemaining > 0 ? daysRemaining : 0,
    isExpired: daysRemaining <= 0,
  };
}

