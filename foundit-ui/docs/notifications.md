# Notifications — Flow & Status

> Status doc for the **Notifications** feature (student + security). Reflects the
> implementation as of 2026-07-12. Safe to commit/share (unlike the local-only
> `plan.md` / `implementation.md`).

## 1. What it is

A shared notification feed for both roles, rendered in the **Notifications tab of
the profile page** (`/profile?tab=notifications`), plus a **navbar bell with an
unread-count badge** on every authenticated page. Students see claim-status and
match-found updates; security staff see "New Claim Submitted" alerts for their
campus.

Routes/components:

- `app/profile/page.tsx` — tab switch; notifications tab renders the feed
- `components/NotificationFeed.tsx` — heading, `N unread`, "Mark all as read", card list
- `components/NotificationCard.tsx` — one row (blue left bar = unread, checkmark = read)
- `components/Navbar.tsx` — bell icon + badge, links to the tab
- `hooks/useNotifications.ts` — data + optimistic mark-read
- `lib/api/notifications.ts` / `types/notifications.ts` — API wrappers + shared types

## 2. End-to-end flow

```
[student] POST /api/claims
        │  backend fans out one Notification row per active security/admin
        │  user whose campusId matches the claim's campusId
        ▼
[security] navbar bell badge (GET /api/notifications → unreadCount)
        │  click bell ──► /profile?tab=notifications
        ▼
   NotificationFeed (useNotifications)
        ├─ click a card      ──► PATCH /api/notifications/:id/read   (optimistic)
        └─ "Mark all as read" ──► PATCH /api/notifications/read-all  (optimistic)

[security] PATCH /api/claims/:id/status (approve/reject/pickup)
        │  backend creates claim_status_update (+ match_found on approval)
        ▼
[student] same bell → same tab → same feed
```

## 3. API contract

| Endpoint                            | Auth   | Returns                                                                      |
| ----------------------------------- | ------ | ---------------------------------------------------------------------------- |
| `GET /api/notifications`            | Bearer | `{ notifications[], unreadCount }`, newest first; `?unreadOnly=true` filters |
| `PATCH /api/notifications/:id/read` | Bearer | updated notification; **404 unless the caller owns it**                      |
| `PATCH /api/notifications/read-all` | Bearer | `{ updatedCount }`                                                           |

Notifications are **per-recipient rows** — every recipient has an independent
copy and read state. Feeds are always scoped to the JWT's user id; there is no
way to query another user's notifications.

## 4. Error handling

- API wrappers throw `Error(parseApiError(res))` on non-2xx like the rest of
  `lib/api/*`.
- Feed load failure → inline "Could not load notifications" message (no crash).
- Mark-read failure → optimistic update is rolled back by refetching the feed.
- Bell badge is best-effort: fetch errors are swallowed and the last known count
  is kept; the badge refreshes on route change.

## 5. Known gaps / follow-ups

- Badge doesn't live-update when notifications are read on the open page; it
  refreshes on the next navigation (a shared store or context would fix this).
- No pagination on the feed yet — fine at current volumes.
- `item_expiring` / `report_confirmation` enum values exist but nothing emits
  them yet; the feed will render them without changes.
- Clicking a card marks it read but doesn't navigate to the referenced claim
  (`referenceType`/`referenceId` are already returned by the API).

## 6. Tests

- `tests/hooks/useNotifications.test.ts` — load, optimistic mark-read/all, rollback
- `tests/components/NotificationFeed.test.tsx`, `NotificationCard.test.tsx`,
  `Navbar.test.tsx` — feed states, card interaction, bell + badge
- Backend: `backend/tests/notifications.integration.test.ts` (routes, ownership),
  fan-out cases in `backend/tests/claims.integration.test.ts`
