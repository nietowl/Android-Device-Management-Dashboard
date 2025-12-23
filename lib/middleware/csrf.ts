/**
 * CSRF Protection Middleware
 * Validates CSRF tokens for state-changing requests
 */

import { NextResponse, type NextRequest } from "next/server";
import { validateCsrfToken } from "@/lib/utils/csrf";

export async function csrfMiddleware(request: NextRequest): Promise<NextResponse | null> {
  // Skip CSRF for GET, HEAD, OPTIONS requests
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    return null; // Continue to next middleware
  }

  // Skip CSRF for webhook endpoints (they use their own authentication)
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/webhooks")) {
    return null; // Continue to next middleware
  }

  // Skip CSRF for public routes that don't modify state
  const publicRoutes = ["/", "/auth/callback"];
  if (publicRoutes.some((route) => url.pathname === route || url.pathname.startsWith(route + "/"))) {
    return null; // Continue to next middleware
  }

  // Validate CSRF token
  const isValid = await validateCsrfToken(request);

  if (!isValid) {
    return NextResponse.json(
      { error: "Invalid CSRF token. Please refresh the page and try again." },
      { status: 403 }
    );
  }

  return null; // Continue to next middleware
}

