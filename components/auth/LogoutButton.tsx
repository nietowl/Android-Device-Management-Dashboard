"use client";

import { createClientSupabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function LogoutButton() {
  const router = useRouter();
  const supabase = createClientSupabase();

  const handleLogout = async () => {
    try {
      // Sign out from Supabase
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        console.error("Logout error:", error);
      }
      
      // Clear any localStorage items
      localStorage.removeItem("auth_session");
      localStorage.removeItem("is_authenticated");
      
      // Redirect to home page
      router.push("/");
      router.refresh();
    } catch (error) {
      console.error("Logout failed:", error);
      // Still redirect even if logout fails
      router.push("/");
      router.refresh();
    }
  };

  return (
    <Button variant="ghost" onClick={handleLogout}>
      Logout
    </Button>
  );
}

