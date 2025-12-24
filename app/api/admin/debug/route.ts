import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

/**
 * Debug endpoint to check admin status
 * This helps diagnose why admin access might be failing
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    const debugInfo: any = {
      timestamp: new Date().toISOString(),
      hasAuthError: !!authError,
      authError: authError ? {
        message: authError.message,
        status: authError.status,
      } : null,
      hasUser: !!user,
      userId: user?.id || null,
      userEmail: user?.email || null,
      hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    };

    if (user) {
      // Try to get profile with regular client
      const { data: profile, error: profileError } = await supabase
        .from("user_profiles")
        .select("id, email, role, is_active")
        .eq("id", user.id)
        .single();

      debugInfo.profileCheck = {
        hasError: !!profileError,
        error: profileError ? {
          message: profileError.message,
          code: profileError.code,
          details: profileError.details,
        } : null,
        profile: profile || null,
      };

      // Try with service role
      if (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL) {
        try {
          const serviceClient = createServiceClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
            {
              auth: { autoRefreshToken: false, persistSession: false },
            }
          );

          const { data: serviceProfile, error: serviceError } = await serviceClient
            .from("user_profiles")
            .select("id, email, role, is_active")
            .eq("id", user.id)
            .single();

          debugInfo.serviceRoleCheck = {
            hasError: !!serviceError,
            error: serviceError ? {
              message: serviceError.message,
              code: serviceError.code,
            } : null,
            profile: serviceProfile || null,
            isAdmin: serviceProfile?.role === "admin",
          };
        } catch (serviceErr: any) {
          debugInfo.serviceRoleCheck = {
            hasError: true,
            error: {
              message: serviceErr.message,
            },
          };
        }
      } else {
        debugInfo.serviceRoleCheck = {
          hasError: true,
          error: {
            message: "Service role key or Supabase URL not configured",
          },
        };
      }
    }

    return NextResponse.json(debugInfo, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error.message,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

