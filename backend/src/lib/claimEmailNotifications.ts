import {
  ClaimNotificationPreference,
  EmailDeliveryStatus,
  Prisma,
} from '@prisma/client';
import { prisma } from '../db';
import { writeAuditLogBestEffort } from '../utils/auditLog';
import { buildBrandedEmail, sendNotificationEmail } from './email';
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
  itemName?: string | null;
  student: {
    firstName: string;
    lastName: string;
    email: string;
    emailNotificationOptIn: boolean;
  };
}

interface StudentClaimEmailContext {
  actorId?: string;
  role?: 'student' | 'security' | 'admin';
  ipAddress?: string;
  requestId?: string;
  event: string;
}

function studentClaimsUrl(): string | null {
  const base =
    process.env.FRONTEND_URL?.trim() || process.env.CORS_ORIGIN?.trim();
  if (!base) {
    return null;
  }

  return `${base.replace(/\/$/, '')}/student/my-claims`;
}

function buildStudentClaimEmailContent(input: {
  greeting: string;
  title: string;
  message: string;
}) {
  const claimsUrl = studentClaimsUrl();

  return buildBrandedEmail({
    greeting: input.greeting,
    title: input.title,
    message: input.message,
    cta: claimsUrl ? { url: claimsUrl, label: 'View My Claims' } : undefined,
    footer:
      'You received this email because you opted in to claim notifications on Foundit.',
  });
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
  await writeAuditLogBestEffort({
    actorId: context.actorId,
    actorType: context.actorId ? 'user' : 'anonymous',
    actorRole: context.role,
    action:
      status === 'sent'
        ? 'claim_email_notification_sent'
        : 'claim_email_notification_failed',
    entityType: 'notification',
    entityId: notification.notificationId,
    entityLabel: claim.itemName ?? undefined,
    outcome: status === 'sent' ? 'success' : 'failure',
    reasonCode: status === 'failed' ? 'email_delivery_failed' : null,
    details: {
      claimId: claim.claimId,
      recipientId: claim.studentId,
      notificationType: notification.type,
      event: context.event,
      emailDeliveryStatus: status,
    },
    ipAddress: context.ipAddress,
    requestId: context.requestId,
  });
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
  const { html, text } = buildStudentClaimEmailContent({
    greeting,
    title: notification.title,
    message: notification.message,
  });

  try {
    await sendNotificationEmail({
      to: claim.student.email,
      subject: notification.title,
      text,
      html,
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
