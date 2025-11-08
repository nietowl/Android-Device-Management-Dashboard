"use client";

import { useState } from "react";
import { createClientSupabase } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function AdminDebug() {
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const checkAdminStatus = async () => {
    setLoading(true);
    const supabase = createClientSupabase();
    
    try {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        setDebugInfo({ error: "No user found", details: userError });
        return;
      }

      // Check if profile exists
      const { data: profile, error: profileError } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      setDebugInfo({
        user: {
          id: user.id,
          email: user.email,
        },
        profile: profile || null,
        profileError: profileError ? {
          message: profileError.message,
          code: profileError.code,
          details: profileError.details,
        } : null,
        isAdmin: profile?.role === "admin",
      });
    } catch (error: any) {
      setDebugInfo({ error: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle>Admin Debug Tool</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={checkAdminStatus} disabled={loading}>
            {loading ? "Checking..." : "Check Admin Status"}
          </Button>

          {debugInfo && (
            <div className="mt-4 p-4 bg-muted rounded-lg">
              <pre className="text-xs overflow-auto">
                {JSON.stringify(debugInfo, null, 2)}
              </pre>
            </div>
          )}

          <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
            <h3 className="font-semibold mb-2">Troubleshooting Steps:</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm">
              <li>Make sure you&apos;ve run migration 002_admin_panel_schema.sql</li>
              <li>Make sure you&apos;ve run migration 003_make_first_user_admin.sql</li>
              <li>Check the browser console for errors</li>
              <li>Verify your user profile exists in the user_profiles table</li>
              <li>Check that your role is set to &apos;admin&apos; in the database</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

