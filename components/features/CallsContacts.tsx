"use client";

import { AndroidDevice, CallLog, Contact } from "@/types";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Users, RefreshCw, Loader2, ChevronLeft, ChevronRight, X, Plus, Trash2, Forward, Hash, Trash } from "lucide-react";
import { format } from "date-fns";
import { io, Socket } from "socket.io-client";
import { Input } from "@/components/ui/input";

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
  
  // Add Contact Modal State
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [addContactLoading, setAddContactLoading] = useState(false);
  const [newContact, setNewContact] = useState({
    name: "",
    phone: "",
    email: "",
  });

  // Call Forward Modal State
  const [showCallForwardModal, setShowCallForwardModal] = useState(false);
  const [callForwardLoading, setCallForwardLoading] = useState(false);
  const [callForwardAction, setCallForwardAction] = useState<"enable" | "disable">("enable");
  const [callForwardData, setCallForwardData] = useState({
    number: "",
    simSlot: "0",
  });

  // USSD Modal State
  const [showUSSDModal, setShowUSSDModal] = useState(false);
  const [ussdLoading, setUssdLoading] = useState(false);
  const [ussdData, setUssdData] = useState({
    code: "",
    simSlot: "0",
  });

  // Delete Call Modal State
  const [showDeleteCallModal, setShowDeleteCallModal] = useState(false);
  const [deleteCallLoading, setDeleteCallLoading] = useState(false);
  const [deleteCallNumber, setDeleteCallNumber] = useState("");
  
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
        path: "/socket.io", // Match device-server.js path
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

      // Handle add-contact-result
      if (event.event === "add_contact_result") {
        console.log("👥 [CallsContacts] Processing add-contact-result:", event.data);
        
        // Clear timeout if it exists
        if (socketRef.current && (socketRef.current as any)._addContactTimeout) {
          clearTimeout((socketRef.current as any)._addContactTimeout);
          delete (socketRef.current as any)._addContactTimeout;
        }
        
        // Always clear loading state when we receive a response
        setAddContactLoading(false);
        
        // If no data or empty data, treat as success (contact was added)
        if (!event.data || Object.keys(event.data || {}).length === 0) {
          setShowAddContactModal(false);
          setNewContact({ name: "", phone: "", email: "" });
          setError(null);
          setAllContacts([]);
          setContactsOffset(0);
          setContactsFetchOffset(0);
          loadContacts(0);
          return;
        }
        
        // Check for explicit error or failure
        const hasError = event.data.error || 
                        event.data.success === false || 
                        event.data.failed === true ||
                        (typeof event.data === "object" && event.data.message && event.data.message.toLowerCase().includes("error"));
        
        if (hasError) {
          setError(event.data.error || event.data.message || "Failed to add contact");
        } else {
          // Success - close modal and refresh contacts
          setShowAddContactModal(false);
          setNewContact({ name: "", phone: "", email: "" });
          setError(null);
          // Refresh contacts list
          setAllContacts([]);
          setContactsOffset(0);
          setContactsFetchOffset(0);
          loadContacts(0);
        }
      }

      // Handle delete-contact-result
      if (event.event === "delete_contact_result" && event.data) {
        console.log("👥 [CallsContacts] Processing delete-contact-result:", event.data);
        
        // Clear timeout if it exists
        if (socketRef.current && (socketRef.current as any)._deleteContactTimeout) {
          clearTimeout((socketRef.current as any)._deleteContactTimeout);
          delete (socketRef.current as any)._deleteContactTimeout;
        }
        
        if (event.data.success !== false) {
          // Success - refresh contacts list to ensure sync
          setAllContacts([]);
          setContactsOffset(0);
          setContactsFetchOffset(0);
          loadContacts(0);
        } else {
          // Failed - restore the contact in the list and show error
          setError(event.data.error || "Failed to delete contact");
          // Reload contacts to restore the deleted contact
          loadContacts(contactsFetchOffset);
        }
      }

      // Handle call-forward-result
      if (event.event === "call_forward_result") {
        console.log("📞 [CallsContacts] Processing call-forward-result:", event.data);
        
        // Clear timeout if it exists
        if (socketRef.current && (socketRef.current as any)._callForwardTimeout) {
          clearTimeout((socketRef.current as any)._callForwardTimeout);
          delete (socketRef.current as any)._callForwardTimeout;
        }
        
        setCallForwardLoading(false);
        
        if (event.data && (event.data.error || event.data.success === false)) {
          setError(event.data.error || "Failed to configure call forwarding");
        } else {
          setShowCallForwardModal(false);
          setCallForwardData({ number: "", simSlot: "0" });
          setError(null);
        }
      }

      // Handle ussd-result
      if (event.event === "ussd_result") {
        console.log("📱 [CallsContacts] Processing ussd-result:", event.data);
        
        // Clear timeout if it exists
        if (socketRef.current && (socketRef.current as any)._ussdTimeout) {
          clearTimeout((socketRef.current as any)._ussdTimeout);
          delete (socketRef.current as any)._ussdTimeout;
        }
        
        setUssdLoading(false);
        
        if (event.data && (event.data.error || event.data.success === false)) {
          setError(event.data.error || "Failed to run USSD code");
        } else {
          setShowUSSDModal(false);
          setUssdData({ code: "", simSlot: "0" });
          setError(null);
          // Show USSD response if available
          if (event.data && event.data.response) {
            alert(`USSD Response: ${event.data.response}`);
          }
        }
      }

      // Handle delete-call-result
      if (event.event === "delete_call_result") {
        console.log("🗑️ [CallsContacts] Processing delete-call-result:", event.data);
        
        // Clear timeout if it exists
        if (socketRef.current && (socketRef.current as any)._deleteCallTimeout) {
          clearTimeout((socketRef.current as any)._deleteCallTimeout);
          delete (socketRef.current as any)._deleteCallTimeout;
        }
        
        setDeleteCallLoading(false);
        
        if (event.data && (event.data.error || event.data.success === false)) {
          setError(event.data.error || "Failed to delete call log");
        } else {
          setShowDeleteCallModal(false);
          setDeleteCallNumber("");
          setError(null);
          // Refresh calls list
          setAllCalls([]);
          setCallsOffset(0);
          setCallsFetchOffset(0);
          loadCalls(0);
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

  // Handle Add Contact
  const handleAddContact = () => {
    if (!socketRef.current || !socketRef.current.connected) {
      setError("Socket not connected");
      return;
    }

    if (!newContact.name || !newContact.phone) {
      setError("Name and phone number are required");
      return;
    }

    setAddContactLoading(true);
    setError(null);

    // Format: "name|phone" or "name|phone|email" if email provided
    const param = newContact.email 
      ? `${newContact.name}|${newContact.phone}|${newContact.email}`
      : `${newContact.name}|${newContact.phone}`;

    console.log(`📤 [CallsContacts] Sending addcontact command with param: ${param}`);
    
    // Set timeout to clear loading state if no response (3 seconds - assume success)
    // This handles cases where contact is added quickly but response event doesn't fire
    const timeoutId = setTimeout(() => {
      console.log("✅ [CallsContacts] Add contact - assuming success after timeout");
      setAddContactLoading(false);
      // Assume success and refresh contacts (contact was likely added)
      setShowAddContactModal(false);
      setNewContact({ name: "", phone: "", email: "" });
      setError(null);
      setAllContacts([]);
      setContactsOffset(0);
      setContactsFetchOffset(0);
      loadContacts(0);
    }, 3000);

    socketRef.current.emit("send-command", {
      deviceId: device.id,
      command: "addcontact",
      param: param
    });

    // Store timeout ID to clear it when response is received
    // We'll clear it in the event handler
    (socketRef.current as any)._addContactTimeout = timeoutId;
  };

  // Handle Delete Contact
  const handleDeleteContact = (contactId: string) => {
    if (!socketRef.current || !socketRef.current.connected) {
      setError("Socket not connected");
      return;
    }

    if (!confirm(`Are you sure you want to delete this contact?`)) {
      return;
    }

    setError(null);

    console.log(`📤 [CallsContacts] Sending deletecontact command for ID: ${contactId}`);
    
    // Optimistically remove contact from local state for immediate UI update
    setAllContacts(prev => prev.filter(c => c.id !== contactId));
    setContacts(prev => prev.filter(c => c.id !== contactId));
    setTotalContacts(prev => Math.max(0, prev - 1));
    
    // Set timeout to refresh contacts list if no response (2 seconds - assume success)
    const timeoutId = setTimeout(() => {
      console.log("✅ [CallsContacts] Delete contact - refreshing list after timeout");
      // Refresh contacts list to ensure sync with device
      setAllContacts([]);
      setContactsOffset(0);
      setContactsFetchOffset(0);
      loadContacts(0);
    }, 2000);
    
    socketRef.current.emit("send-command", {
      deviceId: device.id,
      command: "deletecontact",
      param: contactId,
    });
    
    // Store timeout ID to clear it when response is received
    (socketRef.current as any)._deleteContactTimeout = timeoutId;
  };

  // Handle Call Forward
  const handleCallForward = () => {
    if (!socketRef.current || !socketRef.current.connected) {
      setError("Socket not connected");
      return;
    }

    if (callForwardAction === "enable" && !callForwardData.number) {
      setError("Phone number is required to enable call forwarding");
      return;
    }

    setCallForwardLoading(true);
    setError(null);

    // Format: "number|simSlot" for enable, "simSlot" for disable (only SIM index)
    const param = callForwardAction === "enable"
      ? `${callForwardData.number}|${callForwardData.simSlot}`
      : callForwardData.simSlot;

    console.log(`📤 [CallsContacts] Sending callforward command: ${callForwardAction}, param: ${param}`);
    
    // Set timeout to clear loading state if no response (3 seconds - assume success)
    const timeoutId = setTimeout(() => {
      console.log("✅ [CallsContacts] Call forward - assuming success after timeout");
      setCallForwardLoading(false);
      // Assume success and close modal
      setShowCallForwardModal(false);
      setCallForwardData({ number: "", simSlot: "0" });
      setError(null);
    }, 3000);

    socketRef.current.emit("send-command", {
      deviceId: device.id,
      command: callForwardAction === "enable" ? "enablecallforward" : "disablecallforward",
      param: param,
    });

    // Store timeout ID to clear it when response is received
    (socketRef.current as any)._callForwardTimeout = timeoutId;
  };

  // Handle USSD
  const handleUSSD = () => {
    if (!socketRef.current || !socketRef.current.connected) {
      setError("Socket not connected");
      return;
    }

    if (!ussdData.code) {
      setError("USSD code is required");
      return;
    }

    setUssdLoading(true);
    setError(null);

    // Format: "code|simSlot"
    const param = `${ussdData.code}|${ussdData.simSlot}`;

    console.log(`📤 [CallsContacts] Sending ussd command, param: ${param}`);
    
    // Set timeout to clear loading state if no response (5 seconds - USSD might take longer)
    const timeoutId = setTimeout(() => {
      console.log("✅ [CallsContacts] USSD - assuming success after timeout");
      setUssdLoading(false);
      // Assume success and close modal
      setShowUSSDModal(false);
      setUssdData({ code: "", simSlot: "0" });
      setError(null);
    }, 5000);

    socketRef.current.emit("send-command", {
      deviceId: device.id,
      command: "ussd",
      param: param,
    });

    // Store timeout ID to clear it when response is received
    (socketRef.current as any)._ussdTimeout = timeoutId;
  };

  // Handle Delete Call
  const handleDeleteCall = () => {
    if (!socketRef.current || !socketRef.current.connected) {
      setError("Socket not connected");
      return;
    }

    if (!deleteCallNumber) {
      setError("Call number is required");
      return;
    }

    if (!confirm(`Are you sure you want to delete this call log?`)) {
      return;
    }

    setDeleteCallLoading(true);
    setError(null);

    console.log(`📤 [CallsContacts] Sending deletecall command, param: ${deleteCallNumber}`);
    
    // Set timeout to clear loading state if no response (2 seconds - assume success)
    const timeoutId = setTimeout(() => {
      console.log("✅ [CallsContacts] Delete call - assuming success after timeout (no response received)");
      setDeleteCallLoading(false);
      // Assume success, close modal and refresh calls list
      setShowDeleteCallModal(false);
      setDeleteCallNumber("");
      setError(null);
      // Refresh calls list to show updated data
      setAllCalls([]);
      setCallsOffset(0);
      setCallsFetchOffset(0);
      loadCalls(0);
    }, 2000);

    socketRef.current.emit("send-command", {
      deviceId: device.id,
      command: "deletecall",
      param: deleteCallNumber,
    });

    // Store timeout ID to clear it when response is received
    (socketRef.current as any)._deleteCallTimeout = timeoutId;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Phone className="h-6 w-6" />
          <h2 className="text-2xl font-semibold">Calls & Contacts</h2>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === "calls" && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCallForwardAction("enable");
                  setShowCallForwardModal(true);
                }}
                disabled={device.status !== "online"}
              >
                <Forward className="h-4 w-4 mr-2" />
                Call Forward
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowUSSDModal(true)}
                disabled={device.status !== "online"}
              >
                <Hash className="h-4 w-4 mr-2" />
                USSD
              </Button>
            </>
          )}
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
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setDeleteCallNumber(call.number || call.id);
                              setShowDeleteCallModal(true);
                            }}
                            disabled={device.status !== "online"}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
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
            <div className="flex items-center justify-between">
              <CardTitle>Contacts</CardTitle>
              <Button
                variant="default"
                size="sm"
                onClick={() => setShowAddContactModal(true)}
                disabled={device.status !== "online"}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Contact
              </Button>
            </div>
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
                      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                        <Button variant="outline" size="sm">
                          <Phone className="h-4 w-4 mr-2" />
                          Call
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleDeleteContact(contact.id)}
                          disabled={device.status !== "online"}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
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

      {/* Add Contact Modal */}
      {showAddContactModal && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="flex-shrink-0 border-b bg-muted/50">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl">Add New Contact</CardTitle>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => {
                    setShowAddContactModal(false);
                    setNewContact({ name: "", phone: "", email: "" });
                    setError(null);
                  }}
                  className="h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Name *</label>
                <Input
                  type="text"
                  placeholder="Contact name"
                  value={newContact.name}
                  onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                  disabled={addContactLoading}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Phone Number *</label>
                <Input
                  type="tel"
                  placeholder="+1234567890"
                  value={newContact.phone}
                  onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                  disabled={addContactLoading}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Email (Optional)</label>
                <Input
                  type="email"
                  placeholder="email@example.com"
                  value={newContact.email}
                  onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                  disabled={addContactLoading}
                />
              </div>
              {error && (
                <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-md">
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAddContactModal(false);
                    setNewContact({ name: "", phone: "", email: "" });
                    setError(null);
                  }}
                  disabled={addContactLoading}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAddContact}
                  disabled={addContactLoading || !newContact.name || !newContact.phone || device.status !== "online"}
                >
                  {addContactLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Contact
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Call Forward Modal */}
      {showCallForwardModal && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="flex-shrink-0 border-b bg-muted/50">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl">Call Forwarding</CardTitle>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => {
                    setShowCallForwardModal(false);
                    setCallForwardData({ number: "", simSlot: "0" });
                    setError(null);
                  }}
                  className="h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Action</label>
                <div className="flex gap-2">
                  <Button
                    variant={callForwardAction === "enable" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCallForwardAction("enable")}
                    disabled={callForwardLoading}
                    className="flex-1"
                  >
                    Enable
                  </Button>
                  <Button
                    variant={callForwardAction === "disable" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCallForwardAction("disable")}
                    disabled={callForwardLoading}
                    className="flex-1"
                  >
                    Disable
                  </Button>
                </div>
              </div>
              {callForwardAction === "enable" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Phone Number *</label>
                  <Input
                    type="tel"
                    placeholder="+1234567890"
                    value={callForwardData.number}
                    onChange={(e) => setCallForwardData({ ...callForwardData, number: e.target.value })}
                    disabled={callForwardLoading}
                  />
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium">SIM Slot *</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={callForwardData.simSlot}
                  onChange={(e) => setCallForwardData({ ...callForwardData, simSlot: e.target.value })}
                  disabled={callForwardLoading}
                >
                  <option value="0">SIM 1</option>
                  <option value="1">SIM 2</option>
                </select>
              </div>
              {error && (
                <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-md">
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowCallForwardModal(false);
                    setCallForwardData({ number: "", simSlot: "0" });
                    setError(null);
                  }}
                  disabled={callForwardLoading}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCallForward}
                  disabled={
                    callForwardLoading || 
                    device.status !== "online" ||
                    (callForwardAction === "enable" && !callForwardData.number)
                  }
                >
                  {callForwardLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Forward className="h-4 w-4 mr-2" />
                      {callForwardAction === "enable" ? "Enable" : "Disable"}
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* USSD Modal */}
      {showUSSDModal && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="flex-shrink-0 border-b bg-muted/50">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl">Run USSD Code</CardTitle>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => {
                    setShowUSSDModal(false);
                    setUssdData({ code: "", simSlot: "0" });
                    setError(null);
                  }}
                  className="h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">USSD Code *</label>
                <Input
                  type="text"
                  placeholder="*123#"
                  value={ussdData.code}
                  onChange={(e) => setUssdData({ ...ussdData, code: e.target.value })}
                  disabled={ussdLoading}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">SIM Slot</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={ussdData.simSlot}
                  onChange={(e) => setUssdData({ ...ussdData, simSlot: e.target.value })}
                  disabled={ussdLoading}
                >
                  <option value="0">SIM 1</option>
                  <option value="1">SIM 2</option>
                </select>
              </div>
              {error && (
                <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-md">
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowUSSDModal(false);
                    setUssdData({ code: "", simSlot: "0" });
                    setError(null);
                  }}
                  disabled={ussdLoading}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleUSSD}
                  disabled={ussdLoading || !ussdData.code || device.status !== "online"}
                >
                  {ussdLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Running...
                    </>
                  ) : (
                    <>
                      <Hash className="h-4 w-4 mr-2" />
                      Run USSD
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Delete Call Modal */}
      {showDeleteCallModal && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="flex-shrink-0 border-b bg-muted/50">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl">Delete Call Log</CardTitle>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => {
                    setShowDeleteCallModal(false);
                    setDeleteCallNumber("");
                    setError(null);
                  }}
                  className="h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Call Number *</label>
                <Input
                  type="tel"
                  placeholder="+1234567890 or call ID"
                  value={deleteCallNumber}
                  onChange={(e) => setDeleteCallNumber(e.target.value)}
                  disabled={deleteCallLoading}
                />
                <p className="text-xs text-muted-foreground">
                  Enter the phone number or call ID to delete
                </p>
              </div>
              {error && (
                <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-md">
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowDeleteCallModal(false);
                    setDeleteCallNumber("");
                    setError(null);
                  }}
                  disabled={deleteCallLoading}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteCall}
                  disabled={deleteCallLoading || !deleteCallNumber || device.status !== "online"}
                >
                  {deleteCallLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash className="h-4 w-4 mr-2" />
                      Delete
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
