import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createErrorResponse, ApiErrors } from "@/lib/api/error-handler";

/**
 * POST /api/auth/signout
 * 
 * Proxies supabase.auth.signOut() to hide Supabase URL from network tab.
 * Signs out the current user and clears the session.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      // Even if there's an error, we should still return success
      // as the session might already be cleared
      console.error("Error during sign out:", error);
    }

    return NextResponse.json({ 
      success: true,
      message: "Signed out successfully" 
    });
  } catch (error) {
    // Return success even on error to prevent issues
    return NextResponse.json({ 
      success: true,
      message: "Signed out" 
    });
  }
}

