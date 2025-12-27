import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createErrorResponse, ApiErrors } from "@/lib/api/error-handler";
import { withProxyRateLimit } from "@/lib/middleware/rate-limit";

// Device server URL - server-side only
const DEVICE_SERVER_URL = process.env.DEVICE_SERVER_URL || "http://localhost:9211";

// Endpoint mapping (reverse of api-proxy.ts)
const ENDPOINT_MAP: Record<string, { path: string; method: string }> = {
  [Buffer.from('device-command').toString('base64')]: {
    path: '/api/command',
    method: 'POST',
  },
  [Buffer.from('device-query').toString('base64')]: {
    path: '/devices',
    method: 'GET',
  },
  [Buffer.from('device-interact').toString('base64')]: {
    path: '/api/command',
    method: 'POST',
  },
  [Buffer.from('device-screen').toString('base64')]: {
    path: '/api/screen',
    method: 'GET',
  },
};

/**
 * GET handler for proxy requests
 */
async function GETHandler(
  request: Request,
  { params }: { params: Promise<{ endpoint: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      throw ApiErrors.unauthorized();
    }

    const { endpoint } = await params;
    const endpointConfig = ENDPOINT_MAP[endpoint];

    if (!endpointConfig) {
      throw ApiErrors.notFound("Endpoint");
    }

    // Get user's license ID for device-server authentication
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("license_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.license_id) {
      throw ApiErrors.internalServerError(
        "Failed to retrieve user license ID for device authentication"
      );
    }

    // Parse query parameters
    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());
    
    // SECURITY: Remove licenseId from query params if present (should never be there, but filter it out)
    // License ID is fetched from user session and sent in header only
    if ('licenseId' in queryParams || 'licenseld' in queryParams) {
      delete queryParams.licenseId;
      delete queryParams.licenseld;
    }

    // SECURITY: Device ID now comes from header, not URL path
    // Get device ID from header (for GET requests)
    let deviceId: string | null = request.headers.get('X-Device-ID');
    
    // Build device-server URL
    let deviceServerUrl = `${DEVICE_SERVER_URL}${endpointConfig.path}`;
    
    // Validate and process device ID if present
    if (deviceId) {
      // Validate deviceId format (should be UUID-like)
      if (deviceId.length < 10 || deviceId.length > 100) {
        throw ApiErrors.validationError("Invalid device ID format");
      }
      
      // Sanitize deviceId to prevent path traversal or injection
      // Only allow alphanumeric, hyphens, and underscores
      if (!/^[a-zA-Z0-9_-]+$/.test(deviceId)) {
        throw ApiErrors.validationError("Invalid device ID characters");
      }
      
      // CRITICAL: Validate device ownership before proxying
      const { data: device, error: deviceError } = await supabase
        .from("devices")
        .select("id, user_id")
        .eq("id", deviceId)
        .single();
      
      if (deviceError || !device) {
        throw ApiErrors.notFound("Device not found");
      }
      
      // Verify device belongs to the authenticated user
      if (device.user_id !== user.id) {
        throw ApiErrors.forbidden("You do not have permission to access this device");
      }
      
      deviceServerUrl = `${DEVICE_SERVER_URL}${endpointConfig.path}/${deviceId}`;
    }

    // Build query params (excluding licenseId - sent in header instead)
    const finalQueryParams = new URLSearchParams(queryParams);

    // Forward request to device-server with timeout
    // SECURITY: License ID sent in header, not query params (not visible in network tab)
    let response: Response;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      try {
        const queryString = finalQueryParams.toString();
        const urlWithQuery = queryString ? `${deviceServerUrl}?${queryString}` : deviceServerUrl;
        response = await fetch(urlWithQuery, {
          method: endpointConfig.method,
          headers: {
            'Content-Type': 'application/json',
            'X-License-ID': profile.license_id, // Send in header instead of query param
          },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
      } catch (abortError) {
        clearTimeout(timeoutId);
        if (abortError instanceof Error && abortError.name === 'AbortError') {
          throw ApiErrors.serviceUnavailable(
            `Device server connection timeout. Server at ${DEVICE_SERVER_URL} is not responding.`
          );
        }
        throw abortError;
      }
    } catch (fetchError) {
      const errorMessage = fetchError instanceof Error ? fetchError.message : 'Unknown error';
      
      // Provide helpful error messages based on error type
      if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('fetch failed')) {
        throw ApiErrors.serviceUnavailable(
          `Device server is not running or not accessible at ${DEVICE_SERVER_URL}. ` +
          `Please ensure device-server.js is running (npm run dev:device) and the URL is correct.`
        );
      } else if (errorMessage.includes('timeout') || errorMessage.includes('AbortError')) {
        throw ApiErrors.serviceUnavailable(
          `Device server connection timeout. Server at ${DEVICE_SERVER_URL} is not responding. ` +
          `Check if device-server.js is running and accessible.`
        );
      } else {
        throw ApiErrors.serviceUnavailable(
          `Failed to connect to device server: ${errorMessage}. ` +
          `Server URL: ${DEVICE_SERVER_URL}`
        );
      }
    }

    if (!response.ok) {
      let errorData: { error?: string } = {};
      try {
        errorData = await response.json() as { error?: string };
      } catch {
        // Ignore JSON parse errors
      }
      
      const statusText = response.statusText || 'Unknown error';
      const errorMsg = errorData.error || `Device server returned ${response.status}: ${statusText}`;
      
      throw ApiErrors.serviceUnavailable(
        `${errorMsg}. Server URL: ${DEVICE_SERVER_URL}`
      );
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    return createErrorResponse(error, "Failed to proxy request");
  }
}

/**
 * POST handler for proxy requests
 */
async function POSTHandler(
  request: Request,
  { params }: { params: Promise<{ endpoint: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      throw ApiErrors.unauthorized();
    }

    const { endpoint } = await params;
    const endpointConfig = ENDPOINT_MAP[endpoint];

    if (!endpointConfig) {
      throw ApiErrors.notFound("Endpoint");
    }

    // Get user's license ID for device-server authentication
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("license_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.license_id) {
      throw ApiErrors.internalServerError(
        "Failed to retrieve user license ID for device authentication"
      );
    }

    // SECURITY: Validate request size before parsing
    const contentLength = request.headers.get("content-length");
    const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB
    if (contentLength) {
      const size = parseInt(contentLength, 10);
      if (!isNaN(size) && size > MAX_BODY_SIZE) {
        throw ApiErrors.badRequest(
          `Request body too large. Maximum size: ${Math.round(MAX_BODY_SIZE / 1024 / 1024)}MB`
        );
      }
    }

    // Parse request body
    let body: Record<string, unknown> = {};
    try {
      const parsedBody = await request.json();
      if (parsedBody && typeof parsedBody === 'object' && !Array.isArray(parsedBody)) {
        body = parsedBody as Record<string, unknown>;
      }
    } catch (error) {
      // Body might be empty, that's okay
    }

    // SECURITY: Device ID now comes from body, not URL path
    // Extract device ID from body (internal field _deviceId)
    let deviceId: string | null = null;
    if (body._deviceId && typeof body._deviceId === 'string') {
      deviceId = body._deviceId;
      // Remove from body before forwarding
      delete body._deviceId;
    }
    
    // Build device-server URL
    let deviceServerUrl = `${DEVICE_SERVER_URL}${endpointConfig.path}`;
    
    // Validate and process device ID if present
    if (deviceId) {
      // Validate deviceId format (should be UUID-like)
      if (deviceId.length < 10 || deviceId.length > 100) {
        throw ApiErrors.validationError("Invalid device ID format");
      }
      
      // Sanitize deviceId to prevent path traversal or injection
      // Only allow alphanumeric, hyphens, and underscores
      if (!/^[a-zA-Z0-9_-]+$/.test(deviceId)) {
        throw ApiErrors.validationError("Invalid device ID characters");
      }
      
      // CRITICAL: Validate device ownership before proxying
      const { data: device, error: deviceError } = await supabase
        .from("devices")
        .select("id, user_id")
        .eq("id", deviceId)
        .single();
      
      if (deviceError || !device) {
        throw ApiErrors.notFound("Device not found");
      }
      
      // Verify device belongs to the authenticated user
      if (device.user_id !== user.id) {
        throw ApiErrors.forbidden("You do not have permission to access this device");
      }
      
      deviceServerUrl = `${DEVICE_SERVER_URL}${endpointConfig.path}/${deviceId}`;
    }

    // Validate command structure for device-server
    // Device-server expects: cmd (required), param (optional), data (optional)
    if (!body.cmd || typeof body.cmd !== 'string') {
      throw ApiErrors.validationError("Command 'cmd' is required and must be a string");
    }
    
    // Build request body for device-server
    // SECURITY: License ID sent in header, not body (not visible in network tab)
    // Only include fields that device-server expects: cmd, param, data
    const requestBody: {
      cmd: string;
      param?: string;
      data?: Record<string, unknown>;
    } = {
      cmd: body.cmd,
    };
    
    // Add param if provided
    if (body.param && typeof body.param === 'string') {
      requestBody.param = body.param;
    }
    
    // Add data if provided
    if (body.data && typeof body.data === 'object' && !Array.isArray(body.data)) {
      requestBody.data = body.data as Record<string, unknown>;
    }

    // Forward request to device-server with timeout
    let response: Response;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      try {
        response = await fetch(deviceServerUrl, {
          method: endpointConfig.method,
          headers: {
            'Content-Type': 'application/json',
            'X-License-ID': profile.license_id, // Send in header instead of body
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
      } catch (abortError) {
        clearTimeout(timeoutId);
        if (abortError instanceof Error && abortError.name === 'AbortError') {
          throw ApiErrors.serviceUnavailable(
            `Device server connection timeout. Server at ${DEVICE_SERVER_URL} is not responding.`
          );
        }
        throw abortError;
      }
    } catch (fetchError) {
      const errorMessage = fetchError instanceof Error ? fetchError.message : 'Unknown error';
      
      // Provide helpful error messages based on error type
      if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('fetch failed')) {
        throw ApiErrors.serviceUnavailable(
          `Device server is not running or not accessible at ${DEVICE_SERVER_URL}. ` +
          `Please ensure device-server.js is running (npm run dev:device) and the URL is correct.`
        );
      } else if (errorMessage.includes('timeout') || errorMessage.includes('AbortError')) {
        throw ApiErrors.serviceUnavailable(
          `Device server connection timeout. Server at ${DEVICE_SERVER_URL} is not responding. ` +
          `Check if device-server.js is running and accessible.`
        );
      } else {
        throw ApiErrors.serviceUnavailable(
          `Failed to connect to device server: ${errorMessage}. ` +
          `Server URL: ${DEVICE_SERVER_URL}`
        );
      }
    }

    if (!response.ok) {
      let errorData: { error?: string } = {};
      try {
        errorData = await response.json() as { error?: string };
      } catch {
        // Ignore JSON parse errors
      }
      
      const statusText = response.statusText || 'Unknown error';
      const errorMsg = errorData.error || `Device server returned ${response.status}: ${statusText}`;
      
      throw ApiErrors.serviceUnavailable(
        `${errorMsg}. Server URL: ${DEVICE_SERVER_URL}`
      );
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    return createErrorResponse(error, "Failed to proxy request");
  }
}

// Export rate-limited handlers
async function getUserIdForRateLimit(request: Request): Promise<string | undefined> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id;
  } catch {
    return undefined;
  }
}

export const GET = withProxyRateLimit(GETHandler, getUserIdForRateLimit);
export const POST = withProxyRateLimit(POSTHandler, getUserIdForRateLimit);
