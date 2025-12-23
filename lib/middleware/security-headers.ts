import { NextResponse, type NextRequest } from "next/server";

/**
 * Security headers middleware for production
 * Adds essential security headers to all responses
 */
export function addSecurityHeaders(response: NextResponse, request: NextRequest): NextResponse {
  const headers = new Headers(response.headers);
  
  // Prevent clickjacking
  headers.set("X-Frame-Options", "DENY");
  
  // Prevent MIME type sniffing
  headers.set("X-Content-Type-Options", "nosniff");
  
  // Enable XSS protection (legacy, but still useful)
  headers.set("X-XSS-Protection", "1; mode=block");
  
  // Referrer policy
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  
  // Permissions policy (formerly Feature-Policy)
  headers.set(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()"
  );
  
  // Content Security Policy
  // Adjust based on your needs - this is a restrictive default
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // 'unsafe-eval' needed for Next.js in dev
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
  
  headers.set("Content-Security-Policy", csp);
  
  // Strict Transport Security (only for HTTPS)
  if (request.nextUrl.protocol === "https:") {
    headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload"
    );
  }
  
  return new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

