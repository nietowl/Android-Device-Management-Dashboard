import { UserProfile } from "@/types";
import logger from "@/lib/utils/logger";

export async function checkIsAdmin(): Promise<boolean> {
  try {
    // SECURITY: Use API route to hide user ID from network tab
    const response = await fetch('/api/user/profile');
    
    if (!response.ok) {
      logger.error("Failed to fetch user profile for admin check");
      return false;
    }

    const { profile } = await response.json();
    
    if (!profile) {
      logger.error("No profile found for user");
      return false;
    }

    logger.log("User role:", profile.role);
    return profile.role === "admin";
  } catch (error) {
    logger.error("Error checking admin status:", error);
    return false;
  }
}

export async function getUserProfileClient(): Promise<UserProfile | null> {
  try {
    // SECURITY: Use API route to hide user ID from network tab
    const response = await fetch('/api/user/profile');
    
    if (!response.ok) {
      return null;
    }

    const { profile } = await response.json();
    
    if (!profile) {
      return null;
    }

    return profile as UserProfile;
  } catch (error) {
    logger.error("Error fetching user profile:", error);
    return null;
  }
}
