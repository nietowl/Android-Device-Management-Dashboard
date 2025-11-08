import { createClientSupabase } from "@/lib/supabase/client";
import { UserProfile } from "@/types";

export async function checkIsAdmin(): Promise<boolean> {
  try {
    const supabase = createClientSupabase();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.error("No user found:", userError);
      return false;
    }

    const { data, error } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (error) {
      console.error("Error fetching user profile:", error);
      // If table doesn't exist or profile doesn't exist, return false
      if (error.code === "PGRST116" || error.code === "42P01") {
        console.error("user_profiles table doesn't exist. Please run the migration.");
      }
      return false;
    }

    if (!data) {
      console.error("No profile found for user:", user.id);
      return false;
    }

    console.log("User role:", data.role);
    return data.role === "admin";
  } catch (error) {
    console.error("Error checking admin status:", error);
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
    console.error("Error fetching user profile:", error);
    return null;
  }
}
