# Vercel 404 Troubleshooting Guide

If you're getting a 404 error on your Vercel deployment, check the following:

## 1. Verify Vercel Project Settings

In your Vercel project dashboard, go to **Settings → General** and verify:

- **Root Directory**: Should be set to `puc-backend` (if your repo has both frontend and backend)
- **Framework Preset**: Should be **"Other"** (not Next.js, not Express)
- **Build Command**: Leave empty or set to `npm install`
- **Output Directory**: Leave empty
- **Install Command**: `npm install`

## 2. Check Deployment Logs

1. Go to your Vercel project dashboard
2. Click on the latest deployment
3. Check the **Build Logs** for any errors
4. Check the **Function Logs** for runtime errors

Common issues:
- Missing environment variables
- Build errors
- Import/export errors

## 3. Verify File Structure

Your project should have this structure:
```
puc-backend/
├── api/
│   └── index.js          ← Serverless function entry point
├── app.js                 ← Express app
├── vercel.json           ← Vercel configuration
└── package.json
```

## 4. Test the Function Locally

Install Vercel CLI and test locally:

```bash
npm install -g vercel
cd puc-backend
vercel dev
```

Then visit `http://localhost:3000/health` to see if it works locally.

## 5. Check Function URL

After deployment, Vercel creates a function URL. Check:
- Your deployment URL: `https://puc-backend.vercel.app`
- The function should be accessible at: `https://puc-backend.vercel.app/api/index`

But with the `vercel.json` routing, all paths should work:
- `https://puc-backend.vercel.app/health`
- `https://puc-backend.vercel.app/api/staff`
- etc.

## 6. Common Fixes

### Fix 1: Ensure @vercel/node is Available

Vercel automatically provides `@vercel/node`, but if you're having issues, you can try adding it:

```bash
npm install @vercel/node --save-dev
```

### Fix 2: Check Environment Variables

Make sure all required environment variables are set in Vercel:
- Go to **Settings → Environment Variables**
- Add all variables from your `.env` file
- Redeploy after adding variables

### Fix 3: Verify vercel.json Location

The `vercel.json` file must be in the **root directory** that Vercel is using:
- If Root Directory is `puc-backend`, then `vercel.json` should be in `puc-backend/vercel.json` ✅
- If Root Directory is `.` (root), then `vercel.json` should be in the repo root

### Fix 4: Check Build Output

After deployment, check:
1. Go to **Deployments** tab
2. Click on your deployment
3. Check **Functions** tab - you should see `api/index.js` listed
4. If it's not there, the function isn't being detected

## 7. Alternative: Simpler Configuration

If the current setup doesn't work, try this simpler `vercel.json`:

```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/api/index"
    }
  ]
}
```

And ensure `api/index.js` exports the app correctly.

## 8. Debug Steps

1. **Check if function exists**: Visit `https://puc-backend.vercel.app/api/index` directly
2. **Check build logs**: Look for any errors during build
3. **Check function logs**: Look for runtime errors
4. **Test with curl**:
   ```bash
   curl https://puc-backend.vercel.app/health
   ```

## 9. Still Not Working?

If none of the above works:

1. Check Vercel's function logs for specific error messages
2. Try deploying a minimal Express app first to test
3. Verify your Vercel account has the correct permissions
4. Check if there are any Vercel service status issues

## Quick Checklist

- [ ] Root Directory is set correctly in Vercel
- [ ] `vercel.json` is in the correct location
- [ ] `api/index.js` exists and exports the app
- [ ] All environment variables are set
- [ ] Build completed successfully (check logs)
- [ ] Function appears in the Functions tab
- [ ] No errors in function logs

