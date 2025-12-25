"use client";

import { createBrowserClient } from "@supabase/ssr";

// Ensure console.warn exists (polyfill for environments where it might be missing)
if (typeof window !== 'undefined' && typeof console !== 'undefined') {
  if (typeof console.warn !== 'function') {
    console.warn = function(...args: any[]) {
      if (typeof console.log === 'function') {
        console.log.apply(console, args);
      }
    };
  }
  if (typeof console.error !== 'function') {
    console.error = function(...args: any[]) {
      if (typeof console.log === 'function') {
        console.log.apply(console, args);
      }
    };
  }
}

let supabaseClient: ReturnType<typeof createBrowserClient> | null = null;

export const createClientSupabase = () => {
  // Return existing client if already created (singleton pattern)
  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your environment file (.env.local for development or .env.production for production)."
    );
  }

  // Bypass validation - create client directly
  supabaseClient = createBrowserClient(supabaseUrl, supabaseAnonKey);
  return supabaseClient;
};

