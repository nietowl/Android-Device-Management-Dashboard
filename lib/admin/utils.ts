import { createClient } from "@/lib/supabase/server";
import { UserProfile } from "@/types";

export async function isAdmin(userId: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (error || !data) {
      return false;
    }

    return data.role === "admin";
  } catch (error) {
    console.error("Error checking admin status:", error);
    return false;
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
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const adminStatus = await isAdmin(user.id);
  if (!adminStatus) {
    throw new Error("Forbidden: Admin access required");
  }

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

