import type { AuditAction } from './auditEvents';

export interface AuditSummaryContext {
  actorType: 'anonymous' | 'user' | 'system' | 'unknown';
  actorRole?: 'student' | 'security' | 'admin';
  entityLabel?: string;
  outcome: 'success' | 'denied' | 'failure';
  reasonCode?: string | null;
  details?: Record<string, unknown>;
}

function str(value: unknown): string {
  return value === undefined || value === null ? '' : String(value);
}

function actorPhrase(ctx: AuditSummaryContext): string {
  if (ctx.actorRole === 'student') return 'A student';
  if (ctx.actorRole === 'security') return 'Security staff';
  if (ctx.actorRole === 'admin') return 'An admin';
  if (ctx.actorType === 'system') return 'A system job';
  if (ctx.actorType === 'anonymous') return 'An anonymous requester';
  return 'A user';
}

function withLabel(base: string, ctx: AuditSummaryContext): string {
  return ctx.entityLabel ? `${base} (${ctx.entityLabel})` : base;
}

function transition(ctx: AuditSummaryContext): string {
  const from = str(ctx.details?.previousStatus);
  const to = str(ctx.details?.nextStatus);
  if (from && to) return ` from ${from} to ${to}`;
  if (to) return ` to ${to}`;
  return '';
}

export const auditSummaries: Record<
  AuditAction,
  (ctx: AuditSummaryContext) => string
> = {
  user_registered: (ctx) => `${actorPhrase(ctx)} registered a new account.`,
  user_registration_rolled_back: () =>
    `Registration was rolled back because the confirmation email failed to send.`,
  user_login: (ctx) => `${actorPhrase(ctx)} logged in successfully.`,
  user_login_denied: (ctx) =>
    `${withLabel('A login attempt', ctx)} was denied${ctx.reasonCode ? ` (${ctx.reasonCode})` : ''}.`,
  email_verification_succeeded: (ctx) =>
    `${withLabel('An account', ctx)} completed email verification.`,
  email_verification_denied: (ctx) =>
    `${withLabel('An email verification attempt', ctx)} was denied${ctx.reasonCode ? ` (${ctx.reasonCode})` : ''}.`,
  refresh_token_rotated: (ctx) =>
    `${actorPhrase(ctx)} refreshed their session token.`,
  refresh_token_denied: (ctx) =>
    `${withLabel('A token refresh attempt', ctx)} was denied${ctx.reasonCode ? ` (${ctx.reasonCode})` : ''}.`,
  authorization_denied: (ctx) => {
    const method = str(ctx.details?.method);
    const purpose = str(ctx.details?.routePurpose);
    const required = str(ctx.details?.requiredRoles);
    const actual = str(ctx.details?.actualRole);
    return `${actorPhrase(ctx)} (role: ${actual || 'unknown'}) was denied access to ${purpose || 'a protected route'}${method ? ` (${method})` : ''}; required role(s): ${required || 'unspecified'}.`;
  },
  user_profile_updated: (ctx) => {
    const fields = str(ctx.details?.changedFields);
    return `${actorPhrase(ctx)} updated their profile${fields ? ` (${fields})` : ''}.`;
  },
  user_profile_photo_updated: (ctx) => {
    const op = str(ctx.details?.operation);
    return `${actorPhrase(ctx)} ${op === 'cleared' ? 'removed' : 'updated'} their profile photo.`;
  },
  user_notification_preferences_updated: (ctx) =>
    `${actorPhrase(ctx)} updated their notification preferences.`,
  claim_created: (ctx) => {
    const category = str(ctx.details?.category);
    return `${actorPhrase(ctx)} submitted ${withLabel('a claim', ctx)}${category ? ` (${category})` : ''}.`;
  },
  claim_deleted: (ctx) =>
    `${actorPhrase(ctx)} deleted ${withLabel('a claim', ctx)}.`,
  claim_item_linked: (ctx) =>
    `${actorPhrase(ctx)} linked ${withLabel('a claim', ctx)} to an item.`,
  claim_status_updated: (ctx) => {
    const reason = str(ctx.details?.reasonCategory);
    return `${actorPhrase(ctx)} updated ${withLabel('a claim', ctx)}${transition(ctx)}${reason ? `: ${reason}` : ''}.`;
  },
  claim_transition_denied: (ctx) =>
    `${withLabel('A claim status change', ctx)} was denied.`,
  claim_match_suggestions_generated: (ctx) => {
    const count = str(ctx.details?.suggestionCount);
    return `${actorPhrase(ctx)} triggered match-suggestion generation for ${withLabel('a claim', ctx)}${count ? ` (${count} suggestion(s))` : ''}.`;
  },
  claim_match_suggestion_reviewed: (ctx) =>
    `${actorPhrase(ctx)} reviewed a match suggestion${transition(ctx)}.`,
  claim_notification_sent: (ctx) =>
    `A notification was sent for ${withLabel('a claim', ctx)} update.`,
  claim_email_notification_sent: (ctx) =>
    `An email notification was sent for ${withLabel('a claim', ctx)}.`,
  claim_email_notification_failed: (ctx) =>
    `An email notification failed to send for ${withLabel('a claim', ctx)}.`,
  item_created: (ctx) => {
    const category = str(ctx.details?.category);
    return `${actorPhrase(ctx)} registered ${withLabel('an item', ctx)}${category ? ` (${category})` : ''}.`;
  },
  item_updated: (ctx) => {
    const fields = str(ctx.details?.changedFields);
    return `${actorPhrase(ctx)} updated ${withLabel('an item', ctx)}${fields ? ` (${fields})` : ''}.`;
  },
  item_status_updated: (ctx) =>
    `${actorPhrase(ctx)} updated ${withLabel('an item', ctx)}${transition(ctx)}.`,
  item_status_denied: (ctx) =>
    `${withLabel('An item status change', ctx)} was denied.`,
  item_walk_in_released: (ctx) =>
    `${actorPhrase(ctx)} released ${withLabel('an item', ctx)} to a walk-in claimant.`,
  item_auto_expired: (ctx) =>
    `${withLabel('An item', ctx)} was automatically expired by a retention job.`,
  report_created: (ctx) =>
    `${actorPhrase(ctx)} submitted ${withLabel('a found-item report', ctx)}.`,
  report_link_created: (ctx) =>
    `${actorPhrase(ctx)} created ${withLabel('a report link', ctx)}.`,
  report_link_consumed: (ctx) =>
    `${withLabel('A report link', ctx)} was consumed to submit a report.`,
  notification_created: (ctx) =>
    `A notification was created${ctx.entityLabel ? ` for ${ctx.entityLabel}` : ''}.`,
  notification_fanout_created: (ctx) => {
    const count = str(ctx.details?.recipientCount);
    const type = str(ctx.details?.notificationType);
    return `A notification fan-out was sent to ${count || 'multiple'} recipient(s)${type ? ` (${type})` : ''}.`;
  },
  upload_authorized: (ctx) => {
    const purpose = str(ctx.details?.purpose);
    return `${actorPhrase(ctx)} was authorized to upload a file${purpose ? ` (${purpose})` : ''}.`;
  },
  photo_session_created: (ctx) =>
    `${actorPhrase(ctx)} created ${withLabel('a photo session', ctx)}.`,
  photo_upload_authorized: (ctx) =>
    `${withLabel('A photo upload', ctx)} was authorized via a walk-in session.`,
  photo_image_registered: (ctx) =>
    `${withLabel('A photo', ctx)} was registered to a walk-in session.`,
  photo_image_deleted: (ctx) =>
    `${actorPhrase(ctx)} deleted ${withLabel('a photo', ctx)}.`,
  photo_image_access_denied: (ctx) =>
    `${withLabel('A photo access attempt', ctx)} was denied.`,
  photo_session_access_denied: (ctx) =>
    `${withLabel('A photo session access attempt', ctx)} was denied.`,
  unverified_user_deleted: () =>
    `An unverified account was deleted by a cleanup job.`,
};
