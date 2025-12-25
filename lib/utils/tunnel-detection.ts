/**
 * Utility functions for detecting and handling tunnel URLs
 */

/**
 * Gets the appropriate device server URL based on current access method
 * - If accessing locally (localhost/127.0.0.1), returns localhost:9211
 * - If accessing externally (tunnel), returns the configured tunnel URL
 * 
 * IMPORTANT: When accessing externally, the device-server.js must be exposed
 * through a tunnel on port 9211. Set NEXT_PUBLIC_DEVICE_SERVER_URL in .env.local
 * to your device server tunnel URL (e.g., https://kuchbhi.localto.net:9211)
 */
export function getDeviceServerUrl(): string {
  if (typeof window !== 'undefined') {
    const currentOrigin = window.location.origin;
    const isLocalAccess = currentOrigin.includes('localhost') || 
                         currentOrigin.includes('127.0.0.1') ||
                         currentOrigin.includes('0.0.0.0');
    
    if (isLocalAccess) {
      // When accessing locally, always use localhost device server
      return "http://localhost:9211";
    }
    
    // When accessing externally (via tunnel), we need the tunnel URL for device server
    const tunnelUrl = process.env.NEXT_PUBLIC_DEVICE_SERVER_URL;
    
    if (!tunnelUrl || tunnelUrl.includes('localhost') || tunnelUrl.includes('127.0.0.1')) {
      // If no tunnel URL is configured, try to construct it from current origin
      // This assumes the device server is on the same tunnel domain but port 9211
      try {
        const url = new URL(currentOrigin);
        const deviceServerTunnelUrl = `${url.protocol}//${url.hostname}:9211`;
        console.warn(`⚠️ [Device Server] No tunnel URL configured for device server`);
        console.warn(`   Current origin: ${currentOrigin}`);
        console.warn(`   Attempting to use: ${deviceServerTunnelUrl}`);
        console.warn(`   ⚠️ IMPORTANT: Make sure device-server.js is exposed through tunnel on port 9211`);
        console.warn(`   Set NEXT_PUBLIC_DEVICE_SERVER_URL in .env.local to your device server tunnel URL`);
        return deviceServerTunnelUrl;
      } catch (e) {
        console.error(`❌ [Device Server] Could not parse current origin: ${currentOrigin}`);
        return "http://localhost:9211";
      }
    }
    
    return tunnelUrl;
  }
  // Server-side fallback
  return process.env.NEXT_PUBLIC_DEVICE_SERVER_URL || "http://localhost:9211";
}

/**
 * Detects if a URL is a tunnel URL (LocalTunnel, ngrok, etc.)
 */
export function isTunnelUrl(url: string): boolean {
  if (!url) return false;
  
  return url.includes('localtonet.com') || 
         url.includes('localto.net') || 
         url.includes('ngrok') || 
         url.includes('localtunnel') ||
         url.includes('tunnel') ||
         url.includes('serveo.net') ||
         url.includes('serveo.com');
}

/**
 * Gets the appropriate Socket.IO transport order for a URL
 * Tunnels often don't support WebSocket upgrades, so polling is preferred
 */
export function getSocketTransports(url: string): string[] {
  if (isTunnelUrl(url)) {
    // For tunnels, use polling first (more reliable), then try websocket
    return ["polling", "websocket"];
  } else {
    // For local/direct connections, prefer websocket first
    return ["websocket", "polling"];
  }
}

/**
 * Gets the appropriate Socket.IO connection timeout for a URL
 * Tunnels may need longer timeouts due to network latency
 */
export function getSocketTimeout(url: string): number {
  return isTunnelUrl(url) ? 30000 : 20000; // 30s for tunnels, 20s for local
}

/**
 * Gets whether to allow WebSocket upgrades for a URL
 * Tunnels often don't support WebSocket upgrades properly
 */
export function shouldAllowUpgrade(url: string): boolean {
  return !isTunnelUrl(url); // Don't upgrade for tunnels
}

