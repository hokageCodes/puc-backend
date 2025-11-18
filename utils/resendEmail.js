/**
 * Resend Email Service - Modern, reliable alternative to SMTP
 * Free tier: 3,000 emails/month
 * Sign up at: https://resend.com
 */

const sendEmailViaResend = async ({ to, subject, html, text }) => {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  
  if (!RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured. Get a free API key at https://resend.com');
  }

  const fromEmail = process.env.EMAIL_FROM || process.env.RESEND_FROM || 'onboarding@resend.dev';
  const cleanFrom = fromEmail.replace(/^["']|["']$/g, '');

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
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

    if (!response.ok) {
      const error = new Error(data.message || `Resend API error: ${response.status}`);
      error.code = 'RESEND_API_ERROR';
      error.statusCode = response.status;
      throw error;
    }

    console.log('✅ Email sent via Resend to:', to, 'ID:', data.id);
    return data;
  } catch (error) {
    console.error('❌ Resend email error:', error.message);
    throw error;
  }
};

export default sendEmailViaResend;

