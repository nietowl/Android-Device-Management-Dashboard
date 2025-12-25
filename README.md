# Android Device Management Dashboard

A web-based SaaS platform for remotely managing and interacting with Android devices. Built with Next.js, TypeScript, Tailwind CSS, and Supabase.

## Features

- **Authentication System**: Secure login and user management using Supabase Authentication
- **Device Management**: View and manage multiple Android devices linked to your account
- **SMS Manager**: View, send, and delete SMS messages remotely
- **File Manager**: Browse, upload, download, and delete files on connected devices
- **Calls & Contacts**: View call history and manage contacts
- **Camera Access**: View live camera feed and capture images
- **Screen Control**: Interactive virtual device interface for remote control

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
   - Copy `.env.local.example` to `.env.local`:
   ```bash
   cp .env.local.example .env.local
   ```
   - Fill in all required values in `.env.local`
   - **Required variables** (minimum to run):
     - `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
     - `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (get from: https://app.supabase.com/project/_/settings/api)
     - `NEXT_PUBLIC_DEVICE_SERVER_URL` - Device server URL (default: http://localhost:9211)
     - `NEXT_PUBLIC_SITE_URL` - Your site URL (required in production, must be HTTPS)
   
   ⚠️ **Important**: 
   - Never commit `.env.local` to version control!
   - The `SUPABASE_SERVICE_ROLE_KEY` is secret - keep it secure
   - See `.env.local.example` for all available configuration options

4. Configure Supabase Email Verification:
   
   **Critical Steps (Required for email verification to work):**
   
   a. **Enable Email Confirmations:**
      - Go to: https://app.supabase.com/project/_/auth/providers
      - Click on **Email** provider
      - Ensure **"Enable email confirmations"** is **ENABLED** (toggle should be ON)
      - If disabled, users will be auto-confirmed and won't receive verification emails
   
   b. **Whitelist Redirect URLs:**
      - Go to: https://app.supabase.com/project/_/auth/url-configuration
      - Under **"Redirect URLs"**, add:
        ```
        http://localhost:3000/auth/callback
        http://localhost:3000/**
        https://yourdomain.com/auth/callback
        https://yourdomain.com/**
        ```
      - Click **Save**
      - **Important:** Without these URLs, email verification links will be rejected
   
   c. **Check SMTP Configuration:**
      - Go to: https://app.supabase.com/project/_/settings/auth
      - Scroll to **"SMTP Settings"**
      - **Option 1:** Use Supabase's default email service (recommended for testing)
        - Ensure no custom SMTP is blocking default service
      - **Option 2:** Configure custom SMTP (for production)
        - Enter your SMTP credentials
        - Test the connection
   
   d. **Verify Email Templates:**
      - Go to: https://app.supabase.com/project/_/auth/templates
      - Check **"Confirm signup"** template
      - Ensure it contains: `{{ .ConfirmationURL }}` or `{{ .Token }}`
      - The template should include a link to verify the email
   
   e. **Check Rate Limits:**
      - Go to: https://app.supabase.com/project/_/settings/auth
      - Check **"Rate Limits"** section
      - Free tier has limits on emails per hour
      - If exceeded, wait before trying again
   
   **Troubleshooting:**
   - If emails still don't send, check **Logs** → **Auth Logs** in Supabase dashboard
   - Look for email delivery errors or rate limit messages
   - Test with a different email address to rule out email provider issues
   - Check spam/junk folders
   - Verify your Supabase project is not paused or has billing issues

   **⚠️ ProtonMail Specific Issues:**
   
   ProtonMail has very strict spam filters and may block Supabase verification emails. Here's how to fix it:
   
   1. **Check Spam/Spam Folder:**
      - ProtonMail often sends verification emails to Spam
      - Check: Spam folder → Look for emails from `noreply@mail.app.supabase.io` or similar
      - Mark as "Not Spam" if found
   
   2. **Whitelist Supabase Email Address:**
      - Go to ProtonMail Settings → Filters
      - Create a new filter:
        - **From:** `*@mail.app.supabase.io` or `*@supabase.io`
        - **Action:** Move to Inbox (and mark as important)
      - Save the filter
   
   3. **Check ProtonMail Security Settings:**
      - Go to ProtonMail Settings → Security
      - Temporarily disable "Block sender" or adjust spam filter sensitivity
      - Try signing up again
   
   4. **Use Custom SMTP (Recommended for Production):**
      - Supabase default emails may be blocked by ProtonMail
      - Configure custom SMTP in Supabase:
        - Go to: Project Settings → Auth → SMTP Settings
        - Use a reputable email service (SendGrid, Mailgun, AWS SES, etc.)
        - This will send from your own domain, reducing spam filter issues
   
   5. **Test with Different Email Provider:**
      - Try signing up with Gmail, Outlook, or another provider
      - If it works, the issue is ProtonMail-specific
      - You can then transfer the account or use a different email
   
   6. **Check Supabase Logs:**
      - Go to: Supabase Dashboard → Logs → Auth Logs
      - Look for the email send event
      - Check if it shows "sent" or "failed"
      - If "sent" but not received, it's likely blocked by ProtonMail
   
   7. **Alternative: Use ProtonMail Bridge (if available):**
      - Some users report better delivery with ProtonMail Bridge
      - However, this is mainly for receiving emails, not verification links
   
   **Quick Test:**
   - Sign up with a Gmail account first to verify Supabase is sending emails
   - If Gmail works but ProtonMail doesn't, it's a ProtonMail filtering issue
   - Consider using a different email for signup, or configure custom SMTP

5. Set up Supabase Database:
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

   **Important:** This runs `node server.js` which is a custom Next.js server that includes Socket.IO support. 
   - ✅ **Correct:** `npm run dev` (runs custom server with Socket.IO)
   - ❌ **Wrong:** `next dev` (standard Next.js dev server, no Socket.IO)
   
   The custom server (`server.js`) is required because:
   - Socket.IO needs a persistent HTTP server connection
   - The standard `next dev` command doesn't support Socket.IO out of the box
   - The custom server initializes Socket.IO on the same HTTP server as Next.js

6. (Optional) Run the device server in a separate terminal:
```bash
npm run dev:device
```
   This runs `device-server.js` on port 9211 for Android device connections.

7. Open [http://localhost:3000](http://localhost:3000) in your browser.

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

### Screen Control
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

## Documentation

For complete documentation including API reference, Socket.IO integration, data flow architecture, and more, see [DOCUMENTATION.md](./DOCUMENTATION.md).

## Viewing Users in Supabase

After a user signs up and verifies their email, you can view them in several places:

### Option 1: Supabase Dashboard (Recommended)

1. **View Authentication Users:**
   - Go to: https://app.supabase.com/project/_/auth/users
   - This shows all users in the `auth.users` table
   - You'll see: Email, Created At, Last Sign In, Email Verified status

2. **View User Profiles:**
   - Go to: https://app.supabase.com/project/_/editor
   - Click on the `user_profiles` table
   - This shows all user profile data including:
     - Email, License ID, Role, Subscription Tier, Subscription Status
     - Created At, Updated At timestamps

3. **Query Users Directly:**
   - Go to: https://app.supabase.com/project/_/sql
   - Run this query to see all users with their profiles:
   ```sql
   SELECT 
     au.id,
     au.email,
     au.email_confirmed_at,
     au.created_at,
     up.license_id,
     up.role,
     up.subscription_tier,
     up.subscription_status
   FROM auth.users au
   LEFT JOIN public.user_profiles up ON au.id = up.id
   ORDER BY au.created_at DESC;
   ```

### Option 2: Admin Panel in Your App

1. **Access Admin Panel:**
   - Log in as an admin user
   - Navigate to: `/dashboard/admin`
   - Click on "User Management" tab
   - You'll see all users with their details

2. **View User Details:**
   - Click on any user to see full details
   - Edit user information
   - Manage subscriptions

### Option 3: Check Logs

1. **Auth Logs:**
   - Go to: https://app.supabase.com/project/_/logs/auth
   - See signup events, email verification events

2. **Postgres Logs:**
   - Go to: https://app.supabase.com/project/_/logs/postgres
   - Check for trigger execution logs
   - Look for "handle_new_user" function calls

### Troubleshooting: User Not Showing Up

If a user signed up but doesn't appear in `user_profiles` table:

**Quick Fix (Run in Supabase SQL Editor):**

1. **Go to:** https://app.supabase.com/project/_/sql
2. **Copy and run this SQL:**
   ```sql
   -- Create profiles for users missing profiles
   INSERT INTO public.user_profiles (
     id, email, email_hash, license_id, role, subscription_tier, 
     subscription_status, subscription_start_date, subscription_end_date,
     created_at, updated_at
   )
   SELECT 
     au.id,
     au.email,
     generate_email_hash(au.email),
     generate_unique_license_id(),
     'user',
     'free',
     'trial',
     COALESCE(au.created_at, NOW()),
     COALESCE(au.created_at, NOW()) + INTERVAL '14 days',
     COALESCE(au.created_at, NOW()),
     NOW()
   FROM auth.users au
   LEFT JOIN public.user_profiles up ON au.id = up.id
   WHERE up.id IS NULL
     AND au.email IS NOT NULL
     AND au.deleted_at IS NULL
   ON CONFLICT (id) DO NOTHING;
   
   -- Fix any profiles missing license_id
   UPDATE public.user_profiles
   SET license_id = generate_unique_license_id()
   WHERE license_id IS NULL 
      OR license_id = ''
      OR length(license_id) != 26
      OR license_id !~ '^[A-Za-z0-9]{25}=$';
   ```

3. **Verify the trigger exists:**
   ```sql
   SELECT trigger_name, event_manipulation, event_object_table
   FROM information_schema.triggers
   WHERE trigger_name = 'on_auth_user_created';
   ```

4. **If trigger doesn't exist, recreate it:**
   ```sql
   DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
   CREATE TRIGGER on_auth_user_created
     AFTER INSERT ON auth.users
     FOR EACH ROW 
     EXECUTE FUNCTION public.handle_new_user();
   ```

**Alternative Methods:**

1. **Check if profile was created:**
   ```sql
   SELECT * FROM public.user_profiles WHERE email = 'user@example.com';
   ```

2. **Check if user exists in auth:**
   ```sql
   SELECT * FROM auth.users WHERE email = 'user@example.com';
   ```

3. **Manually create profile (if missing):**
   - Use the Admin Panel → Create User
   - Or run the ensure-profile API: `POST /api/auth/ensure-profile`
   - Or run the migration: `supabase/migrations/001_fix_missing_profiles.sql` in Supabase SQL Editor

## Understanding the Server Setup

### Why Custom Server (`server.js`)?

This project uses a **custom Next.js server** (`server.js`) instead of the standard `next dev` command because:

1. **Socket.IO Support**: Socket.IO requires a persistent HTTP server connection. The custom server creates an HTTP server and attaches both Next.js and Socket.IO to it.

2. **Single Server**: Both your Next.js app and Socket.IO run on the same server (port 3000), making it easier to manage.

3. **Development vs Production**:
   - **Development**: `npm run dev` → runs `node server.js` (includes Socket.IO)
   - **Production**: `npm start` → runs `NODE_ENV=production node server.js`

### Server Architecture

```
┌─────────────────────────────────────┐
│         server.js (Port 3000)       │
│  ┌─────────────┐  ┌──────────────┐ │
│  │   Next.js   │  │  Socket.IO   │ │
│  │   App       │  │  /api/socket │ │
│  └─────────────┘  └──────────────┘ │
└─────────────────────────────────────┘
           │
           └──> Handles both HTTP and WebSocket connections
```

### Running the Servers

**Main Application Server** (includes Socket.IO):
```bash
npm run dev          # Development mode
npm start            # Production mode
```

**Device Server** (for Android device connections, optional):
```bash
npm run dev:device   # Development mode
npm run start:device # Production mode
```

## Development Reverse Proxy (Optional but Recommended)

To mirror production setup and catch issues early, you can use a development reverse proxy that routes both Next.js app and device-server through a single entry point, just like production nginx.

### Why Use Development Proxy?

- **Mirrors Production**: Tests the same routing configuration as production
- **Catches Issues Early**: Identifies CORS, WebSocket, and routing problems before deployment
- **Single Entry Point**: Access everything through one port (8080) like production
- **Simplified Workflow**: Run all services with one command

### Architecture

```
Browser (localhost:8080)
    ↓
Development Proxy (dev-proxy.js)
    ├─→ Next.js App (localhost:3000) - Main app routes
    └─→ Device Server (localhost:9211) - Socket.IO & REST API
```

### Setup

1. **Install dependencies** (if not already installed):
   ```bash
   npm install
   ```

2. **Configure environment variables** in `.env.local`:
   ```bash
   # Development proxy configuration
   DEV_PROXY_PORT=8080
   NEXT_APP_URL=http://localhost:3000
   DEVICE_SERVER_URL=http://localhost:9211
   
   # Update URLs to use proxy
   NEXT_PUBLIC_APP_URL=http://localhost:8080
   NEXT_PUBLIC_DEVICE_SERVER_URL=http://localhost:8080
   ALLOWED_ORIGINS=http://localhost:8080,http://localhost:3000,http://localhost:9211
   ```

3. **Run all services together**:
   ```bash
   npm run dev:all
   ```
   
   This starts:
   - Next.js app on port 3000
   - Device server on port 9211
   - Development proxy on port 8080

4. **Access your app**:
   - Open [http://localhost:8080](http://localhost:8080) in your browser
   - All routes are proxied through the single entry point

### Running Services Individually

If you prefer to run services separately:

```bash
# Terminal 1: Next.js app
npm run dev

# Terminal 2: Device server
npm run dev:device

# Terminal 3: Development proxy
npm run dev:proxy
```

### Proxy Routing

The development proxy routes requests as follows:

- `/` → Next.js app (localhost:3000)
- `/socket.io` → Device server (localhost:9211) - WebSocket support
- `/devices` → Device server (localhost:9211)
- `/api/health` → Device server (localhost:9211)
- `/api/command/*` → Device server (localhost:9211)
- All other routes → Next.js app (localhost:3000)

### Troubleshooting Development Proxy

**Port already in use:**
```bash
# Use a different port
DEV_PROXY_PORT=8081 npm run dev:proxy
```

**Services not connecting:**
- Ensure Next.js app is running: `npm run dev`
- Ensure device-server is running: `npm run dev:device`
- Check proxy logs for routing information

**WebSocket connections failing:**
- Verify `NEXT_PUBLIC_DEVICE_SERVER_URL=http://localhost:8080` in `.env.local`
- Check that `ALLOWED_ORIGINS` includes `http://localhost:8080`
- Review device-server logs for CORS errors

## Troubleshooting Socket Connection Timeouts

If you're experiencing socket connection timeouts, follow these steps:

### 1. Verify You're Using the Custom Server

Make sure you're running:
```bash
npm run dev    # ✅ Correct - uses server.js with Socket.IO
```

NOT:
```bash
next dev       # ❌ Wrong - standard Next.js, no Socket.IO
```

You should see in the terminal:
```
✅ Next.js is ready
> Ready on http://localhost:3000
> Socket.IO initialized on /api/socket.io
```

### 2. Fix "Port 9211 Already in Use" Error

If you see `Error: listen EADDRINUSE: address already in use :::9211`:

**Windows (PowerShell):**
```powershell
# Find what's using port 9211
netstat -ano | findstr :9211

# Kill the process (replace PID with the number from above)
taskkill /PID <PID> /F

# Then restart device-server
npm run dev:device
```

**Mac/Linux:**
```bash
# Find what's using port 9211
lsof -i :9211

# Kill the process (replace PID with the number from above)
kill -9 <PID>

# Then restart device-server
npm run dev:device
```

**Alternative: Use a different port:**
```bash
# Set a different port in .env.local
PORT=9212

# Then update NEXT_PUBLIC_DEVICE_SERVER_URL too
NEXT_PUBLIC_DEVICE_SERVER_URL=http://localhost:9212
```

### 3. Check if device-server.js is Running

The socket connects to `device-server.js` on port 9211. Make sure it's running:

```bash
# Check if device-server is running
npm run dev:device

# Or if using PM2
pm2 status
pm2 logs device-server
```

### 2. Verify Environment Variables

Check your `.env.local` file has the correct device server URL:

```env
NEXT_PUBLIC_DEVICE_SERVER_URL=http://localhost:9211
DEVICE_SERVER_URL=http://localhost:9211
```

For production, update these to your deployed device-server URL.

### 3. Check Browser Console

Open browser console (F12) and look for:
- `❌ Socket connection error: timeout` - Server not reachable
- `🚫 Connection refused` - device-server.js is not running
- `✅ Socket connected` - Connection successful

### 4. Common Issues

**Issue: "Connection timeout"**
- **Cause:** device-server.js is not running or not accessible
- **Fix:** Start device-server.js: `npm run dev:device`
- **Check:** Verify port 9211 is not blocked by firewall

**Issue: "ECONNREFUSED"**
- **Cause:** device-server.js is not running on the expected port
- **Fix:** 
  1. Check if device-server.js is running: `lsof -i :9211` (Mac/Linux) or `netstat -ano | findstr :9211` (Windows)
  2. Start device-server.js if not running
  3. Verify the port in `.env.local` matches the running port

**Issue: "CORS error"**
- **Cause:** device-server.js CORS settings blocking your origin
- **Fix:** Update `device-server.js` CORS configuration to allow your origin

**Issue: "WebSocket connection failed"**
- **Cause:** Network/firewall blocking WebSocket connections
- **Fix:** 
  1. Try using polling transport: `transports: ["polling"]`
  2. Check firewall/proxy settings
  3. Verify WebSocket support in your network

### 5. Test Socket Connection

You can test the socket connection directly:

```javascript
// In browser console
const socket = io('http://localhost:9211', {
  transports: ['websocket', 'polling'],
  timeout: 20000
});

socket.on('connect', () => console.log('✅ Connected'));
socket.on('connect_error', (err) => console.error('❌ Error:', err));
```

### 6. Production Deployment

If deploying to production:
1. Deploy `device-server.js` to a cloud service (Railway, Render, Fly.io) - See cloud platform documentation
2. Update `NEXT_PUBLIC_DEVICE_SERVER_URL` to your deployed URL
3. Ensure WebSocket connections are allowed
4. Check CORS settings allow your frontend domain


## Support

For issues and questions, please contact the development team.

