/**
 * Utility to test Supabase connection
 * Useful for debugging connection issues
 */

export async function testSupabaseConnection(): Promise<{
  success: boolean;
  error?: string;
  details?: any;
}> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      success: false,
      error: "Missing environment variables",
      details: {
        hasUrl: !!supabaseUrl,
        hasKey: !!supabaseAnonKey,
      },
    };
  }

  try {
    // Test basic connectivity
    const healthCheckUrl = `${supabaseUrl}/rest/v1/`;
    const response = await fetch(healthCheckUrl, {
      method: "GET",
      headers: {
        "apikey": supabaseAnonKey,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        details: {
          url: supabaseUrl,
          status: response.status,
          statusText: response.statusText,
        },
      };
    }

    return {
      success: true,
      details: {
        url: supabaseUrl,
        status: response.status,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Unknown error",
      details: {
        url: supabaseUrl,
        errorType: error.name,
        errorMessage: error.message,
      },
    };
  }
}

