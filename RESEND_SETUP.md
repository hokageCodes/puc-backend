# Resend Email Setup - EASIEST SOLUTION! 🚀

## Why Resend?

- ✅ **FREE**: 3,000 emails/month (plenty for your needs)
- ✅ **NO SMTP CONFIGURATION**: Just an API key
- ✅ **RELIABLE**: Modern API, no connection issues
- ✅ **FAST**: Instant delivery
- ✅ **EASY**: Takes 2 minutes to set up

## Quick Setup (2 Minutes)

### Step 1: Sign Up for Resend (FREE)

1. Go to: **https://resend.com**
2. Click "Sign Up" (use Google/GitHub for quick signup)
3. Verify your email

### Step 2: Get Your API Key

1. After logging in, go to **API Keys** in the sidebar
2. Click **"Create API Key"**
3. Name it: `PUC Backend`
4. Copy the API key (starts with `re_...`)

### Step 3: Add Domain (Optional but Recommended)

1. Go to **Domains** in the sidebar
2. Click **"Add Domain"**
3. Enter: `paulusoro.com`
4. Add the DNS records they provide to your domain
5. Wait for verification (usually 5-10 minutes)

**OR** use their default domain for now (emails will come from `onboarding@resend.dev` - you can change the display name)

### Step 4: Add to Render Environment Variables

Go to **Render Dashboard → Your Web Service → Environment** and add:

```
RESEND_API_KEY=re_your_api_key_here
EMAIL_FROM=Paul Usoro & Co. <notifications@paulusoro.com>
```

**OR** if you haven't verified your domain yet:

```
RESEND_API_KEY=re_your_api_key_here
RESEND_FROM=onboarding@resend.dev
EMAIL_FROM=Paul Usoro & Co. <onboarding@resend.dev>
```

### Step 5: Redeploy

1. Save the environment variable in Render
2. **Redeploy** your service
3. Done! 🎉

## That's It!

The system will automatically use Resend if `RESEND_API_KEY` is set. No SMTP configuration needed!

## Benefits Over SMTP

- ✅ No port/firewall issues
- ✅ No authentication problems
- ✅ No connection timeouts
- ✅ Works from anywhere (Render, Vercel, etc.)
- ✅ Better deliverability
- ✅ Email analytics included

## Testing

After redeploying, try sending an invite from the admin dashboard. It should work immediately!

## Troubleshooting

If you see an error:
1. Check that `RESEND_API_KEY` is set correctly in Render
2. Make sure you redeployed after adding the variable
3. Check Render logs for any error messages
4. Verify the API key is active in Resend dashboard

## Free Tier Limits

- **3,000 emails/month** (FREE)
- Perfect for staff invites and password resets
- Upgrade later if needed (very affordable)

---

**This is the easiest solution - no more SMTP headaches!** 🎯

