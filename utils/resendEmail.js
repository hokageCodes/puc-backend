/**
 * Resend Email Service - Modern, reliable alternative to SMTP
 * Free tier: 3,000 emails/month
 * Sign up at: https://resend.com
 */

const sendEmailViaResend = async ({ to, subject, html, text }) => {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  
  console.log('🔍 Resend function called');
  console.log('RESEND_API_KEY exists:', !!RESEND_API_KEY);
  console.log('RESEND_API_KEY length:', RESEND_API_KEY ? RESEND_API_KEY.length : 0);
  console.log('RESEND_API_KEY starts with:', RESEND_API_KEY ? RESEND_API_KEY.substring(0, 3) : 'N/A');
  
  if (!RESEND_API_KEY) {
    const error = new Error('RESEND_API_KEY is not configured. Get a free API key at https://resend.com');
    error.code = 'RESEND_NOT_CONFIGURED';
    throw error;
  }

  // For Resend, if domain not verified, must use onboarding@resend.dev
  // Check if EMAIL_FROM contains a custom domain (not resend.dev)
  let fromEmail = process.env.RESEND_FROM || 'onboarding@resend.dev';
  
  // If EMAIL_FROM is set and contains @resend.dev, use it
  // Otherwise, if it contains a custom domain, extract just the display name
  if (process.env.EMAIL_FROM) {
    const emailFrom = process.env.EMAIL_FROM.replace(/^["']|["']$/g, '');
    // Check if it's a resend.dev email
    if (emailFrom.includes('@resend.dev')) {
      fromEmail = emailFrom;
    } else if (emailFrom.includes('<') && emailFrom.includes('>')) {
      // Extract display name and use onboarding@resend.dev
      const match = emailFrom.match(/^(.+?)\s*<.+>$/);
      if (match) {
        fromEmail = `${match[1].trim()} <onboarding@resend.dev>`;
      } else {
        fromEmail = 'onboarding@resend.dev';
      }
    } else {
      // Just use the default
      fromEmail = 'onboarding@resend.dev';
    }
  }
  
  const cleanFrom = fromEmail.replace(/^["']|["']$/g, '');
  
  console.log('📧 Sending email via Resend:');
  console.log('  From:', cleanFrom);
  console.log('  To:', to);
  console.log('  Subject:', subject);

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
    
    console.log('📬 Resend API Response Status:', response.status);
    console.log('📬 Resend API Response:', JSON.stringify(data, null, 2));

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
    console.error('❌ Resend error code:', error.code);
    console.error('❌ Resend error stack:', error.stack);
    if (error.response) {
      console.error('❌ Resend error response:', JSON.stringify(error.response, null, 2));
    }
    throw error;
  }
};

export default sendEmailViaResend;

