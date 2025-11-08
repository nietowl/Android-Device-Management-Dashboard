import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { username } = body;

    if (!username || username.trim().length === 0) {
      return NextResponse.json(
        { error: "Username is required" },
        { status: 400 }
      );
    }

    // Validate username format (alphanumeric, underscore, hyphen, 3-20 chars)
    const usernameRegex = /^[a-zA-Z0-9_-]{3,20}$/;
    if (!usernameRegex.test(username)) {
      return NextResponse.json(
        { error: "Username must be 3-20 characters and contain only letters, numbers, underscores, or hyphens" },
        { status: 400 }
      );
    }

    // Check if username is already taken
    const { data: existingUser } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("username", username)
      .neq("id", user.id)
      .single();

    if (existingUser) {
      return NextResponse.json(
        { error: "Username is already taken" },
        { status: 400 }
      );
    }

    // Update username
    const { data, error } = await supabase
      .from("user_profiles")
      .update({ username: username.trim() })
      .eq("id", user.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, profile: data });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to update username" },
      { status: 500 }
    );
  }
}

