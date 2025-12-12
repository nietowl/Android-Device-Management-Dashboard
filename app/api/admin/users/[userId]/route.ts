import { requireAdmin } from "@/lib/admin/utils";
import { NextResponse } from "next/server";
import { UserUpdateData } from "@/types";
import { createErrorResponse, ApiErrors } from "@/lib/api/error-handler";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { supabase } = await requireAdmin();
    const { userId } = await params;

    const { data, error } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) {
      throw ApiErrors.internalServerError(
        `Failed to fetch user: ${error.message}`,
        { databaseError: error }
      );
    }

    if (!data) {
      throw ApiErrors.notFound("User");
    }

    // Get user's devices count
    const { count: deviceCount, error: countError } = await supabase
      .from("devices")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);

    if (countError) {
      console.error("Failed to fetch device count:", countError);
    }

    return NextResponse.json({
      user: data,
      deviceCount: deviceCount || 0,
    });
  } catch (error) {
    return createErrorResponse(error, "Failed to fetch user");
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { supabase, user: adminUser } = await requireAdmin();
    const { userId } = await params;

    let updateData: UserUpdateData;
    try {
      updateData = await request.json();
    } catch (error) {
      throw ApiErrors.badRequest("Invalid JSON in request body");
    }

    // Validate update data if needed
    if (updateData.role && !["admin", "user"].includes(updateData.role)) {
      throw ApiErrors.validationError("Role must be either 'admin' or 'user'");
    }

    if (updateData.subscription_tier && !["free", "basic", "premium", "enterprise"].includes(updateData.subscription_tier)) {
      throw ApiErrors.validationError("Invalid subscription tier");
    }

    // Update user profile
    const { data, error } = await supabase
      .from("user_profiles")
      .update(updateData)
      .eq("id", userId)
      .select()
      .single();

    if (error) {
      throw ApiErrors.internalServerError(
        `Failed to update user: ${error.message}`,
        { databaseError: error }
      );
    }

    if (!data) {
      throw ApiErrors.notFound("User");
    }

    // Log admin activity
    await supabase.from("admin_activity_logs").insert({
      admin_id: adminUser.id,
      action: "update_user",
      target_user_id: userId,
      details: updateData,
    });

    return NextResponse.json({ user: data });
  } catch (error) {
    return createErrorResponse(error, "Failed to update user");
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { supabase, user: adminUser } = await requireAdmin();
    const { userId } = await params;

    // Deactivate user instead of deleting
    const { data, error } = await supabase
      .from("user_profiles")
      .update({ is_active: false })
      .eq("id", userId)
      .select()
      .single();

    if (error) {
      throw ApiErrors.internalServerError(
        `Failed to deactivate user: ${error.message}`,
        { databaseError: error }
      );
    }

    if (!data) {
      throw ApiErrors.notFound("User");
    }

    // Log admin activity
    await supabase.from("admin_activity_logs").insert({
      admin_id: adminUser.id,
      action: "deactivate_user",
      target_user_id: userId,
      details: null,
    });

    return NextResponse.json({ user: data });
  } catch (error) {
    return createErrorResponse(error, "Failed to deactivate user");
  }
}

