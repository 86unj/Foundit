import nodemailer from 'nodemailer';

// In development, Ethereal (fake SMTP) is used to catch outgoing emails without actually sending them.
// In production, set real SMTP credentials in .env to send actual emails.

// Validate required email environment variables at startup
function requireEnv(name: 'SMTP_USER' | 'SMTP_PASS' | 'APP_URL'): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for email verification`);
  }
  return value;
}

function senderAddress(): string {
  return `"Foundit" <${requireEnv('SMTP_USER')}>`;
}

export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? 'smtp.ethereal.email',
  port: parseInt(process.env.SMTP_PORT ?? '587'),
  auth: {
    user: requireEnv('SMTP_USER'),
    pass: requireEnv('SMTP_PASS'),
  },
});

export async function sendVerificationEmail(
  to: string,
  token: string,
  enabled = true
): Promise<void> {
  if (!enabled) {
    return;
  }

  const verifyUrl = `${requireEnv('APP_URL')}/api/auth/verify-email?token=${token}`;

  await transporter.sendMail({
    from: senderAddress(),
    to,
    subject: 'Verify your Foundit account',
    html: `
      <p>Thanks for signing up!</p>
      <p>Click the link below to verify your email. This link expires in 24 hours.</p>
      <a href="${verifyUrl}">${verifyUrl}</a>
    `,
  });
}

export async function sendNotificationEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  await transporter.sendMail({
    from: senderAddress(),
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });
}
