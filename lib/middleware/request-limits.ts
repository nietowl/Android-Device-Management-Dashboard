import { NextRequest, NextResponse } from "next/server";

/**
 * Request Size Limits Middleware
 * 
 * Prevents DoS attacks by limiting request body sizes
 */

/**
 * Maximum request body sizes (in bytes)
 */
export const REQUEST_SIZE_LIMITS = {
  // General API requests
  DEFAULT: 1024 * 1024, // 1MB
  
  // File upload endpoints
  FILE_UPLOAD: 100 * 1024 * 1024, // 100MB
  
  // JSON API endpoints
  JSON_API: 10 * 1024 * 1024, // 10MB
  
  // Webhook endpoints (may receive large payloads)
  WEBHOOK: 5 * 1024 * 1024, // 5MB
} as const;

/**
 * Gets the appropriate size limit for a request path
 */
export function getSizeLimitForPath(pathname: string): number {
  // File upload endpoints
  if (pathname.includes("/upload") || pathname.includes("/file")) {
    return REQUEST_SIZE_LIMITS.FILE_UPLOAD;
  }
  
  // Webhook endpoints
  if (pathname.startsWith("/api/webhooks")) {
    return REQUEST_SIZE_LIMITS.WEBHOOK;
  }
  
  // JSON API endpoints
  if (pathname.startsWith("/api/")) {
    return REQUEST_SIZE_LIMITS.JSON_API;
  }
  
  // Default limit
  return REQUEST_SIZE_LIMITS.DEFAULT;
}

/**
 * Validates request body size
 */
export async function validateRequestSize(
  request: NextRequest,
  maxSize: number = REQUEST_SIZE_LIMITS.DEFAULT
): Promise<{ valid: boolean; error?: string }> {
  const contentLength = request.headers.get("content-length");
  
  // If content-length header is present, check it
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (isNaN(size) || size > maxSize) {
      return {
        valid: false,
        error: `Request body too large. Maximum size: ${Math.round(maxSize / 1024 / 1024)}MB`,
      };
    }
  }
  
  // For streaming requests without content-length, we can't validate upfront
  // The server should handle this during parsing
  
  return { valid: true };
}

/**
 * Middleware wrapper that enforces request size limits
 */
export function withRequestSizeLimit<T extends any[]>(
  handler: (request: NextRequest, ...args: T) => Promise<NextResponse> | NextResponse,
  maxSize?: number
) {
  return async (request: NextRequest, ...args: T): Promise<NextResponse> => {
    const pathname = request.nextUrl.pathname;
    const limit = maxSize || getSizeLimitForPath(pathname);
    
    // Validate request size
    const validation = await validateRequestSize(request, limit);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error || "Request body too large" },
        { status: 413 } // Payload Too Large
      );
    }
    
    return handler(request, ...args);
  };
}

