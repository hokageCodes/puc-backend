# Free SMTP Alternatives for PUC Backend

Since Office 365 port 587 is being blocked by your network/firewall, here are **FREE** alternatives that work with Nodemailer:

## Option 1: Gmail SMTP Port 465 (SSL) - Try This First!

If port 587 is blocked, try port 465 with SSL:

1. **Enable 2-Step Verification** on your Gmail account
2. **Generate an App Password**:
   - Go to: https://myaccount.google.com/apppasswords
   - Select "Mail" and "Other (Custom name)"
   - Name it "PUC Backend"
   - Copy the 16-character password

3. **Update your `.env`** (use port 465):
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-16-char-app-password
EMAIL_FROM="Paul Usoro & Co. <your-email@gmail.com>"
```

**Limits**: 500 emails/day, 2000 emails/day for Google Workspace accounts

**Note**: Port 465 uses SSL/TLS directly, which might not be blocked like port 587.

---

## Option 2: Brevo (formerly Sendinblue) - 300 emails/day FREE

**Best alternative if Gmail doesn't work!**

1. **Sign up** at https://www.brevo.com (free tier - 300 emails/day)
2. **Get SMTP credentials**:
   - Dashboard → Settings → SMTP & API
   - Copy your SMTP server, login, and password

3. **Update your `.env`**:
```env
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-brevo-email@example.com
SMTP_PASS=your-brevo-smtp-password
EMAIL_FROM="Paul Usoro & Co. <leaveadmin@paulusoro.com>"
```

**Limits**: 300 emails/day free, unlimited for paid plans
**Why it might work**: Uses different infrastructure, might not be blocked

---

## Option 3: SendGrid (100 emails/day free)

1. **Sign up** at https://sendgrid.com (free tier)
2. **Create an API Key**:
   - Dashboard → Settings → API Keys
   - Create API Key → Full Access
   - Copy the key

3. **Update your `.env`**:
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key-here
EMAIL_FROM="Paul Usoro & Co. <leaveadmin@paulusoro.com>"
```

**Limits**: 100 emails/day free, unlimited for paid plans

---

## Option 4: Try Office 365 Port 465 (SSL)

If port 587 is blocked, try port 465 with SSL:

```env
SMTP_HOST=smtp.office365.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=leaveadmin@paulusoro.com
SMTP_PASS=dpxscbmvzswbnshs
EMAIL_FROM="Paul Usoro & Co. <leaveadmin@paulusoro.com>"
```

Then run: `node scripts/testSMTP.js`

---

## Option 5: Fix Windows Firewall (Requires Admin Access)

Run PowerShell **as Administrator**:

```powershell
# Allow outbound SMTP on port 587
New-NetFirewallRule -DisplayName "Allow SMTP 587" -Direction Outbound -Protocol TCP -LocalPort 587 -Action Allow

# Allow outbound SMTP on port 465
New-NetFirewallRule -DisplayName "Allow SMTP 465" -Direction Outbound -Protocol TCP -LocalPort 465 -Action Allow
```

Then test: `Test-NetConnection -ComputerName smtp.office365.com -Port 587`

---

## Testing

After updating your `.env`, test the connection:

```bash
node scripts/testSMTP.js
```

This will verify the connection and send a test email.

---

## Recommendation

**Use Gmail SMTP** if you have a Gmail account - it's the easiest and most reliable free option with good limits.

