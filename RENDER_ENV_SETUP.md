# How to Set Environment Variables in Render (IMPORTANT!)

## ⚠️ CRITICAL: Each Variable Must Be On Its Own Line!

In Render, environment variables must be set **one per line**, NOT all on one line!

## ❌ WRONG (Don't Do This):

```
MONGODB_URI=... JWT_ACCESS_SECRET=... RESEND_API_KEY=... EMAIL_FROM=...
```

## ✅ CORRECT (Do This):
    
In Render Dashboard → Your Web Service → Environment, add each variable **separately**:

```
MONGODB_URI=mongodb+srv://pucit:orochimaru1@mfonbooks.krds7.mongodb.net/PUC
JWT_ACCESS_SECRET=super-long-random-string
JWT_REFRESH_SECRET=another-super-long-random-string
NODE_ENV=production
CLIENT_URL=https://www.paulusoro.com
CLOUDINARY_CLOUD_NAME=dsjehws0p
CLOUDINARY_API_KEY=416929542928176
CLOUDINARY_API_SECRET=TQ7bROX_bJ5Dnrm7S5Hmp2__BTQ
CLOUDINARY_URL=cloudinary://416929542928176:TQ7bROX_bJ5Dnrm7S5Hmp2__BTQ@dsjehws0p
JWT_SECRET=yourreally_very_secret_key
LEAVE_PORTAL_URL=https://paulusoro.com
RESEND_API_KEY=re_WcvQyrwT_PuWpUuPWFxL8HZRaCkn21qjEs
RESEND_FROM=onboarding@resend.dev
EMAIL_FROM=Paul Usoro & Co. <onboarding@resend.dev>
```

## Step-by-Step in Render:

1. Go to **Render Dashboard**
2. Click on **Your Web Service**
3. Click **Environment** tab (on the left sidebar)
4. **Delete all existing variables** (if they're on one line)
5. Click **"Add Environment Variable"** button
6. Add each variable **one at a time**:
   - Key: `RESEND_API_KEY`
   - Value: `re_WcvQyrwT_PuWpUuPWFxL8HZRaCkn21qjEs`
   - Click **Save Changes**
   - Repeat for each variable

## Quick Copy-Paste Method:

1. In Render Environment tab, you'll see a text area or individual fields
2. If it's a text area, paste each variable on its own line:
   ```
   RESEND_API_KEY=re_WcvQyrwT_PuWpUuPWFxL8HZRaCkn21qjEs
   EMAIL_FROM=Paul Usoro & Co. <onboarding@resend.dev>
   RESEND_FROM=onboarding@resend.dev
   ```
3. Make sure there's a **line break** between each variable

## After Adding Variables:

1. **Save** the environment variables
2. **Redeploy** your service (Render → Manual Deploy or push a commit)
3. Check logs - you should see: `RESEND_API_KEY present: true`

## Verify It's Working:

1. Visit: `https://your-backend.onrender.com/api/diagnostic/smtp`
2. Should show: `RESEND_API_KEY: ✅ Set (RECOMMENDED!)`
3. Try sending an invite - should work instantly!

## Common Mistakes:

- ❌ All variables on one line (won't work!)
- ❌ Forgetting to redeploy after adding variables
- ❌ Typos in variable names (case-sensitive!)
- ❌ Extra spaces around the `=` sign

## If Still Not Working:

1. Check Render logs for: `RESEND_API_KEY present: true/false`
2. If it says `false`, the variable isn't being read correctly
3. Delete and re-add the variable, making sure it's on its own line
4. Redeploy again

