# Deploying to Vercel

This guide will help you deploy the PUC backend from Render to Vercel.

## Prerequisites

1. A Vercel account (sign up at https://vercel.com)
2. Vercel CLI installed (optional, for local testing): `npm i -g vercel`
3. All environment variables from Render

## Deployment Steps

### 1. Install Vercel CLI (Optional but Recommended)

```bash
npm install -g vercel
```

### 2. Deploy via Vercel Dashboard

1. Go to https://vercel.com and sign in
2. Click "Add New Project"
3. Import your Git repository (GitHub/GitLab/Bitbucket)
4. Configure the project:
   - **Root Directory**: Set to `puc-backend` (if your repo has both frontend and backend)
   - **Framework Preset**: Other
   - **Build Command**: Leave empty (or `npm install` if needed)
   - **Output Directory**: Leave empty
   - **Install Command**: `npm install`

### 3. Set Environment Variables

In the Vercel project settings, add all your environment variables from Render:

**Required Variables:**
- `MONGODB_URI` - Your MongoDB connection string
- `CLOUDINARY_CLOUD_NAME` - Cloudinary cloud name
- `CLOUDINARY_API_KEY` - Cloudinary API key
- `CLOUDINARY_API_SECRET` - Cloudinary API secret
- `JWT_SECRET` - JWT secret for authentication
- `RESEND_API_KEY` - (Optional but recommended) Resend API key for emails
- `RESEND_FROM` - (Optional) Resend from email address
- `EMAIL_FROM` - Email from address
- `SMTP_HOST` - (If not using Resend) SMTP host
- `SMTP_PORT` - (If not using Resend) SMTP port
- `SMTP_USER` - (If not using Resend) SMTP username
- `SMTP_PASS` - (If not using Resend) SMTP password
- `CLIENT_URL` - Your frontend URL (e.g., https://paulusoro.com)

**Vercel Auto Variables:**
- `VERCEL` - Automatically set to "1" by Vercel
- `VERCEL_URL` - Automatically set to your deployment URL
- `VERCEL_ENV` - Automatically set to "production", "preview", or "development"

### 4. Deploy

Click "Deploy" and wait for the build to complete.

### 5. Update Frontend API URL

After deployment, update your frontend to use the new Vercel backend URL:
- Production URL: `https://your-project.vercel.app`
- Or use a custom domain if configured

## Important Notes

### File Uploads

⚠️ **Important**: Vercel's file system is **ephemeral** (files are deleted between deployments). 

Your app already uses Cloudinary for file uploads, which is perfect for Vercel. Make sure:
- All file uploads go through Cloudinary (not local storage)
- The `/uploads` route in your app should primarily serve files from Cloudinary URLs

If you have files in the `uploads/` folder, they will **not persist** on Vercel. Consider:
1. Migrating existing files to Cloudinary
2. Using Cloudinary for all new uploads
3. Using an external storage service (S3, etc.) if needed

### Database Connection

The database connection is optimized for serverless:
- Connections are cached and reused across function invocations
- This reduces connection overhead in serverless environments

### CORS Configuration

CORS is automatically configured to allow:
- Your production domain (paulusoro.com)
- Vercel deployment URLs
- Localhost for development

### Testing Locally with Vercel

You can test the Vercel deployment locally:

```bash
cd puc-backend
vercel dev
```

This will simulate the Vercel serverless environment locally.

## Migration Checklist

- [ ] Export all environment variables from Render
- [ ] Create Vercel project and import repository
- [ ] Set all environment variables in Vercel
- [ ] Deploy to Vercel
- [ ] Test all API endpoints
- [ ] Update frontend API URL
- [ ] Verify file uploads work (should use Cloudinary)
- [ ] Test authentication and cookies
- [ ] Monitor logs for any issues
- [ ] Update DNS/custom domain if needed
- [ ] Remove/decommission Render deployment after verification

## Troubleshooting

### Connection Issues
- Check that `MONGODB_URI` is set correctly
- Verify MongoDB allows connections from Vercel IPs (if IP whitelisting is enabled)

### CORS Errors
- Verify `CLIENT_URL` is set correctly
- Check that your frontend domain is in the allowed origins list

### File Upload Issues
- Ensure Cloudinary credentials are set
- Verify files are being uploaded to Cloudinary, not local storage

### Environment Variables Not Working
- Make sure variables are set in Vercel project settings
- Redeploy after adding new environment variables
- Check variable names match exactly (case-sensitive)

## Differences from Render

1. **Serverless**: Functions are invoked on-demand, not always running
2. **Cold Starts**: First request after inactivity may be slower (usually <1s)
3. **File System**: Ephemeral - files don't persist between deployments
4. **Environment**: Automatically detects Vercel environment
5. **Scaling**: Automatically scales based on traffic

## Support

If you encounter issues:
1. Check Vercel deployment logs
2. Check function logs in Vercel dashboard
3. Test endpoints using the Vercel deployment URL
4. Verify all environment variables are set correctly

