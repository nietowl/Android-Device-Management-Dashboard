import { createClientSupabase } from "@/lib/supabase/client";
import { UserProfile } from "@/types";
import logger from "@/lib/utils/logger";

export async function checkIsAdmin(): Promise<boolean> {
  try {
    const supabase = createClientSupabase();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      logger.error("No user found:", userError);
      return false;
    }

    const { data, error } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (error) {
      logger.error("Error fetching user profile:", error);
      // If table doesn't exist or profile doesn't exist, return false
      if (error.code === "PGRST116" || error.code === "42P01") {
        logger.error("user_profiles table doesn't exist. Please run the migration.");
      }
      return false;
    }

    if (!data) {
      logger.error("No profile found for user:", user.id);
      return false;
    }

    logger.log("User role:", data.role);
    return data.role === "admin";
  } catch (error) {
    logger.error("Error checking admin status:", error);
    return false;
  }
}

export async function getUserProfileClient(): Promise<UserProfile | null> {
  try {
    const supabase = createClientSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) return null;

    const { data, error } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error || !data) {
      return null;
    }

    return data as UserProfile;
  } catch (error) {
    logger.error("Error fetching user profile:", error);
    return null;
  }
}
