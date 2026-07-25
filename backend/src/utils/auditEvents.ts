type AuditPolicy = 'required' | 'best_effort';

function event(
  owner: string,
  entityType: string,
  policy: AuditPolicy,
  detailKeys: readonly string[] = [],
  requiredDetailKeys: readonly string[] = []
) {
  return { owner, entityType, policy, detailKeys, requiredDetailKeys } as const;
}

export const auditEvents = {
  user_registered: event('auth', 'user', 'required'),
  user_registration_rolled_back: event('auth', 'user', 'required'),
  user_login: event('auth', 'user', 'required'),
  user_login_denied: event('auth', 'user', 'best_effort'),
  email_verification_succeeded: event('auth', 'user', 'required'),
  email_verification_denied: event('auth', 'user', 'best_effort'),
  refresh_token_rotated: event('auth', 'user', 'required'),
  refresh_token_denied: event('auth', 'user', 'best_effort'),
  authorization_denied: event('requireRole', 'route', 'best_effort', [
    'method',
    'routePurpose',
    'requiredRoles',
    'actualRole',
  ]),
  user_profile_updated: event(
    'users',
    'user',
    'required',
    ['changedFields'],
    ['changedFields']
  ),
  // Details deliberately carry only the operation — the object key and any
  // resolved URL are prohibited audit detail values.
  user_profile_photo_updated: event(
    'users',
    'user',
    'required',
    ['operation'],
    ['operation']
  ),
  user_notification_preferences_updated: event(
    'users',
    'user',
    'required',
    ['previous', 'updated'],
    ['previous', 'updated']
  ),
  claim_created: event('claims', 'claim', 'required', [
    'category',
    'campusId',
    'status',
    'imageCount',
  ]),
  claim_deleted: event(
    'claims',
    'claim',
    'required',
    ['previousStatus'],
    ['previousStatus']
  ),
  claim_item_linked: event('claims', 'claim', 'required', [
    'previousItemId',
    'nextItemId',
  ]),
  claim_status_updated: event('claims', 'claim', 'required', [
    'previousStatus',
    'nextStatus',
    'itemId',
    'reasonCategory',
  ]),
  claim_transition_denied: event('claims', 'claim', 'best_effort', [
    'currentStatus',
    'previousStatus',
    'requestedStatus',
    'itemId',
    'itemStatus',
  ]),
  claim_match_suggestions_generated: event('claims', 'claim', 'required', [
    'candidateCount',
    'suggestionCount',
  ]),
  claim_match_suggestion_reviewed: event(
    'claims',
    'match_suggestion',
    'required',
    ['claimId', 'previousStatus', 'nextStatus'],
    ['claimId', 'previousStatus', 'nextStatus']
  ),
  claim_notification_sent: event('claims', 'notification', 'required', [
    'claimId',
    'recipientId',
    'claimStatus',
  ]),
  claim_email_notification_sent: event(
    'claimEmailNotifications',
    'notification',
    'best_effort',
    [
      'claimId',
      'recipientId',
      'notificationType',
      'event',
      'emailDeliveryStatus',
    ]
  ),
  claim_email_notification_failed: event(
    'claimEmailNotifications',
    'notification',
    'best_effort',
    [
      'claimId',
      'recipientId',
      'notificationType',
      'event',
      'emailDeliveryStatus',
    ]
  ),
  item_created: event('items', 'item', 'required', [
    'category',
    'campusId',
    'dateFound',
    'imageCount',
    'source',
  ]),
  item_updated: event(
    'items',
    'item',
    'required',
    ['changedFields'],
    ['changedFields']
  ),
  item_status_updated: event('items', 'item', 'required', [
    'previousStatus',
    'nextStatus',
    'reasonCategory',
    'retentionExpiryDate',
    'claimId',
  ]),
  item_status_denied: event('items', 'item', 'best_effort', [
    'previousStatus',
    'requestedStatus',
  ]),
  item_walk_in_released: event('items', 'item', 'required', [
    'releaseType',
    'idVerified',
    'verificationNoteProvided',
    'contactProvided',
    'studentNameProvided',
    'releasedAt',
  ]),
  item_auto_expired: event('expireRetainedItems', 'item', 'required', [
    'previousStatus',
    'nextStatus',
    'retentionExpiryDate',
  ]),
  report_created: event('reportLinks', 'found_item_report', 'required', [
    'category',
    'campusId',
  ]),
  report_link_created: event('reportLinks', 'report_link', 'required', [
    'campusId',
    'expiresAt',
  ]),
  report_link_consumed: event('reportLinks', 'report_link', 'required', [
    'reportId',
  ]),
  notification_created: event('notifications', 'notification', 'required', [
    'claimId',
    'reportId',
    'itemId',
  ]),
  notification_fanout_created: event(
    'notifications',
    'notification',
    'required',
    [
      'recipientCount',
      'sourceEntityType',
      'sourceEntityId',
      'notificationType',
    ],
    ['recipientCount', 'notificationType']
  ),
  upload_authorized: event(
    'uploads',
    'upload',
    'best_effort',
    ['contentType', 'sizeCategory', 'purpose'],
    ['contentType', 'sizeCategory']
  ),
  photo_session_created: event('photoSessions', 'photo_session', 'required', [
    'expiresAt',
  ]),
  photo_upload_authorized: event(
    'photoSessions',
    'photo_session',
    'best_effort',
    ['imageId', 'contentType', 'sizeCategory'],
    ['imageId', 'contentType', 'sizeCategory']
  ),
  photo_image_registered: event(
    'photoSessions',
    'photo_session_image',
    'required',
    ['sessionId', 'fileType', 'sizeCategory'],
    ['sessionId', 'fileType', 'sizeCategory']
  ),
  photo_image_deleted: event(
    'photoSessions',
    'photo_session_image',
    'required',
    ['sessionId'],
    ['sessionId']
  ),
  photo_image_access_denied: event(
    'photoSessions',
    'photo_session_image',
    'best_effort'
  ),
  photo_session_access_denied: event(
    'photoSessions',
    'photo_session',
    'best_effort'
  ),
  unverified_user_deleted: event('cleanupUnverifiedUsers', 'user', 'required'),
} as const;

export type AuditAction = keyof typeof auditEvents;

export const prohibitedAuditDetailKeys = [
  'password',
  'accesstoken',
  'refreshtoken',
  'verificationtoken',
  'tokenhash',
  'url',
  'imageurl',
  'presignedurl',
  'objectkey',
  'filename',
  'email',
  'phone',
  'phonenumber',
  'contactnumber',
  'studentnumber',
  'message',
  'body',
  'payload',
] as const;
