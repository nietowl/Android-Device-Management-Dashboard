/**
 * Command Validation Utilities
 * 
 * SECURITY: Whitelist of allowed device commands to prevent command injection attacks
 */

/**
 * Allowed device commands whitelist
 * Only commands in this list can be executed on devices
 */
export const ALLOWED_COMMANDS = [
  // Device information commands
  'getinfo',
  'getdeviceinfo',
  
  // SMS commands
  'getsms',
  'sendsms',
  'deletesms',
  
  // App management
  'getapps',
  'installapp',
  'uninstallapp',
  'startapp',
  'stopapp',
  
  // File management
  'getfiles',
  'uploadfile',
  'downloadfile',
  'deletefile',
  
  // Contacts and calls
  'getcontacts',
  'getcalls',
  'makecall',
  
  // Screen and camera
  'getscreen',
  'getpreviewimg',
  'startcamera',
  'stopcamera',
  'captureimage',
  
  // Input commands
  'input',
  'tap',
  'swipe',
  'scroll',
  'longpress',
  'keyevent',
  
  // Access control
  'access-command',
  
  // System commands
  'reboot',
  'shutdown',
  'getbattery',
  'getlocation',
  
  // Clipboard
  'getclipboard',
  'setclipboard',
] as const;

export type AllowedCommand = typeof ALLOWED_COMMANDS[number];

/**
 * Validates if a command is in the whitelist
 */
export function isCommandAllowed(command: string): command is AllowedCommand {
  return ALLOWED_COMMANDS.includes(command as AllowedCommand);
}

/**
 * Validates and sanitizes a device command
 * @throws Error if command is invalid or contains dangerous content
 */
export function validateCommand(command: string, param?: string, data?: any): void {
  // Check if command is in whitelist
  if (!isCommandAllowed(command)) {
    throw new Error(`Command '${command}' is not allowed. Allowed commands: ${ALLOWED_COMMANDS.join(', ')}`);
  }

  // Validate command format (alphanumeric, hyphens, underscores only)
  if (!/^[a-zA-Z0-9_-]+$/.test(command)) {
    throw new Error(`Command contains invalid characters: ${command}`);
  }

  // Validate param if provided
  if (param !== undefined && param !== null) {
    if (typeof param !== 'string') {
      throw new Error('Command parameter must be a string');
    }
    
    // Prevent extremely long parameters (DoS protection)
    if (param.length > 1000) {
      throw new Error('Command parameter is too long (max 1000 characters)');
    }
    
    // Sanitize param: prevent obvious injection patterns
    // Allow common separators like |, :, / for structured params (e.g., "inbox|50|10")
    const dangerousPatterns = [
      /[<>]/g,  // HTML/XML tags
      /javascript:/gi,  // JavaScript protocol
      /on\w+\s*=/gi,  // Event handlers
      /eval\s*\(/gi,  // eval calls
      /exec\s*\(/gi,  // exec calls
    ];
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(param)) {
        throw new Error(`Command parameter contains potentially dangerous content: ${param.substring(0, 50)}...`);
      }
    }
  }

  // Validate data if provided
  if (data !== undefined && data !== null) {
    if (typeof data !== 'object' || Array.isArray(data) || data === null) {
      throw new Error('Command data must be an object');
    }
    
    // Prevent deeply nested objects (DoS protection)
    const depth = getObjectDepth(data);
    if (depth > 10) {
      throw new Error('Command data is too deeply nested (max depth 10)');
    }
    
    // Prevent extremely large data objects
    const dataSize = JSON.stringify(data).length;
    if (dataSize > 100000) {  // 100KB limit
      throw new Error('Command data is too large (max 100KB)');
    }
    
    // Sanitize data values: check for dangerous strings in values
    const sanitizedData = sanitizeDataObject(data);
    if (sanitizedData !== data) {
      throw new Error('Command data contains potentially dangerous content');
    }
  }
}

/**
 * Gets the depth of a nested object
 */
function getObjectDepth(obj: any, currentDepth = 0): number {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return currentDepth;
  }
  
  let maxDepth = currentDepth;
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const depth = getObjectDepth(obj[key], currentDepth + 1);
      maxDepth = Math.max(maxDepth, depth);
    }
  }
  
  return maxDepth;
}

/**
 * Sanitizes a data object by checking for dangerous patterns
 */
function sanitizeDataObject(obj: any): any {
  if (typeof obj !== 'object' || obj === null) {
    if (typeof obj === 'string') {
      // Check for dangerous patterns in strings
      const dangerousPatterns = [
        /javascript:/gi,
        /on\w+\s*=/gi,
        /eval\s*\(/gi,
        /exec\s*\(/gi,
        /<script/gi,
      ];
      
      for (const pattern of dangerousPatterns) {
        if (pattern.test(obj)) {
          return null; // Return null to indicate dangerous content
        }
      }
    }
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeDataObject(item));
  }
  
  const sanitized: any = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      sanitized[key] = sanitizeDataObject(obj[key]);
    }
  }
  
  return sanitized;
}

/**
 * Gets a list of all allowed commands (for documentation/UI)
 */
export function getAllowedCommands(): readonly string[] {
  return [...ALLOWED_COMMANDS];
}

