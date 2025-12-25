"use client";

import { AndroidDevice, SMSMessage } from "@/types";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  MessageSquare, Trash2, RefreshCw, Loader2, Inbox, Send, Plus, 
  Search, X, MoreVertical, Phone, User, Clock, CreditCard, 
  ChevronLeft, ChevronRight, Filter, CheckCircle2, Circle, Upload
} from "lucide-react";
import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns";
import { io, Socket } from "socket.io-client";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

interface SMSManagerProps {
  device: AndroidDevice;
}

type SMSType = "inbox" | "outbox" | "sent" | "compose";

interface SIMInfo {
  uuid: string;
  isDualSim: boolean;
  totalSlots: number;
  sims: {
    [key: string]: {
      slot: number;
      carrier: string;
      number: string;
      subscriptionId: number;
      iccid: string;
    };
  };
}

interface ComposeSMSProps {
  onSend: (phone: string, message: string, simSlot: string) => Promise<void>;
  device: AndroidDevice;
  simInfo: SIMInfo | null;
  onRequestSimInfo: () => void;
}

function ComposeSMS({ onSend, device, simInfo, onRequestSimInfo }: ComposeSMSProps) {
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [simSlot, setSimSlot] = useState<string>("0");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Request SIM info when component mounts
    onRequestSimInfo();
  }, [onRequestSimInfo]);

  useEffect(() => {
    // Set default to first available SIM slot
    if (simInfo && simInfo.sims) {
      const firstSlot = Object.keys(simInfo.sims)[0];
      setSimSlot(firstSlot || "0");
    }
  }, [simInfo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!phone.trim()) {
      setError("Phone number is required");
      return;
    }

    if (!message.trim()) {
      setError("Message is required");
      return;
    }

    setLoading(true);
    try {
      await onSend(phone.trim(), message.trim(), simSlot);
      setSuccess(true);
      // Clear form after successful send
      setTimeout(() => {
        setPhone("");
        setMessage("");
        setSuccess(false);
      }, 2000);
    } catch (err: any) {
      setError(err.message || "Failed to send SMS");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full p-6 overflow-y-auto">
      <div className="max-w-3xl mx-auto w-full space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-lg bg-primary/10">
            <Send className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Compose SMS</h2>
            <p className="text-sm text-muted-foreground">Send a new message from this device</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
            {/* SIM Info Display */}
            {simInfo ? (
              <div className="p-4 bg-muted/50 rounded-lg border space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Device SIM Information</h3>
                  <Badge variant={simInfo.isDualSim ? "default" : "secondary"}>
                    {simInfo.isDualSim ? "Dual SIM" : "Single SIM"}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  Total SIM Slots: <span className="font-medium text-foreground">{simInfo.totalSlots}</span>
                </div>
                <div className="space-y-2 pt-2">
                  {Object.entries(simInfo.sims).map(([slotKey, sim]) => (
                    <div key={slotKey} className="flex items-center gap-2 text-xs p-2 bg-background rounded border">
                      <CreditCard className="h-3 w-3 text-primary" />
                      <div className="flex-1">
                        <div className="font-medium">{sim.carrier}</div>
                        <div className="text-muted-foreground">{sim.number || "No number"}</div>
                      </div>
                      <Badge variant="outline" className="text-xs">Slot {sim.slot}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-4 bg-muted/50 rounded-lg border flex items-center gap-3">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <div className="text-sm text-muted-foreground">Loading SIM information...</div>
              </div>
            )}

            <div>
              <label className="text-sm font-medium mb-2 block">Phone Number</label>
              <Input
                type="tel"
                placeholder="+1234567890"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={loading}
                className="w-full"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Select SIM Card</label>
              {simInfo && simInfo.sims ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-between"
                      disabled={loading}
                    >
                      <div className="flex flex-col items-start gap-0.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <CreditCard className="h-4 w-4 flex-shrink-0" />
                          <span className="font-medium">
                            {simInfo.sims[simSlot]?.carrier || `Slot ${simSlot}`}
                          </span>
                        </div>
                        {simInfo.sims[simSlot]?.number && (
                          <span className="text-xs text-muted-foreground ml-6">
                            {simInfo.sims[simSlot].number}
                          </span>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 rotate-90 flex-shrink-0" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-full min-w-[300px]">
                    {Object.entries(simInfo.sims).map(([slotKey, sim]) => (
                      <DropdownMenuItem key={slotKey} onClick={() => setSimSlot(slotKey)}>
                        <div className="flex items-start gap-2 flex-1">
                          <CreditCard className="h-4 w-4 mt-0.5 flex-shrink-0" />
                          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{sim.carrier}</span>
                              <Badge variant="outline" className="text-xs">
                                Slot {sim.slot}
                              </Badge>
                            </div>
                            {sim.number && (
                              <span className="text-xs text-muted-foreground">
                                {sim.number}
                              </span>
                            )}
                          </div>
                          {simSlot === slotKey && (
                            <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                          )}
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <div className="w-full p-3 border rounded-md bg-muted/50 text-sm text-muted-foreground text-center">
                  Loading SIM information...
                </div>
              )}
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Message</label>
              <textarea
                className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                placeholder="Type your message here..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={loading}
                maxLength={160}
              />
              <div className="flex justify-between items-center mt-1">
                <p className="text-xs text-muted-foreground">
                  {message.length}/160 characters
                </p>
                {message.length > 160 && (
                  <p className="text-xs text-destructive">Message too long</p>
                )}
              </div>
            </div>

            {/* Success Message */}
            {success && (
              <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-sm font-medium text-green-600">Message sent successfully!</p>
                  <p className="text-xs text-muted-foreground">Your SMS has been sent to {phone}</p>
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="text-sm text-destructive font-medium">{error}</p>
              </div>
            )}

            {/* Submit Button */}
            <div className="flex justify-end gap-3 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setPhone("");
                  setMessage("");
                  setError(null);
                  setSuccess(false);
                }}
                disabled={loading}
              >
                Clear
              </Button>
              <Button 
                type="submit" 
                disabled={loading || !phone.trim() || !message.trim() || message.length > 160}
                className="min-w-[120px]"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send SMS
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
  );
}

function formatMessageDate(date: string): string {
  const messageDate = new Date(date);
  
  if (isToday(messageDate)) {
    return format(messageDate, "h:mm a");
  } else if (isYesterday(messageDate)) {
    return `Yesterday ${format(messageDate, "h:mm a")}`;
  } else {
    return format(messageDate, "MMM d, h:mm a");
  }
}

function getInitials(address: string): string {
  // Extract first letter of each word, or first two characters
  const parts = address.split(/[\s\-]/);
  if (parts.length > 1) {
    return parts.slice(0, 2).map(p => p[0]?.toUpperCase() || "").join("").slice(0, 2);
  }
  return address.slice(0, 2).toUpperCase();
}

export default function SMSManager({ device }: SMSManagerProps) {
  const [messages, setMessages] = useState<SMSMessage[]>([]);
  const [allMessages, setAllMessages] = useState<SMSMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [smsType, setSmsType] = useState<SMSType>("inbox");
  const [fetchLimit] = useState(50);
  const [displayLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [fetchOffset, setFetchOffset] = useState(0);
  const [totalMessages, setTotalMessages] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
  const [simInfo, setSimInfo] = useState<SIMInfo | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const DEVICE_SERVER_URL = process.env.NEXT_PUBLIC_DEVICE_SERVER_URL || "http://localhost:9211";

  // Filter messages based on search query
  const filteredMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages;
    const query = searchQuery.toLowerCase();
    return messages.filter(
      (msg) =>
        msg.address.toLowerCase().includes(query) ||
        msg.body.toLowerCase().includes(query)
    );
  }, [messages, searchQuery]);

  // Group messages by date
  const groupedMessages = useMemo(() => {
    const groups: { [key: string]: SMSMessage[] } = {};
    filteredMessages.forEach((msg) => {
      const date = new Date(msg.date);
      const dateKey = isToday(date)
        ? "Today"
        : isYesterday(date)
        ? "Yesterday"
        : format(date, "MMMM d, yyyy");
      
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(msg);
    });
    return groups;
  }, [filteredMessages]);

  const currentPage = Math.floor(offset / displayLimit) + 1;
  const totalPages = totalMessages > 0 ? Math.max(1, Math.ceil(totalMessages / displayLimit)) : 1;
  const hasNextPage = offset + displayLimit < totalMessages;
  const hasPrevPage = offset > 0;

  // Setup Socket.IO connection (same as before)
  useEffect(() => {
    console.log(`🔌 [SMSManager] Setting up socket for device: ${device.id}`);
    
    if (!socketRef.current) {
      const socket = io(DEVICE_SERVER_URL, {
        path: "/socket.io", // Match device-server.js path
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: Infinity,
      });

      socket.on("connect", () => {
        console.log("✅ SMS Manager connected to device-server.js");
      });

      socket.on("disconnect", () => {
        console.log("❌ SMS Manager disconnected from device-server.js");
      });

      socketRef.current = socket;
    }

    const socket = socketRef.current;
    socket.off("device_event");
    socket.off("command-error");

    socket.on("device_event", (event: any) => {
      console.log("🔔 Device event received:", {
        eventName: event.event,
        deviceId: event.device_id,
        myDeviceId: device.id,
        hasData: !!event.data,
        fullEvent: event
      });
      
      if (event.event === "sms_result" && event.device_id === device.id) {
        if (event.data && event.data.sms && Array.isArray(event.data.sms)) {
          const transformedMessages: SMSMessage[] = event.data.sms.map((sms: any) => {
            const messageType: "sent" | "received" = 
              sms.type === "sent" || sms.type === "outbox"
                ? "sent"
                : event.data.box === "sent" || event.data.box === "outbox" 
                ? "sent" 
                : "received";
            
            return {
              id: String(sms.id),
              device_id: device.id,
              address: sms.address || "",
              body: sms.body || "",
              date: new Date(sms.date).toISOString(),
              type: messageType,
              sim_slot: sms.sim_slot || undefined,
              ...(sms.read !== undefined && { read: sms.read }),
              ...(sms.seen !== undefined && { seen: sms.seen }),
              ...(sms.thread_id !== undefined && { thread_id: sms.thread_id }),
            };
          });
          
          if (event.data.total !== undefined) {
            setTotalMessages(event.data.total);
          } else {
            setTotalMessages(transformedMessages.length);
          }
          
          if (fetchOffset === 0) {
            setAllMessages(transformedMessages);
          } else {
            setAllMessages((prev) => {
              const existingIds = new Set(prev.map(m => m.id));
              const newMessages = transformedMessages.filter(m => !existingIds.has(m.id));
              return [...prev, ...newMessages];
            });
          }
          
          setLoading(false);
          
          if (transformedMessages.length === 0) {
            setStatusMessage(event.data.note || `No ${event.data.box || smsType} messages found`);
          } else {
            setStatusMessage(null);
          }
        } else {
          setMessages([]);
          setLoading(false);
        }
      }
      
      // Handle siminfo-result event (check multiple possible event names)
      const isSimInfoEvent = (
        event.event === "siminfo-result" || 
        event.event === "siminfo_result" ||
        event.event === "simInfo-result" ||
        event.event === "simInfo_result"
      );
      
      if (isSimInfoEvent && event.device_id === device.id) {
        console.log("✅ SIM info received for device:", device.id);
        console.log("📱 SIM Data:", JSON.stringify(event.data, null, 2));
        console.log("📱 SIM Data type:", typeof event.data);
        console.log("📱 SIM Data keys:", event.data ? Object.keys(event.data) : "no data");
        setSimInfo(event.data);
      }
    });

    socket.on("command-error", (error: any) => {
      if (error.deviceId === device.id) {
        setLoading(false);
      }
    });

    // Also listen for siminfo-result as a direct event (fallback)
    socket.on("siminfo-result", (data: any) => {
      console.log("📱 Direct siminfo-result event received:", data);
      if (data && data.uuid === device.id) {
        console.log("✅ Direct SIM info matched device:", device.id);
        setSimInfo(data);
      }
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.off("device_event");
        socketRef.current.off("command-error");
        socketRef.current.off("siminfo-result");
      }
    };
  }, [device.id, DEVICE_SERVER_URL, fetchOffset, smsType]);

  const loadMessages = useCallback(async (type: SMSType = smsType, newOffset: number = 0) => {
    if (!socketRef.current || !socketRef.current.connected) {
      setTimeout(() => loadMessages(type, newOffset), 1000);
      return;
    }

    setLoading(true);
    setFetchOffset(newOffset);
    const param = `${type}|${fetchLimit}|${newOffset}`;
    
    socketRef.current.emit("send-command", {
      deviceId: device.id,
      command: "getsms",
      param: param,
    });
  }, [device.id, fetchLimit, smsType]);

  useEffect(() => {
    if (device.status === "online") {
      setAllMessages([]);
      setOffset(0);
      setFetchOffset(0);
      setTotalMessages(0);
      setSelectedMessages(new Set());
      loadMessages(smsType, 0);
    }
  }, [device.id, device.status, smsType, loadMessages]);
  
  useEffect(() => {
    const start = offset;
    const end = offset + displayLimit;
    const displayed = allMessages.slice(start, end);
    setMessages(displayed);
    
    if (end > allMessages.length && end <= totalMessages && !loading && totalMessages > 0) {
      const nextFetchOffset = Math.floor(allMessages.length / fetchLimit) * fetchLimit;
      if (nextFetchOffset !== fetchOffset) {
        loadMessages(smsType, nextFetchOffset);
      }
    }
  }, [offset, allMessages, displayLimit, totalMessages, loading, smsType, fetchLimit, fetchOffset, loadMessages]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleTypeChange = (type: SMSType) => {
    setSmsType(type);
    setMessages([]);
    setAllMessages([]);
    setStatusMessage(null);
    setSelectedMessages(new Set());
    setOffset(0);
    setFetchOffset(0);
    setTotalMessages(0);
    setSearchQuery("");
    
    // Don't load messages for compose tab
    if (type !== "compose") {
      loadMessages(type, 0);
    } else {
      // Request SIM info when switching to compose
      handleRequestSimInfo();
    }
  };

  const handleDelete = async (messageId: string) => {
    // TODO: Implement delete SMS command
    setMessages(messages.filter((m) => m.id !== messageId));
    setAllMessages((prev) => prev.filter((m) => m.id !== messageId));
  };

  const handleBulkDelete = async () => {
    // TODO: Implement bulk delete
    const idsToDelete = Array.from(selectedMessages);
    setMessages(messages.filter((m) => !idsToDelete.includes(m.id)));
    setAllMessages((prev) => prev.filter((m) => !idsToDelete.includes(m.id)));
    setSelectedMessages(new Set());
  };

  const toggleSelectMessage = (messageId: string) => {
    setSelectedMessages((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedMessages.size === filteredMessages.length) {
      setSelectedMessages(new Set());
    } else {
      setSelectedMessages(new Set(filteredMessages.map(m => m.id)));
    }
  };

  const handleRefresh = () => {
    setStatusMessage(null);
    setSelectedMessages(new Set());
    setSearchQuery("");
    loadMessages(smsType, offset);
  };

  const handleNextPage = () => {
    if (hasNextPage && !loading) {
      setOffset(offset + displayLimit);
      setSelectedMessages(new Set());
    }
  };

  const handlePrevPage = () => {
    if (hasPrevPage && !loading) {
      setOffset(Math.max(0, offset - displayLimit));
      setSelectedMessages(new Set());
    }
  };

  const handleRequestSimInfo = useCallback(() => {
    // Request SIM info from device
    if (socketRef.current && socketRef.current.connected) {
      console.log("📡 Requesting SIM info for device:", device.id);
      socketRef.current.emit("send-command", {
        deviceId: device.id,
        command: "getsiminfo",
        param: "",
      });
    } else {
      console.warn("⚠️ Socket not connected when trying to get SIM info");
    }
  }, [device.id]);

  const handleSendSMS = async (phone: string, message: string, simSlot: string) => {
    if (!socketRef.current || !socketRef.current.connected) {
      throw new Error("Device not connected");
    }

    // Send SMS command with format: simslotindex|sendernumber|message
    socketRef.current.emit("send-command", {
      deviceId: device.id,
      command: "sendsms",
      param: `${simSlot}|${phone}|${message}`,
    });

    // Refresh messages after sending
    setTimeout(() => {
      loadMessages(smsType, 0);
    }, 1000);
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex-shrink-0 border-b bg-card/50 backdrop-blur-sm p-4 space-y-3">
        {/* Top Row: Title and Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <MessageSquare className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">SMS Manager</h2>
              <p className="text-xs text-muted-foreground">
                {totalMessages > 0 ? `${totalMessages} total messages` : "No messages"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {smsType !== "compose" && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={loading || device.status !== "online"}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Search Bar - Hide on Compose tab */}
        {smsType !== "compose" && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search messages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-9"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setSearchQuery("")}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}

        {/* Tabs and Bulk Actions */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg">
            <Button
              variant={smsType === "inbox" ? "default" : "ghost"}
              size="sm"
              onClick={() => handleTypeChange("inbox")}
              className="h-8 gap-2"
            >
              <Inbox className="h-4 w-4" />
              Inbox
            </Button>
            <Button
              variant={smsType === "sent" ? "default" : "ghost"}
              size="sm"
              onClick={() => handleTypeChange("sent")}
              className="h-8 gap-2"
            >
              <Send className="h-4 w-4" />
              Sent
            </Button>
            <Button
              variant={smsType === "outbox" ? "default" : "ghost"}
              size="sm"
              onClick={() => handleTypeChange("outbox")}
              className="h-8 gap-2"
            >
              <Upload className="h-4 w-4" />
              Outbox
            </Button>
            <Button
              variant={smsType === "compose" ? "default" : "ghost"}
              size="sm"
              onClick={() => handleTypeChange("compose")}
              className="h-8 gap-2"
            >
              <Plus className="h-4 w-4" />
              Compose
            </Button>
          </div>

          {selectedMessages.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {selectedMessages.size} selected
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkDelete}
                className="gap-2 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Messages List or Compose Form */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {smsType === "compose" ? (
          <ComposeSMS
            onSend={handleSendSMS}
            device={device}
            simInfo={simInfo}
            onRequestSimInfo={handleRequestSimInfo}
          />
        ) : device.status !== "online" ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="p-4 rounded-full bg-muted mb-4">
              <MessageSquare className="h-12 w-12 text-muted-foreground" />
            </div>
            <p className="text-lg font-medium mb-2">Device is offline</p>
            <p className="text-sm text-muted-foreground">Connect device to view messages</p>
          </div>
        ) : loading && messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-lg font-medium">Loading messages...</p>
          </div>
        ) : filteredMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="p-4 rounded-full bg-muted mb-4">
              <MessageSquare className="h-12 w-12 text-muted-foreground" />
            </div>
            <p className="text-lg font-medium mb-2">
              {searchQuery ? "No messages found" : statusMessage || "No messages"}
            </p>
            {searchQuery ? (
              <p className="text-sm text-muted-foreground">Try a different search term</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Try selecting a different message type
              </p>
            )}
          </div>
        ) : (
          <div className="p-4 space-y-6">
            {Object.entries(groupedMessages).map(([dateKey, dateMessages]) => (
              <div key={dateKey} className="space-y-3">
                {/* Date Header */}
                <div className="sticky top-0 z-10 flex items-center gap-2 py-2 bg-background/80 backdrop-blur-sm">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs font-medium text-muted-foreground px-2">
                    {dateKey}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                {/* Messages */}
                {dateMessages.map((message) => {
                  const isSelected = selectedMessages.has(message.id);
                  const isSent = message.type === "sent" || smsType === "sent" || smsType === "outbox";
                  
                  return (
                    <div
                      key={message.id}
                      className={`group relative flex gap-3 p-3 rounded-xl transition-all ${
                        isSelected ? "bg-primary/10 ring-2 ring-primary" : "hover:bg-muted/50"
                      } ${isSent ? "flex-row-reverse" : ""}`}
                    >
                      {/* Selection Checkbox */}
                      <button
                        onClick={() => toggleSelectMessage(message.id)}
                        className={`flex-shrink-0 mt-1 transition-all ${
                          isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                        }`}
                      >
                        {isSelected ? (
                          <CheckCircle2 className="h-5 w-5 text-primary" />
                        ) : (
                          <Circle className="h-5 w-5 text-muted-foreground" />
                        )}
                      </button>

                      {/* Avatar */}
                      <div
                        className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center text-sm font-semibold ${
                          isSent
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {getInitials(message.address)}
                      </div>

                      {/* Message Content */}
                      <div className={`flex-1 min-w-0 ${isSent ? "text-right" : ""}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-semibold text-sm">{message.address}</p>
                          {message.sim_slot && message.sim_slot !== "unknown" && (
                            <Badge variant="outline" className="text-xs gap-1">
                              <CreditCard className="h-3 w-3" />
                              SIM {message.sim_slot}
                            </Badge>
                          )}
                          {message.read !== undefined && !message.read && (
                            <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-600 border-blue-500/20">
                              Unread
                            </Badge>
                          )}
                        </div>

                        <div
                          className={`inline-block max-w-[85%] rounded-2xl px-4 py-2 mb-1 ${
                            isSent
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-foreground"
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap break-words">
                            {message.body}
                          </p>
                        </div>

                        <div className={`flex items-center gap-2 text-xs text-muted-foreground ${isSent ? "justify-end" : ""}`}>
                          <Clock className="h-3 w-3" />
                          <span>{formatMessageDate(message.date)}</span>
                          {message.seen !== undefined && (
                            <>
                              <span>•</span>
                              <span>{message.seen ? "Seen" : "Not seen"}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Actions Menu */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity ${
                              isSent ? "order-first" : ""
                            }`}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align={isSent ? "end" : "start"}>
                          <DropdownMenuItem onClick={() => handleDelete(message.id)}>
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem>
                            <Phone className="h-4 w-4 mr-2" />
                            Call {message.address}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  );
                })}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Pagination Footer */}
      {messages.length > 0 && !loading && smsType !== "compose" && (
        <div className="flex-shrink-0 border-t bg-card/50 backdrop-blur-sm p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Showing <span className="font-medium text-foreground">{offset + 1}</span> -{" "}
              <span className="font-medium text-foreground">
                {Math.min(offset + displayLimit, totalMessages)}
              </span>{" "}
              of <span className="font-medium text-foreground">{totalMessages}</span> messages
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrevPage}
                disabled={!hasPrevPage || loading}
                className="gap-2"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <div className="px-3 py-1 text-sm font-medium">
                Page {currentPage} of {totalPages}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNextPage}
                disabled={!hasNextPage || loading}
                className="gap-2"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
