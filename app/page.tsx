import LoginForm from "@/components/auth/LoginForm";

export default function Home() {
  // BYPASS: No Supabase checks, just show login form
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md p-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-semibold mb-2 text-foreground">
            Android Device Management
          </h1>
          <p className="text-muted-foreground text-sm">
            Sign in to access your dashboard
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}

