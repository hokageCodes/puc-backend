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
    connectionTimeout: 30000, // 30 seconds - increased for slow networks
    greetingTimeout: 30000,
    socketTimeout: 30000,
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
    console.log('📧 Email (mock send):', mailOptions);
    return;
  }

  try {
    await mailer.sendMail(mailOptions);
    console.log('✅ Email sent successfully to:', to);
  } catch (error) {
    console.error('❌ Email send error:', error.message);
    console.error('Error code:', error.code);
    if (error.code === 'ETIMEDOUT') {
      console.error('💡 Troubleshooting:');
      console.error('   1. Check if port 587 is open: Test-NetConnection -ComputerName smtp.office365.com -Port 587');
      console.error('   2. Verify SMTP credentials in Office 365 admin center');
      console.error('   3. Ensure "Authenticated SMTP" is enabled for the mailbox');
      console.error('   4. Check if your IP is blocked by Office 365');
    }
    console.error('Full error:', error);
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
