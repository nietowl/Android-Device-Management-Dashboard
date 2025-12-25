# Cache Clearing Instructions

## Problem: Port 8080 URL Issue

If you're experiencing issues where the browser tries to load resources from `https://45.138.16.238:8080` instead of `http://45.138.16.238`, this is likely due to cached URLs from development. Port 8080 is only used in development (dev-proxy.js), not in production.

## Solution: Clear Browser Cache and Service Workers

### Method 1: Hard Refresh (Quick Fix)

**Chrome/Edge:**
- Press `Ctrl + Shift + R` (Windows/Linux) or `Cmd + Shift + R` (Mac)
- Or press `F12` to open DevTools, then right-click the refresh button and select "Empty Cache and Hard Reload"

**Firefox:**
- Press `Ctrl + Shift + R` (Windows/Linux) or `Cmd + Shift + R` (Mac)
- Or press `Ctrl + F5`

**Safari:**
- Press `Cmd + Option + R`
- Or go to Safari menu → Develop → Empty Caches

### Method 2: Clear Browser Cache (Complete Fix)

**Chrome/Edge:**
1. Press `Ctrl + Shift + Delete` (Windows/Linux) or `Cmd + Shift + Delete` (Mac)
2. Select "Cached images and files"
3. Choose "All time" from the time range dropdown
4. Click "Clear data"

**Firefox:**
1. Press `Ctrl + Shift + Delete` (Windows/Linux) or `Cmd + Shift + Delete` (Mac)
2. Select "Cache"
3. Choose "Everything" from the time range dropdown
4. Click "Clear Now"

**Safari:**
1. Go to Safari menu → Preferences → Advanced
2. Check "Show Develop menu in menu bar"
3. Go to Develop menu → Empty Caches

### Method 3: Clear Service Workers (If Applicable)

**Chrome/Edge:**
1. Press `F12` to open DevTools
2. Go to "Application" tab (or "Storage" in older versions)
3. Click "Service Workers" in the left sidebar
4. Click "Unregister" for any registered service workers
5. Go to "Cache Storage" and delete all caches
6. Go to "Local Storage" and clear the site's local storage

**Firefox:**
1. Press `F12` to open DevTools
2. Go to "Storage" tab
3. Expand "Cache Storage" and delete all entries
4. Expand "Local Storage" and clear the site's local storage

### Method 4: Incognito/Private Browsing (Test)

Open the site in an incognito/private window to test if the issue is cache-related:
- **Chrome/Edge:** `Ctrl + Shift + N` (Windows/Linux) or `Cmd + Shift + N` (Mac)
- **Firefox:** `Ctrl + Shift + P` (Windows/Linux) or `Cmd + Shift + P` (Mac)
- **Safari:** `Cmd + Shift + N`

If the site works correctly in incognito mode, the issue is definitely browser cache.

### Method 5: Clear Site Data (Most Thorough)

**Chrome/Edge:**
1. Click the lock icon (or info icon) in the address bar
2. Click "Site settings"
3. Click "Clear data"
4. Check all boxes and click "Clear"

**Firefox:**
1. Click the lock icon in the address bar
2. Click "Clear Cookies and Site Data"
3. Confirm the action

## Verification

After clearing cache, verify the correct URLs are being used:

1. Open DevTools (`F12`)
2. Go to "Network" tab
3. Reload the page
4. Check the URLs in the network requests - they should NOT contain `:8080`
5. All requests should go to `http://45.138.16.238` (or your production domain)

## Prevention

The following fixes have been implemented to prevent this issue:

1. **Base Tag**: Added `<base>` tag in `app/layout.tsx` to ensure relative URLs resolve correctly
2. **Cache-Busting Headers**: Added proper cache headers to prevent browsers from using cached old URLs
3. **Environment Validation**: Deployment script now validates and warns about port 8080 in URLs
4. **Relative URLs**: Next.js is configured to use relative URLs for assets (default behavior)

## Still Having Issues?

If clearing cache doesn't resolve the issue:

1. **Check Environment Variables**: Verify `.env.production` has correct `NEXT_PUBLIC_APP_URL` (should NOT contain `:8080`)
2. **Check Nginx Configuration**: Ensure Nginx is properly configured and not redirecting to port 8080
3. **Check DNS**: Verify domain/IP resolves correctly
4. **Check Browser Extensions**: Some extensions may cache or modify URLs
5. **Try Different Browser**: Test in a different browser to rule out browser-specific issues

## Technical Details

- **Port 8080**: Only used in development via `dev-proxy.js`
- **Production**: Uses port 80 (HTTP) or 443 (HTTPS) through Nginx reverse proxy
- **Base Tag**: Ensures all relative URLs resolve from the correct base URL
- **Cache Headers**: Static assets have long cache with versioning, HTML has no cache

