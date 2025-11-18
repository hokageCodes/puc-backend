# SMTP Configuration for Render Deployment

## Problem
Email sending works on localhost but fails in production with "connection failed. Please check SMTP configuration."

## Quick Diagnostic

1. **Check the diagnostic endpoint** (after deploying):
   ```
   https://your-backend-url.onrender.com/api/diagnostic/smtp
   ```
   This will show which environment variables are missing.

2. **Check Render logs** for SMTP configuration messages when the server starts.

## Required Environment Variables in Render

Go to your Render dashboard → Your Web Service → Environment → Add the following:

### Required Variables:
```
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=your-email@paulusoro.com
SMTP_PASS=your-app-password
EMAIL_FROM="Paul Usoro & Co. <notifications@paulusoro.com>"
SMTP_SECURE=false
```

### Important Notes:

1. **Case Sensitivity**: Variable names are case-sensitive. Use EXACTLY:
   - `SMTP_HOST` (not `smtp_host` or `Smtp_Host`)
   - `SMTP_PORT` (not `smtp_port`)
   - `SMTP_USER` (not `smtp_user`)
   - `SMTP_PASS` (not `smtp_pass`)
   - `EMAIL_FROM` (not `email_from`)

2. **SMTP_PASS**: For Office 365, you MUST use an **App Password**, not your regular password.
   - Go to: https://account.microsoft.com/security
   - Security → Advanced security options → App passwords
   - Generate a new app password for "Mail"
   - Use that 16-character password as `SMTP_PASS`

3. **EMAIL_FROM**: Can include quotes or not:
   - `"Paul Usoro & Co. <notifications@paulusoro.com>"`
   - OR: `Paul Usoro & Co. <notifications@paulusoro.com>`

4. **SMTP_SECURE**: 
   - `false` for port 587 (STARTTLS)
   - `true` for port 465 (SSL)

## Common Issues

### Issue 1: Variables Not Set
**Symptom**: Diagnostic endpoint shows "❌ Missing" for variables
**Solution**: 
- Go to Render dashboard → Environment
- Add each variable one by one
- **Redeploy** after adding variables (Render doesn't auto-reload env vars)

### Issue 2: Wrong Variable Names
**Symptom**: Variables show as missing even though you added them
**Solution**: 
- Check for typos (case sensitivity matters!)
- Common mistakes: `smtp_host` instead of `SMTP_HOST`

### Issue 3: Network/Firewall Blocking
**Symptom**: Variables are set but connection times out
**Solution**: 
- Render may block outbound SMTP on some ports
- Try port 465 with SSL instead:
  ```
  SMTP_PORT=465
  SMTP_SECURE=true
  ```
- Or use an alternative SMTP provider (Gmail, Brevo, SendGrid)

### Issue 4: App Password Not Used
**Symptom**: Authentication fails
**Solution**: 
- Office 365 requires App Passwords for SMTP
- Regular passwords won't work
- Generate a new app password and use that

## Alternative SMTP Providers (If Office 365 Doesn't Work)

### Option 1: Gmail SMTP
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-16-char-app-password
EMAIL_FROM="Paul Usoro & Co. <your-email@gmail.com>"
```

### Option 2: Brevo (Free - 300 emails/day)
```
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-brevo-email@example.com
SMTP_PASS=your-brevo-smtp-password
EMAIL_FROM="Paul Usoro & Co. <notifications@paulusoro.com>"
```

### Option 3: SendGrid (Free - 100 emails/day)
```
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
EMAIL_FROM="Paul Usoro & Co. <notifications@paulusoro.com>"
```

## Verification Steps

1. **Add all environment variables in Render**
2. **Redeploy your service** (important!)
3. **Check diagnostic endpoint**: `https://your-backend.onrender.com/api/diagnostic/smtp`
4. **Check Render logs** for SMTP configuration messages
5. **Test sending an invite** from the admin dashboard

## After Fixing

Once variables are set correctly:
- The diagnostic endpoint will show "✅ Set" for all variables
- Connection status should show "✅ Connected"
- Email invites should work from the admin dashboard

## Still Not Working?

1. Check Render logs for detailed error messages
2. Verify the SMTP server is accessible from Render's network
3. Try a different SMTP provider (Gmail, Brevo, SendGrid)
4. Check if Render has any firewall restrictions on SMTP ports


