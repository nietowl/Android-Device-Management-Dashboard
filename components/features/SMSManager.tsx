"use client";

import { AndroidDevice, SMSMessage } from "@/types";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Send, Trash2 } from "lucide-react";
import { format } from "date-fns";

interface SMSManagerProps {
  device: AndroidDevice;
}

export default function SMSManager({ device }: SMSManagerProps) {
  const [messages, setMessages] = useState<SMSMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [recipient, setRecipient] = useState("");
  const [messageBody, setMessageBody] = useState("");

  useEffect(() => {
    loadMessages();
  }, [device.id]);

  const loadMessages = async () => {
    setLoading(true);
    // In a real app, this would fetch from your API
    // Mock data for now
    setTimeout(() => {
      setMessages([
        {
          id: "1",
          device_id: device.id,
          address: "+1234567890",
          body: "Hello, this is a test message",
          date: new Date().toISOString(),
          type: "received",
        },
        {
          id: "2",
          device_id: device.id,
          address: "+1234567890",
          body: "Reply message",
          date: new Date(Date.now() - 3600000).toISOString(),
          type: "sent",
        },
      ]);
      setLoading(false);
    }, 500);
  };

  const handleSend = async () => {
    if (!recipient || !messageBody) return;

    // In a real app, this would call your API
    const newMessage: SMSMessage = {
      id: Date.now().toString(),
      device_id: device.id,
      address: recipient,
      body: messageBody,
      date: new Date().toISOString(),
      type: "sent",
    };

    setMessages([newMessage, ...messages]);
    setMessageBody("");
  };

  const handleDelete = async (messageId: string) => {
    // In a real app, this would call your API
    setMessages(messages.filter((m) => m.id !== messageId));
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="h-6 w-6" />
        <h2 className="text-2xl font-semibold">SMS Manager</h2>
      </div>

      {/* Send SMS Form */}
      <Card>
        <CardHeader>
          <CardTitle>Send SMS</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Recipient</label>
            <Input
              placeholder="Phone number"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Message</label>
            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Type your message..."
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
            />
          </div>
          <Button onClick={handleSend} className="w-full">
            <Send className="h-4 w-4 mr-2" />
            Send Message
          </Button>
        </CardContent>
      </Card>

      {/* Messages List */}
      <Card>
        <CardHeader>
          <CardTitle>Messages ({messages.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading messages...</div>
          ) : messages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No messages found</div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`p-4 rounded-lg border ${
                    message.type === "sent"
                      ? "bg-primary/10 border-primary/20 ml-auto max-w-[80%]"
                      : "bg-muted mr-auto max-w-[80%]"
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-medium text-sm">{message.address}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(message.date), "MMM d, yyyy h:mm a")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={message.type === "sent" ? "default" : "secondary"}>
                        {message.type}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(message.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm">{message.body}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

