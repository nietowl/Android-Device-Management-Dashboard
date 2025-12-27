"use client";

import { signOut } from "@/lib/auth/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function LogoutButton() {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      // SECURITY: Use API route to hide Supabase URL from network tab
      const { error } = await signOut();
      
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

