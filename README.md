# Android Device Management Dashboard

A web-based SaaS platform for remotely managing and interacting with Android devices. Built with Next.js, TypeScript, Tailwind CSS, and Supabase.

## Features

- **Authentication System**: Secure login and user management using Supabase Authentication
- **Device Management**: View and manage multiple Android devices linked to your account
- **SMS Manager**: View, send, and delete SMS messages remotely
- **File Manager**: Browse, upload, download, and delete files on connected devices
- **Calls & Contacts**: View call history and manage contacts
- **Camera Access**: View live camera feed and capture images
- **Full Control**: Interactive virtual device interface for remote control

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React, TypeScript
- **Styling**: Tailwind CSS, shadcn/ui components
- **Backend**: Supabase (Authentication, Database, API)
- **State Management**: React Hooks, Zustand (for future enhancements)

## Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn
- A Supabase account and project

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd "Android Device Management Dashboard"
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
   - Copy `.env.local.example` to `.env.local`
   - Fill in your Supabase credentials:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

4. Set up Supabase Database:
   - Create a `devices` table with the following schema:
```sql
CREATE TABLE devices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT CHECK (status IN ('online', 'offline')) DEFAULT 'offline',
  last_sync TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;

-- Create policy for users to only see their own devices
CREATE POLICY "Users can view their own devices"
  ON devices FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own devices"
  ON devices FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own devices"
  ON devices FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own devices"
  ON devices FOR DELETE
  USING (auth.uid() = user_id);
```

5. Run the development server:
```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
├── app/
│   ├── api/              # API routes
│   ├── dashboard/        # Dashboard page
│   ├── layout.tsx        # Root layout
│   ├── page.tsx          # Landing/login page
│   └── globals.css       # Global styles
├── components/
│   ├── auth/            # Authentication components
│   ├── dashboard/       # Dashboard layout components
│   ├── features/        # Feature-specific components
│   └── ui/              # Reusable UI components
├── lib/
│   ├── supabase/        # Supabase client utilities
│   └── utils.ts         # Utility functions
├── types/
│   └── index.ts         # TypeScript type definitions
└── middleware.ts         # Next.js middleware for auth
```

## Features Overview

### Dashboard Layout
- **Sidebar (30%)**: Navigation panel with device list and feature options
- **Main Content (70%)**: Dynamic preview area for selected features

### Device Management
- View all registered devices
- See device status (online/offline)
- View last sync time
- Select device to access features

### SMS Manager
- View all SMS messages
- Send new SMS messages
- Delete messages
- Filter by sent/received

### File Manager
- Browse device file system
- Navigate directories
- Upload files to device
- Download files from device
- Delete files

### Calls & Contacts
- View call history with details
- Filter by call type (incoming/outgoing/missed)
- View contact list
- Call contacts directly

### Camera
- Start/stop camera stream
- Capture images
- Download captured images

### Full Control
- Virtual device screen replica
- Coordinate-based interactions
- Tap, swipe, scroll gestures
- Real-time screen updates (when connected to actual device)

## API Endpoints

- `GET /api/devices` - Get all devices for the authenticated user
- `POST /api/devices` - Register a new device
- `POST /api/devices/[deviceId]/interact` - Send interaction to device
- `GET /api/devices/[deviceId]/screen` - Get device screen data

## Future Enhancements

- Role-based access control for multi-user teams
- Activity logs and audit trails
- AI-powered analysis of device data
- Notification system for device events
- WebSocket support for real-time updates
- Device registration via QR code
- Screen recording capabilities
- App management and installation

## Development Notes

- The current implementation includes mock data for demonstration purposes
- To connect to actual Android devices, you'll need to implement:
  - Android app/service that communicates with your backend
  - WebSocket server for real-time communication
  - Device registration and pairing mechanism
  - Secure communication protocol

## License

This project is proprietary software. All rights reserved.

## Support

For issues and questions, please contact the development team.

