"use client";

import { AndroidDevice, FileItem } from "@/types";
import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Folder, File, Upload, Download, Trash2, ArrowLeft, RefreshCw, Loader2, Eye, X } from "lucide-react";
import { format } from "date-fns";
import { io, Socket } from "socket.io-client";

const DEVICE_SERVER_URL = process.env.NEXT_PUBLIC_DEVICE_SERVER_URL || "http://localhost:9211";

interface FileManagerProps {
  device: AndroidDevice;
}

export default function FileManager({ device }: FileManagerProps) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [currentPath, setCurrentPath] = useState("/storage/emulated/0");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{ [key: string]: number }>({}); // transferId -> percentage
  const [downloadingFiles, setDownloadingFiles] = useState<{ [fileName: string]: string }>({}); // fileName -> transferId mapping
  const [downloadInfo, setDownloadInfo] = useState<{ [fileName: string]: { received: number, total: number, percentage: number } }>({}); // fileName -> download info
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<{ fileName: string; thumbnail: string } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const fileChunksRef = useRef<{ [transferId: string]: { chunks: string[], fileName: string, totalSize: number } }>({});
  const completedDownloadsRef = useRef<Set<string>>(new Set()); // Track completed transferIds to prevent duplicate downloads
  const downloadingRef = useRef<Set<string>>(new Set()); // Track files currently being downloaded (by fileName) to prevent duplicates

  // Load files from device
  const loadFiles = useCallback(async (path: string) => {
    if (!socketRef.current || !socketRef.current.connected) {
      console.warn("Socket not connected, retrying...");
      setTimeout(() => loadFiles(path), 1000);
      return;
    }

    setLoading(true);
    setError(null);
    
    // Normalize path - default to /storage/emulated/0 if empty or root
    let dirPath = path || "/storage/emulated/0";
    
    // Remove trailing slash (backend expects path without trailing slash)
    if (dirPath !== "/storage/emulated/0" && dirPath.endsWith("/")) {
      dirPath = dirPath.slice(0, -1);
    }
    
    console.log(`📤 [FileManager] ========== SENDING GETDIR COMMAND ==========`);
    console.log(`📤 [FileManager] Path: ${dirPath}`);
    console.log(`📤 [FileManager] Param: ${dirPath}`);
    console.log(`📤 [FileManager] ===========================================`);
    
    socketRef.current.emit("send-command", {
      deviceId: device.id,
      command: "getdir",
      param: dirPath,
    });
  }, [device.id]);

  // Setup Socket.IO connection
  useEffect(() => {
    console.log(`🔌 [FileManager] Setting up socket for device: ${device.id}`);
    
    const socket = io(DEVICE_SERVER_URL, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("✅ FileManager connected to device-server.js");
      if (device.status === "online") {
        loadFiles(currentPath);
      }
    });

    socket.on("disconnect", () => {
      console.log("❌ FileManager disconnected from device-server.js");
    });

    socket.on("connect_error", (err) => {
      console.error("❌ FileManager connection error:", err);
      setError("Failed to connect to device server");
    });

    // Clean up previous listeners
    socket.off("device_event");
    socket.off("command-error");
    socket.off("command-sent");

    // Debug: Listen to ALL events
    socket.onAny((eventName, ...args) => {
      if (eventName === "device_event") {
        const event = args[0];
        if (event?.event === "image_preview") {
          console.log(`🔍 [FileManager] Found image_preview in onAny!`, event);
        }
      }
      console.log(`🔍 [FileManager] Received ANY event: "${eventName}"`, args);
    });

    // Listen for dir-result events
    socket.on("device_event", async (event: any) => {
      // Check device ID - support both deviceId and device_id
      const eventDeviceId = event.deviceId || event.device_id;
      
      // Special handling for image_preview - log everything
      if (event.event === "image_preview") {
        console.log("🖼️ [FileManager] ========== IMAGE PREVIEW EVENT ==========");
        console.log("🖼️ [FileManager] Event deviceId:", eventDeviceId);
        console.log("🖼️ [FileManager] Current device.id:", device.id);
        console.log("🖼️ [FileManager] Match:", eventDeviceId === device.id);
        console.log("🖼️ [FileManager] Event data:", event.data);
      }
      
      if (eventDeviceId && eventDeviceId !== device.id) {
        // Skip events not for this device (but log for debugging)
        if (event.event === "image_preview") {
          console.log(`⚠️ [FileManager] Image preview event for different device: ${eventDeviceId} (current: ${device.id}), skipping...`);
        }
        return;
      }
      
      console.log("📥 [FileManager] ========== DEVICE EVENT RECEIVED ==========");
      console.log("📥 [FileManager] Event type:", event.event);
      console.log("📥 [FileManager] Device ID:", eventDeviceId, "Expected:", device.id);
      console.log("📥 [FileManager] Event data keys:", event.data ? Object.keys(event.data) : "no data");

      // Handle dir-result
      if (event.event === "dir_result" && event.data) {
        console.log("📁 [FileManager] Processing dir-result:", event.data);
        
        try {
          const dirData = event.data;
          
          // Handle different data formats
          let filesArray: any[] = [];
          
          if (Array.isArray(dirData)) {
            filesArray = dirData;
          } else if (dirData.files && Array.isArray(dirData.files)) {
            filesArray = dirData.files;
          } else if (dirData.data && Array.isArray(dirData.data)) {
            filesArray = dirData.data;
          } else if (dirData.items && Array.isArray(dirData.items)) {
            filesArray = dirData.items;
          } else {
            console.warn("⚠️ [FileManager] Unexpected dir data format:", dirData);
            setFiles([]);
            setLoading(false);
            return;
          }
          
          // Transform the data to FileItem format
          const transformedFiles: FileItem[] = filesArray.map((file: any, index: number) => {
            // Use isDir field to determine if it's a directory
            const isDirectory = file.isDir === true || file.isDirectory === true || file.type === "directory" || file.type === "DIRECTORY";
            
            return {
              id: String(file.id || file.name || `file-${index}`),
              device_id: device.id,
              path: file.path || file.absolutePath || currentPath,
              name: file.name || file.fileName || "Unknown",
              type: isDirectory ? "directory" : "file",
              size: file.size || file.length,
              modified: file.modified || file.lastModified || file.date || new Date().toISOString(),
            };
          });
          
          setFiles(transformedFiles);
          setLoading(false);
          setError(null);
        } catch (err: any) {
          console.error("❌ [FileManager] Error processing dir-result:", err);
          setError(`Failed to process files: ${err.message}`);
          setLoading(false);
        }
      }

      // Handle delete-result
      if (event.event === "delete_result" && event.data) {
        console.log("🗑️ [FileManager] Processing delete-result:", event.data);
        
        try {
          const deleteData = event.data;
          const success = deleteData.success !== false; // Default to true if not specified
          const message = deleteData.message || deleteData.status || "";
          
          if (success) {
            console.log(`✅ [FileManager] File deleted successfully: ${message}`);
            // Refresh the file list
            loadFiles(currentPath);
          } else {
            console.error(`❌ [FileManager] Delete failed: ${message}`);
            setError(`Delete failed: ${message}`);
          }
        } catch (err: any) {
          console.error("❌ [FileManager] Error processing delete-result:", err);
          setError(`Delete failed: ${err.message}`);
        }
      }

      // Handle upload-result
      if (event.event === "upload_result" && event.data) {
        console.log("📤 [FileManager] Processing upload-result:", event.data);
        
        try {
          const uploadData = event.data;
          const success = uploadData.success !== false; // Default to true if not specified
          const message = uploadData.message || uploadData.status || "";
          
          if (success) {
            console.log(`✅ [FileManager] File uploaded successfully: ${message}`);
            // Refresh the file list
            loadFiles(currentPath);
          } else {
            console.error(`❌ [FileManager] Upload failed: ${message}`);
            setError(`Upload failed: ${message}`);
          }
          
          setUploading(false);
        } catch (err: any) {
          console.error("❌ [FileManager] Error processing upload-result:", err);
          setError(`Upload failed: ${err.message}`);
          setUploading(false);
        }
      }

      // Handle file-chunk (chunked file download)
      if (event.event === "file_chunk" && event.data) {
        console.log("📥 [FileManager] ========== FILE CHUNK RECEIVED ==========");
        console.log("📥 [FileManager] Event keys:", Object.keys(event.data));
        console.log("📥 [FileManager] Event data type:", typeof event.data);
        
        // Log chunk info without the full chunk data (too large)
        const chunkData = event.data;
        const { transferId, fileName, chunk, isLastChunk, chunkSize, progress, totalSize } = chunkData;
        
        console.log(`📥 [FileManager] Parsed values:`);
        console.log(`   transferId: ${transferId}`);
        console.log(`   fileName: ${fileName}`);
        console.log(`   chunk exists: ${!!chunk}`);
        console.log(`   chunk length: ${chunk?.length || 0}`);
        console.log(`   chunk type: ${typeof chunk}`);
        console.log(`   chunk preview: ${chunk ? chunk.substring(0, 50) + '...' : 'null'}`);
        console.log(`   isLastChunk: ${isLastChunk} (type: ${typeof isLastChunk}, value: ${JSON.stringify(isLastChunk)})`);
        console.log(`   progress: ${progress}`);
        console.log(`   totalSize: ${totalSize}`);
        console.log(`   chunkSize: ${chunkSize}`);
        
        try {
          
          if (!transferId) {
            console.error("❌ [FileManager] No transferId in chunk data");
            return;
          }

          // Initialize transfer if first chunk
          if (!fileChunksRef.current[transferId]) {
            fileChunksRef.current[transferId] = {
              chunks: [],
              fileName: fileName || "download",
              totalSize: totalSize || 0,
            };
            
            // Track this file as downloading with the transferId (using fileName as key)
            setDownloadingFiles(prev => ({
              ...prev,
              [fileName]: transferId
            }));
            
            console.log(`📥 [FileManager] ✅ Started new file transfer: ${fileName} (${transferId})`);
          }

          // Update progress
          if (progress !== undefined && progress !== null) {
            const progressValue = Math.round(progress);
            setDownloadProgress(prev => ({
              ...prev,
              [transferId]: progressValue
            }));
            console.log(`📥 [FileManager] Progress updated: ${progressValue}%`);
            
            // Update download info for UI (bytes received and total)
            if (fileName && totalSize) {
              const transfer = fileChunksRef.current[transferId];
              if (transfer) {
                const totalChunkDataSize = transfer.chunks.reduce((sum, c) => sum + (c ? c.length : 0), 0);
                // Calculate approximate binary bytes received (base64 is ~33% larger)
                const approximateBinaryBytes = Math.floor(totalChunkDataSize * 3 / 4);
                const percentage = totalSize > 0 ? Math.min(100, Math.round((approximateBinaryBytes / totalSize) * 100)) : progressValue;
                
                setDownloadInfo(prev => ({
                  ...prev,
                  [fileName]: {
                    received: approximateBinaryBytes,
                    total: totalSize,
                    percentage: percentage
                  }
                }));
              }
            }
          }

          // Get the transfer to check current state
          const transfer = fileChunksRef.current[transferId];
          
          // Add chunk to buffer (even if empty - last chunk might be empty)
          if (chunk !== undefined && chunk !== null) {
            fileChunksRef.current[transferId].chunks.push(chunk);
            const chunkCount = fileChunksRef.current[transferId].chunks.length;
            console.log(`📥 [FileManager] ✅ Buffered chunk #${chunkCount} for ${fileName} (chunk length: ${chunk.length}, ${Math.round(progress || 0)}%)`);
            
            // Update download info based on chunks received (even if progress not explicitly sent)
            if (fileName && totalSize) {
              const transfer = fileChunksRef.current[transferId];
              if (transfer) {
                const totalChunkDataSize = transfer.chunks.reduce((sum, c) => sum + (c ? c.length : 0), 0);
                // Calculate approximate binary bytes received (base64 is ~33% larger)
                const approximateBinaryBytes = Math.floor(totalChunkDataSize * 3 / 4);
                const percentage = totalSize > 0 ? Math.min(100, Math.round((approximateBinaryBytes / totalSize) * 100)) : 0;
                
                setDownloadInfo(prev => ({
                  ...prev,
                  [fileName]: {
                    received: approximateBinaryBytes,
                    total: totalSize,
                    percentage: percentage
                  }
                }));
              }
            }
          }

          // Check if last chunk (handle multiple formats: boolean, string, number)
          let isLast = isLastChunk === true || 
                       isLastChunk === "true" || 
                       isLastChunk === 1 || 
                       isLastChunk === "1" ||
                       String(isLastChunk).toLowerCase() === "true";
          
          // Special case 1: If chunkSize equals totalSize and this is the first chunk, it's likely the last chunk
          // This handles small files that are sent in a single chunk but not marked as last
          if (!isLast && totalSize && chunkSize && totalSize === chunkSize) {
            const currentTransfer = fileChunksRef.current[transferId];
            if (currentTransfer && currentTransfer.chunks.length === 1) {
              console.log(`📥 [FileManager] Detected single-chunk file: chunkSize (${chunkSize}) === totalSize (${totalSize})`);
              isLast = true;
            }
          }
          
          // Special case 2: For multi-chunk files, check if we've received all data
          // Calculate total base64 data received (base64 is ~33% larger than binary)
          if (!isLast && transfer && totalSize) {
            const totalChunksReceived = transfer.chunks.length;
            const totalChunkDataSize = transfer.chunks.reduce((sum, c) => sum + (c ? c.length : 0), 0);
            
            // Base64 encoding increases size by ~33%, so calculate expected base64 size
            // Binary size * 1.33 ≈ base64 size, but we need to account for padding
            const expectedBase64Size = Math.ceil(totalSize * 4 / 3);
            
            // If we've received close to the expected base64 size, treat as complete
            // Use 90% threshold to account for padding variations
            if (totalChunkDataSize >= expectedBase64Size * 0.90) {
              console.log(`📥 [FileManager] Detected completion by size: received ${totalChunkDataSize} base64 bytes (expected ~${expectedBase64Size} for ${totalSize} binary bytes)`);
              isLast = true;
            } else {
              console.log(`📥 [FileManager] Progress check: ${totalChunkDataSize}/${expectedBase64Size} base64 bytes (${Math.round(totalChunkDataSize / expectedBase64Size * 100)}%)`);
            }
          }
          
          // Special case 3: If we receive an empty chunk with isLastChunk flag (even if false), check if we have all data
          if (!isLast && transfer && totalSize && (!chunk || chunk.length === 0)) {
            const totalChunkDataSize = transfer.chunks.reduce((sum, c) => sum + (c ? c.length : 0), 0);
            const expectedBase64Size = Math.ceil(totalSize * 4 / 3);
            
            // Empty chunk + we have most of the data = likely the end marker
            if (totalChunkDataSize >= expectedBase64Size * 0.85) {
              console.log(`📥 [FileManager] Detected completion: empty chunk received and we have ${totalChunkDataSize} bytes`);
              isLast = true;
            }
          }
          
          console.log(`📥 [FileManager] Is last chunk check: ${isLast}`);
          console.log(`📥 [FileManager] isLastChunk value: ${JSON.stringify(isLastChunk)}, type: ${typeof isLastChunk}`);
          if (transfer) {
            console.log(`📥 [FileManager] Total chunks buffered: ${transfer.chunks.length}`);
            console.log(`📥 [FileManager] Total data size: ${transfer.chunks.reduce((sum, c) => sum + (c ? c.length : 0), 0)} bytes`);
          }
          
          if (isLast) {
            // Check if this download was already completed to prevent duplicate downloads
            if (completedDownloadsRef.current.has(transferId)) {
              console.log(`⚠️ [FileManager] Download already completed for transferId: ${transferId}, skipping...`);
              return;
            }
            
            const transfer = fileChunksRef.current[transferId];
            
            if (!transfer) {
              console.error("❌ [FileManager] Transfer not found for:", transferId);
              return;
            }
            
            // Check by fileName as well to prevent duplicate downloads of the same file
            if (downloadingRef.current.has(transfer.fileName)) {
              console.log(`⚠️ [FileManager] File "${transfer.fileName}" is already being downloaded, skipping duplicate...`);
              return;
            }
            
            // Mark as downloading and completed immediately to prevent duplicate processing
            downloadingRef.current.add(transfer.fileName);
            completedDownloadsRef.current.add(transferId);
            
            console.log(`📥 [FileManager] ========== ASSEMBLING FINAL FILE ==========`);
            console.log(`📥 [FileManager] TransferId: ${transferId}`);
            console.log(`📥 [FileManager] FileName: ${transfer.fileName}`);
            
            console.log(`📥 [FileManager] Total chunks received: ${transfer.chunks.length}`);
            console.log(`📥 [FileManager] File name: ${transfer.fileName}`);
            
            // Combine all base64 chunks
            const combinedBase64 = transfer.chunks.join("");
            console.log(`📥 [FileManager] Combined base64 length: ${combinedBase64.length}`);
            console.log(`📥 [FileManager] First 100 chars: ${combinedBase64.substring(0, 100)}`);
            console.log(`📥 [FileManager] Last 100 chars: ${combinedBase64.substring(combinedBase64.length - 100)}`);
            
            if (combinedBase64.length === 0) {
              console.error("❌ [FileManager] No data to download - combined base64 is empty!");
              alert("Download failed: No file data received");
              return;
            }
            
            try {
              // Clean the base64 string - remove any whitespace, newlines, or invalid characters
              let cleanedBase64 = combinedBase64.replace(/\s/g, '');
              console.log(`📥 [FileManager] Initial combined base64 length: ${combinedBase64.length}`);
              console.log(`📥 [FileManager] After removing whitespace: ${cleanedBase64.length}`);
              
              // Check for invalid characters BEFORE any other processing
              const invalidChars = cleanedBase64.match(/[^A-Za-z0-9+\/=]/g);
              if (invalidChars && invalidChars.length > 0) {
                console.error("❌ [FileManager] Invalid base64 characters found:", invalidChars.length, "total");
                console.error("❌ [FileManager] First 50 invalid chars:", invalidChars.slice(0, 50).join(''));
                console.error("❌ [FileManager] Invalid char codes:", invalidChars.slice(0, 30).map((c: string) => `'${c}' (${c.charCodeAt(0)})`).join(', '));
                
                // Show sample of where invalid chars appear
                const firstInvalidIndex = cleanedBase64.search(/[^A-Za-z0-9+\/=]/);
                if (firstInvalidIndex >= 0) {
                  const start = Math.max(0, firstInvalidIndex - 20);
                  const end = Math.min(cleanedBase64.length, firstInvalidIndex + 20);
                  console.error("❌ [FileManager] Context around first invalid char:", cleanedBase64.substring(start, end));
                }
                
                // Remove invalid characters aggressively
                cleanedBase64 = cleanedBase64.replace(/[^A-Za-z0-9+\/=]/g, '');
                console.log(`📥 [FileManager] After removing invalid chars: ${cleanedBase64.length}`);
              } else {
                console.log(`✅ [FileManager] No invalid characters found`);
              }
              
              // Remove any padding first, then add correct padding
              const paddingBefore = (cleanedBase64.match(/=+$/) || [''])[0].length;
              cleanedBase64 = cleanedBase64.replace(/=+$/, '');
              console.log(`📥 [FileManager] Removed ${paddingBefore} padding characters`);
              
              // Validate base64 padding - ensure length is multiple of 4
              const paddingNeeded = (4 - (cleanedBase64.length % 4)) % 4;
              if (paddingNeeded > 0) {
                console.log(`📥 [FileManager] Adding ${paddingNeeded} padding character(s)`);
                cleanedBase64 += '='.repeat(paddingNeeded);
              }
              
              console.log(`📥 [FileManager] Final base64 length: ${cleanedBase64.length}`);
              console.log(`📥 [FileManager] Final base64 padding: ${cleanedBase64.match(/=+$/) || 'none'}`);
              console.log(`📥 [FileManager] Base64 length mod 4: ${cleanedBase64.length % 4}`);
              
              // Check for any remaining invalid characters
              const stillInvalid = cleanedBase64.match(/[^A-Za-z0-9+\/=]/g);
              if (stillInvalid && stillInvalid.length > 0) {
                console.error("❌ [FileManager] STILL invalid characters after cleaning:", stillInvalid.length);
                console.error("❌ [FileManager] Still invalid chars:", stillInvalid.slice(0, 50).join(''));
                console.error("❌ [FileManager] Still invalid char codes:", stillInvalid.slice(0, 30).map((c: string) => `'${c}' (${c.charCodeAt(0)})`).join(', '));
                
                // Try one more aggressive clean
                cleanedBase64 = cleanedBase64.replace(/[^A-Za-z0-9+\/=]/g, '');
                console.log(`📥 [FileManager] After second cleaning: ${cleanedBase64.length}`);
                
                // Re-add padding if needed
                const paddingNeeded2 = (4 - (cleanedBase64.length % 4)) % 4;
                if (paddingNeeded2 > 0) {
                  cleanedBase64 += '='.repeat(paddingNeeded2);
                }
              }
              
              // Final validation - be more lenient, just check it's mostly valid
              const finalInvalid = cleanedBase64.match(/[^A-Za-z0-9+\/=]/g);
              if (finalInvalid && finalInvalid.length > 0) {
                console.error("❌ [FileManager] Cannot clean base64 string - still has invalid chars");
                throw new Error(`Invalid base64 string format: ${finalInvalid.length} invalid characters remaining`);
              }
              
              // Verify padding is correct (0-2 = signs only)
              const finalPadding = (cleanedBase64.match(/=+$/) || [''])[0];
              if (finalPadding.length > 2) {
                console.warn(`⚠️ [FileManager] Excess padding detected (${finalPadding.length}), fixing...`);
                cleanedBase64 = cleanedBase64.replace(/=+$/, '');
                const paddingNeeded3 = (4 - (cleanedBase64.length % 4)) % 4;
                cleanedBase64 += '='.repeat(paddingNeeded3);
              }
              
              console.log(`✅ [FileManager] Base64 string validated and cleaned`);
              
              // Helper function to decode base64 manually (more robust)
              const manualBase64Decode = (base64: string): Uint8Array => {
                const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
                let bufferLength = base64.length * 0.75;
                if (base64[base64.length - 1] === '=') {
                  bufferLength--;
                  if (base64[base64.length - 2] === '=') {
                    bufferLength--;
                  }
                }
                
                const bytes = new Uint8Array(bufferLength);
                let p = 0;
                
                for (let i = 0; i < base64.length; i += 4) {
                  const encoded1 = chars.indexOf(base64[i]);
                  const encoded2 = chars.indexOf(base64[i + 1]);
                  const encoded3 = chars.indexOf(base64[i + 2]);
                  const encoded4 = chars.indexOf(base64[i + 3]);
                  
                  bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
                  if (encoded3 !== -1 && encoded3 !== 64) {
                    bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
                  }
                  if (encoded4 !== -1 && encoded4 !== 64) {
                    bytes[p++] = ((encoded3 & 3) << 6) | encoded4;
                  }
                }
                
                return bytes.slice(0, p);
              };
              
              // Try multiple decoding methods
              let blob: Blob | null = null;
              let decodeMethod = '';
              
              // Method 1: Try fetch with data URL (most forgiving)
              try {
                console.log(`📥 [FileManager] Attempting fetch method...`);
                const dataUrl = `data:application/octet-stream;base64,${cleanedBase64}`;
                const response = await fetch(dataUrl);
                
                if (!response.ok) {
                  throw new Error(`Fetch failed with status ${response.status}`);
                }
                
                blob = await response.blob();
                
                if (blob.size === 0) {
                  throw new Error("Blob size is 0");
                }
                
                decodeMethod = 'fetch';
                console.log(`✅ [FileManager] Created blob via fetch: ${blob.size} bytes`);
              } catch (fetchError: any) {
                console.warn("⚠️ [FileManager] Fetch method failed:", fetchError.message);
                
                // Method 2: Try manual decoder
                try {
                  console.log(`📥 [FileManager] Attempting manual base64 decoder...`);
                  const bytes = manualBase64Decode(cleanedBase64);
                  // Create a new Uint8Array to ensure proper typing for Blob
                  const typedBytes = new Uint8Array(bytes);
                  blob = new Blob([typedBytes]);
                  decodeMethod = 'manual';
                  console.log(`✅ [FileManager] Created blob via manual decoder: ${blob.size} bytes`);
                } catch (manualError: any) {
                  console.warn("⚠️ [FileManager] Manual decoder failed:", manualError.message);
                  
                  // Method 3: Try atob (last resort)
                  try {
                    console.log(`📥 [FileManager] Attempting atob method...`);
                    const binaryString = atob(cleanedBase64);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                      bytes[i] = binaryString.charCodeAt(i);
                    }
                    blob = new Blob([bytes]);
                    decodeMethod = 'atob';
                    console.log(`✅ [FileManager] Created blob via atob: ${blob.size} bytes`);
                  } catch (atobError: any) {
                    console.error("❌ [FileManager] All decoding methods failed!");
                    console.error("❌ [FileManager] Fetch error:", fetchError.message);
                    console.error("❌ [FileManager] Manual error:", manualError.message);
                    console.error("❌ [FileManager] Atob error:", atobError.message);
                    throw new Error(`All base64 decoding methods failed. Last error: ${atobError.message}`);
                  }
                }
              }
              
              if (!blob) {
                throw new Error("Failed to create blob from base64 data");
              }
              
              console.log(`📥 [FileManager] Blob created: ${blob.size} bytes, type: ${blob.type}`);
              console.log(`📥 [FileManager] File name: ${transfer.fileName}`);
              
              // Create download link and trigger download - SIMPLIFIED AND MORE RELIABLE
              console.log(`📥 [FileManager] ========== TRIGGERING DOWNLOAD ==========`);
              console.log(`📥 [FileManager] File: ${transfer.fileName}`);
              console.log(`📥 [FileManager] Blob size: ${blob.size} bytes`);
              console.log(`📥 [FileManager] Blob type: ${blob.type}`);
              
              // Method 1: Direct blob URL download (most reliable)
              const downloadUrl = URL.createObjectURL(blob);
              console.log(`📥 [FileManager] Created blob URL: ${downloadUrl}`);
              
              // Create link element
              const link = document.createElement("a");
              link.href = downloadUrl;
              link.download = transfer.fileName;
              link.style.position = "fixed";
              link.style.top = "-1000px";
              link.style.left = "-1000px";
              link.style.opacity = "0";
              link.style.pointerEvents = "none";
              
              // Add to DOM
              document.body.appendChild(link);
              console.log(`📥 [FileManager] Link added to DOM`);
              
              // Force download by clicking
              link.click();
              console.log(`📥 [FileManager] Link.click() executed`);
              
              // Clean up after a delay
              setTimeout(() => {
                try {
                  if (document.body.contains(link)) {
                    document.body.removeChild(link);
                  }
                  URL.revokeObjectURL(downloadUrl);
                  console.log(`✅ [FileManager] Cleaned up download link`);
                } catch (e) {
                  console.warn("⚠️ [FileManager] Cleanup warning:", e);
                }
              }, 2000);
              
              console.log(`✅ [FileManager] ========== DOWNLOAD TRIGGERED ==========`);
              console.log(`✅ [FileManager] File: ${transfer.fileName}`);
              console.log(`✅ [FileManager] Size: ${blob.size} bytes`);
              console.log(`✅ [FileManager] Check your browser's download folder`);
              console.log(`✅ [FileManager] =============================================`);
              
              // Clean up immediately
              const fileName = transfer.fileName;
              delete fileChunksRef.current[transferId];
              completedDownloadsRef.current.delete(transferId); // Remove from completed set
              downloadingRef.current.delete(fileName); // Remove from downloading set
              setDownloadProgress(prev => {
                const newProgress = { ...prev };
                delete newProgress[transferId];
                return newProgress;
              });
              setDownloadingFiles(prev => {
                const newFiles = { ...prev };
                delete newFiles[fileName];
                return newFiles;
              });
              setDownloadInfo(prev => {
                const newInfo = { ...prev };
                delete newInfo[fileName];
                return newInfo;
              });
            } catch (decodeError: any) {
              console.error("❌ [FileManager] Base64 decode error:", decodeError);
              console.error("❌ [FileManager] Combined base64 sample (first 200):", combinedBase64.substring(0, 200));
              console.error("❌ [FileManager] Combined base64 sample (last 200):", combinedBase64.substring(Math.max(0, combinedBase64.length - 200)));
              console.error("❌ [FileManager] Total chunks:", transfer.chunks.length);
              console.error("❌ [FileManager] Chunk lengths:", transfer.chunks.map((c: string, i: number) => `Chunk ${i}: ${c.length}`).join(', '));
              alert(`Download failed: ${decodeError.message}`);
              
              // Clean up failed transfer
              const fileName = transfer.fileName;
              delete fileChunksRef.current[transferId];
              completedDownloadsRef.current.delete(transferId); // Remove from completed set
              downloadingRef.current.delete(fileName); // Remove from downloading set
              setDownloadProgress(prev => {
                const newProgress = { ...prev };
                delete newProgress[transferId];
                return newProgress;
              });
              setDownloadingFiles(prev => {
                const newFiles = { ...prev };
                delete newFiles[fileName];
                return newFiles;
              });
              setDownloadInfo(prev => {
                const newInfo = { ...prev };
                delete newInfo[fileName];
                return newInfo;
              });
            }
          }
        } catch (err: any) {
          console.error("❌ [FileManager] ========== ERROR PROCESSING FILE CHUNK ==========");
          console.error("❌ [FileManager] Error:", err);
          console.error("❌ [FileManager] Stack:", err.stack);
          alert(`Download failed: ${err.message}`);
          
          // Clean up on error
          const transfer = fileChunksRef.current[transferId];
          if (transfer) {
            const fileName = transfer.fileName;
            delete fileChunksRef.current[transferId];
            completedDownloadsRef.current.delete(transferId); // Remove from completed set
            downloadingRef.current.delete(fileName); // Remove from downloading set
            setDownloadProgress(prev => {
              const newProgress = { ...prev };
              delete newProgress[transferId];
              return newProgress;
            });
            setDownloadingFiles(prev => {
              const newFiles = { ...prev };
              delete newFiles[fileName];
              return newFiles;
            });
            setDownloadInfo(prev => {
              const newInfo = { ...prev };
              delete newInfo[fileName];
              return newInfo;
            });
          }
        }
      }

      // Handle image preview
      if (event.event === "image_preview") {
        console.log("🖼️ [FileManager] Processing image preview event");
        console.log("🖼️ [FileManager] Event.data:", event.data);
        
        if (!event.data) {
          console.error("❌ [FileManager] No data in event");
          setLoadingPreview(false);
          return;
        }
        
        if (!event.data.thumbnail) {
          console.error("❌ [FileManager] No thumbnail in data");
          console.error("❌ [FileManager] Data keys:", Object.keys(event.data));
          setLoadingPreview(false);
          return;
        }
        
        const fileName = event.data.fileName || "preview";
        const thumbnail = event.data.thumbnail;
        
        console.log(`🖼️ [FileManager] FileName: ${fileName}`);
        console.log(`🖼️ [FileManager] Thumbnail length: ${thumbnail.length}`);
        console.log(`🖼️ [FileManager] Thumbnail preview: ${thumbnail.substring(0, 50)}...`);
        
        // Convert base64 to WebP data URL
        const imageDataUrl = `data:image/webp;base64,${thumbnail}`;
        
        console.log(`🖼️ [FileManager] Created data URL, length: ${imageDataUrl.length}`);
        console.log(`🖼️ [FileManager] Updating state now...`);
        
        // Update state - use setTimeout to ensure state update happens
        setTimeout(() => {
          setPreviewImage({
            fileName,
            thumbnail: imageDataUrl
          });
          setLoadingPreview(false);
          console.log(`✅ [FileManager] State updated!`);
        }, 0);
      }

      // Handle download-result (fallback for non-chunked downloads)
      if (event.event === "download_result" && event.data) {
        console.log("📥 [FileManager] Processing download-result:", event.data);
        
        try {
          const downloadData = event.data;
          const fileName = downloadData.fileName || downloadData.name || "download";
          
          // Check if this file is already being downloaded or completed
          if (downloadingRef.current.has(fileName)) {
            console.log(`⚠️ [FileManager] File "${fileName}" is already being downloaded via chunked transfer, skipping download-result...`);
            return;
          }
          
          const fileData = downloadData.data || downloadData.content || downloadData.fileData;
          
          if (!fileData) {
            console.error("❌ [FileManager] No file data in download result");
            alert("Download failed: No file data received");
            return;
          }
          
          // Mark as downloading to prevent duplicates
          downloadingRef.current.add(fileName);
          
          // Handle base64 encoded data
          let blob: Blob;
          if (typeof fileData === "string") {
            // Assume base64 if it's a string
            const base64Data = fileData.includes(",") ? fileData.split(",")[1] : fileData;
            const binaryString = atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            blob = new Blob([bytes]);
          } else {
            // If it's already binary data
            blob = new Blob([fileData]);
          }
          
          // Create download link and trigger download
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = fileName;
          link.style.position = "fixed";
          link.style.top = "-1000px";
          link.style.left = "-1000px";
          link.style.opacity = "0";
          link.style.pointerEvents = "none";
          document.body.appendChild(link);
          link.click();
          
          // Clean up after delay
          setTimeout(() => {
            try {
              if (document.body.contains(link)) {
                document.body.removeChild(link);
              }
              URL.revokeObjectURL(url);
              downloadingRef.current.delete(fileName); // Remove from downloading set
            } catch (e) {
              console.warn("⚠️ [FileManager] Cleanup warning:", e);
            }
          }, 2000);
          
          console.log(`✅ [FileManager] File downloaded: ${fileName}`);
        } catch (err: any) {
          console.error("❌ [FileManager] Error processing download-result:", err);
          alert(`Download failed: ${err.message}`);
          // Try to get fileName from event.data if available, otherwise use default
          try {
            const errorFileName = (event.data as any)?.fileName || (event.data as any)?.name || "download";
            downloadingRef.current.delete(errorFileName);
          } catch {
            // If we can't get the fileName, just continue
          }
        }
      }
    });

    socket.on("command-error", (error: any) => {
      if (error.deviceId === device.id) {
        console.error("❌ [FileManager] Command error:", error);
        setError(error.error || "Failed to send command");
        setLoading(false);
      }
    });

    socket.on("command-sent", (data: any) => {
      if (data.deviceId === device.id && data.command === "getdir") {
        console.log("✅ [FileManager] Command sent, waiting for response...");
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
  }, [device.id, DEVICE_SERVER_URL, currentPath, loadFiles]);

  // Load files when path changes or device comes online
  useEffect(() => {
    if (device.status === "online" && socketRef.current?.connected) {
      loadFiles(currentPath);
    }
  }, [device.id, device.status, currentPath, loadFiles]);

  const handleNavigate = (file: FileItem) => {
    if (file.type === "directory") {
      // Navigate into directory using the file's path from backend
      // Backend provides full path like "/storage/emulated/0/MT2"
      const newPath = file.path || `${currentPath}${file.name}`;
      console.log(`📁 [FileManager] Double-clicked directory:`);
      console.log(`   File name: ${file.name}`);
      console.log(`   File path: ${file.path}`);
      console.log(`   New path: ${newPath}`);
      
      // Update path and immediately send command
      setCurrentPath(newPath);
      
      // Send command immediately when double-clicking
      if (socketRef.current?.connected && device.status === "online") {
        loadFiles(newPath);
      }
    }
  };

  const handleBack = () => {
    // Navigate to parent directory
    const parts = currentPath.split("/").filter(Boolean);
    if (parts.length > 0) {
      parts.pop();
      const newPath = parts.length > 0 ? `/${parts.join("/")}` : "/storage/emulated/0";
      console.log(`🔙 [FileManager] Navigating back:`);
      console.log(`   Current path: ${currentPath}`);
      console.log(`   New path: ${newPath}`);
      
      // Update path and immediately send command
      setCurrentPath(newPath);
      
      // Send command immediately when clicking back
      if (socketRef.current?.connected && device.status === "online") {
        loadFiles(newPath);
      }
    }
  };

  // Check if file is an image
  const isImageFile = (fileName: string): boolean => {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico', '.heic', '.heif'];
    const lowerName = fileName.toLowerCase();
    return imageExtensions.some(ext => lowerName.endsWith(ext));
  };

  const handlePreview = async (file: FileItem) => {
    if (!socketRef.current || !socketRef.current.connected) {
      alert("Error: Not connected to device");
      return;
    }

    if (file.type === "directory") {
      alert("Cannot preview a directory");
      return;
    }

    if (!isImageFile(file.name)) {
      alert("Preview is only available for image files");
      return;
    }

    // Get the full file path
    const filePath = file.path || `${currentPath}/${file.name}`;
    
    console.log(`🖼️ [FileManager] ========== REQUESTING IMAGE PREVIEW ==========`);
    console.log(`🖼️ [FileManager] File name: ${file.name}`);
    console.log(`🖼️ [FileManager] File path: ${filePath}`);
    console.log(`🖼️ [FileManager] ===========================================`);
    
    // Reset state and open modal
    setPreviewImage(null);
    setLoadingPreview(true);
    setPreviewOpen(true);
    
    // Send preview command with file path
    socketRef.current.emit("send-command", {
      deviceId: device.id,
      command: "getpreviewimg",
      param: filePath,
    });
    
    console.log(`✅ [FileManager] Preview command sent for: ${file.name}`);
  };

  const handleDownload = async (file: FileItem) => {
    if (!socketRef.current || !socketRef.current.connected) {
      alert("Error: Not connected to device");
      return;
    }

    if (file.type === "directory") {
      alert("Cannot download a directory");
      return;
    }

    // Get the full file path
    const filePath = file.path || `${currentPath}${file.name}`;
    
    console.log(`📥 [FileManager] ========== SENDING DOWNLOAD COMMAND ==========`);
    console.log(`📥 [FileManager] File name: ${file.name}`);
    console.log(`📥 [FileManager] File path: ${filePath}`);
    console.log(`📥 [FileManager] ===========================================`);
    
    // Send download command with file path
    socketRef.current.emit("send-command", {
      deviceId: device.id,
      command: "downloadfile",
      param: filePath,
    });
    
    console.log(`✅ [FileManager] Download command sent for: ${file.name}`);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!socketRef.current || !socketRef.current.connected) {
      alert("Error: Not connected to device");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      // Read file as base64
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64Data = e.target?.result as string;
        // Remove data URL prefix if present
        const base64Content = base64Data.includes(",") 
          ? base64Data.split(",")[1] 
          : base64Data;

        console.log(`📤 [FileManager] ========== SENDING UPLOAD COMMAND ==========`);
        console.log(`📤 [FileManager] File name: ${file.name}`);
        console.log(`📤 [FileManager] File size: ${file.size} bytes`);
        console.log(`📤 [FileManager] Destination path: ${currentPath}`);
        console.log(`📤 [FileManager] ===========================================`);

        // Send upload command with file data
        socketRef.current?.emit("send-command", {
          deviceId: device.id,
          command: "upload",
          payload: {
            fileName: file.name,
            destinationPath: currentPath,
            fileData: base64Content,
            fileSize: file.size,
          }
        });

        console.log(`✅ [FileManager] Upload command sent for: ${file.name}`);
      };

      reader.onerror = () => {
        setError("Failed to read file");
        setUploading(false);
      };

      reader.readAsDataURL(file);
    } catch (err: any) {
      console.error("❌ [FileManager] Error reading file:", err);
      setError(`Failed to read file: ${err.message}`);
      setUploading(false);
    }

    // Reset input
    event.target.value = "";
  };

  const handleDelete = async (file: FileItem) => {
    if (!socketRef.current || !socketRef.current.connected) {
      alert("Error: Not connected to device");
      return;
    }

    if (!confirm(`Are you sure you want to delete ${file.name}?`)) {
      return;
    }

    // Get the full file path
    const filePath = file.path || `${currentPath}${file.name}`;
    
    console.log(`🗑️ [FileManager] ========== SENDING DELETE COMMAND ==========`);
    console.log(`🗑️ [FileManager] File name: ${file.name}`);
    console.log(`🗑️ [FileManager] File path: ${filePath}`);
    console.log(`🗑️ [FileManager] ===========================================`);
    
    // Send delete command with file path
    socketRef.current.emit("send-command", {
      deviceId: device.id,
      command: "deletefile",
      param: filePath,
    });
    
    console.log(`✅ [FileManager] Delete command sent for: ${file.name}`);
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "-";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <Folder className="h-6 w-6" />
        <h2 className="text-2xl font-semibold">File Manager</h2>
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
          <div className="flex items-center justify-between">
            <CardTitle>Files</CardTitle>
            <div className="flex items-center gap-2">
              {currentPath !== "/storage/emulated/0" && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleBack}
                  disabled={loading}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
              )}
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => loadFiles(currentPath)}
                disabled={loading || device.status !== "online"}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Refresh
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleUploadClick}
                disabled={uploading || device.status !== "online"}
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Upload
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                style={{ display: "none" }}
                onChange={handleFileSelect}
              />
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-2 font-mono">Path: {currentPath}</p>
        </CardHeader>
        <CardContent>
          {loading && files.length === 0 ? (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading files...</p>
            </div>
          ) : files.length === 0 && !loading ? (
            <div className="text-center py-8 text-muted-foreground">No files found</div>
          ) : (
            <div className="space-y-2">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent cursor-pointer"
                  onDoubleClick={() => {
                    if (file.type === "directory") {
                      handleNavigate(file);
                    }
                  }}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {file.type === "directory" ? (
                      <Folder className="h-5 w-5 text-blue-500 flex-shrink-0" />
                    ) : (
                      <File className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{file.name}</p>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{format(new Date(file.modified), "MMM d, yyyy")}</span>
                          {file.type === "file" && <span>• {formatFileSize(file.size)}</span>}
                        </div>
                        {file.type === "file" && downloadingFiles[file.name] && downloadInfo[file.name] && (
                          <div className="w-full">
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="text-muted-foreground">
                                Downloading: {formatFileSize(downloadInfo[file.name].received)} / {formatFileSize(downloadInfo[file.name].total)}
                              </span>
                              <span className="text-muted-foreground font-medium">
                                {downloadInfo[file.name].percentage}%
                              </span>
                            </div>
                            <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-primary h-full transition-all duration-300 ease-out"
                                style={{
                                  width: `${downloadInfo[file.name].percentage}%`
                                }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <Badge variant={file.type === "directory" ? "default" : "secondary"}>
                      {file.type}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {file.type === "file" && isImageFile(file.name) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePreview(file);
                        }}
                        title="Preview image"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                    {file.type === "file" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(file);
                        }}
                        title="Download file"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(file);
                      }}
                      title="Delete file"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Image Preview Modal */}
      {previewOpen && (
        <div 
          className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => {
            setPreviewOpen(false);
            setPreviewImage(null);
            setLoadingPreview(false);
          }}
        >
          <Card 
            className="w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col shadow-2xl border-2"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="flex-shrink-0 border-b bg-muted/50">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl">Image Preview</CardTitle>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => {
                    setPreviewOpen(false);
                    setPreviewImage(null);
                    setLoadingPreview(false);
                  }}
                  className="h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-2 flex items-center justify-center bg-muted/20 min-h-0">
              {(() => {
                console.log("🖼️ [FileManager] Render check - loadingPreview:", loadingPreview, "previewImage:", !!previewImage);
                if (loadingPreview && !previewImage) {
                  return (
                    <div className="flex flex-col items-center justify-center gap-4 py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground">Loading preview...</p>
                    </div>
                  );
                }
                if (previewImage && previewImage.thumbnail) {
                  console.log("🖼️ [FileManager] Rendering image with src length:", previewImage.thumbnail.length);
                  return (
                    <div className="w-full flex flex-col items-center gap-1">
                      <p className="text-xs font-medium text-muted-foreground truncate w-full text-center px-2">{previewImage.fileName}</p>
                      <div className="relative w-full flex items-center justify-center flex-1 min-h-0 p-2">
                        <img 
                          src={previewImage.thumbnail} 
                          alt={previewImage.fileName}
                          className="object-contain rounded-lg shadow-lg"
                          style={{ 
                            display: 'block', 
                            maxWidth: '100%',
                            maxHeight: 'calc(80vh - 100px)',
                            width: 'auto',
                            height: 'auto'
                          }}
                          onLoad={() => console.log("✅ Image loaded successfully!")}
                          onError={(e) => {
                            console.error("❌ Image failed to load");
                            console.error("❌ Error:", e);
                            console.error("❌ Image src length:", previewImage.thumbnail.length);
                            console.error("❌ Image src preview:", previewImage.thumbnail.substring(0, 100));
                          }}
                        />
                      </div>
                    </div>
                  );
                }
                return (
                  <div className="flex flex-col items-center justify-center gap-4 py-12">
                    <p className="text-sm text-muted-foreground">No preview available</p>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setPreviewOpen(false);
                        setPreviewImage(null);
                        setLoadingPreview(false);
                      }}
                    >
                      Close
                    </Button>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

