import crypto from "crypto";

/**
 * Generate SHA-256 hash of an email address
 * Uses lowercase and trimmed email for consistency
 * 
 * @param email - Email address to hash
 * @returns SHA-256 hash as hexadecimal string
 */
export function generateEmailHash(email: string): string {
  if (!email || typeof email !== "string") {
    throw new Error("Email must be a non-empty string");
  }
  
  // Normalize email: lowercase and trim
  const normalizedEmail = email.toLowerCase().trim();
  
  // Generate SHA-256 hash
  return crypto.createHash("sha256").update(normalizedEmail).digest("hex");
}

/**
 * Validate email hash by comparing with email
 * 
 * @param emailHash - The hash to validate
 * @param email - The email to compare against
 * @returns true if hash matches email, false otherwise
 */
export function validateEmailHash(emailHash: string, email: string): boolean {
  if (!emailHash || !email) {
    return false;
  }
  
  try {
    const expectedHash = generateEmailHash(email);
    return emailHash === expectedHash;
  } catch (error) {
    return false;
  }
}

