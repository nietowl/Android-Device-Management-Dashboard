import crypto from "crypto";

/**
 * Generate a license ID
 * Format: 25 alphanumeric characters (uppercase + lowercase + numbers) + "=" at the end
 * Total: 26 characters (25 alphanumeric + 1 "=")
 * 
 * @param length - Ignored, always generates 25 alphanumeric + "=" (26 total)
 * @returns License ID string
 */
export function generateLicenseId(length: number = 25): string {
  // Always generate 25 alphanumeric characters (uppercase, lowercase, numbers)
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';

  // Generate 25 random alphanumeric characters
  for (let i = 0; i < 25; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    result += chars[randomIndex];
  }

  // Always append "=" at the end
  result += '=';

  return result;
}

/**
 * Validate license ID format
 * Must be exactly 26 characters: 25 alphanumeric (uppercase + lowercase + numbers) + "=" at the end
 * 
 * @param licenseId - License ID to validate
 * @returns true if valid, false otherwise
 */
export function validateLicenseId(licenseId: string): boolean {
  if (!licenseId || typeof licenseId !== "string") {
    return false;
  }

  // Check length (must be exactly 26 characters)
  if (licenseId.length !== 26) {
    return false;
  }

  // Check that it ends with "="
  if (licenseId[25] !== '=') {
    return false;
  }

  // Check format: first 25 characters must be alphanumeric (uppercase, lowercase, numbers)
  const alphanumericPart = licenseId.substring(0, 25);
  const licenseIdRegex = /^[A-Za-z0-9]{25}$/;
  if (!licenseIdRegex.test(alphanumericPart)) {
    return false;
  }

  return true;
}

/**
 * Generate a unique license ID by checking against existing ones
 * This is a client-side helper - actual uniqueness is enforced by database
 * Format: 25 alphanumeric + "=" (26 characters total)
 * 
 * @param existingIds - Array of existing license IDs to check against
 * @param length - Ignored, always generates 25 alphanumeric + "=" (26 total)
 * @returns Unique license ID string
 */
export function generateUniqueLicenseId(existingIds: string[] = [], length: number = 25): string {
  const maxAttempts = 100;
  let attempts = 0;

  while (attempts < maxAttempts) {
    const licenseId = generateLicenseId();
    
    if (!existingIds.includes(licenseId)) {
      return licenseId;
    }
    
    attempts++;
  }

  // If we can't generate a unique ID after max attempts, use timestamp + random hash
  const timestamp = Date.now().toString();
  const hash = crypto.createHash("sha256").update(timestamp + Math.random().toString()).digest("hex");
  // Take first 25 characters from hash (convert to alphanumeric) and append "="
  const alphanumericHash = hash.replace(/[^a-zA-Z0-9]/g, '').substring(0, 25);
  // If hash doesn't have enough alphanumeric chars, pad with random
  if (alphanumericHash.length < 25) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const padding = Array.from({ length: 25 - alphanumericHash.length }, () => 
      chars[Math.floor(Math.random() * chars.length)]
    ).join('');
    return (alphanumericHash + padding) + '=';
  }
  return alphanumericHash + '=';
}

