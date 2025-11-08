import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LoginForm from "@/components/auth/LoginForm";

export default async function Home() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      redirect("/dashboard");
    }
  } catch (error: any) {
    // If Supabase is not configured, show error message
    if (error.message?.includes("Missing Supabase")) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
          <div className="w-full max-w-md p-8">
            <div className="bg-gray-800/90 backdrop-blur-sm border border-gray-700 rounded-lg shadow-2xl p-8">
              <h1 className="text-2xl font-bold text-center mb-4 text-white">
                Configuration Required
              </h1>
              <div className="bg-yellow-900/20 border border-yellow-800 rounded-lg p-4 mb-4">
                <p className="text-sm text-yellow-200 mb-2">
                  <strong>Missing Supabase Configuration</strong>
                </p>
                <p className="text-sm text-yellow-300 mb-3">
                  Please create a <code className="bg-yellow-900 px-1 rounded">.env.local</code> file in the root directory with:
                </p>
                <pre className="text-xs bg-yellow-900 p-2 rounded overflow-x-auto text-yellow-200">
{`NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_key`}
                </pre>
                <p className="text-xs text-yellow-300 mt-3">
                  Get these values from:{" "}
                  <a
                    href="https://supabase.com/dashboard/project/_/settings/api"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-yellow-200 hover:text-yellow-100"
                  >
                    Supabase Dashboard → Settings → API
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    }
    throw error;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative">
      <div className="w-full max-w-md p-8 relative z-10">
        <div className="bg-card/80 backdrop-blur-md border border-border/50 rounded-xl shadow-2xl p-8 relative">
          <div className="text-center mb-6">
            <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              Android Device Management
            </h1>
            <p className="text-muted-foreground text-base">
              Sign in to access your dashboard
            </p>
          </div>
          <LoginForm />
        </div>
      </div>
    </div>
  );
}

