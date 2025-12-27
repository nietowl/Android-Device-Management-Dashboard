/**
 * Environment variable validation and defaults
 * Ensures required environment variables are set and provides helpful error messages
 */

interface EnvValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  values: Record<string, string | undefined>;
}

/**
 * Validates environment variables for socket connections
 */
export function validateSocketEnv(): EnvValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const values: Record<string, string | undefined> = {};

  const isDevelopment = process.env.NODE_ENV !== 'production';

  // Check NEXT_PUBLIC_DEVICE_SERVER_URL
  const deviceServerUrl = process.env.NEXT_PUBLIC_DEVICE_SERVER_URL;
  values.NEXT_PUBLIC_DEVICE_SERVER_URL = deviceServerUrl;
  
  if (!deviceServerUrl) {
    if (isDevelopment) {
      warnings.push('NEXT_PUBLIC_DEVICE_SERVER_URL not set - using default: http://localhost:9211');
    } else {
      errors.push('NEXT_PUBLIC_DEVICE_SERVER_URL is required in production');
    }
  } else {
    try {
      new URL(deviceServerUrl);
    } catch {
      errors.push(`NEXT_PUBLIC_DEVICE_SERVER_URL is not a valid URL: ${deviceServerUrl}`);
    }
  }

  // Check ALLOWED_ORIGINS
  const allowedOrigins = process.env.ALLOWED_ORIGINS;
  values.ALLOWED_ORIGINS = allowedOrigins;
  
  if (!allowedOrigins) {
    if (isDevelopment) {
      warnings.push('ALLOWED_ORIGINS not set - using default localhost origins');
    } else {
      warnings.push('ALLOWED_ORIGINS not set - CORS may block connections in production');
    }
  }

  // Check NEXT_PUBLIC_APP_URL
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  values.NEXT_PUBLIC_APP_URL = appUrl;
  
  if (!appUrl && !isDevelopment) {
    warnings.push('NEXT_PUBLIC_APP_URL not set - CORS may not work correctly');
  }

  // Check NEXT_PUBLIC_SITE_URL (required for authentication redirects)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  values.NEXT_PUBLIC_SITE_URL = siteUrl;
  
  if (!siteUrl) {
    if (isDevelopment) {
      warnings.push('NEXT_PUBLIC_SITE_URL not set - authentication redirects may use localhost URLs');
    } else {
      errors.push('NEXT_PUBLIC_SITE_URL is required in production - authentication redirects will fail without it');
    }
  } else {
    // Validate URL format
    try {
      const url = new URL(siteUrl);
      if (!['http:', 'https:'].includes(url.protocol)) {
        errors.push(`NEXT_PUBLIC_SITE_URL must use HTTP or HTTPS protocol: ${siteUrl}`);
      }
      // In production, check for localhost
      if (!isDevelopment && (siteUrl.includes('localhost') || siteUrl.includes('127.0.0.1'))) {
        errors.push(`NEXT_PUBLIC_SITE_URL cannot contain localhost in production: ${siteUrl}`);
      }
    } catch {
      errors.push(`NEXT_PUBLIC_SITE_URL is not a valid URL: ${siteUrl}`);
    }
  }

  // Check Supabase (optional but recommended)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  values.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl;
  values.SUPABASE_SERVICE_ROLE_KEY = supabaseKey ? '***' : undefined;
  
  if (!supabaseUrl || !supabaseKey) {
    warnings.push('Supabase credentials not set - device authentication will be disabled');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    values,
  };
}

/**
 * Gets default socket server URL based on environment
 */
export function getDefaultSocketServerUrl(): string {
  if (typeof window !== 'undefined') {
    // Client-side: use current origin or configured URL
    return process.env.NEXT_PUBLIC_DEVICE_SERVER_URL || 
           process.env.NEXT_PUBLIC_SOCKET_URL ||
           window.location.origin;
  }
  
  // Server-side: use configured URL or default
  return process.env.DEVICE_SERVER_URL || 
         process.env.NEXT_PUBLIC_DEVICE_SERVER_URL || 
         'http://localhost:9211';
}

/**
 * Gets default allowed origins for CORS
 */
export function getDefaultAllowedOrigins(): string[] {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  if (process.env.ALLOWED_ORIGINS) {
    return process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim());
  }
  
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return [process.env.NEXT_PUBLIC_APP_URL];
  }
  
  if (isDevelopment) {
    return ['http://localhost:3000', 'http://127.0.0.1:3000'];
  }
  
  return [];
}

/**
 * Logs environment validation results
 */
export function logEnvValidation(): void {
  const result = validateSocketEnv();
  
  console.log('\n📋 [Environment Validation]');
  
  if (result.errors.length > 0) {
    console.error('❌ Errors:');
    result.errors.forEach(error => console.error(`   - ${error}`));
  }
  
  if (result.warnings.length > 0) {
    console.warn('⚠️  Warnings:');
    result.warnings.forEach(warning => console.warn(`   - ${warning}`));
  }
  
  if (result.isValid && result.warnings.length === 0) {
    console.log('✅ All environment variables are properly configured');
  }
  
  console.log('\n📊 Environment Values:');
  Object.entries(result.values).forEach(([key, value]) => {
    const displayValue = value || '(not set)';
    const status = value ? '✅' : '❌';
    console.log(`   ${status} ${key}: ${displayValue}`);
  });
  console.log('');
}

