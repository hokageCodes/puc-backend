import 'dotenv/config';
import nodemailer from 'nodemailer';

const testConnection = async (host, port, secure, user, pass) => {
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure && port === 587,
    auth: user && pass ? { user, pass } : undefined,
    tls: {
      rejectUnauthorized: false,
      minVersion: 'TLSv1.2',
    },
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 30000,
    debug: true,
    logger: true,
  });

  try {
    await transporter.verify();
    return { success: true, transporter };
  } catch (error) {
    return { success: false, error: error.message, code: error.code };
  }
};

const testSMTP = async () => {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE } = process.env;
  
  console.log('🔍 Testing SMTP Configuration...\n');
  console.log('Host:', SMTP_HOST);
  console.log('Port:', SMTP_PORT);
  console.log('User:', SMTP_USER);
  console.log('Secure:', SMTP_SECURE || 'false (default)');
  console.log('Password:', SMTP_PASS ? '***' + SMTP_PASS.slice(-4) : 'NOT SET');
  console.log('\n');

  if (!SMTP_HOST || !SMTP_PORT) {
    console.error('❌ SMTP_HOST and SMTP_PORT are required');
    process.exit(1);
  }

  const port = Number(SMTP_PORT);
  const isSecure = ['true', '1', 'yes', 'on'].includes((SMTP_SECURE || '').toLowerCase());
  
  // First try the configured port
  console.log(`🔄 Testing port ${port} (secure: ${isSecure})...\n`);
  let result = await testConnection(SMTP_HOST, port, isSecure, SMTP_USER, SMTP_PASS);
  
  // If port 587 fails, try 465 with SSL
  if (!result.success && port === 587 && (result.code === 'ESOCKET' || result.code === 'ETIMEDOUT')) {
    console.log('\n⚠️ Port 587 failed. Trying port 465 with SSL...\n');
    result = await testConnection(SMTP_HOST, 465, true, SMTP_USER, SMTP_PASS);
    if (result.success) {
      console.log('\n✅ Port 465 works! Update your .env:');
      console.log('   SMTP_PORT=465');
      console.log('   SMTP_SECURE=true\n');
    }
  }

  if (result.success) {
    console.log('\n✅ SMTP connection verified successfully!');
    console.log('✅ You can send emails now.\n');
    
    // Try sending a test email
    if (SMTP_USER) {
      console.log('📧 Attempting to send test email...\n');
      const testEmail = {
        from: process.env.EMAIL_FROM || SMTP_USER,
        to: SMTP_USER, // Send to self
        subject: 'Test Email from PUC Backend',
        text: 'This is a test email from the PUC backend SMTP configuration.',
        html: '<p>This is a test email from the PUC backend SMTP configuration.</p>',
      };
      
      try {
        const info = await result.transporter.sendMail(testEmail);
        console.log('\n✅ Test email sent successfully!');
        console.log('Message ID:', info.messageId);
      } catch (sendError) {
        console.error('\n⚠️ Connection works but email send failed:', sendError.message);
      }
    }
  } else {
    console.error('\n❌ SMTP connection failed!\n');
    console.error('Error:', result.error);
    console.error('Code:', result.code);
    
    if (result.code === 'ESOCKET' || result.code === 'ETIMEDOUT') {
      console.error('\n💡 Connection timeout detected. Your network/firewall is blocking port', port);
      console.error('\n🔧 Solutions:');
      console.error('\n1️⃣ Try port 465 with SSL (update .env):');
      console.error('   SMTP_PORT=465');
      console.error('   SMTP_SECURE=true');
      console.error('\n2️⃣ Check Windows Firewall:');
      console.error('   Run PowerShell as Admin:');
      console.error('   Get-NetFirewallRule | Where-Object {$_.DisplayName -like "*SMTP*"}');
      console.error('   New-NetFirewallRule -DisplayName "Allow SMTP 587" -Direction Outbound -Protocol TCP -LocalPort 587 -Action Allow');
      console.error('\n3️⃣ Use a FREE alternative SMTP service:');
      console.error('   📧 Gmail SMTP (free, 500 emails/day):');
      console.error('      SMTP_HOST=smtp.gmail.com');
      console.error('      SMTP_PORT=587');
      console.error('      SMTP_USER=your-email@gmail.com');
      console.error('      SMTP_PASS=your-app-password');
      console.error('   📧 SendGrid (free tier: 100 emails/day):');
      console.error('      Sign up at sendgrid.com');
      console.error('      SMTP_HOST=smtp.sendgrid.net');
      console.error('      SMTP_PORT=587');
      console.error('      SMTP_USER=apikey');
      console.error('      SMTP_PASS=your-sendgrid-api-key');
      console.error('\n4️⃣ Test port connectivity:');
      console.error(`   Test-NetConnection -ComputerName ${SMTP_HOST} -Port ${port}`);
    } else if (result.code === 'EAUTH') {
      console.error('\n💡 Authentication failed. Check:');
      console.error('   1. Username and password are correct');
      console.error('   2. If MFA is enabled, use an App Password instead');
      console.error('   3. Account has permission to send emails');
    }
    
    process.exit(1);
  }
};

testSMTP();

