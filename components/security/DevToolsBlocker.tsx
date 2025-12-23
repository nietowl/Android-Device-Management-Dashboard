"use client";

import { useEffect } from "react";
import { disableDevTools } from "@/lib/utils/disable-devtools";

/**
 * DevTools Blocker Component
 * Silently disables developer tools in production mode
 * No UI elements, no messages, completely invisible
 */
export default function DevToolsBlocker() {
  useEffect(() => {
    // Only disable in production - completely silent
    if (process.env.NODE_ENV === "production") {
      try {
        disableDevTools();
      } catch (e) {
        // Silently fail - don't show any errors
      }
    }
  }, []);

  // Render nothing - completely invisible
  return null;
}

