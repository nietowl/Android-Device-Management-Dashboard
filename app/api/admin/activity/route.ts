import { requireAdmin } from "@/lib/admin/utils";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { supabase } = await requireAdmin();
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "100");

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
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ logs: data || [] });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Unauthorized" },
      { status: error.message === "Forbidden: Admin access required" ? 403 : 401 }
    );
  }
}

