import { NextResponse } from "next/server";
import { getCsrfToken } from "@/lib/utils/csrf";

/**
 * GET /api/csrf-token
 * Returns CSRF token for the current session
 * Client should include this token in X-CSRF-Token header for state-changing requests
 */
export async function GET() {
  try {
    const token = await getCsrfToken();
    return NextResponse.json({ token });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to generate CSRF token" },
      { status: 500 }
    );
  }
}

