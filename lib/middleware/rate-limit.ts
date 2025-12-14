import { NextResponse } from "next/server";
import { checkRateLimit, getClientIdentifier, RATE_LIMITS, RateLimitConfig } from "@/lib/utils/rate-limit";

/**
 * Rate limiting middleware for Next.js API routes
 */
export function withRateLimit<T extends any[]>(
  handler: (request: Request, ...args: T) => Promise<Response>,
  config: RateLimitConfig = RATE_LIMITS.API,
  getUserId?: (request: Request) => Promise<string | undefined>
) {
  return async (request: Request, ...args: T): Promise<Response> => {
    try {
      // Get user ID if available
      let userId: string | undefined;
      if (getUserId) {
        userId = await getUserId(request);
      }
      
      // Get client identifier
      const identifier = getClientIdentifier(request, userId);
      
      // Check rate limit
      const result = checkRateLimit(identifier, config);
      
      if (!result.allowed) {
        const resetTime = new Date(result.resetTime).toISOString();
        return NextResponse.json(
          {
            error: "Too many requests",
            message: "Rate limit exceeded. Please try again later.",
            retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
            resetTime,
          },
          {
            status: 429,
            headers: {
              "Retry-After": Math.ceil((result.resetTime - Date.now()) / 1000).toString(),
              "X-RateLimit-Limit": config.maxRequests.toString(),
              "X-RateLimit-Remaining": "0",
              "X-RateLimit-Reset": result.resetTime.toString(),
            },
          }
        );
      }
      
      // Add rate limit headers to response
      const response = await handler(request, ...args);
      const headers = new Headers(response.headers);
      headers.set("X-RateLimit-Limit", config.maxRequests.toString());
      headers.set("X-RateLimit-Remaining", result.remaining.toString());
      headers.set("X-RateLimit-Reset", result.resetTime.toString());
      
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      // If rate limiting fails, log and reject the request (fail closed for security)
      // This prevents bypassing rate limits due to implementation errors
      console.error("Rate limiting error:", error);
      return NextResponse.json(
        {
          error: "Rate limit check failed",
          message: "Unable to verify rate limit. Please try again later.",
        },
        { status: 503 }
      );
    }
  };
}

/**
 * Rate limit helper for proxy routes (stricter limits)
 */
export function withProxyRateLimit<T extends any[]>(
  handler: (request: Request, ...args: T) => Promise<Response>,
  getUserId?: (request: Request) => Promise<string | undefined>
) {
  return withRateLimit(handler, RATE_LIMITS.PROXY, getUserId);
}

/**
 * Rate limit helper for auth routes (very strict)
 */
export function withAuthRateLimit<T extends any[]>(
  handler: (request: Request, ...args: T) => Promise<Response>
) {
  return withRateLimit(handler, RATE_LIMITS.AUTH);
}

/**
 * Rate limit helper for admin routes (strict)
 */
export function withAdminRateLimit<T extends any[]>(
  handler: (request: Request, ...args: T) => Promise<Response>,
  getUserId?: (request: Request) => Promise<string | undefined>
) {
  return withRateLimit(handler, RATE_LIMITS.ADMIN, getUserId);
}

