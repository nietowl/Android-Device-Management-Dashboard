"use client";

import { useEffect, useState } from "react";
import { checkSocketServerHealth } from "@/lib/utils/socket-connection";

interface SocketStatusProps {
  serverUrl?: string;
  showDetails?: boolean;
}

/**
 * Component to display socket server connection status
 */
export function SocketStatus({ serverUrl, showDetails = false }: SocketStatusProps) {
  const [isHealthy, setIsHealthy] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

  useEffect(() => {
    let mounted = true;
    
    const checkHealth = async () => {
      setIsChecking(true);
      const healthy = await checkSocketServerHealth(serverUrl);
      if (mounted) {
        setIsHealthy(healthy);
        setIsChecking(false);
        setLastCheck(new Date());
      }
    };

    // Initial check
    checkHealth();

    // Check every 30 seconds
    const interval = setInterval(checkHealth, 30000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [serverUrl]);

  if (!showDetails && isHealthy) {
    return null; // Don't show anything if healthy and details not requested
  }

  return (
    <div className="text-sm">
      {isChecking ? (
        <span className="text-gray-500">Checking connection...</span>
      ) : isHealthy ? (
        <span className="text-green-600">✅ Device server connected</span>
      ) : (
        <div className="text-amber-600">
          <span>⚠️ Device server unavailable</span>
          {showDetails && (
            <div className="mt-1 text-xs">
              <p>Run: <code className="bg-gray-100 px-1 rounded">npm run dev:device</code></p>
              {lastCheck && (
                <p className="text-gray-500">Last checked: {lastCheck.toLocaleTimeString()}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

