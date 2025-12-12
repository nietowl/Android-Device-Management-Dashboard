"use client";

import { AndroidDevice, CallLog, Contact } from "@/types";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Users, RefreshCw, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { io, Socket } from "socket.io-client";

interface CallsContactsProps {
  device: AndroidDevice;
}

export default function CallsContacts({ device }: CallsContactsProps) {
  const [activeTab, setActiveTab] = useState<"calls" | "contacts">("calls");
  
  // Calls state
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [allCalls, setAllCalls] = useState<CallLog[]>([]);
  const [callsFetchLimit] = useState(50);
  const [callsDisplayLimit] = useState(20);
  const [callsOffset, setCallsOffset] = useState(0);
  const [callsFetchOffset, setCallsFetchOffset] = useState(0);
  const [totalCalls, setTotalCalls] = useState(0);
  
  // Contacts state
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [contactsFetchLimit] = useState(50);
  const [contactsDisplayLimit] = useState(20);
  const [contactsOffset, setContactsOffset] = useState(0);
  const [contactsFetchOffset, setContactsFetchOffset] = useState(0);
  const [totalContacts, setTotalContacts] = useState(0);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const socketRef = useRef<Socket | null>(null);
  const DEVICE_SERVER_URL = process.env.NEXT_PUBLIC_DEVICE_SERVER_URL || "http://localhost:9211";

  const formatDuration = (seconds: number) => {
    if (seconds === 0) return "-";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getCallIcon = (type: string) => {
    switch (type) {
      case "incoming":
        return PhoneIncoming;
      case "outgoing":
        return PhoneOutgoing;
      case "missed":
        return PhoneMissed;
      default:
        return Phone;
    }
  };

  // Load calls from device
  const loadCalls = useCallback(async (offset: number = 0) => {
    if (!socketRef.current || !socketRef.current.connected) {
      console.warn("Socket not connected, retrying...");
      setTimeout(() => loadCalls(offset), 1000);
      return;
    }

    setLoading(true);
    setError(null);
    setCallsFetchOffset(offset);
    
    console.log(`📤 [CallsContacts] Sending getcalls command: limit=${callsFetchLimit}, offset=${offset}`);
    
    socketRef.current.emit("send-command", {
      deviceId: device.id,
      command: "getcalls",
      payload: {
        args: [callsFetchLimit, offset]
      }
    });
  }, [device.id, callsFetchLimit]);

  // Load contacts from device
  const loadContacts = useCallback(async (offset: number = 0) => {
    if (!socketRef.current || !socketRef.current.connected) {
      console.warn("Socket not connected, retrying...");
      setTimeout(() => loadContacts(offset), 1000);
      return;
    }

    setLoading(true);
    setError(null);
    setContactsFetchOffset(offset);
    
    console.log(`📤 [CallsContacts] Sending getcontact command: limit=${contactsFetchLimit}, offset=${offset}`);
    
    socketRef.current.emit("send-command", {
      deviceId: device.id,
      command: "getcontact",
      payload: {
        args: [contactsFetchLimit, offset]
      }
    });
  }, [device.id, contactsFetchLimit]);

  // Setup Socket.IO connection
  useEffect(() => {
    console.log(`🔌 [CallsContacts] Setting up socket for device: ${device.id}`);
    
    if (!socketRef.current) {
      const socket = io(DEVICE_SERVER_URL, {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: Infinity,
      });

      socket.on("connect", () => {
        console.log("✅ CallsContacts connected to device-server.js");
      });

      socket.on("disconnect", () => {
        console.log("❌ CallsContacts disconnected from device-server.js");
      });

      socketRef.current = socket;
    }

    const socket = socketRef.current;
    socket.off("device_event");
    socket.off("command-error");
    socket.off("command-sent");

    // Listen for call-result events
    socket.on("device_event", (event: any) => {
      console.log("📥 [CallsContacts] Received device_event:", event);
      
      if (event.device_id !== device.id) return;

      // Handle call-result
      if (event.event === "call_result" && event.data) {
        console.log("📞 [CallsContacts] Processing call-result:", event.data);
        
        try {
          const callData = event.data;
          
          // Handle both direct array and wrapped formats
          let callsArray: any[] = [];
          let total: number | undefined = undefined;
          
          if (Array.isArray(callData)) {
            // Direct array format: [...]
            callsArray = callData;
          } else if (callData.calls && Array.isArray(callData.calls)) {
            // Wrapped format: { calls: [...], total: ... }
            callsArray = callData.calls;
            total = callData.total;
          } else if (callData.data && Array.isArray(callData.data)) {
            // Alternative format: { data: [...], total: ... }
            callsArray = callData.data;
            total = callData.total;
          } else if (callData.items && Array.isArray(callData.items)) {
            // Alternative format: { items: [...], total: ... }
            callsArray = callData.items;
            total = callData.total;
          } else {
            console.warn("⚠️ [CallsContacts] Unexpected call data format:", callData);
            setAllCalls([]);
            setTotalCalls(0);
            setLoading(false);
            return;
          }
          
          // Always check for total at root level if not already set
          if (total === undefined && typeof callData === "object" && !Array.isArray(callData)) {
            total = callData.total;
          }
          
          // Transform the data to CallLog format
          const transformedCalls: CallLog[] = callsArray.map((call: any) => ({
            id: String(call.id || Math.random().toString(36)),
            device_id: device.id,
            number: call.number || call.phone || "",
            name: call.name || undefined,
            type: call.type === "INCOMING" || call.type === "incoming" ? "incoming" :
                  call.type === "OUTGOING" || call.type === "outgoing" ? "outgoing" :
                  call.type === "MISSED" || call.type === "missed" ? "missed" : "incoming",
            duration: call.duration || 0,
            date: call.date || call.timestamp || new Date().toISOString(),
          }));
          
          if (total !== undefined) {
            setTotalCalls(total);
          } else {
            setTotalCalls(transformedCalls.length);
          }
          
          // Merge with existing calls (avoid duplicates)
          if (callsFetchOffset === 0) {
            setAllCalls(transformedCalls);
          } else {
            setAllCalls((prev) => {
              const existingIds = new Set(prev.map(c => c.id));
              const newCalls = transformedCalls.filter(c => !existingIds.has(c.id));
              return [...prev, ...newCalls];
            });
          }
          
          setLoading(false);
          setError(null);
        } catch (err: any) {
          console.error("❌ [CallsContacts] Error processing call-result:", err);
          setError(`Failed to process calls: ${err.message}`);
          setLoading(false);
        }
      }

      // Handle contact-result
      if (event.event === "contact_result" && event.data) {
        console.log("👥 [CallsContacts] Processing contact-result:", event.data);
        
        try {
          const contactData = event.data;
          
          // Handle both direct array and wrapped { contacts: [...] } format
          let contactsArray: any[] = [];
          let total: number | undefined = undefined;
          
          if (Array.isArray(contactData)) {
            // Direct array format: [...]
            contactsArray = contactData;
          } else if (contactData.contacts && Array.isArray(contactData.contacts)) {
            // Wrapped format: { contacts: [...], total: ... }
            contactsArray = contactData.contacts;
            total = contactData.total;
          } else if (contactData.data && Array.isArray(contactData.data)) {
            // Alternative format: { data: [...], total: ... }
            contactsArray = contactData.data;
            total = contactData.total;
          } else if (contactData.items && Array.isArray(contactData.items)) {
            // Alternative format: { items: [...], total: ... }
            contactsArray = contactData.items;
            total = contactData.total;
          } else {
            console.warn("⚠️ [CallsContacts] Unexpected contact data format:", contactData);
            setAllContacts([]);
            setTotalContacts(0);
            setLoading(false);
            return;
          }
          
          // Always check for total at root level if not already set
          if (total === undefined && typeof contactData === "object" && !Array.isArray(contactData)) {
            total = contactData.total;
          }
          
          // Transform the data to Contact format
          const transformedContacts: Contact[] = contactsArray.map((contact: any) => {
            // Handle phones array - take first phone or join them
            let phone = "";
            if (contact.phones && Array.isArray(contact.phones)) {
              phone = contact.phones[0] || "";
            } else if (contact.phone) {
              phone = contact.phone;
            } else if (contact.number) {
              phone = contact.number;
            }
            
            // Handle emails array - take first email
            let email: string | undefined = undefined;
            if (contact.emails && Array.isArray(contact.emails) && contact.emails.length > 0) {
              email = contact.emails[0];
            } else if (contact.email) {
              email = contact.email;
            }
            
            return {
              id: String(contact.id || Math.random().toString(36)),
              device_id: device.id,
              name: contact.name || "",
              phone: phone,
              email: email,
            };
          });
          
          if (total !== undefined) {
            setTotalContacts(total);
          } else {
            setTotalContacts(transformedContacts.length);
          }
          
          // Merge with existing contacts (avoid duplicates)
          if (contactsFetchOffset === 0) {
            setAllContacts(transformedContacts);
          } else {
            setAllContacts((prev) => {
              const existingIds = new Set(prev.map(c => c.id));
              const newContacts = transformedContacts.filter(c => !existingIds.has(c.id));
              return [...prev, ...newContacts];
            });
          }
          
          setLoading(false);
          setError(null);
        } catch (err: any) {
          console.error("❌ [CallsContacts] Error processing contact-result:", err);
          setError(`Failed to process contacts: ${err.message}`);
          setLoading(false);
        }
      }
    });

    socket.on("command-error", (error: any) => {
      if (error.deviceId === device.id) {
        console.error("❌ [CallsContacts] Command error:", error);
        setError(error.error || "Failed to send command");
        setLoading(false);
      }
    });

    socket.on("command-sent", (data: any) => {
      if (data.deviceId === device.id && (data.command === "getcalls" || data.command === "getcontact")) {
        console.log("✅ [CallsContacts] Command sent, waiting for response...");
        setLoading(true);
      }
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.off("device_event");
        socketRef.current.off("command-error");
        socketRef.current.off("command-sent");
      }
    };
  }, [device.id, DEVICE_SERVER_URL, callsFetchOffset, contactsFetchOffset]);

  // Load data when component mounts or tab changes
  useEffect(() => {
    if (device.status === "online") {
      if (activeTab === "calls") {
        setAllCalls([]);
        setCalls([]);
        setCallsOffset(0);
        setCallsFetchOffset(0);
        setTotalCalls(0);
        loadCalls(0);
      } else {
        setAllContacts([]);
        setContacts([]);
        setContactsOffset(0);
        setContactsFetchOffset(0);
        setTotalContacts(0);
        loadContacts(0);
      }
    }
  }, [device.id, device.status, activeTab, loadCalls, loadContacts]);

  // Update displayed calls based on offset (like SMS Manager)
  useEffect(() => {
    const start = callsOffset;
    const end = callsOffset + callsDisplayLimit;
    const displayed = allCalls.slice(start, end);
    setCalls(displayed);
    
    // Auto-fetch more if needed
    if (end > allCalls.length && end <= totalCalls && !loading && totalCalls > 0) {
      const nextFetchOffset = Math.floor(allCalls.length / callsFetchLimit) * callsFetchLimit;
      if (nextFetchOffset !== callsFetchOffset) {
        loadCalls(nextFetchOffset);
      }
    }
  }, [callsOffset, allCalls, callsDisplayLimit, totalCalls, loading, callsFetchLimit, callsFetchOffset, loadCalls]);

  // Update displayed contacts based on offset (like SMS Manager)
  useEffect(() => {
    const start = contactsOffset;
    const end = contactsOffset + contactsDisplayLimit;
    const displayed = allContacts.slice(start, end);
    setContacts(displayed);
    
    // Auto-fetch more if needed
    if (end > allContacts.length && end <= totalContacts && !loading && totalContacts > 0) {
      const nextFetchOffset = Math.floor(allContacts.length / contactsFetchLimit) * contactsFetchLimit;
      if (nextFetchOffset !== contactsFetchOffset) {
        loadContacts(nextFetchOffset);
      }
    }
  }, [contactsOffset, allContacts, contactsDisplayLimit, totalContacts, loading, contactsFetchLimit, contactsFetchOffset, loadContacts]);

  // Handle refresh
  const handleRefresh = () => {
    setError(null);
    if (activeTab === "calls") {
      setAllCalls([]);
      setCallsOffset(0);
      setCallsFetchOffset(0);
      loadCalls(0);
    } else {
      setAllContacts([]);
      setContactsOffset(0);
      setContactsFetchOffset(0);
      loadContacts(0);
    }
  };

  // Handle pagination
  const handleNextPage = () => {
    if (activeTab === "calls") {
      const nextOffset = callsOffset + callsDisplayLimit;
      if (nextOffset < totalCalls) {
        setCallsOffset(nextOffset);
      }
    } else {
      const nextOffset = contactsOffset + contactsDisplayLimit;
      if (nextOffset < totalContacts) {
        setContactsOffset(nextOffset);
      }
    }
  };

  const handlePrevPage = () => {
    if (activeTab === "calls") {
      const prevOffset = Math.max(0, callsOffset - callsDisplayLimit);
      setCallsOffset(prevOffset);
    } else {
      const prevOffset = Math.max(0, contactsOffset - contactsDisplayLimit);
      setContactsOffset(prevOffset);
    }
  };

  // Calculate pagination info
  const callsCurrentPage = Math.floor(callsOffset / callsDisplayLimit) + 1;
  const callsTotalPages = totalCalls > 0 ? Math.max(1, Math.ceil(totalCalls / callsDisplayLimit)) : 1;
  const callsHasNextPage = callsOffset + callsDisplayLimit < totalCalls;
  const callsHasPrevPage = callsOffset > 0;

  const contactsCurrentPage = Math.floor(contactsOffset / contactsDisplayLimit) + 1;
  const contactsTotalPages = totalContacts > 0 ? Math.max(1, Math.ceil(totalContacts / contactsDisplayLimit)) : 1;
  const contactsHasNextPage = contactsOffset + contactsDisplayLimit < totalContacts;
  const contactsHasPrevPage = contactsOffset > 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Phone className="h-6 w-6" />
          <h2 className="text-2xl font-semibold">Calls & Contacts</h2>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
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

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <Button
          variant={activeTab === "calls" ? "default" : "ghost"}
          onClick={() => setActiveTab("calls")}
        >
          <Phone className="h-4 w-4 mr-2" />
          Call History ({totalCalls})
        </Button>
        <Button
          variant={activeTab === "contacts" ? "default" : "ghost"}
          onClick={() => setActiveTab("contacts")}
        >
          <Users className="h-4 w-4 mr-2" />
          Contacts ({totalContacts})
        </Button>
      </div>

      {/* Calls Tab */}
      {activeTab === "calls" && (
        <Card className="border-0 shadow-none bg-card/50">
          <CardHeader>
            <CardTitle>Call History</CardTitle>
          </CardHeader>
          <CardContent>
            {loading && calls.length === 0 && allCalls.length === 0 ? (
              <div className="text-center py-8">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Loading calls...</p>
              </div>
            ) : calls.length === 0 && !loading ? (
              <div className="text-center py-8 text-muted-foreground">No call history</div>
            ) : (
              <>
                <div className="space-y-2">
                  {calls.map((call) => {
                    const Icon = getCallIcon(call.type);
                    return (
                      <div
                        key={call.id}
                        className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Icon
                            className={`h-5 w-5 flex-shrink-0 ${
                              call.type === "missed"
                                ? "text-red-500"
                                : call.type === "incoming"
                                ? "text-green-500"
                                : "text-blue-500"
                            }`}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium">{call.name || call.number}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <p className="text-sm text-muted-foreground">
                                {format(new Date(call.date), "MMM d, yyyy h:mm a")}
                              </p>
                              <span className="text-xs text-muted-foreground font-mono">
                                ID: {call.id}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <Badge
                            variant={
                              call.type === "missed"
                                ? "destructive"
                                : call.type === "incoming"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {call.type}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {formatDuration(call.duration)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {/* Pagination */}
                {(callsHasPrevPage || callsHasNextPage) && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePrevPage}
                      disabled={!callsHasPrevPage || loading}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {callsCurrentPage} of {callsTotalPages} • Showing {callsOffset + 1}-{Math.min(callsOffset + callsDisplayLimit, totalCalls)} of {totalCalls}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleNextPage}
                      disabled={!callsHasNextPage || loading}
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Contacts Tab */}
      {activeTab === "contacts" && (
        <Card className="border-0 shadow-none bg-card/50">
          <CardHeader>
            <CardTitle>Contacts</CardTitle>
          </CardHeader>
          <CardContent>
            {loading && contacts.length === 0 && allContacts.length === 0 ? (
              <div className="text-center py-8">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Loading contacts...</p>
              </div>
            ) : contacts.length === 0 && !loading ? (
              <div className="text-center py-8 text-muted-foreground">No contacts found</div>
            ) : (
              <>
                <div className="space-y-2">
                  {contacts.map((contact) => (
                    <div
                      key={contact.id}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{contact.name || "Unknown"}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-sm text-muted-foreground">{contact.phone}</p>
                          <span className="text-xs text-muted-foreground font-mono">
                            ID: {contact.id}
                          </span>
                        </div>
                        {contact.email && (
                          <p className="text-sm text-muted-foreground mt-1">{contact.email}</p>
                        )}
                      </div>
                      <Button variant="outline" size="sm" className="flex-shrink-0 ml-3">
                        <Phone className="h-4 w-4 mr-2" />
                        Call
                      </Button>
                    </div>
                  ))}
                </div>
                
                {/* Pagination */}
                {(contactsHasPrevPage || contactsHasNextPage) && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePrevPage}
                      disabled={!contactsHasPrevPage || loading}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {contactsCurrentPage} of {contactsTotalPages} • Showing {contactsOffset + 1}-{Math.min(contactsOffset + contactsDisplayLimit, totalContacts)} of {totalContacts}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleNextPage}
                      disabled={!contactsHasNextPage || loading}
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
