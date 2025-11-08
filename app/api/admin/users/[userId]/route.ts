import { requireAdmin } from "@/lib/admin/utils";
import { NextResponse } from "next/server";
import { UserUpdateData } from "@/types";

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
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get user's devices count
    const { count: deviceCount } = await supabase
      .from("devices")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);

    return NextResponse.json({
      user: data,
      deviceCount: deviceCount || 0,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Unauthorized" },
      { status: error.message === "Forbidden: Admin access required" ? 403 : 401 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { supabase, user: adminUser } = await requireAdmin();
    const { userId } = await params;
    const updateData: UserUpdateData = await request.json();

    // Update user profile
    const { data, error } = await supabase
      .from("user_profiles")
      .update(updateData)
      .eq("id", userId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log admin activity
    await supabase.from("admin_activity_logs").insert({
      admin_id: adminUser.id,
      action: "update_user",
      target_user_id: userId,
      details: updateData,
    });

    return NextResponse.json({ user: data });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Unauthorized" },
      { status: error.message === "Forbidden: Admin access required" ? 403 : 401 }
    );
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
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log admin activity
    await supabase.from("admin_activity_logs").insert({
      admin_id: adminUser.id,
      action: "deactivate_user",
      target_user_id: userId,
      details: null,
    });

    return NextResponse.json({ user: data });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Unauthorized" },
      { status: error.message === "Forbidden: Admin access required" ? 403 : 401 }
    );
  }
}

