"use client";

import { AndroidDevice, DeviceInteraction } from "@/types";
import { useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Monitor, Power, RotateCcw } from "lucide-react";

interface FullControlProps {
  device: AndroidDevice;
}

export default function FullControl({ device }: FullControlProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [screenData, setScreenData] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isInteracting, setIsInteracting] = useState(false);

  const handleConnect = async () => {
    setIsConnected(true);
    // In a real app, this would establish a WebSocket connection
    // and start receiving screen updates
    // Mock screen data
    setScreenData("mock");
  };

  const handleDisconnect = () => {
    setIsConnected(false);
    setScreenData(null);
  };

  const sendInteraction = useCallback(
    async (interaction: DeviceInteraction) => {
      if (!isConnected) return;

      // In a real app, this would send the interaction to your API
      console.log("Sending interaction:", interaction);
      // API call would go here: await fetch(`/api/devices/${device.id}/interact`, { ... })
    },
    [isConnected, device.id]
  );

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current || !isConnected) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Scale coordinates to device screen dimensions
      const scaleX = rect.width / (canvasRef.current.width || 1);
      const scaleY = rect.height / (canvasRef.current.height || 1);
      const deviceX = Math.round(x / scaleX);
      const deviceY = Math.round(y / scaleY);

      sendInteraction({
        type: "tap",
        x: deviceX,
        y: deviceY,
      });
    },
    [isConnected, sendInteraction]
  );

  const handleCanvasMouseDown = useCallback(() => {
    setIsInteracting(true);
  }, []);

  const handleCanvasMouseUp = useCallback(() => {
    setIsInteracting(false);
  }, []);

  const handleSwipe = useCallback(
    (startX: number, startY: number, endX: number, endY: number) => {
      if (!canvasRef.current || !isConnected) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const scaleX = rect.width / (canvasRef.current.width || 1);
      const scaleY = rect.height / (canvasRef.current.height || 1);

      sendInteraction({
        type: "swipe",
        x: Math.round(startX / scaleX),
        y: Math.round(startY / scaleY),
        deltaX: Math.round((endX - startX) / scaleX),
        deltaY: Math.round((endY - startY) / scaleY),
      });
    },
    [isConnected, sendInteraction]
  );

  // Mock device screen dimensions (typical Android phone)
  const deviceWidth = 1080;
  const deviceHeight = 2340;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <Monitor className="h-6 w-6" />
        <h2 className="text-2xl font-semibold">Full Control</h2>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Device Screen Control</CardTitle>
            <div className="flex items-center gap-2">
              {!isConnected ? (
                <Button onClick={handleConnect}>
                  <Power className="h-4 w-4 mr-2" />
                  Connect
                </Button>
              ) : (
                <>
                  <Button variant="outline" onClick={handleDisconnect}>
                    <Power className="h-4 w-4 mr-2" />
                    Disconnect
                  </Button>
                  <Button variant="outline" onClick={() => setScreenData("mock")}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!isConnected ? (
            <div className="aspect-[9/19.5] bg-muted rounded-lg flex items-center justify-center border-2 border-dashed">
              <div className="text-center text-muted-foreground">
                <Monitor className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg">Click &quot;Connect&quot; to start remote control</p>
                <p className="text-sm mt-2">
                  This will establish a connection to {device.name}
                </p>
              </div>
            </div>
          ) : (
            <div
              ref={containerRef}
              className="flex items-center justify-center bg-gray-900 rounded-lg p-4"
            >
              <div className="relative">
                <canvas
                  ref={canvasRef}
                  width={deviceWidth}
                  height={deviceHeight}
                  className={`max-w-full h-auto border-4 border-gray-700 rounded-lg cursor-pointer ${
                    isInteracting ? "opacity-90" : ""
                  }`}
                  onClick={handleCanvasClick}
                  onMouseDown={handleCanvasMouseDown}
                  onMouseUp={handleCanvasMouseUp}
                  style={{
                    maxHeight: "70vh",
                    touchAction: "none",
                  }}
                />
                {screenData === null && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg">
                    <div className="text-white text-center">
                      <Monitor className="h-12 w-12 mx-auto mb-2 opacity-50 animate-pulse" />
                      <p>Loading screen...</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {isConnected && (
            <div className="mt-4 p-4 bg-muted rounded-lg">
              <h3 className="font-semibold mb-2">Control Instructions</h3>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Click anywhere on the screen to tap</li>
                <li>Click and drag to swipe</li>
                <li>Long press for context menus</li>
                <li>Scroll with mouse wheel or touch gestures</li>
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

