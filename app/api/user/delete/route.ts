import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createErrorResponse, ApiErrors } from "@/lib/api/error-handler";

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      throw ApiErrors.unauthorized();
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw ApiErrors.internalServerError(
        "Server configuration error: Missing required environment variables"
      );
    }

    // Use service role client to delete the user
    // This bypasses RLS and allows deletion of auth.users
    const serviceClient = createServiceClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Delete the user from auth.users
    // This will cascade delete:
    // - user_profiles (ON DELETE CASCADE)
    // - devices (ON DELETE CASCADE from user_id reference)
    // - admin_activity_logs (ON DELETE SET NULL)
    const { error: deleteError } = await serviceClient.auth.admin.deleteUser(user.id);

    if (deleteError) {
      throw ApiErrors.internalServerError(
        `Failed to delete user: ${deleteError.message}`,
        { deleteError }
      );
    }

    // Sign out the user session
    await supabase.auth.signOut();

    return NextResponse.json({ 
      success: true, 
      message: "Account deleted successfully" 
    });
  } catch (error) {
    return createErrorResponse(error, "Failed to delete account");
  }
}

