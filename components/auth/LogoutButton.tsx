"use client";

import { createClientSupabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function LogoutButton() {
  const router = useRouter();
  const supabase = createClientSupabase();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <Button variant="ghost" onClick={handleLogout}>
      Logout
    </Button>
  );
}

