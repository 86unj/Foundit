# Notifications — Flow & Status

> Status doc for the **Notifications** feature (student + security). Reflects the
> implementation as of 2026-08-05. Safe to commit/share (unlike the local-only
> `plan.md` / `implementation.md`).

## 1. What it is

A shared notification feed for both roles, rendered in the **Notifications tab of
the profile page** (`/profile?tab=notifications`), plus a **navbar bell with an
unread-count badge** on every authenticated page. Students see match-found,
claim-status (rejected / picked up), and report-received updates; security staff
see per-campus alerts (new claims, cancellations, expired retention).

Routes/components:

- `app/profile/page.tsx` — tab switch; notifications tab renders the feed
- `components/NotificationFeed.tsx` — heading, All | Unread filter, "Mark all as read", card list
- `components/NotificationCard.tsx` — card; left unread bar; mail toggle + dismiss
- `utils/notificationHref.ts` — role-aware deep-link helper
- `components/NotificationsProvider.tsx` — shares the unread count so the bell updates live
- `components/Navbar.tsx` — bell icon + badge, links to the tab
- `app/profile/page.tsx` — sidebar Notifications tab shows unread badge when count > 0
- `hooks/useNotifications.ts` — data + optimistic read/unread actions
- `lib/api/notifications.ts` / `types/notifications.ts` — API wrappers + shared types

## 2. Who gets notified of what

| Event                                              | Recipient                                                          | Type                                      |
| -------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------- |
| Claim status changes (rejected / picked up)        | The claim's student                                                | `claim_status_update`                     |
| Match / approval for a claim                       | The claim's student                                                | `match_found`                             |
| New claim submitted                                | Active security/admin at the claim's campus                        | `claim_status_update`                     |
| Student cancels a claim                            | Active security/admin at the claim's campus                        | `claim_status_update` ("Claim Cancelled") |
| Retention job expires items                        | Active security/admin at each affected campus (batched per campus) | `item_expiring`                           |
| Retention job auto-rejects claims on expired items | Each affected student                                              | `claim_status_update`                     |
| Open-claim expiry (35 days, unmatched)             | Student                                                            | `claim_status_update`                     |
| Found-item report submitted                        | The finder                                                         | `report_confirmation`                     |

Copy rule: messages name the item (`Your claim for "X" …`) and fall back to a
short `#REF` — raw UUIDs never appear. Emissions run inside the triggering
transaction, so a notification can never exist without its event (or vice
versa). Security closing a claim is a status change (`rejected`) — covered by
the first row.

## 3. API contract

| Endpoint                              | Auth   | Returns                                                                      |
| ------------------------------------- | ------ | ---------------------------------------------------------------------------- |
| `GET /api/notifications`              | Bearer | `{ notifications[], unreadCount }`, newest first; `?unreadOnly=true` filters |
| `PATCH /api/notifications/:id/read`   | Bearer | updated notification; **404 unless the caller owns it**                      |
| `PATCH /api/notifications/:id/unread` | Bearer | updated notification; same ownership rule                                    |
| `PATCH /api/notifications/read-all`   | Bearer | `{ updatedCount }`                                                           |

Notifications are **per-recipient rows** — every recipient has an independent
copy and read state. Feeds are always scoped to the JWT's user id; there is no
way to query another user's notifications.

## 4. Feed interactions

- **Card click (or Enter/Space)** → optimistic mark read (fire-and-forget
  PATCH), then navigate when `getNotificationHref` returns a path; otherwise
  stay on the feed. Unread cards show a blue bar on the left edge.
- **Deep links**:
  - Student + claim → `/student/my-claims?claimId=` (opens existing claim modal)
  - Security/admin + claim → `/security/claims/{id}`
  - Security/admin + item → `/security/items/{id}`
  - Security/admin + `item_expiring` → `/security/items?status=expired`
  - Missing ref (other types) → no href (mark read only)
- **Overflow / actions** → mail icon toggles read/unread; × dismisses. Relative
  time sits under the message.
- **All | Unread** → server filter via `?unreadOnly=true`. Under Unread, cards
  marked read **stay rendered** until the filter changes, remount, or reload.
- **"Mark all as read"** → clears everything unread server-side (cards stay on
  the Unread view until refetch as above).
- **Live badge**: `NotificationsProvider` shares the count between feed, navbar
  account menu, and the profile sidebar Notifications tab. Navbar falls back to
  its own fetch when no provider is mounted.

## 5. Error handling

- API wrappers throw `Error(parseApiError(res))` on non-2xx like the rest of
  `lib/api/*`.
- Feed load failure → inline "Could not load notifications" message (no crash).
- Read/unread failures → the optimistic update is rolled back by refetching.
- Bell badge is best-effort: fetch errors are swallowed and the last known
  count is kept.

## 6. Known gaps / follow-ups (Phase 3+ of the roadmap)

- No retention/cleanup job for the notification table.
- Soft-handling deleted claim deep links in the feed (destination pages already
  404 / empty).
- Email covers student claim events only (`deliverStudentClaimEmail` when
  `emailNotificationOptIn` + claim `notificationPreference` are set); security
  alerts, report confirmation, and retention expiry stay in-app.
- No real-time push — another session's events appear on the next fetch.

## 7. Tests

- `tests/hooks/useNotifications.test.ts` — load, optimistic read/unread/all, rollbacks, stay-on-Unread
- `tests/utils/notificationHref.test.ts` — role-aware href mapping
- `tests/components/NotificationFeed.test.tsx` — feed states, All/Unread, open + navigate
- `tests/components/NotificationCard.test.tsx` — card click/keyboard, read toggle, dismiss
- `tests/components/Navbar.test.tsx` — bell + badge, guest fallback
- Backend: `backend/tests/notifications.integration.test.ts` (routes, ownership,
  read/unread), fan-out cases in `claims.integration.test.ts` (submit + cancel),
  `expireRetainedItems.test.ts` (expiry notices), `reportLinks.integration.test.ts`
  (report confirmation)
