# Security: Email Verification URLs

## Current Verification URL Structure

Supabase email verification links follow this format:
```
https://[PROJECT_REF].supabase.co/auth/v1/verify?token=[TOKEN]&type=signup&redirect_to=[YOUR_DOMAIN]/auth/callback
```

### Components Explained

1. **Supabase Project Reference** (`sqrmwanjudctgtgssjcg.supabase.co`)
   - This is Supabase's authentication domain
   - **Cannot be hidden** without using Supabase's custom domain feature (requires Pro plan)
   - This is how Supabase's email verification works - verification happens on their domain first, then redirects to yours

2. **Token** (`pkce_...`)
   - Single-use, time-limited verification token
   - Standard PKCE flow for secure email verification
   - Expires quickly (typically 1 hour)
   - This is normal and secure - tokens in URLs are standard for email verification

3. **Redirect URL** (`redirect_to=...`)
   - This should ALWAYS use your production domain
   - Currently controlled by `NEXT_PUBLIC_SITE_URL` environment variable
   - **CRITICAL**: Must be set in production to prevent localhost exposure

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

## How to Hide Supabase Project Reference (Optional)

### Option 1: Custom Domain (Requires Supabase Pro Plan)
1. Go to: **Project Settings → Custom Domain**
2. Configure your custom domain for Auth
3. Update DNS records as instructed
4. Verification URLs will use your domain instead

### Option 2: Custom Email Verification Flow
- Implement your own email verification system
- Use Supabase only for authentication, not email verification
- More complex but gives full control

## Current Limitations

- **Supabase project reference is visible** in verification URLs
  - This is standard Supabase behavior
  - Only hidden with custom domain (Pro plan required)
  - The project reference itself is not sensitive (it's public)

- **Token in URL is standard**
  - This is how PKCE email verification works
  - Tokens are single-use and time-limited
  - This is industry standard practice

## What We've Fixed

✅ **Production domain enforcement** - localhost blocked in production  
✅ **HTTPS requirement** - production must use HTTPS  
✅ **Environment variable validation** - NEXT_PUBLIC_SITE_URL required  
✅ **Logging sanitization** - no sensitive data in logs  
✅ **Strict validation** - no fallback to insecure defaults  

## What's Still Visible (By Design)

⚠️ **Supabase project reference** - visible in URL (standard Supabase behavior)  
⚠️ **Verification token** - visible in URL (standard PKCE flow)  

These are **not security vulnerabilities** - they're how Supabase's email verification works. The token is single-use and time-limited, and the project reference is public information.

## Recommendations

1. **Set `NEXT_PUBLIC_SITE_URL` in production** - This ensures redirect_to uses your domain
2. **Configure Supabase Site URL** - Set in Supabase Dashboard → Authentication → URL Configuration
3. **Use HTTPS** - Required for production
4. **Consider custom domain** - If you need to hide Supabase reference (Pro plan required)

