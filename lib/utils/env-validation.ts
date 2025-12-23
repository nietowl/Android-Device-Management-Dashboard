/**
 * Environment variable validation for production readiness
 * Validates that all required environment variables are set
 */

interface EnvVar {
  name: string;
  required: boolean;
  productionOnly?: boolean;
  validator?: (value: string) => boolean;
  errorMessage?: string;
}

const REQUIRED_ENV_VARS: EnvVar[] = [
  {
    name: "NEXT_PUBLIC_SUPABASE_URL",
    required: true,
    validator: (value) => value.startsWith("https://") && value.includes(".supabase.co"),
    errorMessage: "Must be a valid Supabase URL (https://*.supabase.co)",
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    required: true,
    validator: (value) => value.length > 50, // Supabase keys are long
    errorMessage: "Must be a valid Supabase anon key",
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    required: true,
    validator: (value) => value.length > 50,
    errorMessage: "Must be a valid Supabase service role key",
  },
  {
    name: "NEXT_PUBLIC_APP_URL",
    required: false,
    productionOnly: true,
    validator: (value) => value.startsWith("https://"),
    errorMessage: "Must be a valid HTTPS URL in production",
  },
  {
    name: "WEBHOOK_SECRET",
    required: false,
    productionOnly: true,
    validator: (value) => value.length >= 32,
    errorMessage: "Must be at least 32 characters long",
  },
  {
    name: "DEVICE_SERVER_URL",
    required: false,
    validator: (value) => {
      // Validate it's a safe internal URL (not external)
      try {
        const url = new URL(value);
        // Allow localhost, 127.0.0.1, or private IP ranges
        const hostname = url.hostname.toLowerCase();
        return (
          hostname === "localhost" ||
          hostname === "127.0.0.1" ||
          hostname.startsWith("192.168.") ||
          hostname.startsWith("10.") ||
          hostname.startsWith("172.16.") ||
          hostname.startsWith("172.17.") ||
          hostname.startsWith("172.18.") ||
          hostname.startsWith("172.19.") ||
          hostname.startsWith("172.20.") ||
          hostname.startsWith("172.21.") ||
          hostname.startsWith("172.22.") ||
          hostname.startsWith("172.23.") ||
          hostname.startsWith("172.24.") ||
          hostname.startsWith("172.25.") ||
          hostname.startsWith("172.26.") ||
          hostname.startsWith("172.27.") ||
          hostname.startsWith("172.28.") ||
          hostname.startsWith("172.29.") ||
          hostname.startsWith("172.30.") ||
          hostname.startsWith("172.31.")
        );
      } catch {
        return false;
      }
    },
    errorMessage: "Must be a safe internal URL (localhost or private IP)",
  },
];

/**
 * Validates environment variables
 * @throws Error if required variables are missing or invalid
 */
export function validateEnvironment(): void {
  const isProduction = process.env.NODE_ENV === "production";
  const errors: string[] = [];

  for (const envVar of REQUIRED_ENV_VARS) {
    const value = process.env[envVar.name];

    // Check if required
    if (envVar.required && !value) {
      errors.push(`Missing required environment variable: ${envVar.name}`);
      continue;
    }

    // Check if production-only and we're in production
    if (envVar.productionOnly && isProduction && !value) {
      errors.push(
        `Missing required production environment variable: ${envVar.name}`
      );
      continue;
    }

    // Validate value if present and validator exists
    if (value && envVar.validator) {
      if (!envVar.validator(value)) {
        errors.push(
          `Invalid environment variable ${envVar.name}: ${envVar.errorMessage || "Validation failed"}`
        );
      }
    }
  }

  if (errors.length > 0) {
    console.error("❌ Environment validation failed:");
    errors.forEach((error) => console.error(`   - ${error}`));
    throw new Error(
      `Environment validation failed. Please check your .env file.\n${errors.join("\n")}`
    );
  }

  console.log("✅ Environment variables validated successfully");
}

/**
 * Validates DEVICE_SERVER_URL is safe (SSRF protection)
 */
export function validateDeviceServerUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();

    // Block external domains and public IPs
    if (
      !hostname.includes("localhost") &&
      !hostname.includes("127.0.0.1") &&
      !hostname.startsWith("192.168.") &&
      !hostname.startsWith("10.") &&
      !hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./) // 172.16.0.0 - 172.31.255.255
    ) {
      // Check if it's a public IP or external domain
      if (hostname.includes(".") && !hostname.match(/^(\d+\.){3}\d+$/)) {
        // It's a domain name - block external domains
        console.warn(`⚠️ SSRF Protection: Blocked external domain in DEVICE_SERVER_URL: ${hostname}`);
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

