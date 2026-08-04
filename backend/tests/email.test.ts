import { beforeEach, describe, expect, test, vi } from 'vitest';

const sendMail = vi.hoisted(() => vi.fn());

vi.hoisted(() => {
  process.env.SMTP_USER = 'smtp-user';
  process.env.SMTP_PASS = 'smtp-pass';
  process.env.APP_URL = 'https://foundit.example';
});

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail,
    })),
  },
}));

import { sendNotificationEmail, sendVerificationEmail } from '../src/lib/email';

describe('sendVerificationEmail', () => {
  beforeEach(() => {
    sendMail.mockReset();
  });

  test('does not send when email notifications are disabled', async () => {
    await sendVerificationEmail('student@myseneca.ca', 'token-123', false);

    expect(sendMail).not.toHaveBeenCalled();
  });

  test('sends when email notifications are enabled', async () => {
    sendMail.mockResolvedValueOnce(undefined);

    await sendVerificationEmail('student@myseneca.ca', 'token-123', true);

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '"Foundit" <smtp-user>',
        to: 'student@myseneca.ca',
        subject: 'Verify your Foundit account',
        text: expect.stringContaining('Verify Email:'),
        html: expect.stringContaining('Verify Email'),
      })
    );
    expect(sendMail.mock.calls[0]?.[0]?.html).toContain('#009adb');
    expect(sendMail.mock.calls[0]?.[0]?.html).toContain(
      'https://foundit.example/api/auth/verify-email?token=token-123'
    );
  });

  test('sends notification emails', async () => {
    sendMail.mockResolvedValueOnce(undefined);

    await sendNotificationEmail({
      to: 'student@myseneca.ca',
      subject: 'Claim submitted',
      html: '<p>Your claim was submitted.</p>',
      text: 'Your claim was submitted.',
    });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '"Foundit" <smtp-user>',
        to: 'student@myseneca.ca',
        subject: 'Claim submitted',
      })
    );
  });
});
