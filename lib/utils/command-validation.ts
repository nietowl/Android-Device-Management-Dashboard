/**
 * Command validation utilities for device commands
 * Prevents command injection and ensures only safe commands are executed
 */

/**
 * Whitelist of allowed device commands
 */
const ALLOWED_COMMANDS = [
  // SMS commands
  'getsms',
  'sendsms',
  'deletesms',
  
  // File commands
  'getfiles',
  'uploadfile',
  'downloadfile',
  'deletefile',
  
  // Call/Contact commands
  'getcalls',
  'getcontacts',
  'makecall',
  
  // Camera commands
  'startcamera',
  'stopcamera',
  'capture',
  
  // Screen commands
  'getscreen',
  'screenshot',
  
  // Device info commands
  'getinfo',
  'getdeviceinfo',
  
  // Interaction commands
  'tap',
  'swipe',
  'scroll',
  'type',
  'back',
  'home',
  'menu',
  
  // App commands
  'getapps',
  'launchapp',
  'closeapp',
  
  // Other safe commands
  'ping',
  'status',
] as const;

type AllowedCommand = typeof ALLOWED_COMMANDS[number];

/**
 * Validates if a command is in the whitelist
 */
export function isValidCommand(cmd: string): cmd is AllowedCommand {
  return ALLOWED_COMMANDS.includes(cmd as AllowedCommand);
}

/**
 * Validates and sanitizes a command
 * @throws Error if command is invalid
 */
export function validateCommand(cmd: unknown): string {
  if (typeof cmd !== 'string') {
    throw new Error('Command must be a string');
  }

  const trimmedCmd = cmd.trim().toLowerCase();
  
  if (trimmedCmd.length === 0) {
    throw new Error('Command cannot be empty');
  }

  if (trimmedCmd.length > 50) {
    throw new Error('Command name too long (max 50 characters)');
  }

  // Only allow alphanumeric characters and hyphens
  if (!/^[a-z0-9-]+$/.test(trimmedCmd)) {
    throw new Error('Command contains invalid characters');
  }

  if (!isValidCommand(trimmedCmd)) {
    throw new Error(`Command '${trimmedCmd}' is not in the allowed whitelist`);
  }

  return trimmedCmd;
}

/**
 * Validates command parameters
 */
export function validateCommandParam(param: unknown): string | null {
  if (param === null || param === undefined) {
    return null;
  }

  if (typeof param !== 'string') {
    throw new Error('Command parameter must be a string');
  }

  // Limit parameter length
  if (param.length > 1000) {
    throw new Error('Command parameter too long (max 1000 characters)');
  }

  // Sanitize parameter - remove potentially dangerous characters
  const sanitized = param
    .replace(/[<>\"'`]/g, '') // Remove HTML/script injection chars
    .replace(/[;&|$`]/g, '')  // Remove shell injection chars
    .trim();

  return sanitized.length > 0 ? sanitized : null;
}

/**
 * Validates command data payload
 */
export function validateCommandData(data: unknown): Record<string, unknown> | null {
  if (data === null || data === undefined) {
    return null;
  }

  if (typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Command data must be an object');
  }

  // Limit data size (prevent large payloads)
  const dataStr = JSON.stringify(data);
  if (dataStr.length > 10000) {
    throw new Error('Command data payload too large (max 10KB)');
  }

  return data as Record<string, unknown>;
}

/**
 * Validates a complete command request
 */
export interface CommandRequest {
  cmd: string;
  param?: string | null;
  data?: Record<string, unknown> | null;
}

export function validateCommandRequest(request: {
  cmd?: unknown;
  param?: unknown;
  data?: unknown;
}): CommandRequest {
  const cmd = validateCommand(request.cmd);
  const param = request.param !== undefined ? validateCommandParam(request.param) : null;
  const data = request.data !== undefined ? validateCommandData(request.data) : null;

  return {
    cmd,
    ...(param !== null && { param }),
    ...(data !== null && { data }),
  };
}

