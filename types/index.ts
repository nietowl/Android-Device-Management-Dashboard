export interface AndroidDevice {
  id: string;
  user_id: string;
  name: string;
  model: string;
  status: "online" | "offline";
  last_sync: string;
  created_at: string;
  updated_at: string;
}

export interface SMSMessage {
  id: string;
  device_id: string;
  address: string;
  body: string;
  date: string;
  type: "sent" | "received";
}

export interface Contact {
  id: string;
  device_id: string;
  name: string;
  phone: string;
  email?: string;
}

export interface CallLog {
  id: string;
  device_id: string;
  number: string;
  name?: string;
  type: "incoming" | "outgoing" | "missed";
  duration: number;
  date: string;
}

export interface FileItem {
  id: string;
  device_id: string;
  path: string;
  name: string;
  type: "file" | "directory";
  size?: number;
  modified: string;
}

export interface DeviceInteraction {
  type: "tap" | "swipe" | "long_press" | "scroll";
  x: number;
  y: number;
  duration?: number;
  deltaX?: number;
  deltaY?: number;
}

export interface UserProfile {
  id: string;
  email: string;
  username: string | null;
  role: "admin" | "user";
  subscription_tier: "free" | "basic" | "premium" | "enterprise";
  subscription_status: "active" | "expired" | "cancelled" | "trial";
  subscription_start_date: string | null;
  subscription_end_date: string | null;
  max_devices: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdminActivityLog {
  id: string;
  admin_id: string;
  action: string;
  target_user_id: string | null;
  details: Record<string, any> | null;
  created_at: string;
}

export interface UserUpdateData {
  role?: "admin" | "user";
  subscription_tier?: "free" | "basic" | "premium" | "enterprise";
  subscription_status?: "active" | "expired" | "cancelled" | "trial";
  subscription_end_date?: string;
  max_devices?: number;
  is_active?: boolean;
}
