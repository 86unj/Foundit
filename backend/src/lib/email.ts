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

const EMAIL_BRAND = {
  primary: '#009adb',
  text: '#1a1a1a',
  muted: '#666666',
  border: '#D9D9D9',
  surface: '#ffffff',
  background: '#f4f6f8',
  accentSurface: '#f0f9ff',
} as const;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildBrandedEmail(input: {
  greeting: string;
  title: string;
  message: string;
  cta?: { url: string; label: string };
  footer?: string;
}): { html: string; text: string } {
  const { greeting, title, message, cta, footer } = input;
  const safeGreeting = escapeHtml(greeting);
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  const safeFooter = footer ? escapeHtml(footer) : null;

  const text = [
    greeting,
    '',
    title,
    message,
    cta ? `\n${cta.label}: ${cta.url}` : '',
    '',
    footer ?? '— Foundit',
  ]
    .filter(Boolean)
    .join('\n');

  const ctaBlock = cta
    ? `<tr>
            <td style="padding: 0 32px 8px;">
              <a href="${escapeHtml(cta.url)}" style="display: inline-block; background-color: ${EMAIL_BRAND.primary}; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 6px;">
                ${escapeHtml(cta.label)}
              </a>
            </td>
          </tr>`
    : '';

  const footerBlock = safeFooter
    ? `<tr>
              <td style="padding: 16px 32px 28px; border-top: 1px solid ${EMAIL_BRAND.border};">
                <p style="margin: 0; color: ${EMAIL_BRAND.muted}; font-size: 12px; line-height: 1.5;">${safeFooter}</p>
              </td>
            </tr>`
    : `<tr>
              <td style="padding: 16px 32px 28px; border-top: 1px solid ${EMAIL_BRAND.border};">
                <p style="margin: 0; color: ${EMAIL_BRAND.muted}; font-size: 12px; line-height: 1.5;">— Foundit</p>
              </td>
            </tr>`;

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeTitle}</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: ${EMAIL_BRAND.background}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: ${EMAIL_BRAND.background}; padding: 32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px; background-color: ${EMAIL_BRAND.surface}; border: 1px solid ${EMAIL_BRAND.border}; border-radius: 8px; overflow: hidden;">
            <tr>
              <td style="background-color: ${EMAIL_BRAND.primary}; padding: 20px 32px;">
                <p style="margin: 0; color: #ffffff; font-size: 18px; font-weight: 700; letter-spacing: 0.02em;">Foundit</p>
              </td>
            </tr>
            <tr>
              <td style="padding: 28px 32px 8px;">
                <p style="margin: 0 0 16px; color: ${EMAIL_BRAND.text}; font-size: 16px; line-height: 1.5;">${safeGreeting}</p>
                <h1 style="margin: 0; color: ${EMAIL_BRAND.text}; font-size: 20px; font-weight: 700; line-height: 1.3;">${safeTitle}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding: 16px 32px 24px;">
                <p style="margin: 0; padding: 16px; background-color: ${EMAIL_BRAND.accentSurface}; border-left: 4px solid ${EMAIL_BRAND.primary}; border-radius: 4px; color: ${EMAIL_BRAND.text}; font-size: 15px; line-height: 1.6;">${safeMessage}</p>
              </td>
            </tr>
            ${ctaBlock}
            ${footerBlock}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { html, text };
}

export async function sendVerificationEmail(
  to: string,
  token: string,
  enabled = true
): Promise<void> {
  if (!enabled) {
    return;
  }

  const verifyUrl = `${requireEnv('APP_URL')}/api/auth/verify-email?token=${token}`;
  const { html, text } = buildBrandedEmail({
    greeting: 'Hi,',
    title: 'Verify your Foundit account',
    message:
      'Thanks for signing up! Click the button below to verify your email. This link expires in 24 hours.',
    cta: {
      url: verifyUrl,
      label: 'Verify Email',
    },
    footer:
      'If you did not create a Foundit account, you can safely ignore this email.',
  });

  await transporter.sendMail({
    from: senderAddress(),
    to,
    subject: 'Verify your Foundit account',
    html,
    text,
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
