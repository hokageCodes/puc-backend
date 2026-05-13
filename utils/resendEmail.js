/**
 * Resend Email Service - Modern, reliable alternative to SMTP
 * Free tier: 3,000 emails/month
 * Sign up at: https://resend.com
 */

const FALLBACK_FROM = 'Paul Usoro & Co <onboarding@resend.dev>';

const isPlaceholderOrUnsafeDomain = (addr) => {
  const lower = String(addr).toLowerCase();
  return (
    lower.includes('yourdomain.') ||
    lower.includes('example.com') ||
    lower.includes('test.com') ||
    lower.endsWith('@localhost')
  );
};

/**
 * Resolves a valid Resend "from" line. Unverified / placeholder domains fall back to onboarding@resend.dev.
 */
const resolveResendFrom = () => {
  const candidates = [process.env.RESEND_FROM, process.env.EMAIL_FROM].filter(Boolean);

  for (const raw of candidates) {
    const s = String(raw).replace(/^["']|["']$/g, '').trim();
    if (!s) continue;

    // "Name <email@domain.com>"
    const bracket = s.match(/^(.+?)\s*<([^>]+)>$/);
    if (bracket) {
      const display = bracket[1].trim();
      const addr = bracket[2].trim().toLowerCase();
      if (addr.endsWith('@resend.dev')) {
        return `${display} <${addr}>`;
      }
      if (isPlaceholderOrUnsafeDomain(addr)) {
        console.warn(
          '[resend] From-address uses a placeholder or unsafe domain; using onboarding@resend.dev instead.'
        );
        return `${display} <onboarding@resend.dev>`;
      }
      return `${display} <${addr}>`;
    }

    // Bare email
    if (/^[^\s<]+@[^\s>]+$/.test(s)) {
      const addr = s.toLowerCase();
      if (addr.endsWith('@resend.dev')) return s;
      if (isPlaceholderOrUnsafeDomain(addr)) {
        console.warn('[resend] Bare from-address is a placeholder; using onboarding@resend.dev.');
        return FALLBACK_FROM;
      }
      return s;
    }

    // Legacy junk e.g. "Paul Usoro & Co no-reply@yourdomain.com" (no brackets)
    const embedded = s.match(/([\w.+-]+@[\w.-]+\.[a-z]{2,})/i);
    if (embedded) {
      const addr = embedded[1];
      if (isPlaceholderOrUnsafeDomain(addr)) {
        console.warn('[resend] Embedded from-email is a placeholder; using onboarding@resend.dev.');
        return FALLBACK_FROM;
      }
      return `Paul Usoro & Co <${addr}>`;
    }
  }

  return FALLBACK_FROM;
};

const sendEmailViaResend = async ({ to, subject, html, text }) => {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;

  if (!RESEND_API_KEY) {
    const error = new Error('RESEND_API_KEY is not configured. Get a free API key at https://resend.com');
    error.code = 'RESEND_NOT_CONFIGURED';
    throw error;
  }

  const cleanFrom = resolveResendFrom();

  console.log('📧 Sending email via Resend:');
  console.log('  From:', cleanFrom);
  console.log('  To:', to);
  console.log('  Subject:', subject);

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: cleanFrom,
        to: [to],
        subject,
        html,
        text,
      }),
    });

    const data = await response.json();

    console.log('📬 Resend API Response Status:', response.status);

    if (!response.ok) {
      const error = new Error(data.message || `Resend API error: ${response.status}`);
      error.code = 'RESEND_API_ERROR';
      error.statusCode = response.status;
      error.response = data;
      console.error('❌ Resend API Error:', error);
      throw error;
    }

    console.log('✅ Email sent via Resend to:', to, 'ID:', data.id);
    return data;
  } catch (error) {
    console.error('❌ Resend email error:', error.message);
    if (error.response) {
      console.error('❌ Resend error response:', JSON.stringify(error.response, null, 2));
    }
    throw error;
  }
};

export default sendEmailViaResend;
