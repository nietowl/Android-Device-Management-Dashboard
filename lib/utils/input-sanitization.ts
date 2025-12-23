/**
 * Input sanitization utilities for production security
 */

/**
 * Sanitizes a string input by removing potentially dangerous characters
 */
export function sanitizeString(input: string, maxLength: number = 1000): string {
  if (typeof input !== "string") {
    return "";
  }

  // Trim and limit length
  let sanitized = input.trim().slice(0, maxLength);

  // Remove null bytes and control characters (except newlines and tabs)
  sanitized = sanitized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, "");

  return sanitized;
}

/**
 * Validates and sanitizes an email address
 */
export function sanitizeEmail(email: string): string | null {
  if (typeof email !== "string") {
    return null;
  }

  const sanitized = sanitizeString(email.toLowerCase(), 254);
  
  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(sanitized)) {
    return null;
  }

  return sanitized;
}

/**
 * Validates and sanitizes a UUID
 */
export function sanitizeUuid(uuid: string): string | null {
  if (typeof uuid !== "string") {
    return null;
  }

  const sanitized = sanitizeString(uuid, 36);
  
  // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(sanitized)) {
    return null;
  }

  return sanitized.toLowerCase();
}

/**
 * Validates and sanitizes a device ID (UUID-like, but more flexible)
 */
export function sanitizeDeviceId(deviceId: string): string | null {
  if (typeof deviceId !== "string") {
    return null;
  }

  const sanitized = sanitizeString(deviceId, 100);
  
  // Allow alphanumeric, hyphens, and underscores only
  if (!/^[a-zA-Z0-9_-]+$/.test(sanitized)) {
    return null;
  }

  return sanitized;
}

/**
 * Validates and sanitizes a username
 */
export function sanitizeUsername(username: string): string | null {
  if (typeof username !== "string") {
    return null;
  }

  const sanitized = sanitizeString(username, 50);
  
  // Allow alphanumeric, underscores, hyphens, and dots
  if (!/^[a-zA-Z0-9_.-]+$/.test(sanitized)) {
    return null;
  }

  if (sanitized.length < 3 || sanitized.length > 50) {
    return null;
  }

  return sanitized;
}

/**
 * Validates command structure to prevent injection
 */
export function validateCommand(cmd: unknown): string | null {
  if (typeof cmd !== "string") {
    return null;
  }

  const sanitized = sanitizeString(cmd, 100);
  
  // Only allow alphanumeric, hyphens, underscores, and dots
  if (!/^[a-zA-Z0-9_.-]+$/.test(sanitized)) {
    return null;
  }

  return sanitized;
}

/**
 * Sanitizes an object by recursively sanitizing string values
 */
export function sanitizeObject<T extends Record<string, any>>(
  obj: T,
  maxDepth: number = 10,
  currentDepth: number = 0
): T {
  if (currentDepth >= maxDepth) {
    return obj;
  }

  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return obj;
  }

  const sanitized = {} as T;

  for (const [key, value] of Object.entries(obj)) {
    const sanitizedKey = sanitizeString(key, 100);
    
    if (typeof value === "string") {
      (sanitized as any)[sanitizedKey] = sanitizeString(value, 10000);
    } else if (typeof value === "object" && value !== null) {
      (sanitized as any)[sanitizedKey] = sanitizeObject(
        value,
        maxDepth,
        currentDepth + 1
      );
    } else {
      (sanitized as any)[sanitizedKey] = value;
    }
  }

  return sanitized;
}

