"use client";

import { AndroidDevice, CallLog, Contact } from "@/types";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Users } from "lucide-react";
import { format } from "date-fns";

interface CallsContactsProps {
  device: AndroidDevice;
}

export default function CallsContacts({ device }: CallsContactsProps) {
  const [activeTab, setActiveTab] = useState<"calls" | "contacts">("calls");
  const [calls] = useState<CallLog[]>([
    {
      id: "1",
      device_id: device.id,
      number: "+1234567890",
      name: "John Doe",
      type: "incoming",
      duration: 120,
      date: new Date().toISOString(),
    },
    {
      id: "2",
      device_id: device.id,
      number: "+0987654321",
      name: "Jane Smith",
      type: "outgoing",
      duration: 300,
      date: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: "3",
      device_id: device.id,
      number: "+1122334455",
      type: "missed",
      duration: 0,
      date: new Date(Date.now() - 7200000).toISOString(),
    },
  ]);

  const [contacts] = useState<Contact[]>([
    {
      id: "1",
      device_id: device.id,
      name: "John Doe",
      phone: "+1234567890",
      email: "john@example.com",
    },
    {
      id: "2",
      device_id: device.id,
      name: "Jane Smith",
      phone: "+0987654321",
      email: "jane@example.com",
    },
  ]);

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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <Phone className="h-6 w-6" />
        <h2 className="text-2xl font-semibold">Calls & Contacts</h2>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <Button
          variant={activeTab === "calls" ? "default" : "ghost"}
          onClick={() => setActiveTab("calls")}
        >
          <Phone className="h-4 w-4 mr-2" />
          Call History
        </Button>
        <Button
          variant={activeTab === "contacts" ? "default" : "ghost"}
          onClick={() => setActiveTab("contacts")}
        >
          <Users className="h-4 w-4 mr-2" />
          Contacts
        </Button>
      </div>

      {/* Calls Tab */}
      {activeTab === "calls" && (
        <Card>
          <CardHeader>
            <CardTitle>Call History ({calls.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {calls.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No call history</div>
            ) : (
              <div className="space-y-2">
                {calls.map((call) => {
                  const Icon = getCallIcon(call.type);
                  return (
                    <div
                      key={call.id}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent"
                    >
                      <div className="flex items-center gap-3">
                        <Icon
                          className={`h-5 w-5 ${
                            call.type === "missed"
                              ? "text-red-500"
                              : call.type === "incoming"
                              ? "text-green-500"
                              : "text-blue-500"
                          }`}
                        />
                        <div>
                          <p className="font-medium">{call.name || call.number}</p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(call.date), "MMM d, yyyy h:mm a")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge
                          variant={
                            call.type === "missed"
                              ? "destructive"
                              : call.type === "incoming"
                              ? "success"
                              : "default"
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
            )}
          </CardContent>
        </Card>
      )}

      {/* Contacts Tab */}
      {activeTab === "contacts" && (
        <Card>
          <CardHeader>
            <CardTitle>Contacts ({contacts.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {contacts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No contacts found</div>
            ) : (
              <div className="space-y-2">
                {contacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent"
                  >
                    <div>
                      <p className="font-medium">{contact.name}</p>
                      <p className="text-sm text-muted-foreground">{contact.phone}</p>
                      {contact.email && (
                        <p className="text-sm text-muted-foreground">{contact.email}</p>
                      )}
                    </div>
                    <Button variant="outline" size="sm">
                      <Phone className="h-4 w-4 mr-2" />
                      Call
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

