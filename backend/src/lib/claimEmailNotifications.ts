import {
  ClaimNotificationPreference,
  EmailDeliveryStatus,
  Prisma,
} from '@prisma/client';
import { prisma } from '../db';
import { writeAuditLog } from '../utils/auditLog';
import { sendNotificationEmail } from './email';
import { logger } from './logger';

export const studentNotificationEmailSelect = {
  notificationId: true,
  type: true,
  title: true,
  message: true,
} as const;

export type StudentNotificationEmailRow = Prisma.NotificationGetPayload<{
  select: typeof studentNotificationEmailSelect;
}>;

export interface StudentClaimEmailTarget {
  claimId: string;
  studentId: string;
  notificationPreference: ClaimNotificationPreference;
  student: {
    firstName: string;
    lastName: string;
    email: string;
    emailNotificationOptIn: boolean;
  };
}

interface StudentClaimEmailContext {
  actorId?: string;
  ipAddress?: string;
  event: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function claimWantsEmail(claim: StudentClaimEmailTarget): boolean {
  return (
    claim.student.emailNotificationOptIn &&
    claim.notificationPreference === 'email'
  );
}

async function recordStudentClaimEmailAudit(
  notification: StudentNotificationEmailRow,
  claim: StudentClaimEmailTarget,
  context: StudentClaimEmailContext,
  status: 'sent' | 'failed'
) {
  try {
    await writeAuditLog({
      actorId: context.actorId,
      action:
        status === 'sent'
          ? 'claim_email_notification_sent'
          : 'claim_email_notification_failed',
      entityType: 'notification',
      entityId: notification.notificationId,
      details: {
        claimId: claim.claimId,
        recipientId: claim.studentId,
        notificationType: notification.type,
        event: context.event,
        emailDeliveryStatus: status,
      },
      ipAddress: context.ipAddress,
    });
  } catch (err) {
    logger.warn(
      {
        err,
        notificationId: notification.notificationId,
        claimId: claim.claimId,
      },
      'Failed to write student claim email audit log'
    );
  }
}

export async function deliverStudentClaimEmail(
  notification: StudentNotificationEmailRow,
  claim: StudentClaimEmailTarget,
  context: StudentClaimEmailContext
) {
  if (!claimWantsEmail(claim)) {
    return;
  }

  const studentName =
    `${claim.student.firstName} ${claim.student.lastName}`.trim();
  const greeting = studentName ? `Hi ${studentName},` : 'Hi,';

  try {
    await sendNotificationEmail({
      to: claim.student.email,
      subject: notification.title,
      text: `${greeting}\n\n${notification.message}\n\nFoundit`,
      html: `
        <p>${escapeHtml(greeting)}</p>
        <p>${escapeHtml(notification.message)}</p>
        <p>Foundit</p>
      `,
    });

    await prisma.notification.update({
      where: { notificationId: notification.notificationId },
      data: {
        emailSent: true,
        emailSentAt: new Date(),
        emailDeliveryStatus: EmailDeliveryStatus.sent,
      },
    });

    await recordStudentClaimEmailAudit(notification, claim, context, 'sent');
  } catch (err) {
    logger.warn(
      {
        err,
        notificationId: notification.notificationId,
        claimId: claim.claimId,
        recipientId: claim.studentId,
      },
      'Failed to send student claim notification email'
    );

    await prisma.notification.update({
      where: { notificationId: notification.notificationId },
      data: {
        emailSent: false,
        emailDeliveryStatus: EmailDeliveryStatus.failed,
      },
    });

    await recordStudentClaimEmailAudit(notification, claim, context, 'failed');
  }
}
