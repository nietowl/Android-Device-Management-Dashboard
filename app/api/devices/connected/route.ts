import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createErrorResponse, ApiErrors } from "@/lib/api/error-handler";

// Get socket.io functions from server
function getSocketFunctions() {
  if (typeof global !== "undefined") {
    try {
      const socketModule = require("@/lib/socket/server.js");
      return socketModule;
    } catch (error) {
      console.error("Error loading socket module:", error);
      return null;
    }
  }
  return null;
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      throw ApiErrors.unauthorized();
    }

    const socketFunctions = getSocketFunctions();
    if (socketFunctions) {
      const { getAllDevices } = socketFunctions;
      const devices = getAllDevices();

      return NextResponse.json({
        connectedDevices: devices.length,
        devices: devices.map((d: any) => ({
          uuid: d.uuid,
          isOnline: d.isOnline,
          info: d.info,
        })),
      });
    }

    return NextResponse.json({
      connectedDevices: 0,
      devices: [],
      message: "Socket.IO not initialized",
    });
  } catch (error) {
    return createErrorResponse(error, "Failed to fetch connected devices");
  }
}

