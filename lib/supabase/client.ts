"use client";

import { createBrowserClient } from "@supabase/ssr";

let supabaseClient: ReturnType<typeof createBrowserClient> | null = null;

export const createClientSupabase = () => {
  // Return existing client if already created (singleton pattern)
  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // During build time or when env vars are missing, provide placeholder values
  // This prevents build errors - actual values will be used at runtime
  const safeUrl = supabaseUrl || 'https://placeholder.supabase.co';
  const safeKey = supabaseAnonKey || 'placeholder-key';

  // Only validate and throw errors in browser runtime (not during build)
  if (typeof window !== 'undefined') {
    // Better error messages (only in browser/runtime)
    if (!supabaseUrl) {
      console.error("❌ NEXT_PUBLIC_SUPABASE_URL is missing");
      console.error("   Current env vars:", {
        hasUrl: !!supabaseUrl,
        hasKey: !!supabaseAnonKey,
        urlValue: supabaseUrl ? `${supabaseUrl.substring(0, 20)}...` : "undefined",
      });
      throw new Error(
        "Missing NEXT_PUBLIC_SUPABASE_URL. Please set it in your .env.local file.\n" +
        "Example: NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co"
      );
    }

    if (!supabaseAnonKey) {
      console.error("❌ NEXT_PUBLIC_SUPABASE_ANON_KEY is missing");
      throw new Error(
        "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY. Please set it in your .env.local file.\n" +
        "Get it from: https://app.supabase.com/project/_/settings/api"
      );
    }

    // Validate URL format
    try {
      new URL(supabaseUrl);
    } catch (e) {
      throw new Error(
        `Invalid NEXT_PUBLIC_SUPABASE_URL format: "${supabaseUrl}". It should be a valid URL like https://your-project.supabase.co`
      );
    }
  }

  // Create client with better error handling
  // Use safe placeholders during build, actual values at runtime
  try {
    supabaseClient = createBrowserClient(safeUrl, safeKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    });
    console.log("✅ Supabase client created successfully");
    return supabaseClient;
  } catch (error: any) {
    console.error("❌ Failed to create Supabase client:", error);
    throw new Error(
      `Failed to initialize Supabase client: ${error.message}\n` +
      "Please check your NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY values."
    );
  }
};

