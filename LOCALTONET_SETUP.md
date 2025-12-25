# LocalTunnel Setup Guide for Device Server

This guide shows you how to use **localtonet.com/servermanager** to expose your device-server.js to the internet.

---

## 📋 Prerequisites

1. **Device server running** on port `9211`
2. **Account on localtonet.com** (sign up if needed)
3. **LocalTunnel client** installed (if using CLI)

---

## 🚀 Setup Steps

### Step 1: Start Your Device Server

Make sure your device-server is running locally:

```powershell
npm run dev:device
```

You should see:
```
🚀 Server running at http://0.0.0.0:9211
```

### Step 2: Access LocalTunnel Server Manager

1. Go to **https://localtonet.com/servermanager**
2. Log in with your account

### Step 3: Create a Tunnel

In the LocalTunnel Server Manager:

1. **Click "Create Tunnel"** or similar option
2. **Configure the tunnel:**
   - **Local Port:** `9211`
   - **Protocol:** `HTTP` or `TCP` (depending on LocalTunnel options)
   - **Type:** Choose based on your needs:
     - **TCP/UDP Tunnel** - For Socket.IO connections
     - **HTTP Tunnel** - For HTTP requests

3. **Get your public URL:**
   - LocalTunnel will provide a URL like: `https://xxxxx.localtonet.com`
   - Or an IP:Port combination like: `xxxxx.localtonet.com:12345`

### Step 4: Update Environment Variables

Update your `.env.local` file with the LocalTunnel URL:

```env
# Device Server URL (LocalTunnel public URL)
DEVICE_SERVER_URL=https://your-tunnel-id.localtonet.com
NEXT_PUBLIC_DEVICE_SERVER_URL=https://your-tunnel-id.localtonet.com

# Keep your other variables
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_key
ALLOWED_ORIGINS=https://your-dashboard.com
```

**Important:** 
- Use `https://` if LocalTunnel provides HTTPS
- Use the full URL including port if required
- For Socket.IO, ensure WebSocket support is enabled

### Step 5: Update CORS Settings

Update `device-server.js` to allow your LocalTunnel domain:

```javascript
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : process.env.NEXT_PUBLIC_APP_URL 
    ? [process.env.NEXT_PUBLIC_APP_URL]
    : ['http://localhost:3000'];

// Add LocalTunnel domain to allowed origins
allowedOrigins.push('https://your-tunnel-id.localtonet.com');
```

Or set in `.env.local`:
```env
ALLOWED_ORIGINS=https://your-dashboard.com,https://your-tunnel-id.localtonet.com
```

### Step 6: Restart Your Services

1. **Restart device-server:**
   ```powershell
   # Stop current server (Ctrl+C)
   npm run dev:device
   ```

2. **Restart Next.js app:**
   ```powershell
   npm run dev
   ```

### Step 7: Test Connection

1. **Test from browser:**
   ```
   https://your-tunnel-id.localtonet.com/health
   ```
   Should return: `{"status":"ok"}`

2. **Test Socket.IO connection:**
   - Open browser console
   - Check for successful WebSocket connection
   - Verify no CORS errors

3. **Test from Android app:**
   - Update Android app with LocalTunnel URL
   - Connect and verify device appears in dashboard

---

## 🔧 Configuration Details

### For HTTP/HTTPS Tunnels

If LocalTunnel provides HTTP/HTTPS:

```env
DEVICE_SERVER_URL=https://your-tunnel-id.localtonet.com
NEXT_PUBLIC_DEVICE_SERVER_URL=https://your-tunnel-id.localtonet.com
```

### For TCP/UDP Tunnels

If LocalTunnel provides TCP/UDP (IP:Port):

```env
DEVICE_SERVER_URL=https://your-tunnel-id.localtonet.com:PORT
NEXT_PUBLIC_DEVICE_SERVER_URL=https://your-tunnel-id.localtonet.com:PORT
```

**Note:** Socket.IO may need WebSocket upgrade support. Ensure LocalTunnel supports WebSockets.

---

## 📱 Update Android App

In your Android app, update the connection URL:

```java
// Old (local)
String serverUrl = "http://localhost:9211";

// New (LocalTunnel)
String serverUrl = "https://your-tunnel-id.localtonet.com";
```

Or if using port:
```java
String serverUrl = "https://your-tunnel-id.localtonet.com:PORT";
```

---

## ⚙️ Advanced Configuration

### Persistent Tunnel (If Available)

Some LocalTunnel plans offer persistent tunnels:

1. **Set up persistent tunnel** in LocalTunnel dashboard
2. **Use custom subdomain** if available
3. **Configure auto-reconnect** if tunnel drops

### Health Check Endpoint

Your device-server already has a health endpoint:
```
GET /health
```

Use this to verify tunnel is working:
```powershell
curl https://your-tunnel-id.localtonet.com/health
```

### Socket.IO WebSocket Support

Ensure LocalTunnel supports WebSocket upgrades:

1. **Check LocalTunnel documentation** for WebSocket support
2. **Test WebSocket connection** from browser console
3. **Verify Socket.IO can connect** through tunnel

---

## 🆘 Troubleshooting

### "Connection Refused"

**Problem:** Can't connect to tunnel

**Solutions:**
- Verify device-server is running: `npm run dev:device`
- Check port is correct (9211)
- Verify tunnel is active in LocalTunnel dashboard
- Check firewall isn't blocking port 9211

### "CORS Error"

**Problem:** Browser blocks requests due to CORS

**Solutions:**
- Add LocalTunnel URL to `ALLOWED_ORIGINS`
- Update `device-server.js` CORS configuration
- Restart device-server after changes

### "Socket.IO Connection Failed"

**Problem:** WebSocket can't connect through tunnel

**Solutions:**
- Verify LocalTunnel supports WebSocket
- Check tunnel type (TCP/UDP may be needed)
- Test with HTTP first, then WebSocket
- Check browser console for specific errors

### "Tunnel URL Changed"

**Problem:** LocalTunnel URL changes on restart

**Solutions:**
- Use persistent tunnel (if available in your plan)
- Update `.env.local` with new URL
- Restart Next.js app after URL change
- Consider using paid plan for stable URL

### "Timeout Errors"

**Problem:** Requests timeout

**Solutions:**
- Check LocalTunnel server status
- Verify your internet connection
- Check if tunnel is still active
- Restart tunnel if needed

---

## 📝 Environment Variables Summary

```env
# LocalTunnel Public URL
DEVICE_SERVER_URL=https://your-tunnel-id.localtonet.com
NEXT_PUBLIC_DEVICE_SERVER_URL=https://your-tunnel-id.localtonet.com

# Supabase (required)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_key

# CORS - Include LocalTunnel domain
ALLOWED_ORIGINS=https://your-dashboard.com,https://your-tunnel-id.localtonet.com

# Next.js App
NEXT_PUBLIC_APP_URL=https://your-dashboard.com
```

---

## 🔄 Daily Usage

### Starting Everything

1. **Start device-server:**
   ```powershell
   npm run dev:device
   ```

2. **Ensure LocalTunnel is active:**
   - Check https://localtonet.com/servermanager
   - Verify tunnel is running

3. **Start Next.js app:**
   ```powershell
   npm run dev
   ```

### Monitoring

- **Check device-server logs** for connection issues
- **Monitor LocalTunnel dashboard** for tunnel status
- **Test health endpoint** regularly
- **Check Android device connections**

---

## 💡 Tips

1. **Keep tunnel active:** Some plans require tunnel to stay active
2. **Monitor usage:** Check LocalTunnel dashboard for limits
3. **Backup URL:** Save your tunnel URL in case it changes
4. **Test regularly:** Verify connection works before important operations
5. **Update Android app:** Keep Android app URL in sync with tunnel URL

---

## 📚 LocalTunnel Resources

- **Dashboard:** https://localtonet.com/servermanager
- **Documentation:** Check LocalTunnel docs for specific features
- **Support:** Contact LocalTunnel support if needed

---

## ✅ Checklist

- [ ] Device-server running on port 9211
- [ ] LocalTunnel account created
- [ ] Tunnel created in LocalTunnel dashboard
- [ ] Public URL obtained
- [ ] `.env.local` updated with LocalTunnel URL
- [ ] CORS configured for LocalTunnel domain
- [ ] Device-server restarted
- [ ] Next.js app restarted
- [ ] Health endpoint tested
- [ ] Socket.IO connection tested
- [ ] Android app updated with new URL
- [ ] End-to-end connection verified

---

**Your device-server is now accessible via LocalTunnel!** 🎉

