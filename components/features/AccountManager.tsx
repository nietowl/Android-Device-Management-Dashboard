"use client";

import { AndroidDevice, Account } from "@/types";
import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mail, RefreshCw, Loader2 } from "lucide-react";
import { io, Socket } from "socket.io-client";

const DEVICE_SERVER_URL = process.env.NEXT_PUBLIC_DEVICE_SERVER_URL || "http://localhost:9211";

interface AccountManagerProps {
  device: AndroidDevice;
}

export default function AccountManager({ device }: AccountManagerProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Load accounts from device
  const loadAccounts = () => {
    if (!socketRef.current || !socketRef.current.connected) {
      console.warn("Socket not connected, retrying...");
      setTimeout(() => loadAccounts(), 1000);
      return;
    }

    setLoading(true);
    setError(null);
    
    console.log(`📤 [AccountManager] Sending getaccount command`);
    
    socketRef.current.emit("send-command", {
      deviceId: device.id,
      command: "getaccount",
    });
  };

  // Setup Socket.IO connection
  useEffect(() => {
    console.log(`🔌 [AccountManager] Setting up socket for device: ${device.id}`);
    
    const socket = io(DEVICE_SERVER_URL, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("✅ AccountManager connected to device-server.js");
      if (device.status === "online") {
        loadAccounts();
      }
    });

    socket.on("disconnect", () => {
      console.log("❌ AccountManager disconnected from device-server.js");
    });

    socket.on("connect_error", (err) => {
      console.error("❌ AccountManager connection error:", err);
      setError("Failed to connect to device server");
    });

    // Clean up previous listeners
    socket.off("device_event");
    socket.off("command-error");
    socket.off("command-sent");

    // Listen for account-result events
    socket.on("device_event", (event: any) => {
      console.log("📥 [AccountManager] Received device_event:", event);
      console.log("📥 [AccountManager] Event type:", event.event);
      console.log("📥 [AccountManager] Device ID:", event.device_id);
      console.log("📥 [AccountManager] Expected device ID:", device.id);
      console.log("📥 [AccountManager] Device ID match?", event.device_id === device.id);
      
      if (event.device_id !== device.id) {
        console.log("⏭️ [AccountManager] Skipping event - device ID mismatch");
        return;
      }

      // Handle account-result
      if (event.event === "account_result" && event.data) {
        console.log("📧 [AccountManager] Processing account-result:", event);
        console.log("📧 [AccountManager] Event data:", event.data);
        
        try {
          const accountData = event.data;
          
          // Handle the data structure: { uuid, accounts: [...], total, timestamp }
          let accountsArray: any[] = [];
          
          if (accountData.accounts && Array.isArray(accountData.accounts)) {
            // Format: { accounts: [...], total, timestamp, uuid }
            accountsArray = accountData.accounts;
            console.log("✅ [AccountManager] Using accounts array, count:", accountsArray.length);
          } else if (Array.isArray(accountData)) {
            // Direct array format: [...]
            accountsArray = accountData;
            console.log("✅ [AccountManager] Using direct array format, count:", accountsArray.length);
          } else if (accountData.data && Array.isArray(accountData.data)) {
            // Alternative format: { data: [...] }
            accountsArray = accountData.data;
            console.log("✅ [AccountManager] Using data array, count:", accountsArray.length);
          } else if (accountData.items && Array.isArray(accountData.items)) {
            // Alternative format: { items: [...] }
            accountsArray = accountData.items;
            console.log("✅ [AccountManager] Using items array, count:", accountsArray.length);
          } else if (typeof accountData === "object" && accountData !== null) {
            // Single object - wrap it in an array
            console.log("⚠️ [AccountManager] Single object detected, wrapping in array");
            accountsArray = [accountData];
          } else {
            console.warn("⚠️ [AccountManager] Unexpected account data format:", accountData);
            setAccounts([]);
            setLoading(false);
            setError("Unexpected data format received");
            return;
          }
          
          console.log("📊 [AccountManager] Processing", accountsArray.length, "accounts");
          
          // Transform the data to Account format - preserve all fields
          const transformedAccounts: Account[] = accountsArray.map((account: any, index: number) => {
            const transformed = {
              id: String(account.id || account.name || `account-${index}`),
              device_id: device.id,
              name: account.name || account.account_name || account.email || "Unknown Account",
              type: account.type || account.account_type || "unknown",
              app_name: account.app_name || "",
              icon: account.icon || "",
              email: account.email || account.name || "",
              // Include all other fields from the account object
              ...account,
            };
            return transformed;
          });
          
          console.log("✅ [AccountManager] Successfully transformed", transformedAccounts.length, "accounts");
          setAccounts(transformedAccounts);
          setLoading(false);
          setError(null);
        } catch (err: any) {
          console.error("❌ [AccountManager] Error processing account-result:", err);
          setError(`Failed to process accounts: ${err.message}`);
          setLoading(false);
        }
      } else {
        console.log("⚠️ [AccountManager] Event received but not account_result:", event.event);
      }
    });

    socket.on("command-error", (error: any) => {
      if (error.deviceId === device.id) {
        console.error("❌ [AccountManager] Command error:", error);
        setError(error.error || "Failed to send command");
        setLoading(false);
      }
    });

    socket.on("command-sent", (data: any) => {
      if (data.deviceId === device.id && data.command === "getaccount") {
        console.log("✅ [AccountManager] Command sent, waiting for response...");
      }
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.off("device_event");
        socketRef.current.off("command-error");
        socketRef.current.off("command-sent");
        socketRef.current.disconnect();
      }
    };
  }, [device.id, DEVICE_SERVER_URL]);

  // Load accounts when device comes online
  useEffect(() => {
    if (device.status === "online" && socketRef.current?.connected) {
      setAccounts([]);
      loadAccounts();
    }
  }, [device.id, device.status]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Mails</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={loadAccounts}
          disabled={loading || device.status !== "online"}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Loading...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </>
          )}
        </Button>
      </div>

      {error && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      <Card className="border-0 shadow-none bg-card/50">
        <CardHeader>
          <CardTitle>Device Mails</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && accounts.length === 0 ? (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading mails...</p>
            </div>
          ) : accounts.length === 0 && !loading ? (
            <div className="text-center py-8 text-muted-foreground">No mails found</div>
          ) : (
            <div className="space-y-2">
              {accounts.map((account) => {
                // Handle base64 icon
                const iconSrc = account.icon 
                  ? (account.icon.startsWith('data:image') 
                      ? account.icon 
                      : `data:image/png;base64,${account.icon}`)
                  : null;
                
                return (
                  <div
                    key={account.id}
                    className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="flex-shrink-0">
                        {iconSrc ? (
                          <img 
                            src={iconSrc} 
                            alt={account.app_name || account.name}
                            className="h-10 w-10 rounded object-cover"
                            onError={(e) => {
                              // Fallback to icon if image fails to load
                              e.currentTarget.style.display = 'none';
                              e.currentTarget.nextElementSibling?.classList.remove('hidden');
                            }}
                          />
                        ) : null}
                        <Mail className={`h-5 w-5 text-muted-foreground ${iconSrc ? 'hidden' : ''}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{account.name}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {account.app_name && (
                            <span className="text-xs text-muted-foreground">
                              {account.app_name}
                            </span>
                          )}
                          <Badge variant="secondary" className="text-xs">
                            {account.type}
                          </Badge>
                          {account.email && account.email !== account.name && (
                            <>
                              <span className="text-xs text-muted-foreground">•</span>
                              <span className="text-xs text-muted-foreground truncate">
                                {account.email}
                              </span>
                            </>
                          )}
                        </div>
                        {/* Show ID */}
                        <div className="mt-1">
                          <span className="text-xs text-muted-foreground font-mono">
                            ID: {account.id}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

