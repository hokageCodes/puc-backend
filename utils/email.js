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

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: getBooleanEnv('SMTP_SECURE', Number(SMTP_PORT) === 465),
    auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });

  return transporter;
};

export const sendEmail = async ({ to, subject, html, text }) => {
  const mailer = getTransporter();
  const mailOptions = {
    from: process.env.EMAIL_FROM || 'no-reply@paulusoro.com',
    to,
    subject,
    text,
    html,
  };

  if (!mailer) {
    console.log('📧 Email (mock send):', mailOptions);
    return;
  }

  await mailer.sendMail(mailOptions);
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
