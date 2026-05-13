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
  
  // If explicitly configured to only log emails (dev), do that and exit early
  const LOG_ONLY = (process.env.EMAIL_LOG_ONLY || '').toLowerCase() === 'true';
  if (LOG_ONLY) {
    console.log('📧 EMAIL_LOG_ONLY enabled — logging email instead of sending');
    console.log('📧 Email payload:', { from: process.env.EMAIL_FROM || 'no-reply', to, subject, text, htmlSnippet: (html || '').slice(0, 200) });
    return;
  }

  if (process.env.RESEND_API_KEY) {
    try {
      console.log('📧 Attempting to send via Resend...');
      const sendEmailViaResend = (await import('./resendEmail.js')).default;
      await sendEmailViaResend({ to, subject, html, text });
      return; // Success!
    } catch (resendError) {
      // Inspect resendError response to detect test-mode / unverified domain errors
      console.error('❌ Resend failed:', resendError.message || resendError);
      console.error('Resend error details:', resendError.response || resendError);

      const resendBody = resendError && resendError.response ? resendError.response : null;
      const isResendTestMode =
        resendBody && (
          (typeof resendBody.message === 'string' && resendBody.message.toLowerCase().includes('testing')) ||
          (typeof resendBody.error === 'string' && resendBody.error.toLowerCase().includes('testing')) ||
          (resendError.statusCode === 403)
        );

      if (isResendTestMode && (process.env.NODE_ENV || 'development') !== 'production') {
        console.warn('⚠️ Resend appears to be in test/unverified mode (or returned 403). Falling back to an Ethereal test account for development.');
        try {
          // Lazy-create a test account and send via Ethereal so devs receive a working preview URL
          const testInfo = await (async function sendViaEthereal() {
            console.log('📧 Creating ethereal test account...');
            const testAccount = await nodemailer.createTestAccount();
            const ethTransporter = nodemailer.createTransport({
              host: testAccount.smtp.host,
              port: testAccount.smtp.port,
              secure: testAccount.smtp.secure,
              auth: { user: testAccount.user, pass: testAccount.pass },
            });

            const info = await ethTransporter.sendMail({
              from: process.env.EMAIL_FROM || `"PUC Leave" <${testAccount.user}>`,
              to,
              subject,
              text,
              html,
            });

            const preview = nodemailer.getTestMessageUrl(info);
            console.log('✅ Ethereal email sent. Preview URL:', preview || 'NOT_AVAILABLE');
            return { info, preview };
          })();

          return testInfo;
        } catch (ethErr) {
          console.error('❌ Ethereal fallback failed:', ethErr && ethErr.message ? ethErr.message : ethErr);
          // Fall through to SMTP attempt below
        }
      }

      // Fall through to SMTP for other kinds of errors
      console.log('❌ Resend failed, falling back to SMTP');
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
  const encoded = encodeURIComponent(token);
  const url = baseUrl(`/leave/activate?token=${encoded}`);
  const first = String(user?.firstName || '').trim();
  const greet = first || 'there';

  const escapeHtml = (s) =>
    String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  const greetHtml = escapeHtml(greet);

  const textBody = [
    `Hi ${greet},`,
    '',
    'Welcome to PUC Hub 👋🏽',
    '',
    'Your staff account has been created successfully.',
    "PUC Hub gives you secure access to the company's internal tools and services, including leave management, diary access, admin resources, and other role-based applications.",
    '',
    'To get started, please activate your account and create your password using the link below.',
    '',
    url,
    '',
    'For security reasons, this activation link will expire in 60 minutes.',
    '',
    "Once your password is set, you'll use the same login details across all authorized Paul Usoro & Co platforms.",
    '',
    'If you did not expect this email, you can safely ignore it.',
    '',
    'Warm regards,',
    'PUC IT Team',
  ].join('\n');

  return {
    subject: 'Activate your PUC Hub account',
    text: textBody,
    html: `
      <p style="margin: 0 0 12px; font-size: 16px; color: #0f172a;">Hi ${greetHtml},</p>
      <p style="margin: 0 0 16px; font-size: 16px; color: #0f172a;">Welcome to PUC Hub 👋🏽</p>
      <p style="margin: 0 0 12px; font-size: 15px; line-height: 1.55; color: #334155;">Your staff account has been created successfully.</p>
      <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.55; color: #334155;">PUC Hub gives you secure access to the company&apos;s internal tools and services, including leave management, diary access, admin resources, and other role-based applications.</p>
      <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.55; color: #334155;">To get started, please activate your account and create your password using the button below.</p>
      <p style="margin: 0 0 24px;">
        <a href="${url}" target="_blank" rel="noopener noreferrer" style="background: #059669; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 600;">Activate My Account</a>
      </p>
      <p style="margin: 0 0 12px; font-size: 14px; line-height: 1.5; color: #64748b;">For security reasons, this activation link will expire in 60 minutes.</p>
      <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.5; color: #64748b;">Once your password is set, you&apos;ll use the same login details across all authorized Paul Usoro &amp; Co platforms.</p>
      <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.5; color: #64748b;">If you did not expect this email, you can safely ignore it.</p>
      <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #334155;">Warm regards,<br /><strong>PUC IT Team</strong></p>
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

// Leave request notification emails
export const buildLeaveRequestNotificationEmail = (approver, staff, leaveRequest, leaveType) => {
  const approverName = approver.firstName || approver.email;
  const staffName = `${staff.firstName} ${staff.lastName}`;
  const dates = formatLeaveDates(leaveRequest.startDate, leaveRequest.endDate);
  const approvalUrl = baseUrl('/leave/approvals');
  
  return {
    subject: `Leave Request from ${staffName} - Action Required`,
    text: `Hello ${approverName},\n\n${staffName} has submitted a leave request that requires your approval.\n\nDetails:\n- Leave Type: ${leaveType.name}\n- Dates: ${dates}\n- Duration: ${leaveRequest.durationDays} ${leaveRequest.durationDays === 1 ? 'day' : 'days'}\n- Reason: ${leaveRequest.reason}\n\nPlease review and approve this request:\n${approvalUrl}\n\n— Paul Udo &amp; Co Leave Portal`,
    html: `
      <p>Hello ${approverName},</p>
      <p><strong>${staffName}</strong> has submitted a leave request that requires your approval.</p>
      <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <p><strong>Leave Type:</strong> ${leaveType.name}</p>
        <p><strong>Dates:</strong> ${dates}</p>
        <p><strong>Duration:</strong> ${leaveRequest.durationDays} ${leaveRequest.durationDays === 1 ? 'day' : 'days'}</p>
        <p><strong>Reason:</strong> ${leaveRequest.reason}</p>
        ${leaveRequest.coveragePlan ? `<p><strong>Coverage Plan:</strong> ${leaveRequest.coveragePlan}</p>` : ''}
        ${leaveRequest.handoverNotes ? `<p><strong>Handover Notes:</strong> ${leaveRequest.handoverNotes}</p>` : ''}
      </div>
      <p style="margin: 20px 0;">
        <a href="${approvalUrl}" style="background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">
          Review & Approve Request
        </a>
      </p>
      <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">— Paul Udo &amp; Co Leave Portal</p>
    `,
  };
};

export const buildLeaveApprovedEmail = (staff, approver, leaveRequest, leaveType, isFinal = false) => {
  const staffName = `${staff.firstName} ${staff.lastName}`;
  const approverName = approver ? `${approver.firstName} ${approver.lastName}` : 'HR';
  const dates = formatLeaveDates(leaveRequest.startDate, leaveRequest.endDate);
  
  if (isFinal) {
    return {
      subject: `Your Leave Request Has Been Approved`,
      text: `Hello ${staffName},\n\nGreat news! Your leave request has been fully approved.\n\nDetails:\n- Leave Type: ${leaveType.name}\n- Dates: ${dates}\n- Duration: ${leaveRequest.durationDays} ${leaveRequest.durationDays === 1 ? 'day' : 'days'}\n- Approved by: ${approverName}\n\nYou can view your leave requests at: ${baseUrl('/leave/requests')}\n\n— Paul Udo &amp; Co Leave Portal`,
      html: `
        <p>Hello ${staffName},</p>
        <p><strong>Great news! Your leave request has been fully approved.</strong></p>
        <div style="background: #d1fae5; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #10b981;">
          <p><strong>Leave Type:</strong> ${leaveType.name}</p>
          <p><strong>Dates:</strong> ${dates}</p>
          <p><strong>Duration:</strong> ${leaveRequest.durationDays} ${leaveRequest.durationDays === 1 ? 'day' : 'days'}</p>
          <p><strong>Approved by:</strong> ${approverName}</p>
        </div>
        <p style="margin: 20px 0;">
          <a href="${baseUrl('/leave/requests')}" style="background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">
            View My Requests
          </a>
        </p>
        <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">— Paul Udo &amp; Co Leave Portal</p>
      `,
    };
  } else {
    // Not final approval - notify next approver
    return {
      subject: `Leave Request Approved - Forwarded for Final Review`,
      text: `Hello ${staffName},\n\nYour leave request has been approved by ${approverName} and is now pending final approval.\n\nDetails:\n- Leave Type: ${leaveType.name}\n- Dates: ${dates}\n- Duration: ${leaveRequest.durationDays} ${leaveRequest.durationDays === 1 ? 'day' : 'days'}\n\nYou can track the status at: ${baseUrl('/leave/requests')}\n\n— Paul Udo &amp; Co Leave Portal`,
      html: `
        <p>Hello ${staffName},</p>
        <p>Your leave request has been <strong>approved by ${approverName}</strong> and is now pending final approval.</p>
        <div style="background: #fef3c7; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #f59e0b;">
          <p><strong>Leave Type:</strong> ${leaveType.name}</p>
          <p><strong>Dates:</strong> ${dates}</p>
          <p><strong>Duration:</strong> ${leaveRequest.durationDays} ${leaveRequest.durationDays === 1 ? 'day' : 'days'}</p>
        </div>
        <p style="margin: 20px 0;">
          <a href="${baseUrl('/leave/requests')}" style="background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">
            Track Request Status
          </a>
        </p>
        <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">— Paul Udo &amp; Co Leave Portal</p>
      `,
    };
  }
};

export const buildLeaveRejectedEmail = (staff, approver, leaveRequest, leaveType, comment) => {
  const staffName = `${staff.firstName} ${staff.lastName}`;
  const approverName = approver ? `${approver.firstName} ${approver.lastName}` : 'HR';
  const dates = formatLeaveDates(leaveRequest.startDate, leaveRequest.endDate);
  
  return {
    subject: `Your Leave Request Has Been Declined`,
    text: `Hello ${staffName},\n\nUnfortunately, your leave request has been declined by ${approverName}.\n\nDetails:\n- Leave Type: ${leaveType.name}\n- Dates: ${dates}\n- Duration: ${leaveRequest.durationDays} ${leaveRequest.durationDays === 1 ? 'day' : 'days'}\n${comment ? `- Reason: ${comment}\n` : ''}\nYou can view your leave requests at: ${baseUrl('/leave/requests')}\n\n— Paul Udo &amp; Co Leave Portal`,
    html: `
      <p>Hello ${staffName},</p>
      <p>Unfortunately, your leave request has been <strong>declined by ${approverName}</strong>.</p>
      <div style="background: #fee2e2; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #ef4444;">
        <p><strong>Leave Type:</strong> ${leaveType.name}</p>
        <p><strong>Dates:</strong> ${dates}</p>
        <p><strong>Duration:</strong> ${leaveRequest.durationDays} ${leaveRequest.durationDays === 1 ? 'day' : 'days'}</p>
        ${comment ? `<p><strong>Reason:</strong> ${comment}</p>` : ''}
      </div>
      <p style="margin: 20px 0;">
        <a href="${baseUrl('/leave/requests')}" style="background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">
          View My Requests
        </a>
      </p>
      <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">— Paul Udo &amp; Co Leave Portal</p>
    `,
  };
};

const formatLeaveDates = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const startStr = start.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const endStr = end.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  
  if (start.getTime() === end.getTime()) {
    return startStr;
  }
  return `${startStr} – ${endStr}`;
};
