# Notifications — Flow & Status

> Status doc for the **Notifications** feature (student + security). Reflects the
> implementation as of 2026-07-13. Safe to commit/share (unlike the local-only
> `plan.md` / `implementation.md`).

## 1. What it is

A shared notification feed for both roles, rendered in the **Notifications tab of
the profile page** (`/profile?tab=notifications`), plus a **navbar bell with an
unread-count badge** on every authenticated page. Students see claim-status,
match-found, and report-received updates; security staff see per-campus alerts
(new claims, cancellations, expired retention).

Routes/components:

- `app/profile/page.tsx` — tab switch; notifications tab renders the feed
- `components/NotificationFeed.tsx` — heading, Unread filter, "Mark all as read", card list
- `components/NotificationCard.tsx` — one row; circle button toggles read ⇄ unread
- `components/NotificationsProvider.tsx` — shares the unread count so the bell updates live
- `components/Navbar.tsx` — bell icon + badge, links to the tab
- `hooks/useNotifications.ts` — data + optimistic read/unread actions
- `lib/api/notifications.ts` / `types/notifications.ts` — API wrappers + shared types

## 2. Who gets notified of what

| Event                                                  | Recipient                                                          | Type                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------ | ----------------------------------------- |
| Claim status changes (approved / rejected / picked up) | The claim's student                                                | `claim_status_update`                     |
| Match approved for a claim                             | The claim's student                                                | `match_found` (+ status update)           |
| New claim submitted                                    | Active security/admin at the claim's campus                        | `claim_status_update`                     |
| Student cancels a claim                                | Active security/admin at the claim's campus                        | `claim_status_update` ("Claim Cancelled") |
| Retention job expires items                            | Active security/admin at each affected campus (batched per campus) | `item_expiring`                           |
| Retention job auto-rejects claims on expired items     | Each affected student                                              | `claim_status_update`                     |
| Found-item report submitted                            | The finder                                                         | `report_confirmation`                     |

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

- **Card body click (or Enter/Space)** → mark read.
- **Circle button** → toggles read ⇄ unread (`aria-label` flips accordingly).
- **"Unread (N)"** → filters the list to unread cards (client-side — see gaps).
- **"Mark all as read"** → clears everything unread server-side.
- **Live badge**: `NotificationsProvider` (mounted in `RoleShell` and the
  profile page) shares the count between feed and bell, so marking cards read
  updates the badge without navigating. Navbar falls back to its own fetch when
  no provider is mounted.

## 5. Error handling

- API wrappers throw `Error(parseApiError(res))` on non-2xx like the rest of
  `lib/api/*`.
- Feed load failure → inline "Could not load notifications" message (no crash).
- Read/unread failures → the optimistic update is rolled back by refetching.
- Bell badge is best-effort: fetch errors are swallowed and the last known
  count is kept.

## 6. Known gaps / follow-ups (Phase 3+ of the roadmap)

- No pagination; the **Unread filter is client-side** and only correct because
  the full list loads in one request — move filtering server-side
  (`?unreadOnly=true` exists) when pagination lands.
- No retention/cleanup job for the notification table.
- Clicking a card doesn't navigate to the referenced claim/item
  (`referenceType`/`referenceId` are already returned by the API).
- In-app only: `notificationPreference` and the email opt-in are stored but not
  honored; `lib/email.ts` has a transporter (used for signup verification) that
  a future `sendNotificationEmail` can reuse.
- No real-time push — another session's events appear on the next fetch.

## 7. Tests

- `tests/hooks/useNotifications.test.ts` — load, optimistic read/unread/all, rollbacks
- `tests/components/NotificationFeed.test.tsx` — feed states, Unread filter, toggle wiring
- `tests/components/NotificationCard.test.tsx` — card click/keyboard, circle toggle isolation
- `tests/components/Navbar.test.tsx` — bell + badge, guest fallback
- Backend: `backend/tests/notifications.integration.test.ts` (routes, ownership,
  read/unread), fan-out cases in `claims.integration.test.ts` (submit + cancel),
  `expireRetainedItems.test.ts` (expiry notices), `reportLinks.integration.test.ts`
  (report confirmation)
