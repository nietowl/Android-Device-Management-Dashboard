"use client";

import { AndroidDevice, FileItem } from "@/types";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Folder, File, Upload, Download, Trash2, ArrowLeft } from "lucide-react";
import { format } from "date-fns";

interface FileManagerProps {
  device: AndroidDevice;
}

export default function FileManager({ device }: FileManagerProps) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [currentPath, setCurrentPath] = useState("/");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFiles(currentPath);
  }, [device.id, currentPath]);

  const loadFiles = async (path: string) => {
    setLoading(true);
    // In a real app, this would fetch from your API
    setTimeout(() => {
      setFiles([
        {
          id: "1",
          device_id: device.id,
          path: path,
          name: "Documents",
          type: "directory",
          modified: new Date().toISOString(),
        },
        {
          id: "2",
          device_id: device.id,
          path: path,
          name: "Pictures",
          type: "directory",
          modified: new Date().toISOString(),
        },
        {
          id: "3",
          device_id: device.id,
          path: path,
          name: "example.txt",
          type: "file",
          size: 1024,
          modified: new Date().toISOString(),
        },
      ]);
      setLoading(false);
    }, 500);
  };

  const handleNavigate = (file: FileItem) => {
    if (file.type === "directory") {
      setCurrentPath(`${currentPath}${file.name}/`);
    }
  };

  const handleBack = () => {
    const parts = currentPath.split("/").filter(Boolean);
    if (parts.length > 0) {
      parts.pop();
      setCurrentPath(parts.length > 0 ? `/${parts.join("/")}/` : "/");
    }
  };

  const handleDownload = async (file: FileItem) => {
    // In a real app, this would call your API
    alert(`Downloading ${file.name}...`);
  };

  const handleDelete = async (file: FileItem) => {
    // In a real app, this would call your API
    if (confirm(`Delete ${file.name}?`)) {
      setFiles(files.filter((f) => f.id !== file.id));
    }
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

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Files</CardTitle>
            <div className="flex items-center gap-2">
              {currentPath !== "/" && (
                <Button variant="outline" size="sm" onClick={handleBack}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
              )}
              <Button variant="outline" size="sm">
                <Upload className="h-4 w-4 mr-2" />
                Upload
              </Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-2">Path: {currentPath}</p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading files...</div>
          ) : files.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No files found</div>
          ) : (
            <div className="space-y-2">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent cursor-pointer"
                  onClick={() => handleNavigate(file)}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {file.type === "directory" ? (
                      <Folder className="h-5 w-5 text-blue-500 flex-shrink-0" />
                    ) : (
                      <File className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{file.name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{format(new Date(file.modified), "MMM d, yyyy")}</span>
                        {file.type === "file" && <span>• {formatFileSize(file.size)}</span>}
                      </div>
                    </div>
                    <Badge variant={file.type === "directory" ? "default" : "secondary"}>
                      {file.type}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {file.type === "file" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(file);
                        }}
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
    </div>
  );
}

