import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * CSRF Protection Middleware
 * 
 * Implements CSRF protection using:
 * 1. SameSite cookies (handled by Supabase)
 * 2. Origin/Referer header validation for state-changing requests
 * 3. CSRF token validation (optional, for additional security)
 */

/**
 * Validates Origin/Referer headers for CSRF protection
 */
export function validateOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const host = request.headers.get("host");
  
  // Get allowed origins from environment
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
    : process.env.NEXT_PUBLIC_APP_URL
    ? [process.env.NEXT_PUBLIC_APP_URL]
    : [];

  // In development, allow localhost
  const isDevelopment = process.env.NODE_ENV !== "production";
  if (isDevelopment) {
    allowedOrigins.push("http://localhost:3000", "http://127.0.0.1:3000");
  }

  // For same-origin requests, origin might be null (same-origin policy)
  // In that case, check referer
  if (!origin && referer) {
    try {
      const refererUrl = new URL(referer);
      const refererOrigin = `${refererUrl.protocol}//${refererUrl.host}`;
      
      // Check if referer origin matches allowed origins
      if (allowedOrigins.some((allowed) => {
        try {
          const allowedUrl = new URL(allowed);
          return allowedUrl.origin === refererOrigin;
        } catch {
          return allowed === refererOrigin;
        }
      })) {
        return true;
      }
    } catch {
      // Invalid referer URL
    }
  }

  // Validate origin header
  if (origin) {
    try {
      const originUrl = new URL(origin);
      
      // Check if origin matches allowed origins
      const isValid = allowedOrigins.some((allowed) => {
        try {
          const allowedUrl = new URL(allowed);
          return allowedUrl.origin === originUrl.origin;
        } catch {
          return allowed === origin;
        }
      });

      if (isValid) {
        return true;
      }
    } catch {
      // Invalid origin URL
    }
  }

  // If no origin/referer and it's a same-origin request (no origin header), allow it
  // This handles same-origin requests where origin header is not sent
  if (!origin && host) {
    // For same-origin requests, origin header is typically not sent
    // We'll allow these but log for monitoring
    if (isDevelopment) {
      const logger = require("@/lib/utils/logger").default;
      logger.warn("⚠️ CSRF: No origin/referer header for request to", request.url);
    }
    return true; // Allow same-origin requests without origin header
  }

  return false;
}

/**
 * Checks if a request method requires CSRF protection
 */
export function requiresCsrfProtection(method: string): boolean {
  // Only protect state-changing methods
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());
}

/**
 * CSRF protection middleware wrapper
 */
export function withCsrfProtection<T extends any[]>(
  handler: (request: NextRequest, ...args: T) => Promise<NextResponse> | NextResponse
) {
  return async (request: NextRequest, ...args: T): Promise<NextResponse> => {
    // Only protect state-changing requests
    if (requiresCsrfProtection(request.method)) {
      // Skip CSRF check for webhooks (they use Bearer token auth)
      const pathname = request.nextUrl.pathname;
      if (pathname.startsWith("/api/webhooks")) {
        return handler(request, ...args);
      }

      // Validate origin/referer
      if (!validateOrigin(request)) {
        const logger = require("@/lib/utils/logger").default;
        logger.error("❌ CSRF: Invalid origin/referer for request", {
          method: request.method,
          url: request.url,
          origin: request.headers.get("origin"),
          referer: request.headers.get("referer"),
        });

        return NextResponse.json(
          { error: "Invalid request origin" },
          { status: 403 }
        );
      }
    }

    return handler(request, ...args);
  };
}

/**
 * Validates CSRF token (if using token-based CSRF protection)
 * This is optional - SameSite cookies + Origin validation is usually sufficient
 */
export async function validateCsrfToken(
  request: NextRequest,
  token?: string
): Promise<boolean> {
  // If not using token-based CSRF, skip validation
  if (!token) {
    return true;
  }

  // Get token from request (could be in header, cookie, or body)
  const requestToken =
    request.headers.get("x-csrf-token") ||
    request.cookies.get("csrf-token")?.value;

  if (!requestToken || requestToken !== token) {
    return false;
  }

  return true;
}

