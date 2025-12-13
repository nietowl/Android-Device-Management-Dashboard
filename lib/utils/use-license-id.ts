"use client";

import { useState, useEffect } from "react";
import { createClientSupabase } from "@/lib/supabase/client";

/**
 * Hook to get the current user's license ID
 * Returns the license ID or null if not available
 */
export function useLicenseId(): string | null {
  const [licenseId, setLicenseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLicenseId() {
      try {
        const supabase = createClientSupabase();
        
        // Get current user
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError || !user) {
          console.warn("⚠️ [useLicenseId] User not authenticated");
          setLicenseId(null);
          setLoading(false);
          return;
        }

        // Get user's license_id from profile
        const { data: profile, error: profileError } = await supabase
          .from("user_profiles")
          .select("license_id")
          .eq("id", user.id)
          .single();

        if (profileError || !profile?.license_id) {
          console.warn("⚠️ [useLicenseId] License ID not found:", profileError);
          setLicenseId(null);
          setLoading(false);
          return;
        }

        setLicenseId(profile.license_id);
        setLoading(false);
      } catch (error) {
        console.error("❌ [useLicenseId] Error fetching license ID:", error);
        setLicenseId(null);
        setLoading(false);
      }
    }

    fetchLicenseId();
  }, []);

  return licenseId;
}

