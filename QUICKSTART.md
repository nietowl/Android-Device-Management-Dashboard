# Quick Start Guide

## Prerequisites Checklist

- [ ] Node.js 18+ installed
- [ ] npm or yarn installed
- [ ] Supabase account created
- [ ] Supabase project created

## Step-by-Step Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Supabase

1. Go to your Supabase project dashboard
2. Navigate to Settings > API
3. Copy your Project URL and anon/public key
4. Create a `.env.local` file in the root directory:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### 3. Set Up Database

1. Go to Supabase SQL Editor
2. Copy and paste the contents of `supabase/migrations/001_initial_schema.sql`
3. Run the SQL script
4. Verify the `devices` table was created

### 4. Configure Authentication

1. In Supabase Dashboard, go to Authentication > Settings
2. Enable Email authentication
3. (Optional) Configure email templates
4. (Optional) Add OAuth providers if needed

### 5. Run the Development Server

```bash
npm run dev
```

### 6. Access the Application

Open [http://localhost:3000](http://localhost:3000) in your browser.

## First Steps

1. **Create an Account**: Click "Sign up" on the login page
2. **Verify Email**: Check your email for the confirmation link (if email confirmation is enabled)
3. **Sign In**: Use your credentials to log in
4. **Add a Device**: The dashboard will show mock data initially. To add real devices, you'll need to:
   - Implement device registration API
   - Create an Android app/service that connects to your backend
   - Set up device pairing mechanism

## Development Notes

- The application currently uses mock data for demonstration
- To connect real Android devices, you'll need to:
  - Build an Android companion app/service
  - Implement WebSocket server for real-time communication
  - Set up secure device registration and pairing
  - Implement actual device control APIs

## Troubleshooting

### Authentication Issues
- Ensure your Supabase URL and keys are correct in `.env.local`
- Check that email authentication is enabled in Supabase
- Verify RLS policies are set up correctly

### Database Issues
- Ensure the `devices` table exists and has correct schema
- Check that RLS policies allow user access to their own devices
- Verify foreign key constraints are correct

### Build Errors
- Run `npm install` to ensure all dependencies are installed
- Check Node.js version (should be 18+)
- Clear `.next` folder and rebuild: `rm -rf .next && npm run build`

## Next Steps

1. Implement real device communication backend
2. Build Android companion app
3. Set up WebSocket server for real-time updates
4. Add device registration and pairing flow
5. Implement actual screen capture and control APIs

