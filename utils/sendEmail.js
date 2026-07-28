const nodemailer = require('nodemailer');

/**
 * Helper to send verification emails.
 * @param {Object} options Options containing to, subject, text, and html.
 * @returns {Promise<Boolean>} Success status.
 */
const sendEmail = async (options) => {
  // Check if SMTP configuration is set
  const isSmtpConfigured = process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS;

  if (isSmtpConfigured) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT, 10) || 587,
        secure: process.env.EMAIL_SECURE === 'true', // true for port 465, false for 587
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });

      const mailOptions = {
        from: process.env.EMAIL_FROM || '"ConnectHub" <noreply@connecthub.com>',
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      };

      await transporter.sendMail(mailOptions);
      console.log(`Email successfully sent to ${options.to}`);
      return true;
    } catch (error) {
      console.error('Error sending email via SMTP:', error);
      // Fallback to console simulation on failure
    }
  }

  // Fallback / simulation log
  console.log('\n======================================================================');
  console.log('[EMAIL SIMULATION (SMTP Not Configured or Failed)]');
  console.log(`To:      ${options.to}`);
  console.log(`Subject: ${options.subject}`);
  console.log('----------------------------------------------------------------------');
  console.log(options.text);
  console.log('======================================================================\n');
  return false;
};

module.exports = sendEmail;
