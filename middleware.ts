import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { addSecurityHeaders } from "@/lib/middleware/security-headers";
import { csrfMiddleware } from "@/lib/middleware/csrf";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({
            name,
            value,
            ...options,
          });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: "",
            ...options,
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({
            name,
            value: "",
            ...options,
          });
        },
      },
    }
  );

  // Refresh session if expired
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Public routes that don't require authentication
  const publicRoutes = ["/", "/api/webhooks", "/auth/callback"];
  const isPublicRoute = publicRoutes.some((route) => pathname === route || pathname.startsWith(route + "/"));

  // Protected routes
  const isProtectedRoute = pathname.startsWith("/dashboard") || (pathname.startsWith("/api/") && !pathname.startsWith("/api/webhooks"));

  // Allow auth callback to proceed without authentication check
  if (pathname.startsWith("/auth/callback")) {
    return response;
  }

  // If accessing protected route without authentication
  if (isProtectedRoute && !isPublicRoute && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/";
    return NextResponse.redirect(redirectUrl);
  }

  // If accessing login page while authenticated, redirect to dashboard
  if (pathname === "/" && user) {
    // Check if email is verified
    const { data: { user: fullUser } } = await supabase.auth.getUser();
    if (fullUser?.email_confirmed_at) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/dashboard";
      const redirectResponse = NextResponse.redirect(redirectUrl);
      return addSecurityHeaders(redirectResponse, request);
    }
  }

  // CSRF protection for state-changing requests
  const csrfResult = await csrfMiddleware(request);
  if (csrfResult) {
    return addSecurityHeaders(csrfResult, request);
  }

  // Add security headers to all responses
  return addSecurityHeaders(response, request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
