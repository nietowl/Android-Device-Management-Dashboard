import { NextResponse, type NextRequest } from "next/server";

/**
 * Security Headers Middleware
 * 
 * Adds security headers to all responses to protect against common attacks:
 * - XSS (Cross-Site Scripting)
 * - Clickjacking
 * - MIME type sniffing
 * - Protocol downgrade attacks
 */

const isProduction = process.env.NODE_ENV === "production";

/**
 * Gets Content-Security-Policy header based on environment
 */
function getCSPHeader(request?: NextRequest): string {
  // Check if we're using HTTPS from the request
  const isHttps = request 
    ? (request.url.startsWith('https://') || request.headers.get('x-forwarded-proto') === 'https')
    : (process.env.NEXT_PUBLIC_APP_URL?.startsWith('https://') || false);
  
  if (isProduction) {
    // Strict CSP for production
    const cspDirectives = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.js requires unsafe-inline/unsafe-eval
      "style-src 'self' 'unsafe-inline'", // Tailwind requires unsafe-inline
      "img-src 'self' data: https: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      // Note: form-action is not restricted because forms use JavaScript (fetch API)
      // Traditional form submissions are prevented by e.preventDefault() in the form handler
      "frame-src 'self'",
      "object-src 'none'",
    ];
    
    // Only add upgrade-insecure-requests if using HTTPS
    if (isHttps) {
      cspDirectives.push("upgrade-insecure-requests");
    }
    
    return cspDirectives.join("; ");
  } else {
    // More permissive CSP for development
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https: http: blob:",
      "font-src 'self' data:",
      "connect-src 'self' http://localhost:* https://*.supabase.co wss://*.supabase.co ws://localhost:*",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-src 'self'",
    ].join("; ");
  }
}

/**
 * Adds security headers to a response
 */
export function addSecurityHeaders(response: NextResponse, request?: NextRequest): NextResponse {
  const headers = new Headers(response.headers);

  // Content Security Policy
  headers.set("Content-Security-Policy", getCSPHeader(request));

  // Prevent clickjacking
  headers.set("X-Frame-Options", "DENY");

  // Prevent MIME type sniffing
  headers.set("X-Content-Type-Options", "nosniff");

  // XSS Protection (legacy, but still useful)
  headers.set("X-XSS-Protection", "1; mode=block");

  // Referrer Policy
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Permissions Policy (formerly Feature-Policy)
  headers.set(
    "Permissions-Policy",
    [
      "geolocation=()",
      "microphone=()",
      "camera=()",
      "payment=()",
      "usb=()",
      "magnetometer=()",
      "gyroscope=()",
      "speaker=()",
    ].join(", ")
  );

  // Strict Transport Security (HTTPS only in production and when using HTTPS)
  // Check if the request is HTTPS by checking the protocol or X-Forwarded-Proto header
  const isHttps = request 
    ? (request.url.startsWith('https://') || request.headers.get('x-forwarded-proto') === 'https')
    : (process.env.NEXT_PUBLIC_APP_URL?.startsWith('https://') || false);
  
  if (isProduction && isHttps) {
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

/**
 * Middleware wrapper that adds security headers
 */
export function withSecurityHeaders(
  handler: (request: NextRequest) => Promise<NextResponse> | NextResponse
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const response = await handler(request);
    return addSecurityHeaders(response, request);
  };
}
