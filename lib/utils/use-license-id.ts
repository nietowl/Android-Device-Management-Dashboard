"use client";

import { useState, useEffect } from "react";

/**
 * Hook to get the current user's license ID
 * Returns the license ID or null if not available
 * SECURITY: Uses API route to hide user ID from network tab
 */
export function useLicenseId(): string | null {
  const [licenseId, setLicenseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLicenseId() {
      try {
        // SECURITY: Get license_id via API route (hides user ID from network tab)
        const response = await fetch('/api/user/license-id');
        
        if (!response.ok) {
          if (response.status === 401) {
            console.warn("⚠️ [useLicenseId] User not authenticated");
          } else {
            console.warn("⚠️ [useLicenseId] License ID not found");
          }
          setLicenseId(null);
          setLoading(false);
          return;
        }

        const data = await response.json();
        if (!data.license_id) {
          console.warn("⚠️ [useLicenseId] License ID not found in response");
          setLicenseId(null);
          setLoading(false);
          return;
        }

        setLicenseId(data.license_id);
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

