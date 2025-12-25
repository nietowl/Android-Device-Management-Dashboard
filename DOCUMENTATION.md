# Android Device Management Dashboard - Complete Documentation

## Table of Contents

1. [Device Server](#device-server)
2. [Socket.IO Integration](#socketio-integration)
3. [Data Flow Architecture](#data-flow-architecture)
4. [Sending Commands to Devices](#sending-commands-to-devices)
5. [Webhook Integration](#webhook-integration)
6. [API Reference](#api-reference)
7. [Environment Variables](#environment-variables)
8. [Testing](#testing)
9. [Troubleshooting](#troubleshooting)
10. [Improvement Roadmap](#improvement-roadmap)

---

## Device Server

The device server (`device-server.js`) is a standalone Socket.IO server for Android device connections. It runs independently from the Next.js web application.

### Features

- Socket.IO server for Android device connections
- Device authentication via UUID and token
- Real-time device event handling
- Web UI viewer for monitoring connected devices
- REST API endpoints for device management
- Device persistence (devices saved to `devices.json`)

### Usage

**Start the Device Server:**

```bash
npm run dev:device
```

Or directly:
```bash
node device-server.js
```

### Configuration

**Environment Variables:**

```env
DEVICE_AUTH_SECRET=MySuperSecretToken
DEVICE_SERVER_PORT=4527
DEVICE_SERVER_HOST=0.0.0.0
```

**Default Configuration:**
- **Port**: 4527
- **Host**: 0.0.0.0 (listens on all interfaces)
- **Auth Secret**: "MySuperSecretToken" (or set via `DEVICE_AUTH_SECRET`)

### Endpoints

**Web UI:**
- `GET /` - Device viewer dashboard

**REST API:**
- `GET /health` - Health check endpoint
- `GET /devices` - List all connected and persisted devices
- `POST /api/command/:deviceId` - Send command to device

### Socket.IO Events

#### Client → Server (Android Devices)

**Authentication:**
```javascript
socket.emit("authenticate", {
  uuid: "device-uuid-123",
  token: "MySuperSecretToken"
});
```

**Register Device:**
```javascript
socket.emit("add-new-device", {
  name: "Samsung Galaxy S21",
  model: "SM-G991B",
  manufacturer: "Samsung",
  androidVersion: "13",
  sdkLevel: 33,
  timestamp: new Date().toISOString()
});
```

**Send Command Result:**
```javascript
socket.emit(`command-result-${uuid}`, {
  command: "tap",
  result: "success",
  x: 100,
  y: 200
});
```

**Send Device Info:**
```javascript
socket.emit(`getinfo-${uuid}`, {
  battery: 85,
  storage: { used: 50, total: 128 },
  network: "WiFi"
});
```

**Send Generic Event:**
```javascript
socket.emit(`device-event-${uuid}`, {
  event: "sms_received",
  timestamp: new Date().toISOString(),
  data: {
    from: "+1234567890",
    message: "Hello"
  }
});
```

#### Server → Client

**Authentication Response:**
```javascript
socket.on("auth-success", () => {
  // Authentication successful
});

socket.on("auth-failed", () => {
  // Authentication failed
});
```

**Device Registration Broadcast:**
```javascript
socket.on("device_registered", (data) => {
  // Device registered: { uuid, info, timestamp }
});
```

**Device Disconnection Broadcast:**
```javascript
socket.on("device_disconnected", (data) => {
  // Device disconnected: { uuid, timestamp }
});
```

### Example: Connecting an Android Device

```javascript
const io = require("socket.io-client");

const socket = io("http://localhost:4527");

socket.on("connect", () => {
  // Authenticate
  socket.emit("authenticate", {
    uuid: "my-device-uuid",
    token: "MySuperSecretToken"
  });
});

socket.on("auth-success", () => {
  console.log("Authenticated!");
  
  // Register device
  socket.emit("add-new-device", {
    name: "My Android Device",
    model: "Pixel 7",
    manufacturer: "Google",
    androidVersion: "13",
    sdkLevel: 33
  });
  
  // Send device info
  socket.emit("getinfo-my-device-uuid", {
    battery: 85,
    storage: { used: 50, total: 128 }
  });
});
```

### Web UI Viewer

Access the web UI at `http://localhost:4527` to see:
- Connection status
- List of connected devices
- Device information (manufacturer, model, Android version, SDK level)
- Online/offline status
- Real-time updates

### Notes

- This server runs independently from the Next.js application
- It uses a separate port (4527) to avoid conflicts
- Device UUIDs should be unique identifiers for each Android device
- The auth token should match `DEVICE_AUTH_SECRET` environment variable
- Devices are persisted to `devices.json` and persist across server restarts

---

## Socket.IO Integration

The system supports two types of Socket.IO connections:

1. **Android Devices** - Connect with UUID authentication to `device-server.js`
2. **Web Clients** - Next.js frontend clients that receive real-time updates

### Device Connection Flow

#### 1. Android Device Connects

```javascript
// Android device connects and authenticates
socket.emit("authenticate", {
  uuid: "device-uuid-123",
  token: "MySuperSecretToken"
});

// On success, device receives "auth-success"
socket.on("auth-success", () => {
  // Device is now authenticated
});
```

#### 2. Device Registration

```javascript
// Device sends its info
socket.emit("add-new-device", {
  name: "Samsung Galaxy S21",
  model: "SM-G991B",
  manufacturer: "Samsung",
  androidVersion: "13"
});
```

#### 3. Device Events

Devices can send events that are automatically forwarded to webhook and broadcast to web clients:

```javascript
// Command result
socket.emit(`command-result-${uuid}`, {
  command: "tap",
  result: "success",
  x: 100,
  y: 200
});

// Device info update
socket.emit(`getinfo-${uuid}`, {
  battery: 85,
  storage: { used: 50, total: 128 }
});

// Generic device event
socket.emit(`device-event-${uuid}`, {
  event: "sms_received",
  timestamp: new Date().toISOString(),
  data: {
    from: "+1234567890",
    message: "Hello"
  }
});
```

### Web Client Connection Flow

#### 1. Connect to Socket.IO

```typescript
import { io } from "socket.io-client";

const DEVICE_SERVER_URL = process.env.NEXT_PUBLIC_DEVICE_SERVER_URL || "http://localhost:3000";

const socket = io(DEVICE_SERVER_URL, {
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5,
});

socket.on("connect", () => {
  console.log("✅ Connected to device-server.js");
});

socket.on("device_registered", (data) => {
  console.log("📱 Device registered:", data);
  // Reload devices list
});

socket.on("device_disconnected", (data) => {
  console.log("🔌 Device disconnected:", data);
  // Update devices list
});
```

#### 2. Listen for Device Events

```typescript
useEffect(() => {
  if (!socket) return;

  socket.on("device_event", (event: WebhookEvent) => {
    console.log("Device event:", event);
    // Handle event (update UI, refresh data, etc.)
  });

  return () => {
    socket.off("device_event");
  };
}, [socket]);
```

### Event Flow Diagram

```
Android Device
    │
    ├─> Socket.IO Server (authenticate)
    │       │
    │       ├─> Device Events (command-result, getinfo, device-event)
    │       │       │
    │       │       ├─> Forward to Webhook Endpoint
    │       │       │       └─> Process & Store in Database
    │       │       │
    │       │       └─> Broadcast to Web Clients
    │       │               └─> Real-time UI Updates
    │       │
    │       └─> Device Registration (add-new-device)
    │               └─> Broadcast to Web Clients
    │
    └─> Receive Commands (tap, swipe, etc.)
            └─> Execute on Device
```

---

## Data Flow Architecture

This section explains how data flows from Android devices to your Next.js dashboard.

### Data Flow Overview

```
Android Device
    ↓
    Connects via Socket.IO
    ↓
device-server.js (Port 4527)
    ↓
    Receives Events (command-result, getinfo, device-event, etc.)
    ↓
    Forwards to Webhook Endpoint
    ↓
/api/webhooks/device-events (Next.js - Port 3000)
    ↓
    Processes & Stores in Database
    ↓
    Broadcasts via Socket.IO
    ↓
Next.js Frontend Components
    ↓
    ActivityFeed.tsx
    WebhookEventViewer.tsx
    Dashboard Components
```

### How It Works

#### 1. Android Device Sends Data

When your Android device sends data via Socket.IO:

```javascript
// Device sends command result
socket.emit(`command-result-${uuid}`, {
  command: "tap",
  result: "success",
  x: 100,
  y: 200
});

// Device sends info
socket.emit(`getinfo-${uuid}`, {
  battery: 85,
  storage: { used: 50, total: 128 }
});

// Device sends generic event
socket.emit(`device-event-${uuid}`, {
  event: "sms_received",
  data: {
    from: "+1234567890",
    message: "Hello"
  }
});
```

#### 2. Device Server Receives & Forwards

`device-server.js` receives the data and automatically forwards it to:

```
POST http://localhost:3000/api/webhooks/device-events
```

With the event data formatted as:
```json
{
  "event": "command_result",
  "device_id": "device-uuid-123",
  "timestamp": "2024-01-01T12:00:00Z",
  "data": {
    "command": "tap",
    "result": "success"
  }
}
```

#### 3. Webhook Processes & Broadcasts

The webhook endpoint:
- Processes the event
- Updates database (if needed)
- Broadcasts to connected Next.js clients via Socket.IO

#### 4. Frontend Displays Data

Your Next.js components automatically receive and display:

- **ActivityFeed** - Shows notifications and activity timeline
- **WebhookEventViewer** - Shows raw event data
- **Dashboard** - Updates device status and information

### Event Types Supported

All these events are automatically forwarded and rendered:

- `command_result` - Command execution results
- `device_info` - Device information updates
- `device_status` - Online/offline status changes
- `device_event` - Generic device events
- `sms_received` - SMS received (if sent via device-event)
- `sms_sent` - SMS sent (if sent via device-event)
- `call_logged` - Call log entries
- `file_uploaded` - File uploads
- `battery_status` - Battery level changes
- `swipe_detected` - Screen swipe gestures detected
- `gesture_detected` - Generic gesture detection events
- And any custom event types you send

---

## Swipe Detection Events

The system supports real-time swipe detection from Android devices. When a swipe gesture is detected on the device screen, it automatically emits an event that is broadcasted to all connected web clients.

### How Swipe Detection Works

```
Android Device
    ↓
    Detects Screen Swipe/Touch Gesture
    ↓
    Emits "swipe-detected" Event via Socket.IO
    ↓
device-server.js (Port 4527)
    ↓
    Receives & Processes Swipe Data
    ↓
    Calculates Direction, Distance, Velocity
    ↓
    Broadcasts "swipe_detected" Event
    ↓
Next.js Frontend Components
    ↓
    ActivityFeed.tsx
    Dashboard Components
```

### Android Implementation

To enable swipe detection on your Android device, you need to emit swipe events when gestures are detected. Here's an example implementation:

#### Kotlin Example (Accessibility Service)

```kotlin
// In your AccessibilityService or touch event handler
class MyAccessibilityService : AccessibilityService() {
    
    private fun detectSwipe(startX: Float, startY: Float, endX: Float, endY: Float, duration: Long) {
        val deltaX = endX - startX
        val deltaY = endY - startY
        val distance = sqrt((deltaX * deltaX + deltaY * deltaY).toDouble())
        
        // Determine direction
        val direction = when {
            abs(deltaX) > abs(deltaY) -> if (deltaX > 0) "right" else "left"
            else -> if (deltaY > 0) "down" else "up"
        }
        
        // Emit swipe event to server
        socket.emit("swipe-detected", JSONObject().apply {
            put("startX", startX.toInt())
            put("startY", startY.toInt())
            put("endX", endX.toInt())
            put("endY", endY.toInt())
            put("duration", duration)
            put("direction", direction)
            put("distance", distance)
            put("velocity", distance / duration)
        })
    }
    
    // Example: Detect swipe from touch events
    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // Your touch detection logic here
        // When swipe is detected, call detectSwipe()
    }
}
```

#### JavaScript Example (Node.js/React Native)

```javascript
// When swipe is detected on device
socket.emit("swipe-detected", {
  startX: 100,
  startY: 200,
  endX: 500,
  endY: 200,
  duration: 300, // milliseconds
  direction: "right", // optional, will be calculated if not provided
  distance: 400, // optional, will be calculated if not provided
  velocity: 1.33 // optional, will be calculated if not provided
});
```

### Swipe Event Data Format

**Event Name:** `swipe-detected`

**Payload:**
```json
{
  "startX": 100,
  "startY": 200,
  "endX": 500,
  "endY": 200,
  "duration": 300,
  "direction": "right",
  "distance": 400,
  "velocity": 1.33
}
```

**Fields:**
- `startX` (required) - Starting X coordinate
- `startY` (required) - Starting Y coordinate
- `endX` (required) - Ending X coordinate
- `endY` (required) - Ending Y coordinate
- `duration` (optional) - Swipe duration in milliseconds
- `direction` (optional) - Swipe direction: "left", "right", "up", "down", "up-left", "up-right", "down-left", "down-right"
- `distance` (optional) - Swipe distance in pixels
- `velocity` (optional) - Swipe velocity (pixels per millisecond)

**Note:** If `direction`, `distance`, or `velocity` are not provided, they will be automatically calculated by the server.

### Received Event Format

When the swipe event is broadcasted to web clients, it follows this format:

```json
{
  "event": "swipe_detected",
  "device_id": "device-uuid-123",
  "timestamp": "2024-01-01T12:00:00Z",
  "data": {
    "startX": 100,
    "startY": 200,
    "endX": 500,
    "endY": 200,
    "duration": 300,
    "direction": "right",
    "distance": 400,
    "velocity": 1.33,
    "timestamp": "2024-01-01T12:00:00Z"
  }
}
```

### Listening for Swipe Events

In your Next.js components, you can listen for swipe events:

```typescript
import { useSocket } from "@/lib/socket/client";

function MyComponent() {
  const { lastEvent } = useSocket({ deviceId: "device-uuid-123" });
  
  useEffect(() => {
    if (lastEvent?.event === "swipe_detected") {
      const swipeData = lastEvent.data;
      console.log(`Swipe detected: ${swipeData.direction}`, swipeData);
      // Handle swipe event
    }
  }, [lastEvent]);
}
```

### Gesture Detection

For more generic gesture detection (pinch, rotate, multi-touch, etc.), use the `gesture-detected` event:

```javascript
socket.emit("gesture-detected", {
  type: "pinch",
  scale: 1.5,
  centerX: 400,
  centerY: 600,
  // ... other gesture-specific data
});
```

---

## Sending Commands to Devices

This section explains how to send data/commands FROM your Next.js app TO Android devices.

### Data Flow (Sending Commands)

```
Next.js Frontend/API
    ↓
    POST /api/devices/[deviceId]/interact
    or
    POST /api/devices/[deviceId]/command
    ↓
device-server.js (Port 4527)
    ↓
    POST /api/command/:deviceId
    ↓
    Forwards via Socket.IO
    ↓
Android Device
    ↓
    Executes Command
    ↓
    Sends Result Back
    ↓
    (See receiving data flow)
```

### How to Send Commands

#### Method 1: Using the Interact Endpoint (Recommended)

**Endpoint**: `POST /api/devices/[deviceId]/interact`

**Request Body:**
```json
{
  "type": "tap",
  "x": 100,
  "y": 200
}
```

**Supported Types:**
- `tap` - Tap at coordinates
- `swipe` - Swipe gesture
- `long_press` - Long press
- `scroll` - Scroll gesture

**Example:**
```typescript
// From your React component
const response = await fetch(`/api/devices/${deviceId}/interact`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    type: "tap",
    x: 100,
    y: 200,
  }),
});
```

#### Method 2: Using the Command Endpoint (Direct)

**Endpoint**: `POST /api/devices/[deviceId]/command`

**Request Body:**
```json
{
  "command": "tap",
  "data": {
    "x": 100,
    "y": 200
  }
}
```

**Example:**
```typescript
const response = await fetch(`/api/devices/${deviceId}/command`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    command: "tap",
    data: { x: 100, y: 200 },
  }),
});
```

#### Method 3: Direct to Device Server

**Endpoint**: `POST http://localhost:4527/api/command/:deviceId`

**Request Body:**
```json
{
  "command": "tap",
  "data": { "x": 100, "y": 200 }
}
```

### Device Server API Endpoints

#### Send Command to Device

**POST** `/api/command/:deviceId`

**Request:**
```json
{
  "command": "tap",
  "data": { "x": 100, "y": 200 }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Command 'tap' sent to device device-123",
  "deviceId": "device-123",
  "command": "tap",
  "data": { "x": 100, "y": 200 },
  "timestamp": "2024-01-01T12:00:00Z"
}
```

**Error Responses:**
- `404` - Device not found or not connected
- `503` - Device socket not connected
- `500` - Failed to send command

### Supported Commands

The device server forwards these commands to Android devices:

- `tap` - Tap at coordinates `{ x, y }`
- `swipe` - Swipe gesture `{ x, y, deltaX, deltaY, duration }`
- `long-press` - Long press `{ x, y, duration }`
- `scroll` - Scroll gesture `{ x, y, deltaX, deltaY }`
- `device-interaction` - Generic interaction
- Any custom command your Android app supports

### Complete Example

#### 1. Send Command from Next.js

```typescript
// components/features/ScreenControl.tsx
const handleTap = async (x: number, y: number) => {
  const response = await fetch(`/api/devices/${device.id}/interact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "tap",
      x,
      y,
    }),
  });
  
  const result = await response.json();
  console.log("Command sent:", result);
};
```

#### 2. Device Server Receives & Forwards

```javascript
// device-server.js receives POST /api/command/:deviceId
// Forwards to Android device via Socket.IO
client.socket.emit(command, data);
```

#### 3. Android Device Executes

```javascript
// Android app receives command
socket.on("tap", (data) => {
  // Execute tap at coordinates
  performTap(data.x, data.y);
  
  // Send result back
  socket.emit(`command-result-${uuid}`, {
    command: "tap",
    result: "success",
    x: data.x,
    y: data.y
  });
});
```

#### 4. Result Comes Back

The result flows back through the same path:
- Android Device → device-server.js → Webhook → Next.js Dashboard

---

## Webhook Integration

This project supports receiving webhook events via HTTP POST and broadcasting them to connected clients using Socket.IO.

### Setup

1. **Install dependencies** (already done):
   ```bash
   npm install socket.io socket.io-client
   ```

2. **Environment Variables** (add to `.env.local`):
   ```env
   WEBHOOK_SECRET=your-webhook-secret-here
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   NEXT_PUBLIC_SOCKET_URL=/api/socket.io
   ```

3. **Run the development server**:
   ```bash
   npm run dev
   ```
   Note: The custom server (`server.js`) is used instead of `next dev` to support Socket.IO.

### Webhook Endpoint

**URL**: `POST /api/webhooks/device-events`

**Headers:**
```
Authorization: Bearer YOUR_WEBHOOK_SECRET
Content-Type: application/json
```

**Request Body:**
```json
{
  "event": "device_status",
  "device_id": "device-123",
  "user_id": "user-456",
  "timestamp": "2024-01-01T12:00:00Z",
  "data": {
    "status": "online",
    "battery": 85
  }
}
```

**Supported Event Types:**
- `device_status` - Device online/offline status
- `sms_received` - New SMS received
- `sms_sent` - SMS sent
- `call_logged` - Call log entry
- `file_uploaded` - File uploaded to device
- `file_deleted` - File deleted from device
- `contact_synced` - Contact synchronized
- `screen_update` - Screen update (for remote control)
- `device_sync` - Device synchronization
- `notification_received` - Notification received
- `location_update` - Location update
- `battery_status` - Battery status change
- `app_installed` - App installed
- `app_uninstalled` - App uninstalled

### Client-Side Usage

#### Using the Socket Hook

```tsx
import { useSocket } from "@/lib/socket/client";

function MyComponent() {
  const { socket, isConnected, lastEvent } = useSocket({
    userId: "user-123",
    deviceId: "device-456",
    autoConnect: true,
  });

  useEffect(() => {
    if (!socket) return;

    socket.on("device_event", (event) => {
      console.log("Received event:", event);
      // Handle the event
    });

    return () => {
      socket.off("device_event");
    };
  }, [socket]);

  return <div>Connected: {isConnected ? "Yes" : "No"}</div>;
}
```

#### Using the WebhookListener Component

```tsx
import WebhookListener from "@/components/webhooks/WebhookListener";

function MyComponent() {
  const handleEvent = (event: WebhookEvent) => {
    console.log("Webhook event:", event);
    // Update UI, refresh data, etc.
  };

  return (
    <WebhookListener
      userId="user-123"
      deviceId="device-456"
      onEvent={handleEvent}
    />
  );
}
```

### How It Works

1. **Webhook receives data**: External service sends POST request to `/api/webhooks/device-events`
2. **Data is processed**: The webhook handler validates and processes the event
3. **Database updated**: Relevant data is stored/updated in Supabase
4. **Socket.IO broadcast**: Event is broadcast to connected clients via Socket.IO
5. **Clients receive updates**: Connected clients receive real-time updates

### Socket.IO Rooms

- `user:{userId}` - All events for a specific user
- `device:{deviceId}` - All events for a specific device
- General `device_events` channel - All device events

---

## API Reference

### Next.js API Endpoints

#### Get All Devices

**GET** `/api/devices`

Returns all devices for the authenticated user.

#### Get Connected Devices

**GET** `/api/devices/connected`

Returns list of currently connected Android devices.

#### Send Interaction to Device

**POST** `/api/devices/[deviceId]/interact`

Sends interaction command to connected device.

**Request Body:**
```json
{
  "type": "tap",
  "x": 100,
  "y": 200
}
```

#### Send Command to Device

**POST** `/api/devices/[deviceId]/command`

Sends direct command to connected device.

**Request Body:**
```json
{
  "command": "tap",
  "data": { "x": 100, "y": 200 }
}
```

#### Webhook Endpoint

**POST** `/api/webhooks/device-events`

Receives webhook events (from external services or internal Socket.IO forwarding).

### Device Server API Endpoints

#### Health Check

**GET** `/health`

Returns server health status.

#### Get All Devices

**GET** `/devices`

Returns all connected and persisted devices.

**Response:**
```json
{
  "devices": [
    {
      "uuid": "device-123",
      "isOnline": true,
      "info": {
        "name": "Samsung Galaxy S21",
        "model": "SM-G991B",
        "manufacturer": "Samsung",
        "androidVersion": "13",
        "sdkLevel": 33,
        "timestamp": "2024-01-01T12:00:00Z"
      },
      "lastSeen": "2024-01-01T12:00:00Z"
    }
  ],
  "count": 1
}
```

#### Send Command to Device

**POST** `/api/command/:deviceId`

Sends command to connected device.

**Request Body:**
```json
{
  "command": "tap",
  "data": { "x": 100, "y": 200 }
}
```

---

## Environment Variables

### Required Variables

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

### Optional Variables

```env
# Device Server Configuration
DEVICE_SERVER_URL=http://localhost:3000
DEVICE_SERVER_PORT=4527
DEVICE_SERVER_HOST=0.0.0.0
DEVICE_AUTH_SECRET=MySuperSecretToken

# Webhook Configuration
WEBHOOK_URL=http://localhost:3000/api/webhooks/device-events
WEBHOOK_SECRET=your-webhook-secret

# Socket.IO Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SOCKET_URL=/api/socket.io
```

---

## Testing

### Test Device Connection

```bash
# Using socket.io-client in Node.js
const io = require("socket.io-client");
const socket = io("http://localhost:4527");

socket.emit("authenticate", {
  uuid: "test-device-123",
  token: "MySuperSecretToken"
});

socket.on("auth-success", () => {
  console.log("Authenticated!");
  
  // Send test event
  socket.emit("device-event-test-device-123", {
    event: "test_event",
    data: { message: "Hello from device" }
  });
});
```

### Test Sending Command

```bash
# Send tap command to device server
curl -X POST http://localhost:4527/api/command/test-device-123 \
  -H "Content-Type: application/json" \
  -d '{
    "command": "tap",
    "data": { "x": 100, "y": 200 }
  }'
```

### Test Webhook

```bash
curl -X POST http://localhost:3000/api/webhooks/device-events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-webhook-secret" \
  -d '{
    "event": "device_status",
    "device_id": "test-device",
    "user_id": "test-user",
    "timestamp": "2024-01-01T12:00:00Z",
    "data": {
      "status": "online"
    }
  }'
```

### Test Device Info Event

```bash
curl -X POST http://localhost:3000/api/webhooks/device-events \
  -H "Content-Type: application/json" \
  -d '{
    "event": "device_info",
    "device_id": "test-device-123",
    "timestamp": "2024-01-01T12:00:00Z",
    "data": {
      "battery": 85,
      "model": "Samsung Galaxy S21"
    }
  }'
```

---

## Troubleshooting

### Events not appearing in dashboard?

1. **Check both servers are running:**
   - Device server: `http://localhost:4527`
   - Next.js: `http://localhost:3000`

2. **Check webhook forwarding:**
   - Look for `✅ Event forwarded to webhook` in device server logs
   - Check Next.js console for webhook received messages

3. **Check Socket.IO connection:**
   - Open browser console in Next.js dashboard
   - Should see "Socket connected" message
   - Check for "device_event" messages

4. **Verify device UUID matches:**
   - Device UUID in `device-server.js` should match device `id` in database
   - Frontend components filter by `deviceId` prop

### Device not connecting?

1. **Check authentication:**
   - Verify `DEVICE_AUTH_SECRET` matches on both device and server
   - Check device UUID is valid

2. **Check network:**
   - Ensure device can reach server on port 4527
   - Check firewall settings

3. **Check server logs:**
   - Look for connection attempts in device server console
   - Check for authentication errors

### Commands not working?

1. **Verify device is connected:**
   - Check `/devices` endpoint shows device as online
   - Check device server logs for connection status

2. **Check command format:**
   - Verify command name matches supported commands
   - Check data structure matches expected format

3. **Check error responses:**
   - Look for 404 (device not found) or 503 (socket not connected) errors
   - Check device server logs for command forwarding errors

---

## Improvement Roadmap

### 🔥 High Priority (Immediate Impact)

1. **Supabase Integration for Device Persistence**
   - Sync devices from `device-server.js` to Supabase database
   - Multi-user device ownership
   - Better querying and filtering
   - **Impact**: Scalability, multi-user support

2. **Device Health Monitoring**
   - Battery level tracking
   - Storage usage monitoring
   - Connection quality metrics
   - **Impact**: Proactive device management

3. **Enhanced Device Cards**
   - Show battery percentage
   - Display storage usage
   - Android version badge
   - Last seen timestamp
   - **Impact**: Better UX, more information at a glance

4. **Search & Filter**
   - Search devices by name/model/UUID
   - Filter by status (online/offline)
   - Filter by Android version
   - Sort by last seen, name, etc.
   - **Impact**: Better device management with many devices

5. **Connection Reliability**
   - Heartbeat/ping mechanism
   - Automatic reconnection handling
   - Connection quality indicators
   - **Impact**: More reliable device tracking

### 📊 Medium Priority (Feature Enhancements)

6. **Device Details Panel**
   - Expandable device information
   - Real-time stats (battery, storage, network)
   - Quick action buttons
   - Activity timeline

7. **Device Grouping/Tags**
   - Organize devices by location, department, project
   - Custom tags and labels
   - Group-based operations

8. **Activity History**
   - Log all device events
   - Command history
   - Connection/disconnection logs
   - Error tracking

9. **Bulk Operations**
   - Select multiple devices
   - Send commands to multiple devices
   - Bulk status updates

10. **Real-time Notifications**
    - Toast notifications for device events
    - Browser notifications for offline devices
    - Alert system for critical events

### 💡 Quick Wins (Easy to Implement)

1. ✅ **Device persistence** - Already done!
2. **Add battery indicator** - Show battery level in device card
3. **Add last seen time** - Show "Last seen 5 minutes ago"
4. **Device search** - Simple search input in sidebar
5. **Status filter** - Filter buttons (All/Online/Offline)
6. **Device count badge** - Show count in sidebar header
7. **Connection quality** - Show signal strength indicator
8. **Quick actions** - Hover menu with common actions
9. **Device notes** - Add notes/comments to devices
10. **Export devices** - Export device list to CSV/JSON

---

## Notes

- Device server runs independently on port 4527
- Next.js app runs on port 3000
- Data flows automatically: Device → Device Server → Webhook → Frontend
- All events are logged in console for debugging
- Events are stored in database (if configured)
- Real-time updates via Socket.IO
- Devices are persisted to `devices.json` and persist across server restarts
- Device UUIDs should match the `id` field in the `devices` table
- Web clients automatically receive events for devices they're subscribed to
- Device events are automatically forwarded to webhook for processing
- Commands sent to offline devices are logged but not queued (can be enhanced)

