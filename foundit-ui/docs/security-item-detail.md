# Security — Item Detail — Flow & Status

> Status doc for the **Security Item Detail** page. Reflects the implementation as
> of 2026-06-15. Safe to commit/share (unlike the local-only `plan.md` /
> `implementation.md`).

## 1. What it is

A read-only detail view for a single found item, used by **security/admin** staff
to look up an item and (eventually) release or edit it. Opened by clicking a row
on the security items list.

Route: `app/security/items/[itemId]/page.tsx` → URL `/security/items/<itemId>`.

Access is **role-gated server-side** — the backend requires a `security` or
`admin` role (see flow). The page itself does no client-side role check; it just
sends the Bearer token via `authFetch`.

## 2. End-to-end flow

```
[security] open /security/items/<itemId>   (from the items list)
        │
        ▼  useParams() → itemId ; useEffect fires on mount / itemId change
        │     setLoading(true) → render <Spinner>
        │
        ▼  fetchSecurityItem(itemId)
        │     authFetch GET /api/items/:itemId   (Bearer; auto-refresh on TOKEN_EXPIRED)
        │       backend: authenticate + requireRole('security','admin')
        │       → 200 SecurityItemDetail
        │       → 404 { code: ITEM_NOT_FOUND }   → parseApiError → error message
        │       → 400 VALIDATION_ERROR (bad itemId param)
        │       → 401 → client tries refresh; on failure signOut() + throw
        │
        ├─ error || !item ──► error card: message + "Back to items" button
        └─ success         ──► render detail (fields + photo + action buttons)
        │
        ▼  Cancel  → router.push('/security/items')
           Release → navigates to /security/items/<id>/walk-in-release
           Edit    → toggles inline EDIT MODE (fields → inputs)
                       Save   → PATCH /api/items/:itemId (persists)
                       Cancel → discards edits, back to read mode
```

The effect uses an `active` flag in cleanup so a stale response from a previous
`itemId` can't overwrite state (race guard).

## 3. Files

### This feature

| File                                   | Responsibility                                                                                                                                                               |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/security/items/[itemId]/page.tsx` | Route. Fetches the item, branches loading / error / loaded, derives display values, renders fields + photo + actions. Has a `// NOTES FOR THE TEAM` block on the Finder gap. |

### Reused (shared lib)

| File                | Used for                                                                     |
| ------------------- | ---------------------------------------------------------------------------- |
| `lib/api/items.ts`  | `fetchSecurityItem(itemId)` — wraps `GET /api/items/:itemId`.                |
| `lib/api/client.ts` | `authFetch` (Bearer + token refresh on `TOKEN_EXPIRED`), `parseApiError`.    |
| `types/items.ts`    | `SecurityItemDetail` / `SecurityItemImage` / `ItemStatus` response types.    |
| `utils/auth.ts`     | (via client) `getAccessToken` / `getRefreshToken` / `setTokens` / `signOut`. |

### Backend (consumed, owned by backend team)

| File                          | What                                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| `backend/src/routes/items.ts` | `GET /items/:itemId` (`securityItemDetailSelect`, `toSecurityItemDetailDto`), role-gated. |

## 4. Field mapping (response → UI)

`GET /api/items/:itemId` returns `SecurityItemDetail`. What the page actually shows:

| UI label           | Source                                     | Notes                                                            |
| ------------------ | ------------------------------------------ | ---------------------------------------------------------------- |
| Item Name          | `title`                                    |                                                                  |
| Category           | `category`                                 |                                                                  |
| Date               | `dateFound`                                | `formatDate` → `en-CA` (YYYY-MM-DD); null → `—`.                 |
| Location           | `locationFound`                            | null → `—`.                                                      |
| Campus             | `campusName`                               |                                                                  |
| Description        | `descriptionPublic ?? descriptionInternal` | null → `—`. (No separate internal/public distinction in the UI.) |
| Is item picked up? | `status === 'claimed'` → `Yes` / `No`      | Crude proxy — see Gaps #2.                                       |
| Registrant         | `registeredBy.firstName + lastName`        | Empty → `—`.                                                     |
| Photo              | `images[0]?.imageUrl`                      | null → empty gray box; only the **first** image is shown.        |
| **Finder**         | not shown                                  | Not rendered; see Gaps #1.                                       |
| **Finder Contact** | not shown                                  | Not rendered; see Gaps #1.                                       |

**Returned but not displayed:** `color`, `brand`, `descriptionInternal` (when a
public one exists), `claims[]` (claimId / status / studentName), `campusId`,
`foundItemReportId`, `retentionExpiryDate`, `createdAt`, `updatedAt`, `status`
(used only to derive "picked up"), all images after the first.

## 5. Current status

**Working**

- Fetch + the three render states (loading spinner / error card / loaded detail).
- Race guard on `itemId` change (stale responses discarded).
- Auth handled by `authFetch`: Bearer header, silent refresh on `TOKEN_EXPIRED`, `signOut` on hard 401.
- Error card shows the backend message (or "Item not found.") + "Back to items".
- Cancel navigates back to `/security/items`.
- Responsive layout (fields beside photo on `lg`, stacked on mobile).

**Working (since earlier stub notes)**

- **Edit mode** — Save persists via `PATCH /api/items/:itemId`.
- **Release** — walks to `/security/items/<id>/walk-in-release` (`POST .../walk-in-release`).
- **Dispose** — `PATCH /api/items/:itemId/status` with `disposed` when allowed.

**Still stubbed / unused in UI**

- **Finder** / **Finder Contact** — not shown (API may return `finder`; page does not render it).

## 6. Known gaps / risks

1. **Finder name + contact have no data source.** `GET /api/items/:itemId` doesn't
   return them. The path would be `Item → foundItemReport → finder (User)`, but the
   report records the **submitter** as the finder
   (`backend/src/routes/reportLinks.ts` `finderId: req.user.user_id`), so "Finder"
   would just equal the registrant. There's also no contact column on
   `found_item_report` (closest is `user.phone`). **Decide the real source before
   wiring these up.** Same gap is mirrored in `app/report-found/[token]/page.tsx`.
2. **"Is item picked up?" is a proxy.** Derived from `status === 'claimed'`, not a
   real pickup/handover record. Won't reflect `expired`/`disposed` nuance.
3. **Only the first image is shown.** `images[]` may hold several; gallery/multi-image
   UI isn't built.
4. **`claims[]` is fetched but unused.** Claim status/claimant aren't surfaced even
   though they'd be the natural backing for release + "picked up".
5. **No client role guard.** Security relies entirely on the backend role check; a
   non-security user hitting the URL just sees an error from the API, not a redirect.

## 7. How to test

**Setup** (same as the rest of the app)

```bash
cd backend && pnpm install && npx prisma migrate dev && npx prisma db seed && pnpm dev
cd foundit-ui && pnpm install && pnpm dev   # .env: NEXT_PUBLIC_API_URL=http://localhost:3001
```

**Run**

1. Log in as a **security** user (seed: `carol@myseneca.ca` / `Test1234!`).
2. Open `/security/items`, click an item — or hit `/security/items/<itemId>` directly
   (grab a real `itemId` from the list response or `npx prisma studio` → `item`).

**Matrix**

| Case          | How                                    | Expect                                              |
| ------------- | -------------------------------------- | --------------------------------------------------- |
| Happy path    | open a valid item                      | spinner → detail with fields + photo                |
| Not found     | use a bogus (well-formed) id           | error card "Item not found." + Back button          |
| No image      | item with no `images`                  | empty gray placeholder box                          |
| Null fields   | item missing location/description/date | each shows `—`                                      |
| Picked up     | item with `status = claimed`           | "Is item picked up?" → Yes                          |
| Wrong role    | log in as a student                    | error card (backend 403), no detail                 |
| Not logged in | clear localStorage                     | `authFetch` throws "Not authenticated" → error card |
| Cancel        | click Cancel (read mode)               | navigates to `/security/items`                      |
| Enter edit    | click Edit                             | fields become inputs; buttons → Cancel / Save       |
| Save edit     | change a field, click Save             | read mode shows new value (this session only)       |
| Discard edit  | change a field, click Cancel (edit)    | reverts to original values, back to read mode       |

## 8. Future work

- **Backend:** decide the Finder identity/contact source (or drop both fields); add a
  Release endpoint (status transition + ID-verification + claim linkage); add an item
  update endpoint.
- **Frontend:** point Save at `PATCH /api/items/:itemId` once it exists (swap
  `handleSave`'s local `setItem` for a request + error handling); wire Release; surface `claims[]` and the
  remaining `images[]`; replace the `status === 'claimed'` pickup proxy with a real
  signal; consider a client-side role redirect for non-security users.
