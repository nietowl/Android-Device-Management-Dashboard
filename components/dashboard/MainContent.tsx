"use client";

import { AndroidDevice } from "@/types";
import dynamic from "next/dynamic";
import DeviceOverview from "@/components/dashboard/DeviceOverview";

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
const CameraView = dynamic(() => import("@/components/features/CameraView"), {
  loading: () => <div className="p-6">Loading Camera...</div>,
});
const FullControl = dynamic(() => import("@/components/features/FullControl"), {
  loading: () => <div className="p-6">Loading Full Control...</div>,
});

interface MainContentProps {
  device: AndroidDevice | null;
  view: string | null;
  onViewSelect: (view: string) => void;
}

export default function MainContent({ device, view, onViewSelect }: MainContentProps) {
  if (!device) {
    return null; // DashboardOverview will be shown instead
  }

  if (!view) {
    return (
      <div className="flex-1 overflow-hidden flex flex-col min-h-0 bg-background/50">
        <DeviceOverview device={device} onViewSelect={onViewSelect} />
      </div>
    );
  }

  const renderView = () => {
    switch (view) {
      case "sms":
        return <SMSManager device={device} />;
      case "files":
        return <FileManager device={device} />;
      case "calls":
        return <CallsContacts device={device} />;
      case "camera":
        return <CameraView device={device} />;
      case "control":
        return <FullControl device={device} />;
      default:
        return null;
    }
  };

  return <div className="flex-1 overflow-y-auto scrollbar-thin bg-background/50">{renderView()}</div>;
}

