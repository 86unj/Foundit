# Audit Event Registry

`src/utils/auditEvents.ts` is the typed source of truth. Required events are written in the same Prisma transaction as their database mutation. Best-effort events cover denials and external effects; persistence failure is reported through a sanitized `audit_log_persistence_failed` Pino record.

All request-driven events use the server-generated request ID and `req.ip`. Job events use one generated run ID per invocation. Detail objects are allowlisted by the owning call site and rejected when they contain credential, token, URL, object-key, filename, email, phone, student-number, message-body, or provider-payload keys.

| Actions                                                                           | Actor source                                                  | Entity                    | Policy               | Safe detail contract                                                   | Owning tests                                                           |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------- | -------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `user_registered`, `user_registration_rolled_back`, `user_login`                  | Anonymous requester for registration; verified user for login | user                      | Required             | Result/reason only                                                     | `auth.login.integration`, `auth.extra.integration`                     |
| `user_login_denied`, `email_verification_denied`, `refresh_token_denied`          | Anonymous; known user is target only                          | user                      | Best effort          | Reason code; no submitted identifier or credential                     | `auth.login.integration`, `auth.extra.integration`, `auditLog`         |
| `email_verification_succeeded`, `refresh_token_rotated`                           | Verified credential target                                    | user                      | Required             | No token or hash                                                       | `auth.extra.integration`                                               |
| `authorization_denied`                                                            | Authenticated JWT user                                        | route                     | Best effort          | Method, route purpose, required/actual roles                           | `requireRole`                                                          |
| `user_profile_updated`, `user_notification_preferences_updated`                   | Authenticated user                                            | user                      | Required             | Changed field names; previous and updated notification preference only | `users.integration`                                                    |
| `user_profile_photo_updated`                                                      | Authenticated user                                            | user                      | Required             | Operation (`set` or `cleared`) only; never the object key or URL       | `users.integration`                                                    |
| `claim_created`, `claim_deleted`, `claim_item_linked`, `claim_status_updated`     | Authenticated student/security/admin or system job            | claim                     | Required             | IDs, status, category, counts, reason category                         | `claims.integration`, `expireRetainedItems`                            |
| `claim_transition_denied`                                                         | Authenticated user                                            | claim                     | Best effort          | Current/requested status and safe IDs                                  | `claims.integration`                                                   |
| `claim_match_suggestions_generated`, `claim_match_suggestion_reviewed`            | Security/admin                                                | claim or match suggestion | Required             | Counts, claim ID, status transition                                    | `claims.integration`                                                   |
| `claim_notification_sent`, `notification_created`, `notification_fanout_created`  | Originating actor/system                                      | notification              | Required             | Source IDs, type, recipient count                                      | `claims.integration`, `reportLinks.integration`, `expireRetainedItems` |
| `claim_email_notification_sent`, `claim_email_notification_failed`                | Originating actor                                             | notification              | Best effort          | Notification/claim IDs, event, delivery status                         | `claims.integration`, `auditLog`                                       |
| `item_created`, `item_updated`, `item_status_updated`, `item_walk_in_released`    | Student/security/admin                                        | item                      | Required             | Category/campus, changed fields, status, non-personal presence flags   | `items.integration`, `reportLinks.integration`, `claims.integration`   |
| `item_status_denied`                                                              | Security/admin                                                | item                      | Best effort          | Requested/current status and reason code                               | `items.integration`                                                    |
| `item_auto_expired`                                                               | System job                                                    | item                      | Required             | Status and retention date                                              | `expireRetainedItems`                                                  |
| `report_created`, `report_link_created`, `report_link_consumed`                   | Authenticated student/security/admin                          | report or link            | Required             | IDs, campus, category, expiry; never bearer token/URL                  | `reportLinks.integration`                                              |
| `upload_authorized`                                                               | Authenticated user                                            | upload authorization      | Best effort          | Content type, size category, and upload purpose                        | `uploads.integration`                                                  |
| `photo_session_created`                                                           | Security user                                                 | photo session             | Required             | Expiry only                                                            | `photoSessions.integration`                                            |
| `photo_upload_authorized`, `photo_image_registered`                               | Anonymous session holder                                      | photo session/image       | Best effort/required | Session/image ID, content type, size category                          | `photoSessions.integration`                                            |
| `photo_image_deleted`, `photo_image_access_denied`, `photo_session_access_denied` | Authenticated security user                                   | photo image/session       | Required/best effort | Stable IDs and denial reason                                           | `photoSessions.integration`                                            |
| `unverified_user_deleted`                                                         | System job                                                    | user                      | Required             | Expiry reason only                                                     | `cleanupUnverifiedUsers`                                               |

## Intentional exclusions

- Read-only routes, health checks, public catalog browsing, and derived search-index writes.
- Notification read, unread, and read-all toggles.
- Invalid request-shape noise and ordinary missing-token GET requests.
- Existing `501 NOT_IMPLEMENTED` endpoints.
- Audit-log query, export, download, UI, retention, archival, and tamper-evident storage.

No application update/delete helper or audit mutation API exists. `writeAuditLog`, `writeAuditLogs`, and `writeAuditLogBestEffort` are the only supported write paths.

## Deployment verification

Apply the migration before deploying the new backend with `pnpm exec prisma migrate deploy`. The migration installs a compatibility trigger before enforcing `NOT NULL`; pre-change processes that omit `actor_type` and `outcome` therefore remain insert-compatible while instances are replaced. New code supplies both values explicitly.

Before deployment, save these baselines:

```sql
SELECT COUNT(*) AS audit_rows FROM audit_log;
SELECT COUNT(*) AS non_null_actor_ids FROM audit_log WHERE actor_id IS NOT NULL;
SELECT action, COUNT(*) FROM audit_log GROUP BY action ORDER BY action;
```

After migration, require all checks below to return zero and verify the actor count matches the saved baseline:

```sql
SELECT COUNT(*) FROM audit_log WHERE actor_type IS NULL OR outcome IS NULL;
SELECT COUNT(*) FROM audit_log WHERE actor_id IS NOT NULL AND actor_type <> 'user';
SELECT COUNT(*) FROM audit_log
WHERE actor_id IS NULL
  AND action IN ('item_auto_expired', 'unverified_user_deleted')
  AND actor_type <> 'system';
SELECT COUNT(*) AS non_null_actor_ids FROM audit_log WHERE actor_id IS NOT NULL;
```

Removing the actor foreign key is not safely reversible after users have been deleted. Roll back application code only, preserve the audit table, and use a forward-fix migration rather than recreating the foreign key.
