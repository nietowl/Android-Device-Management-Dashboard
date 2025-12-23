# Troubleshooting Guide

## "Failed to fetch" / "AuthRetryableFetchError" on Login

If you're seeing a "Failed to fetch" or "AuthRetryableFetchError" when trying to sign in, check the following:

### Quick Fix: Try Webpack Instead of Turbopack

Next.js 16 uses Turbopack by default, which can sometimes cause fetch issues. Try using Webpack:

```bash
npm run dev:webpack
```

This uses the traditional Webpack bundler which is more stable for Supabase connections.

### 1. Check Environment Variables

Make sure your `.env.local` file exists and contains:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

**Important**: 
- Variables must start with `NEXT_PUBLIC_` to be available in the browser
- Restart your dev server after changing `.env.local`

### 2. Restart Development Server

After creating or modifying `.env.local`, you **must** restart the dev server:

```bash
# Stop the server (Ctrl+C)
# Then restart:
npm run dev
```

### 3. Check Supabase Project Status

Your Supabase project might be paused (free tier projects pause after inactivity):

1. Go to https://app.supabase.com
2. Check if your project is active
3. If paused, click "Restore" to reactivate it

### 4. Verify Supabase URL

Make sure your `NEXT_PUBLIC_SUPABASE_URL` is correct:
- Should start with `https://`
- Should end with `.supabase.co`
- Example: `https://sqrmwanjudctgtgssjcg.supabase.co`

### 5. Check CORS Configuration

In your Supabase dashboard:
1. Go to **Settings** → **API**
2. Under **CORS**, make sure your localhost is allowed:
   - `http://localhost:3000`
   - `http://127.0.0.1:3000`

Or add your production domain when deploying.

### 6. Check Network Connectivity

Test if you can reach Supabase:

```bash
# Test connectivity
curl https://sqrmwanjudctgtgssjcg.supabase.co/rest/v1/
```

If this fails, check your internet connection or firewall.

### 7. Check Browser Console

Open browser DevTools (F12) and check:
- **Console** tab for detailed error messages
- **Network** tab to see if requests are being made
- Look for CORS errors (red requests)

### 8. Verify API Keys

1. Go to https://app.supabase.com/project/_/settings/api
2. Copy the **Project URL** → use as `NEXT_PUBLIC_SUPABASE_URL`
3. Copy the **anon/public** key → use as `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**Important**: Use the **anon** key, NOT the **service_role** key for client-side code.

---

## Common Issues

### Issue: "Missing Supabase environment variables"

**Solution**: Create `.env.local` file in the project root with your Supabase credentials.

### Issue: Environment variables not loading

**Solution**: 
1. Make sure file is named `.env.local` (not `.env` or `.env.local.txt`)
2. Restart the dev server
3. Check that variables start with `NEXT_PUBLIC_`

### Issue: "Invalid Supabase URL"

**Solution**: 
- URL must be a valid HTTPS URL
- Should be your Supabase project URL (not a custom domain)
- Format: `https://xxxxx.supabase.co`

### Issue: CORS errors in browser console

**Solution**: 
1. Add your domain to Supabase CORS settings
2. For development: Add `http://localhost:3000`
3. For production: Add your production domain

---

## Still Having Issues?

1. Check the browser console for detailed error messages
2. Check the terminal where `npm run dev` is running for server errors
3. Verify your Supabase project is active and not paused
4. Test the Supabase URL directly in your browser

---

**Last Updated**: $(date)

