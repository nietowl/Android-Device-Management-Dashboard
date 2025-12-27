# Security: Email Verification URLs

## Current Verification URL Structure

**✅ IMPLEMENTED: Proxy Endpoint to Hide Supabase URL**

The application now uses a proxy endpoint that completely hides the Supabase URL from users. Email verification links now use your domain exclusively:

```
https://yourdomain.com/api/auth/verify?token=[TOKEN]&type=signup&redirect=/dashboard
```

### How It Works

1. **User receives email** with link pointing to your domain (`/api/auth/verify`)
2. **Proxy endpoint** (`/api/auth/verify`) receives the request server-side
3. **Proxy forwards** verification to Supabase's verify endpoint (server-side, invisible to user)
4. **Supabase verifies** the token and returns a redirect with code
5. **Proxy extracts** the code and redirects to `/auth/callback`
6. **Callback exchanges** code for session and redirects user to dashboard

**Result**: Users only see your domain in email links - Supabase URL is completely hidden.

### Components Explained

1. **Your Domain** (`yourdomain.com/api/auth/verify`)
   - All email links now point to your domain
   - No Supabase URL visible to users
   - Works with any Supabase plan (no Pro requirement)

2. **Token** (`pkce_...`)
   - Single-use, time-limited verification token
   - Standard PKCE flow for secure email verification
   - Expires quickly (typically 1 hour)
   - This is normal and secure - tokens in URLs are standard for email verification

3. **Redirect Parameter** (`redirect=/dashboard`)
   - Where to redirect user after successful verification
   - Validated to prevent open redirects
   - Defaults to `/dashboard` if not specified

## Security Measures Implemented

### 1. Production URL Enforcement
- `NEXT_PUBLIC_SITE_URL` is **REQUIRED** in production
- Localhost URLs are **BLOCKED** in production
- HTTPS is **REQUIRED** in production
- No fallback to request headers in production

### 2. Logging Security
- Email addresses are sanitized in logs (`user@***`)
- Full redirect URLs are not logged (only domain)
- Tokens are never logged

### 3. Configuration Requirements

**Environment Variables (Production):**
```env
NEXT_PUBLIC_SITE_URL=https://yourdomain.com
NODE_ENV=production
```

**Supabase Dashboard Settings:**
1. Go to: **Authentication → URL Configuration**
2. Set **Site URL** to: `https://yourdomain.com`
3. Add to **Redirect URLs**:
   - `https://yourdomain.com/auth/callback`
   - `https://yourdomain.com/**`

## Supabase Email Template Configuration

**⚠️ IMPORTANT: Manual Configuration Required**

To ensure email links use the proxy endpoint, you must configure Supabase email templates:

### Step 1: Configure Email Templates

1. Go to: **Supabase Dashboard → Authentication → Email Templates**
2. For each template (Confirm signup, Reset password, Change email), update the verification link:

**For "Confirm signup" template:**
Replace the default link:
```
{{ .ConfirmationURL }}
```

With:
```
{{ .SiteURL }}/api/auth/verify?token={{ .Token }}&type=signup&redirect=/dashboard
```

**For "Reset password" template:**
Replace with:
```
{{ .SiteURL }}/api/auth/verify?token={{ .Token }}&type=recovery&redirect=/dashboard
```

**For "Change email" template:**
Replace with:
```
{{ .SiteURL }}/api/auth/verify?token={{ .Token }}&type=email_change&redirect=/dashboard
```

### Step 2: Verify Redirect URLs

1. Go to: **Authentication → URL Configuration**
2. Ensure these URLs are in **Redirect URLs**:
   - `https://yourdomain.com/api/auth/verify`
   - `https://yourdomain.com/auth/callback`
   - `https://yourdomain.com/**`

### Step 3: Set Site URL

1. In **Authentication → URL Configuration**
2. Set **Site URL** to: `https://yourdomain.com`
3. This ensures `{{ .SiteURL }}` variable uses your domain

## Alternative Options (No Longer Needed)

The proxy endpoint approach eliminates the need for these alternatives:

~~### Option 1: Custom Domain (Requires Supabase Pro Plan)~~
- **Not needed** - Proxy endpoint hides Supabase URL without Pro plan

~~### Option 2: Custom Email Verification Flow~~
- **Not needed** - Proxy endpoint provides full control without custom implementation

## Current Status

✅ **Supabase URL is completely hidden** - All email links use your domain  
✅ **Proxy endpoint implemented** - Server-side forwarding to Supabase  
✅ **Production domain enforcement** - localhost blocked in production  
✅ **HTTPS requirement** - production must use HTTPS  
✅ **Environment variable validation** - NEXT_PUBLIC_SITE_URL required  
✅ **Logging sanitization** - no sensitive data in logs  
✅ **Strict validation** - no fallback to insecure defaults  
✅ **Open redirect protection** - redirect URLs validated to prevent attacks  

## What's Visible (By Design)

✅ **Only your domain** - Users see `yourdomain.com/api/auth/verify`  
⚠️ **Verification token** - Visible in URL (standard PKCE flow)  
  - This is industry standard practice
  - Tokens are single-use and time-limited (typically 1 hour)
  - Not a security vulnerability

## Implementation Details

The proxy endpoint (`/api/auth/verify`) handles:
- Token validation and format checking
- Server-side forwarding to Supabase verify endpoint
- Extracting verification code from Supabase redirect
- Secure redirect to callback endpoint
- Support for all auth types (signup, recovery, email_change)
- Open redirect protection
- Error handling and user-friendly error pages

## Setup Checklist

1. ✅ **Set `NEXT_PUBLIC_SITE_URL` in production** - Required for proxy endpoint
2. ✅ **Configure Supabase Email Templates** - Update templates to use proxy endpoint (see above)
3. ✅ **Set Supabase Site URL** - In Dashboard → Authentication → URL Configuration
4. ✅ **Add Redirect URLs** - Ensure `/api/auth/verify` and `/auth/callback` are whitelisted
5. ✅ **Use HTTPS** - Required for production
6. ✅ **Test email verification** - Send test emails and verify links use your domain

## Troubleshooting

**Email links still show Supabase URL?**
- Check that email templates are updated (see "Supabase Email Template Configuration" above)
- Verify `NEXT_PUBLIC_SITE_URL` is set correctly
- Ensure templates use `{{ .SiteURL }}/api/auth/verify` format

**Verification fails?**
- Check that `/api/auth/verify` is in Supabase Redirect URLs
- Verify `/auth/callback` is also whitelisted
- Check server logs for proxy endpoint errors
- Ensure Supabase URL environment variables are set

**Redirect errors?**
- Verify redirect parameter is a relative path (starts with `/`)
- Check that callback endpoint is accessible
- Review proxy endpoint logs for validation errors

