import { requireAdmin } from "@/lib/admin/utils";
import { NextResponse } from "next/server";
import { UserUpdateData } from "@/types";
import { createErrorResponse, ApiErrors } from "@/lib/api/error-handler";
import { validateLicenseId } from "@/lib/utils/license-id";

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

    // Validate license_id if provided
    if (updateData.license_id !== undefined) {
      if (updateData.license_id === null || updateData.license_id === "") {
        // Allow clearing license_id
        updateData.license_id = null;
      } else if (!validateLicenseId(updateData.license_id)) {
        throw ApiErrors.validationError(
          "Invalid license ID format. Must be exactly 26 characters: 25 alphanumeric (uppercase, lowercase, numbers) + '=' at the end."
        );
      }
    }

    // Update user profile
    // Handle license_key_validity - if subscription_end_date is updated, sync it
    if (updateData.subscription_end_date && !updateData.license_key_validity) {
      // If subscription_end_date is updated but license_key_validity is not provided,
      // sync license_key_validity with subscription_end_date
      updateData.license_key_validity = updateData.subscription_end_date;
    }
    
    // Try to update with all fields
    let { data, error } = await supabase
      .from("user_profiles")
      .update(updateData)
      .eq("id", userId)
      .select()
      .single();

    // If error is about license_id column not existing, try without it
    if (error && updateData.license_id !== undefined && error.message?.includes('license_id')) {
      const updateWithoutLicense = { ...updateData };
      delete updateWithoutLicense.license_id;
      
      const retryResult = await supabase
        .from("user_profiles")
        .update(updateWithoutLicense)
        .eq("id", userId)
        .select()
        .single();
      
      data = retryResult.data;
      error = retryResult.error;
      
      // If license_id was provided but column doesn't exist, return a warning
      if (!error && updateData.license_id) {
        console.warn("license_id column does not exist. Please run migration 011_add_license_id.sql");
      }
    }

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

