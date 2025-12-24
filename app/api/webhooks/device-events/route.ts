import { NextResponse } from "next/server";
import { WebhookEvent } from "@/types";
import { createClient } from "@/lib/supabase/server";
import { createErrorResponse, ApiErrors } from "@/lib/api/error-handler";

// Socket.io server instance (will be initialized in server.js)
// Access via global.io set by the custom server
function getSocketIO() {
  if (typeof global !== "undefined" && (global as any).io) {
    return (global as any).io;
  }
  return null;
}

// Get device clients map
function getDeviceClients() {
  if (typeof global !== "undefined" && (global as any).deviceClients) {
    return (global as any).deviceClients;
  }
  return null;
}

export async function POST(request: Request) {
  try {
    // CRITICAL: Webhook authentication is REQUIRED in production
    const webhookSecret = process.env.WEBHOOK_SECRET;
    const authHeader = request.headers.get("authorization");

    // In production, webhook secret must be set and validated
    const isProduction = process.env.NODE_ENV === "production";
    if (isProduction && !webhookSecret) {
      console.error("❌ WEBHOOK_SECRET is required in production but not set");
      throw ApiErrors.internalServerError("Webhook authentication not configured");
    }

    if (webhookSecret) {
      if (!authHeader || authHeader !== `Bearer ${webhookSecret}`) {
        // Use safe console logging since console.warn may not be available in all environments
        if (typeof console !== 'undefined' && typeof console.warn === 'function') {
          console.warn(`⚠️ Webhook authentication failed: Invalid or missing authorization header`);
        } else if (typeof console !== 'undefined' && typeof console.error === 'function') {
          console.error(`⚠️ Webhook authentication failed: Invalid or missing authorization header`);
        }
        throw ApiErrors.unauthorized("Invalid webhook secret");
      }
    } else if (isProduction) {
      // Fail closed in production if secret is not set
      throw ApiErrors.internalServerError("Webhook authentication not configured");
    }

    let event: WebhookEvent;
    try {
      event = await request.json();
    } catch (error) {
      throw ApiErrors.badRequest("Invalid JSON in request body");
    }

    const { event: eventType, device_id, user_id, data, timestamp } = event;

    // Validate required fields
    if (!eventType || typeof eventType !== "string") {
      throw ApiErrors.validationError("event is required and must be a string");
    }

    if (!device_id || typeof device_id !== "string") {
      throw ApiErrors.validationError("device_id is required and must be a string");
    }

    // Get Supabase client for database operations
    const supabase = await createClient();

    // Handle different event types
    switch (eventType) {
      case "device_status":
        // Update device status in database
        const { error: statusError } = await supabase
          .from("devices")
          .update({
            status: data.status || "online",
            last_sync: timestamp || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", device_id);

        if (statusError) {
          console.error("Failed to update device status:", statusError);
        }
        break;

      case "sms_received":
      case "sms_sent":
        // Store SMS in database if needed
        // You can add an sms_messages table or handle differently
        break;

      case "call_logged":
        // Store call log in database if needed
        break;

      case "file_uploaded":
      case "file_deleted":
        // Handle file operations
        break;

      case "contact_synced":
        // Handle contact sync
        break;

      case "screen_update":
        // Handle screen update (for remote control)
        break;

      case "device_sync":
        // Update last_sync timestamp
        const { error: syncError } = await supabase
          .from("devices")
          .update({
            last_sync: timestamp || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", device_id);

        if (syncError) {
          console.error("Failed to update device sync:", syncError);
        }
        break;

      case "command_result":
        // Command result from device - already handled by socket events
        break;

      case "device_info":
        // Device info update - update device info in database
        if (data) {
          const { error: infoError } = await supabase
            .from("devices")
            .update({
              model: data.model || undefined,
              name: data.name || undefined,
              updated_at: new Date().toISOString(),
            })
            .eq("id", device_id);

          if (infoError) {
            console.error("Failed to update device info:", infoError);
          }
        }
        break;

      case "swipe_detected":
      case "gesture_detected":
        // Swipe/gesture detection events - log for activity tracking
        // You can optionally store these in a device_activity table
        console.log(`👆 ${eventType} on device ${device_id}:`, {
          direction: data?.direction,
          distance: data?.distance,
          duration: data?.duration,
        });
        break;

      case "click_detected":
        // Click/tap detection events - log for activity tracking
        console.log(`👆 click_detected on device ${device_id}:`, {
          x: data?.x,
          y: data?.y,
          duration: data?.duration,
          source: data?.source,
        });
        break;

      case "screen_result":
        // Screen capture result - log for activity tracking
        console.log(`📺 screen_result on device ${device_id}:`, {
          hasImage: !!data?.image || !!data?.data,
          width: data?.width,
          height: data?.height,
          format: data?.format,
        });
        break;

      default:
        console.log(`Unhandled event type: ${eventType}`);
    }

    // Broadcast event to connected clients via Socket.IO
    const io = getSocketIO();
    if (io) {
      // Emit to all clients listening to this device
      io.to(`device:${device_id}`).emit("device_event", event);
      
      // Also emit to user-specific room if user_id is provided
      if (user_id) {
        io.to(`user:${user_id}`).emit("device_event", event);
      }

      // Emit to a general device events channel
      io.emit("device_events", event);
    }

    // Log the webhook event
    console.log(`Webhook received: ${eventType} for device ${device_id}`, {
      timestamp,
      data,
    });

    return NextResponse.json({
      success: true,
      message: "Webhook event processed",
      event: eventType,
    });
  } catch (error) {
    return createErrorResponse(error, "Failed to process webhook event");
  }
}

// GET endpoint for webhook verification (optional)
export async function GET(request: Request) {
  try {
    const deviceClients = getDeviceClients();
    const connectedDevices = deviceClients ? Array.from(deviceClients.keys()) : [];

    return NextResponse.json({
      message: "Webhook endpoint is active",
      timestamp: new Date().toISOString(),
      connectedDevices: connectedDevices.length,
      devices: connectedDevices,
    });
  } catch (error) {
    return createErrorResponse(error, "Failed to fetch webhook status");
  }
}
