import { requireAdmin } from "@/lib/admin/utils";
import { NextResponse } from "next/server";
import { createErrorResponse, ApiErrors } from "@/lib/api/error-handler";

export async function GET(request: Request) {
  try {
    const { supabase } = await requireAdmin();
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "100");

    // Validate limit parameter
    if (isNaN(limit) || limit < 1 || limit > 1000) {
      throw ApiErrors.validationError("Limit must be a number between 1 and 1000");
    }

    const { data, error } = await supabase
      .from("admin_activity_logs")
      .select(`
        *,
        admin:admin_id(email),
        target_user:target_user_id(email)
      `)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw ApiErrors.internalServerError(
        `Failed to fetch activity logs: ${error.message}`,
        { databaseError: error }
      );
    }

    return NextResponse.json({ logs: data || [] });
  } catch (error) {
    return createErrorResponse(error, "Failed to fetch activity logs");
  }
}

