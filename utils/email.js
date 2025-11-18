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
  if (!SMTP_HOST || !SMTP_PORT) {
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
    const error = new Error('SMTP configuration is missing. Please configure SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS environment variables.');
    error.code = 'SMTP_NOT_CONFIGURED';
    console.error('❌ Email send failed:', error.message);
    console.log('📧 Email (mock send):', mailOptions);
    throw error;
  }

  // Add a wrapper timeout to ensure we don't wait too long
  const sendWithTimeout = async () => {
    try {
      await mailer.sendMail(mailOptions);
      console.log('✅ Email sent successfully to:', to);
    } catch (error) {
      console.error('❌ Email send error:', error.message);
      console.error('Error code:', error.code);
      console.error('Response code:', error.responseCode);
      if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKET') {
        console.error('💡 Connection timeout detected:');
        console.error('   1. Check if port is open: Test-NetConnection -ComputerName ' + process.env.SMTP_HOST + ' -Port ' + process.env.SMTP_PORT);
        console.error('   2. Verify SMTP credentials');
        console.error('   3. Check firewall/network settings');
        console.error('   4. Consider using a different SMTP provider (Gmail, Brevo, SendGrid)');
      } else if (error.code === 'EAUTH' || error.responseCode === 535) {
        console.error('💡 Authentication failed:');
        console.error('   1. Verify SMTP_USER and SMTP_PASS are correct');
        console.error('   2. For Office 365, use an app password instead of regular password');
        console.error('   3. Ensure the account has SMTP enabled');
      }
      console.error('Full error:', error);
      throw error;
    }
  };

  // Race against a 15-second timeout
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      const timeoutError = new Error('Email send operation timed out after 15 seconds. SMTP server may be unreachable.');
      timeoutError.code = 'ETIMEDOUT';
      reject(timeoutError);
    }, 15000); // 15 seconds total timeout
  });

  try {
    await Promise.race([sendWithTimeout(), timeoutPromise]);
  } catch (error) {
    // Re-throw with proper error code
    if (error.code === 'ETIMEDOUT' && !error.message.includes('SMTP server')) {
      error.message = 'SMTP connection timed out. Please check your network connection and SMTP configuration.';
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
