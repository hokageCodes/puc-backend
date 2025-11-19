import nodemailer from 'nodemailer';

let transporter;

const getBooleanEnv = (name, defaultValue = false) => {
  const value = process.env[name];
  if (value === undefined) return defaultValue;
  return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
};

const getTransporter = () => {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  
  // Enhanced logging for production debugging
  console.log('🔍 SMTP Configuration Check:', {
    SMTP_HOST: SMTP_HOST ? `${SMTP_HOST.substring(0, 10)}...` : '❌ MISSING',
    SMTP_PORT: SMTP_PORT || '❌ MISSING',
    SMTP_USER: SMTP_USER ? `${SMTP_USER.substring(0, 5)}...` : '❌ MISSING',
    SMTP_PASS: SMTP_PASS ? '✅ Present' : '❌ MISSING',
    SMTP_SECURE: process.env.SMTP_SECURE || 'not set',
    NODE_ENV: process.env.NODE_ENV || 'not set',
  });
  
  if (!SMTP_HOST || !SMTP_PORT) {
    console.error('❌ SMTP configuration missing. Required variables:');
    console.error('   - SMTP_HOST:', SMTP_HOST || 'MISSING');
    console.error('   - SMTP_PORT:', SMTP_PORT || 'MISSING');
    console.error('   - SMTP_USER:', SMTP_USER ? 'Present' : 'MISSING');
    console.error('   - SMTP_PASS:', SMTP_PASS ? 'Present' : 'MISSING');
    console.warn('📭 SMTP configuration missing. Emails will be logged to console.');
    transporter = null;
    return transporter;
  }

  const port = Number(SMTP_PORT);
  const isSecure = getBooleanEnv('SMTP_SECURE', port === 465);
  
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: isSecure,
    requireTLS: !isSecure && port === 587, // Office 365 requires STARTTLS on port 587
    auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    tls: {
      rejectUnauthorized: false, // Office 365 sometimes has cert issues
      minVersion: 'TLSv1.2',
    },
    connectionTimeout: 10000, // 10 seconds - fail faster
    greetingTimeout: 5000, // 5 seconds
    socketTimeout: 10000, // 10 seconds
    debug: process.env.NODE_ENV === 'development', // Enable debug logging
    logger: process.env.NODE_ENV === 'development', // Log to console
  });

  return transporter;
};

// Test SMTP connection before sending
export const verifyConnection = async () => {
  const mailer = getTransporter();
  if (!mailer) {
    console.warn('⚠️ No SMTP transporter configured');
    return false;
  }
  
  try {
    await mailer.verify();
    console.log('✅ SMTP connection verified successfully');
    return true;
  } catch (error) {
    console.error('❌ SMTP verification failed:', error.message);
    if (error.code === 'ETIMEDOUT') {
      console.error('💡 Connection timeout - check firewall/network settings');
      console.error('💡 Try: Test-NetConnection -ComputerName smtp.office365.com -Port 587');
    }
    return false;
  }
};

export const sendEmail = async ({ to, subject, html, text }) => {
  // Try Resend first if API key is available (much more reliable)
  console.log('🔍 Checking email service...');
  console.log('RESEND_API_KEY present:', !!process.env.RESEND_API_KEY);
  console.log('RESEND_API_KEY value:', process.env.RESEND_API_KEY ? `${process.env.RESEND_API_KEY.substring(0, 10)}...` : 'NOT SET');
  
  if (process.env.RESEND_API_KEY) {
    try {
      console.log('📧 Attempting to send via Resend...');
      const sendEmailViaResend = (await import('./resendEmail.js')).default;
      await sendEmailViaResend({ to, subject, html, text });
      return; // Success!
    } catch (resendError) {
      console.error('❌ Resend failed, falling back to SMTP:', resendError.message);
      console.error('Resend error details:', resendError);
      // Fall through to SMTP
    }
  } else {
    console.log('⚠️ RESEND_API_KEY not found, using SMTP fallback');
  }

  // Fallback to SMTP
  const mailer = getTransporter();
  
  // Clean EMAIL_FROM - remove quotes if present, support "Name <email>" format
  let fromEmail = process.env.EMAIL_FROM || 'no-reply@paulusoro.com';
  fromEmail = fromEmail.replace(/^["']|["']$/g, ''); // Remove surrounding quotes
  // Keep the full "Name <email>" format if present, otherwise use as-is
  // Nodemailer supports both formats
  
  const mailOptions = {
    from: fromEmail,
    to,
    subject,
    text,
    html,
  };

  if (!mailer) {
    const error = new Error('SMTP configuration is missing. Please configure SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS environment variables. Or use Resend API (RESEND_API_KEY).');
    error.code = 'SMTP_NOT_CONFIGURED';
    console.error('❌ Email send failed:', error.message);
    console.log('📧 Email (mock send):', mailOptions);
    throw error;
  }

  // Add a wrapper timeout to ensure we don't wait too long
  const sendWithTimeout = async () => {
    try {
      console.log('📧 Attempting to send via SMTP to:', to);
      await mailer.sendMail(mailOptions);
      console.log('✅ Email sent successfully to:', to);
    } catch (error) {
      console.error('❌ Email send error:', error.message);
      console.error('Error code:', error.code);
      console.error('Response code:', error.responseCode);
      console.error('Error command:', error.command);
      console.error('Error response:', error.response);
      if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKET') {
        console.error('💡 Connection timeout detected:');
        console.error('   1. Check if port is open: Test-NetConnection -ComputerName ' + process.env.SMTP_HOST + ' -Port ' + process.env.SMTP_PORT);
        console.error('   2. Verify SMTP credentials');
        console.error('   3. Check firewall/network settings');
        console.error('   4. Consider using Resend API (RESEND_API_KEY) - much more reliable!');
      } else if (error.code === 'EAUTH' || error.responseCode === 535) {
        console.error('💡 Authentication failed:');
        console.error('   1. Verify SMTP_USER and SMTP_PASS are correct');
        console.error('   2. For Gmail, use an app password (not regular password)');
        console.error('   3. For Office 365, use an app password instead of regular password');
        console.error('   4. Consider using Resend API (RESEND_API_KEY) - much more reliable!');
      }
      console.error('Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
      throw error;
    }
  };

  // Race against a 15-second timeout
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      const timeoutError = new Error('Email send operation timed out after 15 seconds. SMTP server may be unreachable. Consider using Resend API (RESEND_API_KEY) for better reliability.');
      timeoutError.code = 'ETIMEDOUT';
      reject(timeoutError);
    }, 15000); // 15 seconds total timeout
  });

  try {
    await Promise.race([sendWithTimeout(), timeoutPromise]);
  } catch (error) {
    // Re-throw with proper error code
    if (error.code === 'ETIMEDOUT' && !error.message.includes('SMTP server')) {
      error.message = 'SMTP connection timed out. Please check your network connection and SMTP configuration. Or use Resend API (RESEND_API_KEY) for better reliability.';
    }
    throw error;
  }
};

const baseUrl = (path = '') => {
  const leaveBase = process.env.LEAVE_PORTAL_URL || process.env.CLIENT_URL || 'http://localhost:3000';
  return `${leaveBase.replace(/\/$/, '')}${path}`;
};

export const buildActivationEmail = (user, token) => {
  const url = baseUrl(`/leave/activate?token=${token}`);
  const name = user.firstName || user.email;
  return {
    subject: 'Activate your PUC leave portal account',
    text: `Hello ${name},\n\nUse the link below to set your password and activate your account:\n${url}\n\nThis link expires in 60 minutes. If you did not expect this email, please ignore it.`,
    html: `
      <p>Hello ${name},</p>
      <p>Use the link below to set your password and activate your account:</p>
      <p><a href="${url}" target="_blank" rel="noopener noreferrer">Activate account</a></p>
      <p>This link expires in 60 minutes. If you did not expect this email, please ignore it.</p>
      <p>— Paul Udo &amp; Co</p>
    `,
  };
};

export const buildPasswordResetEmail = (user, token) => {
  const url = baseUrl(`/leave/reset?token=${token}`);
  const name = user.firstName || user.email;
  return {
    subject: 'Reset your PUC leave portal password',
    text: `Hello ${name},\n\nA password reset was requested for your account. Use the link below to set a new password:\n${url}\n\nIf you did not request this change, please contact support immediately.\n`,
    html: `
      <p>Hello ${name},</p>
      <p>A password reset was requested for your account. Use the link below to set a new password:</p>
      <p><a href="${url}" target="_blank" rel="noopener noreferrer">Reset password</a></p>
      <p>If you did not request this change, please contact support immediately.</p>
      <p>— Paul Udo &amp; Co</p>
    `,
  };
};
