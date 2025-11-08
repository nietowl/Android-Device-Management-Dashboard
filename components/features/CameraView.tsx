"use client";

import { AndroidDevice } from "@/types";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Camera, CameraOff, Download } from "lucide-react";

interface CameraViewProps {
  device: AndroidDevice;
}

export default function CameraView({ device }: CameraViewProps) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  const handleStartStream = async () => {
    setIsStreaming(true);
    // In a real app, this would start a video stream from the device
    // For now, we'll simulate it
  };

  const handleStopStream = () => {
    setIsStreaming(false);
  };

  const handleCapture = async () => {
    // In a real app, this would capture an image from the device camera
    // Mock implementation
    setCapturedImage("data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iIzMzMzMzMyIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMjQiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+Q2FwdHVyZWQgSW1hZ2U8L3RleHQ+PC9zdmc+");
  };

  const handleDownload = () => {
    if (capturedImage) {
      const link = document.createElement("a");
      link.href = capturedImage;
      link.download = `camera-capture-${Date.now()}.png`;
      link.click();
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <Camera className="h-6 w-6" />
        <h2 className="text-2xl font-semibold">Camera</h2>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Camera Feed</CardTitle>
            <div className="flex items-center gap-2">
              {!isStreaming ? (
                <Button onClick={handleStartStream}>
                  <Camera className="h-4 w-4 mr-2" />
                  Start Stream
                </Button>
              ) : (
                <>
                  <Button variant="outline" onClick={handleStopStream}>
                    <CameraOff className="h-4 w-4 mr-2" />
                    Stop Stream
                  </Button>
                  <Button onClick={handleCapture}>
                    <Camera className="h-4 w-4 mr-2" />
                    Capture
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isStreaming ? (
            <div className="relative aspect-video bg-black rounded-lg flex items-center justify-center">
              <div className="text-white text-center">
                <Camera className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg">Camera stream would appear here</p>
                <p className="text-sm text-gray-400 mt-2">
                  In production, this would show a live feed from {device.name}
                </p>
              </div>
            </div>
          ) : (
            <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <Camera className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p>Click &quot;Start Stream&quot; to begin viewing the camera feed</p>
              </div>
            </div>
          )}

          {capturedImage && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">Captured Image</h3>
                <Button variant="outline" size="sm" onClick={handleDownload}>
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </div>
              <img
                src={capturedImage}
                alt="Captured"
                className="w-full rounded-lg border"
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

