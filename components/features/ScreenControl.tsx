"use client";

import { AndroidDevice } from "@/types";
import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Monitor, Power, RotateCcw, Loader2, X, Maximize2, Minimize2, Eye, ArrowLeft, Home, Lock, Volume2, Volume1, GripVertical, ArrowUp, ArrowDown, ArrowRight, Mic, MicOff, Unlock, Send } from "lucide-react";
import { io, Socket } from "socket.io-client";
import { useLicenseId } from "@/lib/utils/use-license-id";
import { proxyDeviceCommand } from "@/lib/utils/api-proxy";

interface ScreenControlProps {
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

export default function ScreenControl({ device, showContent = true, onViewSelect, triggerOpen = 0 }: ScreenControlProps) {
  const licenseId = useLicenseId();
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
  const [screenImageData, setScreenImageData] = useState<string | null>(null);
  const [screenImageDimensions, setScreenImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const resizeStartRef = useRef<{ width: number; x: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const titleBarRef = useRef<HTMLDivElement>(null);
  const resizeHandleRef = useRef<HTMLDivElement>(null);
  const previousImageRef = useRef<HTMLImageElement | null>(null);
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const lastTriggerRef = useRef<number>(0);
  const hasAutoConnectedRef = useRef<boolean>(false);
  const [isAutoConnecting, setIsAutoConnecting] = useState(false);
  const isScreenOpenRef = useRef<boolean>(false); // Track if screen is already open
  
  // Control panel state
  const [showArrowKeys, setShowArrowKeys] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [blockScreenEnabled, setBlockScreenEnabled] = useState(false);
  
  // Swipe detection state
  const swipeStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const isSwipeActiveRef = useRef(false);

  // Device server URL - automatically detects local vs external access
  const getDeviceServerUrl = () => {
    if (typeof window !== 'undefined') {
      const currentOrigin = window.location.origin;
      const isLocalAccess = currentOrigin.includes('localhost') || 
                           currentOrigin.includes('127.0.0.1') ||
                           currentOrigin.includes('0.0.0.0');
      
      if (isLocalAccess) {
        // When accessing locally, always use localhost device server
        return "http://localhost:9211";
      }
      
      // When accessing externally (via tunnel), we need to use the tunnel URL for device server
      const tunnelUrl = process.env.NEXT_PUBLIC_DEVICE_SERVER_URL;
      
      if (!tunnelUrl || tunnelUrl.includes('localhost') || tunnelUrl.includes('127.0.0.1')) {
        // If no tunnel URL is configured, try to construct it from current origin
        const url = new URL(currentOrigin);
        const deviceServerTunnelUrl = `${url.protocol}//${url.hostname}:9211`;
        console.warn(`⚠️ [ScreenControl] No tunnel URL configured, using: ${deviceServerTunnelUrl}`);
        return deviceServerTunnelUrl;
      }
      
      return tunnelUrl;
    }
    return process.env.NEXT_PUBLIC_DEVICE_SERVER_URL || "http://localhost:9211";
  };
  
  const DEVICE_SERVER_URL = getDeviceServerUrl();
  
  // Detect if using tunnel - tunnels often don't support WebSocket, so prefer polling
  const isTunnel = DEVICE_SERVER_URL.includes('localtonet.com') || 
                   DEVICE_SERVER_URL.includes('localto.net') || 
                   DEVICE_SERVER_URL.includes('ngrok') || 
                   DEVICE_SERVER_URL.includes('localtunnel') ||
                   DEVICE_SERVER_URL.includes('tunnel');
  
  // Get appropriate socket configuration for tunnel vs local
  // For tunnels, use polling first (more reliable), then try websocket
  // For local connections, prefer websocket first
  const socketTransports = isTunnel ? ["polling", "websocket"] : ["websocket", "polling"];
  const socketTimeout = isTunnel ? 30000 : 20000; // Longer timeout for tunnels
  const allowUpgrade = !isTunnel; // Don't upgrade to websocket for tunnels


  useEffect(() => {
    setMounted(true);
    // Don't auto-open on mount - only open when button is clicked
  }, []);

  // Automatically open popup when triggerOpen changes (when Screen Control button is clicked)
  useEffect(() => {
    // Only open if triggerOpen is a new value (increased) and popup is not already open
    if (triggerOpen > 0 && triggerOpen !== lastTriggerRef.current && !isPopupOpen) {
      lastTriggerRef.current = triggerOpen;
      setIsPopupOpen(true);
      setIsMinimized(false);
      hasAutoConnectedRef.current = false; // Reset auto-connect flag when opening
      // Center the popup on screen
      setPosition({
        x: Math.max(0, (window.innerWidth - 600) / 2),
        y: Math.max(0, (window.innerHeight - 600) / 2),
      });
    }
  }, [triggerOpen, isPopupOpen]);

  // Auto-connect when popup opens - set connected immediately to show content, then connect in background
  useEffect(() => {
    if (isPopupOpen && !hasAutoConnectedRef.current) {
      // Immediately set connected to show content area (no waiting window)
      setIsConnected(true);
      hasAutoConnectedRef.current = true;
      setIsAutoConnecting(false);
      
      // Wait a bit to see if data is already coming before sending connect command
      const timer = setTimeout(() => {
        // Check if screen is already open - don't send duplicate command
        if (isScreenOpenRef.current) {
          console.log("🔌 [ScreenControl] Screen is already open, skipping connect command");
          return;
        }
        
        // Send start-screen command via socket to device-server (silently in background)
        if (socketRef.current && socketRef.current.connected) {
          console.log(`📤 [ScreenControl] Sending start-screen command to device: ${device.id}`);
          
          socketRef.current.emit("send-command", {
            deviceId: device.id,
            command: "access-command",
            param: "start-screen",
            payload: {},
          });
          
          isScreenOpenRef.current = true; // Mark screen as open
          console.log("✅ [ScreenControl] start-screen command sent via socket");
        } else {
          console.log("🔌 [ScreenControl] Socket not connected yet, will retry when socket connects");
        }
      }, 500); // Reduced delay - just a small buffer to check if data is already coming
      
      return () => {
        clearTimeout(timer);
      };
    }
  }, [isPopupOpen, device.id]);

  // Setup Socket.IO connection for receiving screen-result events
  useEffect(() => {
    if (!isPopupOpen) return;
    
    console.log(`🔌 [ScreenControl] Setting up socket for device: ${device.id}`);
    
    if (!socketRef.current) {
      console.log(`🔌 [ScreenControl] Creating socket connection`);
      console.log(`   URL: ${DEVICE_SERVER_URL}`);
      console.log(`   Tunnel detected: ${isTunnel ? 'Yes (using polling first)' : 'No (using websocket first)'}`);
      console.log(`   Transports: ${socketTransports.join(", ")}`);
      console.log(`   Timeout: ${socketTimeout}ms`);
      console.log(`   Allow upgrade: ${allowUpgrade}`);
      
      const socket = io(DEVICE_SERVER_URL, {
        path: "/socket.io", // Match device-server.js path
        transports: socketTransports, // Use appropriate transport order for tunnel vs local
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: Infinity,
        timeout: socketTimeout, // Longer timeout for tunnels
        upgrade: allowUpgrade, // Don't upgrade to websocket for tunnels
      });

      socket.on("connect", () => {
        console.log("✅ [ScreenControl] Socket connected");
      });

      socket.on("device_event", (event: any) => {
        console.log("📨 [ScreenControl] Received device event:", event.event, "for device:", event.device_id);
        
        if (event.event === "screen_result" && event.device_id === device.id) {
          console.log("📺 [ScreenControl] Screen result received, data keys:", Object.keys(event.data || {}));
          console.log("📺 [ScreenControl] Full event data:", event.data);
          
          // If we receive data, mark as connected and cancel auto-connect
          if (!isConnected) {
            console.log("✅ [ScreenControl] Data is already streaming, marking as connected");
            setIsConnected(true);
            setIsLoading(false);
            hasAutoConnectedRef.current = true; // Prevent auto-connect from triggering
            isScreenOpenRef.current = true; // Mark screen as already open
          }
          
          try {
            // Extract image data from event - check all possible fields
            let imageData = event.data?.image_data || event.data?.image || event.data?.data;
            const width = event.data?.wmob || event.data?.width || 720;
            const height = event.data?.hmob || event.data?.height || 1232;
            const format = event.data?.frmt || event.data?.format || 'webp';
            
            console.log("📺 [ScreenControl] Extracted data:", {
              hasImageData: !!imageData,
              imageDataLength: imageData?.length,
              imageDataPreview: imageData?.substring(0, 50),
              width,
              height,
              format
            });
            
            if (imageData) {
              // Normalize format to lowercase and handle webp
              const normalizedFormat = format?.toLowerCase() || 'webp';
              
              console.log("🔧 [ScreenControl] Processing image data:", {
                originalLength: imageData.length,
                originalPreview: imageData.substring(0, 50),
                originalFirstChar: imageData[0],
                originalType: typeof imageData,
                startsWithData: imageData.startsWith('data:'),
                format: normalizedFormat,
                rawFormat: format
              });
              
              // CRITICAL FIX: Restore leading slash BEFORE any processing if missing
              // JPEG base64 MUST start with /9j/ (encodes FF D8 FF JPEG header)
              // This must happen first, before any trimming or cleaning
              const trimmedData = imageData.trim();
              const needsSlashFix = !imageData.startsWith('data:') && 
                                    !trimmedData.startsWith('/') && 
                                    trimmedData.startsWith('9j/');
              
              console.log("🔍 [ScreenControl] Early fix check:", {
                startsWithData: imageData.startsWith('data:'),
                startsWithSlash: trimmedData.startsWith('/'),
                startsWith9j: trimmedData.startsWith('9j/'),
                needsSlashFix,
                firstChars: trimmedData.substring(0, 5)
              });
              
              if (needsSlashFix) {
                console.log("⚠️ [ScreenControl] EARLY FIX: Missing leading slash detected, restoring BEFORE processing...");
                imageData = '/' + trimmedData;
                console.log("✅ [ScreenControl] Fixed imageData, now starts with:", imageData.substring(0, 5));
              }
              
              let base64Image = imageData;
              
              // Check if it already has data URI prefix
              if (!imageData.startsWith('data:')) {
                // Handle escaped characters (like \/ -> /) - common in JSON strings
                let cleanData = imageData.trim();
                
                console.log("🔧 [ScreenControl] Before cleaning:", {
                  length: cleanData.length,
                  preview: cleanData.substring(0, 50),
                  firstChar: cleanData[0],
                  first3Chars: cleanData.substring(0, 3),
                  startsWithSlash: cleanData.startsWith('/'),
                  startsWith9j: cleanData.startsWith('9j/')
                });
                
                // REMOVED: Don't handle escaped forward slashes (\/) - base64 data should have raw /
                // The leading / in /9j/ is valid base64 and should NOT be escaped
                // Only handle other escape sequences that might corrupt the data
                cleanData = cleanData.replace(/\\n/g, '\n');
                cleanData = cleanData.replace(/\\r/g, '\r');
                cleanData = cleanData.replace(/\\t/g, '\t');
                
                // Remove any quotes that might wrap the base64 string
                cleanData = cleanData.replace(/^["']+|["']+$/g, '');
                
                // Remove any whitespace or non-base64 characters at the very start/end
                // But preserve valid base64 characters including /, +, = (for padding)
                // Base64 characters: A-Z, a-z, 0-9, +, /, = (for padding)
                // Only trim non-base64 characters, not valid ones like /
                cleanData = cleanData.replace(/^[\s\n\r\t"']+|[\s\n\r\t"']+$/g, '');
                
                // CRITICAL FIX: Restore leading slash if missing (common issue with JPEG base64)
                // JPEG base64 starts with /9j/ which encodes FF D8 FF (JPEG header)
                // Check multiple patterns to catch all cases
                const needsSlashAfterClean = !cleanData.startsWith('/') && 
                                            (cleanData.startsWith('9j/') || 
                                             cleanData.match(/^9j\//) ||
                                             cleanData.substring(0, 3) === '9j/');
                
                if (needsSlashAfterClean) {
                  console.log("⚠️ [ScreenControl] Missing leading slash detected AFTER cleaning, restoring...");
                  console.log("🔍 [ScreenControl] Before fix:", cleanData.substring(0, 10));
                  cleanData = '/' + cleanData;
                  console.log("✅ [ScreenControl] After fix:", cleanData.substring(0, 10));
                }
                
                // Validate base64 format
                const isValidBase64 = /^[A-Za-z0-9+/=]+$/.test(cleanData);
                const base64Length = cleanData.length;
                const expectedLength = Math.ceil(base64Length / 4) * 4; // Base64 should be multiple of 4
                
                console.log("🔧 [ScreenControl] After cleaning:", {
                  length: cleanData.length,
                  preview: cleanData.substring(0, 50),
                  firstChar: cleanData[0],
                  first3Chars: cleanData.substring(0, 3),
                  isValidBase64Start: /^[A-Za-z0-9+\/]/.test(cleanData),
                  isValidBase64,
                  base64Length,
                  expectedLength,
                  lengthMod4: base64Length % 4,
                  startsWithSlash: cleanData.startsWith('/')
                });
                
                // Detect format from base64 signature if format is not provided
                let detectedFormat = normalizedFormat;
                if (cleanData.startsWith('/9j/')) {
                  detectedFormat = 'jpeg';
                  console.log("🔍 [ScreenControl] Detected JPEG format from base64 signature");
                } else if (cleanData.startsWith('iVBORw0KGgo')) {
                  detectedFormat = 'png';
                  console.log("🔍 [ScreenControl] Detected PNG format from base64 signature");
                } else if (cleanData.startsWith('UklGR')) {
                  detectedFormat = 'webp';
                  console.log("🔍 [ScreenControl] Detected WebP format from base64 signature");
                }
                
                // Create data URI with proper MIME type
                // WebP: data:image/webp;base64,...
                // JPEG: data:image/jpeg;base64,...
                const mimeType = detectedFormat === 'webp' ? 'webp' : 
                                detectedFormat === 'jpeg' || detectedFormat === 'jpg' ? 'jpeg' :
                                detectedFormat === 'png' ? 'png' : 'jpeg'; // Default to jpeg if unknown
                
                base64Image = `data:image/${mimeType};base64,${cleanData}`;
                
                console.log("🔧 [ScreenControl] Final data URI:", {
                  mimeType,
                  detectedFormat,
                  dataUriPreview: base64Image.substring(0, 50),
                  dataUriLength: base64Image.length
                });
              } else {
                // Even if it has data: prefix, handle escaped characters in the data part
                const parts = base64Image.split(',');
                if (parts.length > 1) {
                  let cleanData = parts[1];
                  // REMOVED: Don't handle escaped forward slashes (\/) - base64 data should have raw /
                  // Only handle other escape sequences
                  cleanData = cleanData.replace(/\\n/g, '\n');
                  cleanData = cleanData.replace(/\\r/g, '\r');
                  cleanData = cleanData.replace(/\\t/g, '\t');
                  // Update MIME type if format changed
                  const mimeType = normalizedFormat === 'webp' ? 'webp' : 
                                  normalizedFormat === 'jpeg' || normalizedFormat === 'jpg' ? 'jpeg' :
                                  normalizedFormat === 'png' ? 'png' : 'jpeg';
                  base64Image = `data:image/${mimeType};base64,${cleanData}`;
                }
              }
              
              // FINAL SAFETY CHECK: Ensure JPEG base64 has leading slash
              // This is a last resort check before setting state
              if (base64Image.includes('base64,') && !base64Image.includes('base64,/') && base64Image.includes('base64,9j/')) {
                console.log("🚨 [ScreenControl] FINAL SAFETY FIX: Detected missing slash in final data URI, fixing...");
                base64Image = base64Image.replace('base64,9j/', 'base64,/9j/');
                console.log("✅ [ScreenControl] Final fix applied, preview:", base64Image.substring(0, 50));
              }
              
              console.log("📺 [ScreenControl] Processed image data:", {
                format: normalizedFormat,
                dataUriLength: base64Image.length,
                dataUriPreview: base64Image.substring(0, 80),
                dataUriStartsWith: base64Image.substring(0, 30),
                hasCorrectSlash: base64Image.includes('base64,/9j/'),
                width,
                height
              });
              
              // Update state immediately
              setScreenImageData(base64Image);
              setScreenImageDimensions({ width, height });
              setIsLoading(false);
              
              console.log("✅ [ScreenControl] State updated with image data");
            } else {
              console.warn("⚠️ [ScreenControl] No image data found in event");
            }
          } catch (error) {
            console.error("❌ [ScreenControl] Error processing screen result:", error);
            setIsLoading(false);
          }
        }
      });

      socket.on("disconnect", () => {
        console.log("❌ [ScreenControl] Socket disconnected");
      });

      socketRef.current = socket;
    }

    return () => {
      // Send minimize command when component unmounts or popup closes
      if (isScreenOpenRef.current && socketRef.current && socketRef.current.connected) {
        console.log(`📤 [ScreenControl] Component unmounting, sending stop-screen command to minimize screen`);
        socketRef.current.emit("send-command", {
          deviceId: device.id,
          command: "access-command",
          param: "stop-screen",
          payload: {},
        });
        isScreenOpenRef.current = false;
      }
      
      if (socketRef.current) {
        console.log("🔌 [ScreenControl] Cleaning up socket");
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [device.id, DEVICE_SERVER_URL, isPopupOpen]);

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

  // Position minimized popup in top right corner of header, side by side horizontally
  useEffect(() => {
    if (isMinimized && isPopupOpen) {
      // Use requestAnimationFrame to ensure DOM is updated
      requestAnimationFrame(() => {
        // Calculate position for top right corner, side by side horizontally
        // Account for admin/theme buttons on the right (~300px width for safety)
        const minimizedWidth = 280; // Width of minimized popup
        const buttonAreaWidth = 300; // Space for admin button + theme toggle + padding (increased for safety)
        const rightOffset = 16; // Offset from right edge
        const topOffset = 8; // Offset from top (slightly below header)
        const horizontalSpacing = 8; // Spacing between side-by-side popups
        
        // Count how many minimized popups exist (including this one)
        // Find all minimized popups in the DOM
        const minimizedPopups = document.querySelectorAll('[data-minimized-popup="true"]');
        const currentIndex = Array.from(minimizedPopups).findIndex(el => 
          el === popupRef.current
        );
        // If current popup not found, count all others and add this one
        const stackIndex = currentIndex >= 0 ? currentIndex : minimizedPopups.length;
        
        // Position side by side horizontally (from right to left)
        // Calculate where button area starts (left edge of button area)
        const buttonAreaStartX = window.innerWidth - buttonAreaWidth;
        // Position each popup: rightmost popup ends just before button area
        // Each subsequent popup is positioned to the left of the previous one
        const newX = buttonAreaStartX - minimizedWidth - (stackIndex * (minimizedWidth + horizontalSpacing));
        const newY = topOffset;
        
        // Ensure popup doesn't go off-screen on the left
        setPosition({ x: Math.max(16, newX), y: newY });
      });
    }
  }, [isMinimized, isPopupOpen]);

  // Handle window resize to keep popup within viewport bounds
  useEffect(() => {
    if (!isPopupOpen || !popupRef.current) return;
    
    let rafId: number | null = null;
    
    const handleResize = () => {
      // Cancel any pending animation frame
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      
      // Use requestAnimationFrame for smooth updates
      rafId = requestAnimationFrame(() => {
        if (!popupRef.current) return;
        
        const rect = popupRef.current.getBoundingClientRect();
        const maxX = window.innerWidth - rect.width;
        const maxY = window.innerHeight - rect.height;
        
        setPosition(prev => ({
          x: Math.max(0, Math.min(prev.x, maxX)),
          y: Math.max(0, Math.min(prev.y, maxY))
        }));
      });
    };
    
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [isPopupOpen]);

  const handleClosePopup = () => {
    console.log("handleClosePopup called, minimizing popup UI only (no device command)");
    
    // Only minimize the popup UI - don't send any commands to the device
    // Keep connection and state intact so user can restore it later
    setIsMinimized(true);
    // Keep isPopupOpen true so the minimized window stays in the DOM
    // Keep isConnected true to maintain socket connection
    // Don't clear state - keep everything for when user reopens
    // Don't navigate back - stay on current view
  };


  const handleConnect = async () => {
    console.log("🔌 [ScreenControl] Connecting...");
    
    if (!socketRef.current || !socketRef.current.connected) {
      console.error("❌ [ScreenControl] Socket not connected");
      setIsLoading(false);
      setIsConnected(false);
      return;
    }

    // Check if screen is already open - don't send duplicate command
    if (isScreenOpenRef.current) {
      console.log("✅ [ScreenControl] Screen is already open, marking as connected without sending command");
      setIsConnected(true);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setIsConnected(true);

    try {
      // Send start-screen command via socket to device-server
      console.log(`📤 [ScreenControl] Sending start-screen command to device: ${device.id}`);
      
      socketRef.current.emit("send-command", {
        deviceId: device.id,
        command: "access-command",
        param: "start-screen",
        payload: {},
      });
      
      isScreenOpenRef.current = true; // Mark screen as open
      console.log("✅ [ScreenControl] start-screen command sent via socket");
      setIsLoading(false);
    } catch (error) {
      console.error("❌ [ScreenControl] Error sending start-screen command:", error);
      setIsLoading(false);
      setIsConnected(false);
    }
  };

  const handleDisconnect = async () => {
    console.log("🔌 [ScreenControl] Disconnecting...");
    
    try {
      // Send stop-screen command via socket to device-server to minimize screen
      if (socketRef.current && socketRef.current.connected && isScreenOpenRef.current) {
        console.log(`📤 [ScreenControl] Sending stop-screen command to minimize screen on device: ${device.id}`);
        
        socketRef.current.emit("send-command", {
          deviceId: device.id,
          command: "access-command",
          param: "stop-screen",
          payload: {},
        });
        
        isScreenOpenRef.current = false; // Mark screen as closed
        console.log("✅ [ScreenControl] stop-screen command sent via socket");
      } else {
        if (!isScreenOpenRef.current) {
          console.log("ℹ️ [ScreenControl] Screen is already closed, skipping stop-screen command");
        } else {
          console.warn("⚠️ [ScreenControl] Socket not connected, skipping stop-screen command");
        }
      }
    } catch (error) {
      console.error("❌ [ScreenControl] Error sending stop-screen command:", error);
    }
    
    // Close popup and clean up
    setIsConnected(false);
    setIsLoading(false);
    setIsAutoConnecting(false);
    setSkeletonData(null);
    setScreenImageData(null);
    setScreenImageDimensions(null);
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
    console.log("🔄 [ScreenControl] Refreshing...");
    
    // Reset states first
    setIsLoading(true);
    setSkeletonData(null);
    setScreenImageData(null);
    setScreenImageDimensions(null);
    
    // Disconnect first, then reconnect
    try {
      // Send stop-screen command first via socket (preferred) or REST API with licenseId
      if (socketRef.current && socketRef.current.connected && isScreenOpenRef.current) {
        socketRef.current.emit("send-command", {
          deviceId: device.id,
          command: "access-command",
          param: "stop-screen",
          payload: {},
        });
        isScreenOpenRef.current = false; // Mark screen as closed
      } else if (licenseId && isScreenOpenRef.current) {
        // Fallback to REST API if socket not available - use proxy
        await proxyDeviceCommand(device.id, {
          cmd: "access-command",
          param: "stop-screen",
        });
        isScreenOpenRef.current = false; // Mark screen as closed
      } else {
        if (process.env.NODE_ENV === 'development') {
          console.log("ℹ️ [ScreenControl] Screen already closed or no connection, skipping stop-screen");
        }
      }
      
      // Wait a bit before reconnecting
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Now reconnect
      await handleConnect();
    } catch (error) {
      console.error("❌ [ScreenControl] Error during refresh:", error);
      setIsLoading(false);
      setIsConnected(false);
    }
  };

  const sendDeviceCommand = async (command: string, payload: any = {}) => {
    if (!socketRef.current) {
      console.error("❌ [ScreenControl] Socket not initialized");
      return;
    }

    if (!socketRef.current.connected) {
      console.error("❌ [ScreenControl] Socket not connected. Current state:", socketRef.current.connected);
      return;
    }

    if (!isConnected) {
      console.error("❌ [ScreenControl] Device not connected");
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

      console.log(`📤 [ScreenControl] Sending command:`, commandData);
      console.log(`📤 [ScreenControl] Command: ${command}, Param: ${param || 'none'}`);
      
      socketRef.current.emit("send-command", commandData);
      
      console.log(`✅ [ScreenControl] Command emitted: ${command}`, { param, payload: restPayload });
    } catch (error) {
      console.error(`❌ [ScreenControl] Error sending command ${command}:`, error);
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
    console.log("🔘 [ScreenControl] Back button clicked");
    if (!socketRef.current || !socketRef.current.connected || !isConnected) {
      console.error("❌ [ScreenControl] Cannot send command - not connected");
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
    console.log("🔘 [ScreenControl] Home button clicked");
    if (!socketRef.current || !socketRef.current.connected || !isConnected) {
      console.error("❌ [ScreenControl] Cannot send command - not connected");
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
    console.log("🔘 [ScreenControl] Recent button clicked");
    if (!socketRef.current || !socketRef.current.connected || !isConnected) {
      console.error("❌ [ScreenControl] Cannot send command - not connected");
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
    console.log("🔘 [ScreenControl] Lock button clicked");
    if (!socketRef.current || !socketRef.current.connected || !isConnected) {
      console.error("❌ [ScreenControl] Cannot send command - not connected");
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
    console.log("🔘 [ScreenControl] Volume Up button clicked");
    if (!socketRef.current || !socketRef.current.connected || !isConnected) {
      console.error("❌ [ScreenControl] Cannot send command - not connected");
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
    console.log("🔘 [ScreenControl] Volume Down button clicked");
    if (!socketRef.current || !socketRef.current.connected || !isConnected) {
      console.error("❌ [ScreenControl] Cannot send command - not connected");
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
    console.log("⬆️ [ScreenControl] Arrow Up pressed");
    if (!socketRef.current || !socketRef.current.connected || !isConnected) return;
    sendDeviceCommand("access-command", {
      param: "btnarrowup",
      payload: { button: "arrow_up", keycode: 19 },
    });
  }, [device.id, isConnected, sendDeviceCommand]);

  const handleArrowDown = useCallback(() => {
    console.log("⬇️ [ScreenControl] Arrow Down pressed");
    if (!socketRef.current || !socketRef.current.connected || !isConnected) return;
    sendDeviceCommand("access-command", {
      param: "btnarrowdown",
      payload: { button: "arrow_down", keycode: 20 },
    });
  }, [device.id, isConnected, sendDeviceCommand]);

  const handleArrowLeft = useCallback(() => {
    console.log("⬅️ [ScreenControl] Arrow Left pressed");
    if (!socketRef.current || !socketRef.current.connected || !isConnected) return;
    sendDeviceCommand("access-command", {
      param: "btnarrowleft",
      payload: { button: "arrow_left", keycode: 21 },
    });
  }, [device.id, isConnected, sendDeviceCommand]);

  const handleArrowRight = useCallback(() => {
    console.log("➡️ [ScreenControl] Arrow Right pressed");
    if (!socketRef.current || !socketRef.current.connected || !isConnected) return;
    sendDeviceCommand("access-command", {
      param: "btnarrowright",
      payload: { button: "arrow_right", keycode: 22 },
    });
  }, [device.id, isConnected, sendDeviceCommand]);

  // Text input handler
  const handleSendText = useCallback(() => {
    if (!textInput.trim()) return;
    console.log("📝 [ScreenControl] Sending text:", textInput);
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
    console.log(`🔇 [ScreenControl] ${newMuteState ? 'Muting' : 'Unmuting'}`);
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
    console.log(`🔐 [ScreenControl] ${newLockState ? 'Locking' : 'Unlocking'}`);
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
    console.log(`🚫 [ScreenControl] ${checked ? 'Enabling' : 'Disabling'} block screen`);
    if (!socketRef.current || !socketRef.current.connected || !isConnected) return;
    sendDeviceCommand("access-command", { param });
  }, [isConnected, sendDeviceCommand]);

  // Convert canvas coordinates to device coordinates
  const canvasToDeviceCoords = useCallback((canvasX: number, canvasY: number) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    
    const canvas = canvasRef.current;
    
    // Get device dimensions from screenImageDimensions or skeletonData
    let deviceWidth = 720;
    let deviceHeight = 1232;
    
    if (screenImageDimensions) {
      deviceWidth = screenImageDimensions.width;
      deviceHeight = screenImageDimensions.height;
    } else if (skeletonData) {
      deviceWidth = skeletonData.device_width || 1080;
      deviceHeight = skeletonData.device_height || 2400;
    }
    
    // Calculate UI chrome dimensions (EXACT same as in render logic)
    const statusBarHeight = Math.round(canvas.height * 0.04);
    const navBarHeight = Math.round(canvas.height * 0.06);
    const screenStartY = statusBarHeight;
    const screenHeight = canvas.height - statusBarHeight - navBarHeight;
    
    // Canvas is now EXACT device resolution, so coordinates are 1:1 mapping
    // Canvas coordinates ARE device coordinates directly
    const scaleX = 1; // 1:1 pixel mapping
    const scaleY = 1; // 1:1 pixel mapping
    
    let deviceX: number;
    let deviceY: number;
    
    if (screenImageData) {
      // Canvas is exactly device resolution, so canvas coordinates = device coordinates
      // Just clamp to device bounds
      deviceX = Math.max(0, Math.min(Math.round(canvasX), deviceWidth - 1));
      deviceY = Math.max(0, Math.min(Math.round(canvasY), deviceHeight - 1));
    } else {
      // For skeleton: canvas is device resolution, so 1:1 mapping
      deviceX = Math.max(0, Math.min(Math.round(canvasX), deviceWidth - 1));
      deviceY = Math.max(0, Math.min(Math.round(canvasY - screenStartY), deviceHeight - 1));
    }
    
    // Clamp to device bounds
    return { 
      x: Math.max(0, Math.min(deviceX, deviceWidth - 1)), 
      y: Math.max(0, Math.min(deviceY, deviceHeight - 1)) 
    };
  }, [skeletonData, screenImageDimensions, screenImageData]);

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
    
    console.log(`👆 [ScreenControl] Swipe detected: ${direction}`, {
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
    
    console.log(`👆 [ScreenControl] Click detected:`, {
      at: `(${x}, ${y})`,
      duration,
    });
  }, [device.id]);

  // Handle canvas touch/mouse start
  const handleCanvasStart = useCallback((clientX: number, clientY: number) => {
    if (!canvasRef.current || !isConnected) return;
    
    // Allow swipe detection when either screenImageData or skeletonData is available
    if (!screenImageData && !skeletonData) return;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    // Account for CSS scaling - convert CSS display coordinates to canvas pixel coordinates
    // This is critical when canvas is displayed at a different size than its resolution
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
    
    console.log("👆 [ScreenControl] Swipe start:", { 
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
  }, [isConnected, skeletonData, screenImageData]);

  // Handle canvas touch/mouse end (complete swipe)
  const handleCanvasEnd = useCallback((clientX: number, clientY: number) => {
    if (!canvasRef.current || !isConnected || !swipeStartRef.current) {
      isSwipeActiveRef.current = false;
      swipeStartRef.current = null;
      return;
    }
    
    // Allow swipe detection when either screenImageData or skeletonData is available
    if (!screenImageData && !skeletonData) {
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
    
    console.log("👆 [ScreenControl] Swipe end:", {
      canvasStart: { x: start.x, y: start.y },
      canvasEnd: { x: validEndCanvasX, y: validEndCanvasY },
      deviceStart: finalDeviceStart,
      deviceEnd: finalDeviceEnd,
      distance,
      duration
    });
    
    if (distance <= CLICK_THRESHOLD) {
      // It's a click/tap
      console.log("👆 [ScreenControl] Detected as click");
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
      
      console.log("👆 [ScreenControl] Detected as swipe");
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
  }, [isConnected, skeletonData, screenImageData, canvasToDeviceCoords, emitSwipeDetected, emitClickDetected, sendDeviceCommand]);

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

  // Render screen image on canvas - Anti-flicker optimized
  useEffect(() => {
    console.log("🖼️ [ScreenControl] Render effect triggered:", {
      hasScreenImageData: !!screenImageData,
      hasCanvas: !!canvasRef.current,
      isConnected,
      hasDimensions: !!screenImageDimensions,
      dimensions: screenImageDimensions
    });

    if (!screenImageData || !canvasRef.current || !isConnected || !screenImageDimensions) {
      console.log("⏸️ [ScreenControl] Skipping render - missing requirements");
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      console.error("❌ [ScreenControl] Canvas ref is null");
      return;
    }

    console.log("🖼️ [ScreenControl] Canvas found, starting render process");

    // Get device dimensions from screen image - use EXACT device resolution
    const deviceWidth = screenImageDimensions.width || 720;
    const deviceHeight = screenImageDimensions.height || 1232;
    
    // Use EXACT device resolution for canvas
    const canvasWidth = deviceWidth;
    const canvasHeight = deviceHeight;
    
    // Calculate display scale to fit within phoneWidth container
    const maxDisplayWidth = phoneWidth - 12;
    const displayScale = Math.min(1, maxDisplayWidth / deviceWidth);
    const displayWidth = deviceWidth * displayScale;
    const displayHeight = deviceHeight * displayScale;
    
    // Store screen height for container div (display size)
    setScreenHeight(displayHeight);
    
    // Set canvas dimensions to EXACT device resolution
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    // Set CSS size for display (scaled down if needed to fit container)
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;

    // Pre-calculate UI dimensions
    const statusBarHeight = Math.round(canvasHeight * 0.04);
    const navBarHeight = Math.round(canvasHeight * 0.06);
    const screenStartY = statusBarHeight;
    const screenHeight = canvasHeight - statusBarHeight - navBarHeight;
    
    // Draw function - reusable for both previous and new image
    const drawImageToCanvas = (img: HTMLImageElement, currentCtx: CanvasRenderingContext2D) => {
      console.log("🎨 [ScreenControl] drawImageToCanvas called:", {
        imgWidth: img.width,
        imgHeight: img.height,
        imgComplete: img.complete,
        canvasWidth,
        canvasHeight,
        screenHeight,
        screenStartY
      });
      
      // Canvas is now EXACT device resolution, so draw image at 1:1 pixel mapping
      // Image should match canvas dimensions exactly
      // Status bar and nav bar will be drawn on top of the image
      const scaleX = 1; // 1:1 pixel mapping
      const scaleY = 1; // 1:1 pixel mapping
      
      // Draw image at exact device resolution (1:1 pixel mapping)
      const scaledWidth = canvasWidth; // Same as device width
      const scaledHeight = canvasHeight; // Same as device height
      const x = 0; // Start at left edge
      const y = 0; // Start at top of canvas (status bar will be drawn on top)
      
      console.log("🎨 [ScreenControl] Image drawing params:", {
        scaleX,
        scaleY,
        scaledWidth,
        scaledHeight,
        x,
        y,
        imgWidth: img.width,
        imgHeight: img.height,
        canvasWidth,
        screenHeight
      });
      
      // Draw image
      try {
        currentCtx.drawImage(img, x, y, scaledWidth, scaledHeight);
        console.log("✅ [ScreenControl] Image drawn to canvas successfully");
      } catch (error) {
        console.error("❌ [ScreenControl] Error in drawImage:", error);
        throw error;
      }
    };
    
    const drawUIChrome = (currentCtx: CanvasRenderingContext2D) => {
      // Draw Android status bar area (top)
      const statusGradient = currentCtx.createLinearGradient(0, 0, 0, statusBarHeight);
      statusGradient.addColorStop(0, "#1a1a1a");
      statusGradient.addColorStop(1, "#0a0a0a");
      currentCtx.fillStyle = statusGradient;
      currentCtx.fillRect(0, 0, canvasWidth, statusBarHeight);
      
      // Draw status bar content
      currentCtx.fillStyle = "#e5e5e5";
      currentCtx.font = `bold ${Math.round(statusBarHeight * 0.5)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      currentCtx.textAlign = "left";
      currentCtx.textBaseline = "middle";
      currentCtx.fillText("9:41", 16, statusBarHeight / 2);
      
      // Battery icon
      const batteryWidth = 24;
      const batteryHeight = 12;
      const batteryX = canvasWidth - batteryWidth - 16;
      const batteryY = (statusBarHeight - batteryHeight) / 2;
      
      currentCtx.strokeStyle = "#e5e5e5";
      currentCtx.lineWidth = 1.5;
      currentCtx.strokeRect(batteryX, batteryY, batteryWidth, batteryHeight);
      currentCtx.fillStyle = "#e5e5e5";
      currentCtx.fillRect(batteryX + batteryWidth, batteryY + 3, 2, batteryHeight - 6);
      
      const batteryGradient = currentCtx.createLinearGradient(batteryX, 0, batteryX + batteryWidth, 0);
      batteryGradient.addColorStop(0, "#4ade80");
      batteryGradient.addColorStop(1, "#22c55e");
      currentCtx.fillStyle = batteryGradient;
      currentCtx.fillRect(batteryX + 2, batteryY + 2, batteryWidth * 0.7, batteryHeight - 4);
      
      // Signal bars
      const signalX = batteryX - 40;
      for (let i = 0; i < 4; i++) {
        const barHeight = 3 + (i * 2);
        const barX = signalX + (i * 5);
        const barY = statusBarHeight / 2 + (12 - barHeight) / 2;
        currentCtx.fillStyle = i < 3 ? "#e5e5e5" : "#4ade80";
        currentCtx.fillRect(barX, barY, 3, barHeight);
      }
      
      // Draw Android navigation bar area (bottom)
      const navBarY = canvasHeight - navBarHeight;
      const navGradient = currentCtx.createLinearGradient(0, navBarY, 0, canvasHeight);
      navGradient.addColorStop(0, "#0a0a0a");
      navGradient.addColorStop(1, "#1a1a1a");
      currentCtx.fillStyle = navGradient;
      currentCtx.fillRect(0, navBarY, canvasWidth, navBarHeight);
      
      // Draw navigation gesture bar
      const gestureBarWidth = 120;
      const gestureBarHeight = 4;
      const gestureBarX = (canvasWidth - gestureBarWidth) / 2;
      const gestureBarY = navBarY + (navBarHeight - gestureBarHeight) / 2;
      
      currentCtx.fillStyle = "#6b7280";
      currentCtx.beginPath();
      if (currentCtx.roundRect) {
        currentCtx.roundRect(gestureBarX, gestureBarY, gestureBarWidth, gestureBarHeight, 2);
      } else {
        currentCtx.fillRect(gestureBarX, gestureBarY, gestureBarWidth, gestureBarHeight);
      }
      currentCtx.fill();
    };
    
    // Draw function that ensures canvas is ready
    const renderImage = (img: HTMLImageElement) => {
      if (!canvas) {
        console.error("❌ [ScreenControl] Canvas is null in renderImage");
        return;
      }
      
      if (!img.complete || img.width === 0 || img.height === 0) {
        console.warn("⚠️ [ScreenControl] Image not ready:", {
          complete: img.complete,
          width: img.width,
          height: img.height
        });
        return;
      }
      
      console.log("🎨 [ScreenControl] Rendering image:", {
        imageSize: { width: img.width, height: img.height },
        canvasSize: { width: canvasWidth, height: canvasHeight }
      });
      
      const currentCtx = canvas.getContext("2d");
      if (!currentCtx) {
        console.error("❌ [ScreenControl] Failed to get context");
        return;
      }
      
      // Ensure canvas dimensions are set
      if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
        console.log("📐 [ScreenControl] Setting canvas dimensions:", { canvasWidth, canvasHeight });
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        canvas.style.width = `${canvasWidth}px`;
        canvas.style.height = `${canvasHeight}px`;
      }
      
      // Clear entire canvas first
      currentCtx.clearRect(0, 0, canvasWidth, canvasHeight);
      
      // Fill background with dark color (will be covered by image)
      currentCtx.fillStyle = "#000000";
      currentCtx.fillRect(0, 0, canvasWidth, canvasHeight);
      
      // Draw the screen image
      try {
        // Verify image is ready before drawing
        if (!img.complete) {
          console.warn("⚠️ [ScreenControl] Image not complete when trying to draw");
          currentCtx.fillStyle = "#ffff00";
          currentCtx.font = "16px Arial";
          currentCtx.fillText("Image not ready", 10, 30);
          return;
        }
        
        if (img.width === 0 || img.height === 0) {
          console.warn("⚠️ [ScreenControl] Image has zero dimensions");
          currentCtx.fillStyle = "#ff8800";
          currentCtx.font = "16px Arial";
          currentCtx.fillText("Image has zero size", 10, 30);
          return;
        }
        
        drawImageToCanvas(img, currentCtx);
        console.log("✅ [ScreenControl] Image drawn successfully");
      } catch (error) {
        console.error("❌ [ScreenControl] Error drawing image:", error);
        // Draw error message on canvas
        currentCtx.fillStyle = "#ff0000";
        currentCtx.font = "16px Arial";
        currentCtx.fillText("Error drawing image", 10, 30);
        currentCtx.fillText(String(error), 10, 50);
      }
      
      // Draw UI chrome on top
      drawUIChrome(currentCtx);
      
      previousImageRef.current = img;
      setIsLoading(false);
      
      console.log("✅ [ScreenControl] Image rendered successfully");
    };
    
    // Check if we have a cached image
    const cachedImg = imageCacheRef.current.get(screenImageData);
    if (cachedImg && cachedImg.complete && cachedImg.width > 0) {
      // Image is already loaded - draw immediately (no flicker)
      requestAnimationFrame(() => renderImage(cachedImg));
      return;
    }
    
    // Draw previous image while loading new one (prevent flicker)
    if (previousImageRef.current && previousImageRef.current.complete && previousImageRef.current.width > 0) {
      requestAnimationFrame(() => renderImage(previousImageRef.current!));
    }
    
    // Create new image from base64 data
    const img = new Image();
    
    img.onload = () => {
      console.log("✅ [ScreenControl] Image loaded successfully:", {
        width: img.width,
        height: img.height,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        complete: img.complete,
        src: img.src.substring(0, 50) + '...'
      });
      
      if (img.width === 0 || img.height === 0) {
        console.error("❌ [ScreenControl] Image loaded but has zero dimensions");
        setIsLoading(false);
        return;
      }
      
      // Cache the loaded image
      imageCacheRef.current.set(screenImageData, img);
      
      // Limit cache size to prevent memory issues
      if (imageCacheRef.current.size > 3) {
        const firstKey = imageCacheRef.current.keys().next().value;
        if (firstKey !== undefined) {
          imageCacheRef.current.delete(firstKey);
        }
      }
      
      // Draw new image immediately
      requestAnimationFrame(() => {
        console.log("🎨 [ScreenControl] Drawing loaded image");
        renderImage(img);
      });
    };
    
    img.onerror = (error) => {
      console.error("❌ [ScreenControl] Error loading image:", error);
      console.error("❌ [ScreenControl] Error event:", error);
      console.error("❌ [ScreenControl] Image src preview:", screenImageData.substring(0, 100));
      console.error("❌ [ScreenControl] Full image src (first 200 chars):", screenImageData.substring(0, 200));
      console.error("❌ [ScreenControl] Image src length:", screenImageData.length);
      console.error("❌ [ScreenControl] Image src starts with data:", screenImageData.startsWith('data:'));
      
      // Try to validate base64
      const base64Part = screenImageData.includes(',') ? screenImageData.split(',')[1] : screenImageData;
      const isValidBase64 = /^[A-Za-z0-9+/=]+$/.test(base64Part);
      console.error("❌ [ScreenControl] Base64 validation:", {
        hasComma: screenImageData.includes(','),
        base64PartLength: base64Part?.length,
        isValidBase64,
        base64Preview: base64Part?.substring(0, 50),
        firstChars: base64Part?.substring(0, 10),
        lastChars: base64Part?.substring(base64Part.length - 10)
      });
      
      // Check data URI format
      if (screenImageData.startsWith('data:')) {
        const [header, data] = screenImageData.split(',');
        console.error("❌ [ScreenControl] Data URI header:", header);
        console.error("❌ [ScreenControl] Data URI data length:", data?.length);
        console.error("❌ [ScreenControl] Data URI data preview:", data?.substring(0, 20));
      }
      
      // Try to test with a simple test image
      console.log("🧪 [ScreenControl] Testing with a simple 1x1 pixel image...");
      const testImg = new Image();
      testImg.onload = () => console.log("✅ [ScreenControl] Test image loaded successfully");
      testImg.onerror = () => console.error("❌ [ScreenControl] Even test image failed - browser issue");
      testImg.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      
      // Draw error indicator on canvas
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#ff0000";
          ctx.font = "20px Arial";
          ctx.fillText("Image Load Error", 20, 50);
          ctx.fillText("Check console", 20, 80);
          ctx.fillText(`Length: ${screenImageData.length}`, 20, 110);
          ctx.fillText(`Has data: ${screenImageData.startsWith('data:')}`, 20, 140);
        }
      }
      
      setIsLoading(false);
    };
    
    // Start loading immediately
    console.log("🖼️ [ScreenControl] Setting image src, length:", screenImageData.length);
    console.log("🖼️ [ScreenControl] Image src preview:", screenImageData.substring(0, 100));
    console.log("🖼️ [ScreenControl] Image src starts with data:", screenImageData.startsWith('data:'));
    console.log("🖼️ [ScreenControl] Image src format check:", {
      isWebP: screenImageData.includes('data:image/webp'),
      isJPEG: screenImageData.includes('data:image/jpeg'),
      isPNG: screenImageData.includes('data:image/png')
    });
    
    // Validate data URI format before setting src
    if (!screenImageData.startsWith('data:')) {
      console.warn("⚠️ [ScreenControl] Image data doesn't start with 'data:' prefix - this will cause an error!");
      console.warn("⚠️ [ScreenControl] Attempting to fix by adding data URI prefix...");
      // Try to fix it - detect format from first chars
      let detectedMime = 'image/jpeg'; // default
      if (screenImageData.startsWith('/9j/')) {
        detectedMime = 'image/jpeg';
      } else if (screenImageData.startsWith('iVBORw0KGgo')) {
        detectedMime = 'image/png';
      } else if (screenImageData.startsWith('UklGR')) {
        detectedMime = 'image/webp';
      }
      let fixedData = `data:${detectedMime};base64,${screenImageData}`;
      // CRITICAL: Fix missing leading slash for JPEG before rendering
      if (fixedData.includes('base64,9j/') && !fixedData.includes('base64,/9j/')) {
        fixedData = fixedData.replace('base64,9j/', 'base64,/9j/');
        console.log("🔧 [ScreenControl] Fixed missing slash in data URI before rendering");
      }
      console.log("🔧 [ScreenControl] Fixed data URI:", fixedData.substring(0, 50));
      img.src = fixedData;
    } else {
      // Validate the data URI format
      const parts = screenImageData.split(',');
      if (parts.length !== 2) {
        console.error("❌ [ScreenControl] Invalid data URI format - should have exactly one comma");
        console.error("❌ [ScreenControl] Parts count:", parts.length);
        setIsLoading(false);
        return;
      }
      
      const [header, data] = parts;
      if (!header.includes('base64')) {
        console.error("❌ [ScreenControl] Data URI header doesn't contain 'base64'");
        console.error("❌ [ScreenControl] Header:", header);
        setIsLoading(false);
        return;
      }
      
      if (!data || data.length === 0) {
        console.error("❌ [ScreenControl] Data URI has no data after comma");
        setIsLoading(false);
        return;
      }
      
      // CRITICAL: Fix missing leading slash for JPEG before rendering
      let finalImageData = screenImageData;
      if (finalImageData.includes('base64,9j/') && !finalImageData.includes('base64,/9j/')) {
        finalImageData = finalImageData.replace('base64,9j/', 'base64,/9j/');
        console.log("🔧 [ScreenControl] Fixed missing slash in data URI before rendering");
        console.log("🔧 [ScreenControl] Fixed preview:", finalImageData.substring(0, 50));
      }
      
      console.log("✅ [ScreenControl] Data URI format is valid, setting src");
      img.src = finalImageData;
    }
    
  }, [screenImageData, screenImageDimensions, isConnected, phoneWidth]);

  // Render skeleton on canvas (fallback when no screen image)
  useEffect(() => {
    if (!skeletonData || !canvasRef.current || !containerRef.current || !isConnected || screenImageData) {
      // Skip skeleton rendering if screen image is available
      return;
    }

    console.log("🎨 [ScreenControl] Starting render with skeleton data:", {
      package: skeletonData.package,
      device_width: skeletonData.device_width,
      device_height: skeletonData.device_height,
      skeleton_length: skeletonData.skeleton.length,
      skeleton_is_array: Array.isArray(skeletonData.skeleton)
    });

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      console.error("❌ [ScreenControl] Failed to get canvas context");
      return;
    }

    const container = containerRef.current;
    
    // Wait for container to have dimensions
    if (container.clientWidth === 0 || container.clientHeight === 0) {
      console.log("⏸️ [ScreenControl] Container has no dimensions, waiting...");
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

    console.log("📐 [ScreenControl] Container dimensions:", {
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

    console.log("📐 [ScreenControl] Canvas dimensions:", {
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
      console.log(`🎨 [ScreenControl] Drawing ${skeletonData.skeleton.length} skeleton entries`);
      console.log(`🎨 [ScreenControl] Screen area:`, {
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
            console.log(`⏭️ [ScreenControl] Skipping entry ${index} - invalid or out of bounds:`, {
              original: { x, y, width, height },
              clamped: { x: clampedX, y: clampedY, width: clampedWidth, height: clampedHeight }
            });
          }
          return;
        }
        
        if (index < 5) {
          console.log(`🎨 [ScreenControl] Drawing entry ${index}:`, {
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
      
      console.log(`✅ [ScreenControl] Successfully drew ${drawnCount} out of ${skeletonData.skeleton.length} skeleton entries`);
    } else {
      console.warn("⚠️ [ScreenControl] No skeleton entries to draw:", {
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
            data-minimized-popup={isMinimized ? "true" : "false"}
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
            <div className="p-2 bg-white dark:bg-gray-900 rounded flex items-center justify-between gap-2 border-2 border-blue-500/80 shadow-lg">
              <div className="flex items-center gap-2">
                <Monitor className="h-4 w-4 text-gray-900 dark:text-white" />
                <span className="text-xs font-semibold text-gray-900 dark:text-white">Screen Control - {device.name}</span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 hover:bg-gray-200 dark:hover:bg-gray-700 cursor-move text-gray-900 dark:text-white"
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
                  className="h-6 w-6 p-0 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
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
            <div className="relative p-1 space-y-1.5">
              {/* Title Bar - Full Width Draggable */}
              <div 
                ref={titleBarRef}
                className="w-full px-2 py-1.5 text-center cursor-move bg-muted/30 rounded-t border-2 border-blue-500/80 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                onMouseDown={handleMouseDown}
              >
                <h2 className="text-sm font-bold">Screen Control - {device.name}</h2>
              </div>
              
              {/* Screen Display - Compact - Always show content area immediately */}
              <div className="space-y-1.5">
                  <div
                    ref={containerRef}
                    className="flex items-center gap-2 p-2"
                  >
                    {/* Screen with Device Name and Text Input */}
                    <div className="flex flex-col gap-1">
                      {/* Simple Rectangle Display - Just thin border */}
                      <div 
                        className="relative border border-border"
                        style={{
                          width: `${phoneWidth}px`,
                          height: screenHeight ? `${screenHeight}px` : "600px",
                        }}
                      >
                      {isLoading && !screenImageData && !skeletonData ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black text-gray-300">
                          <Loader2 className="h-12 w-12 mb-4 animate-spin opacity-50" />
                          <p className="text-sm">Loading screen data...</p>
                          <p className="text-xs mt-2 text-gray-400">Waiting for data from device...</p>
                        </div>
                      ) : screenImageData ? (
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
                          <Monitor className="h-12 w-12 mb-4 opacity-50" />
                          <p className="text-sm">Waiting for screen data...</p>
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
                          handleClosePopup();
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
                          className="h-10 w-full p-0 bg-blue-600 hover:bg-blue-700 text-white"
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
                        <div className="px-2 py-1.5 flex items-center justify-center gap-1.5">
                          <Lock className="h-3 w-3 text-muted-foreground" />
                          <Switch
                            checked={blockScreenEnabled}
                            onCheckedChange={handleBlockScreenToggle}
                            className="scale-75"
                          />
                        </div>
                        
                        </>
                      )}
                    </div>
                  </div>
                </div>
            </div>
          )}
        </div>
        </>,
        document.body
      )}
    </>
  );
}

