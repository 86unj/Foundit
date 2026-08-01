# Foundit Backend

Express + TypeScript + PostgreSQL

## Getting Started

### 1. Prerequisites

- Node.js 22+
- PostgreSQL running (start via `cd database && docker compose up -d` from project root)

### 2. Install dependencies

```bash
pnpm install
```

### 3. Set up environment variables

### Email

| Variable    | Description                                            |
| ----------- | ------------------------------------------------------ |
| `SMTP_HOST` | SMTP server host (e.g. `smtp.gmail.com`)               |
| `SMTP_PORT` | SMTP port (default: `587`)                             |
| `SMTP_USER` | SMTP sender email address                              |
| `SMTP_PASS` | SMTP password or app password                          |
| `APP_URL`   | Base URL of the backend (e.g. `http://localhost:3001`) |

https://myaccount.google.com/apppasswords

```bash
cp .env.example .env
```

Open `.env` and fill in the values (see [Environment Variables](#environment-variables) below).

### 4. Apply database migrations and seed

```bash
pnpm exec prisma migrate dev
pnpm exec prisma db seed
```

This creates all tables and inserts a default admin account (`admin@myseneca.ca` / `Admin@1234`).

### 5. Start the dev server

```bash
# Make sure you are inside the backend/ folder
pnpm run dev
```

Server runs at `http://localhost:3001`. Confirm it's up:

```bash
curl http://localhost:3001/api/health
# → { "status": "ok", "db": true }
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in each value.

### Server

| Variable      | Description                                                |
| ------------- | ---------------------------------------------------------- |
| `PORT`        | Port the server listens on (default: `3001`)               |
| `CORS_ORIGIN` | Allowed frontend origin (default: `http://localhost:3000`) |

### JWT

| Variable                   | Description                                                                      |
| -------------------------- | -------------------------------------------------------------------------------- |
| `JWT_ACCESS_SECRET`        | Secret used to sign access tokens — **required**, server won't start without it  |
| `JWT_REFRESH_SECRET`       | Secret used to sign refresh tokens — **required**, server won't start without it |
| `JWT_ACCESS_EXPIRES_IN`    | Access token lifetime (default: `15m`)                                           |
| `JWT_REFRESH_EXPIRES_IN`   | Refresh token lifetime (default: `7d`)                                           |
| `JWT_REFRESH_EXPIRES_DAYS` | Refresh token lifetime in days for DB expiry calculation (default: `7`)          |

**Why two JWT secrets?**
Access tokens and refresh tokens are signed with separate secrets so that if one is compromised, the other is unaffected. If they shared the same secret, a leaked refresh secret would let an attacker forge access tokens and bypass authentication entirely.

Set them to any long random string in local dev, e.g.:

```
JWT_ACCESS_SECRET=some-long-random-string-here
JWT_REFRESH_SECRET=another-different-random-string
```

### Semantic matching

| Variable                     | Description                                                |
| ---------------------------- | ---------------------------------------------------------- |
| `OPENROUTER_API_KEY`         | OpenRouter API key for embedding-based match search        |
| `OPENROUTER_EMBEDDING_MODEL` | Embedding model (default: `openai/text-embedding-3-small`) |

If unset, a local hash fallback is used (dev only). After deploy, backfill existing rows:

```bash
pnpm run backfill:embeddings
```

---

## Project Structure

```
src/
├── types/
│   └── express.d.ts           # req.user type declaration (campus_id is nullable)
├── middleware/
│   ├── authenticate.ts         # JWT verification — attaches req.user on success
│   ├── requireRole.ts          # Role-based access guard
│   └── errorHandler.ts         # Global Express error handler (Zod, JWT, generic)
├── validators/
│   ├── shared.ts               # validate() and validateQuery() middleware helpers
│   ├── auth.ts                 # Zod schemas: loginSchema, registerSchema, refreshSchema, logoutSchema
│   ├── claims.ts               # Zod schemas for claim routes
│   └── users.ts                # Zod schemas: replaceProfileSchema, updateProfileSchema, createUserSchema, listUsersQuerySchema
├── lib/
│   ├── email.ts                # Nodemailer transporter and email sender
│   └── matching/               # Semantic match ingest, embeddings, scoring
├── utils/
│   ├── token.ts                # JWT signing, refresh token verification, SHA-256 hash helper
│   ├── password.ts             # bcrypt hash and compare helpers
│   ├── auditLog.ts             # Audit log writer
|   ├── emailVerification.ts    # Token generation and expiry helpers
│   └── username.ts             # Unique username generator
├── jobs/
│   ├── cleanupUnverifiedUsers.ts  # Daily cron job to delete unverified accounts
│   └── expireRetainedItems.ts     # Daily cron: stored → expired when retention ends
├── routes/
│   ├── health.ts               # GET /api/health
│   ├── auth.ts                 # POST /api/auth/login|register (done) · refresh|logout (stub)
│   ├── claims.ts               # Claim lifecycle routes
│   ├── users.ts                # GET|PUT /api/users/me (done) · PATCH stubs
│   ├── notifications.ts        # GET list · PATCH read|unread|read-all (done)
│   └── admin/
│       └── users.ts            # Admin user management stubs
├── db.ts                       # Prisma client singleton
└── index.ts                    # Entry point, router registration, error handler
```

---

## API Endpoints

This section lists both implemented routes and planned backend API contracts. Current implementation status:

- **Done**: implemented route behavior.
- **Stub**: route exists and returns `501 NOT_IMPLEMENTED`.
- **Planned**: route is part of the backend API plan but has not been added to Express yet.

Global API rules:

- Responses use **camelCase** field names.
- Protected routes require `Authorization: Bearer <accessToken>`.
- Endpoints must return explicit DTOs/projections and must not return raw Prisma models directly.
- List endpoints should use cursor pagination: `{ data: [...], nextCursor: string | null }`, with max `limit = 50`.
- Errors should use `{ code: "ERROR_CODE", message: "Human-readable description." }`.

### Auth

| Method | Path                     | Auth | Status | Description                                                 |
| ------ | ------------------------ | ---- | ------ | ----------------------------------------------------------- |
| POST   | `/api/auth/register`     | —    | Done   | Self-register a student or security account                 |
| POST   | `/api/auth/login`        | —    | Done   | Verify email + password, return JWT access & refresh tokens |
| POST   | `/api/auth/refresh`      | —    | Done   | Exchange refresh token for a new access token               |
| POST   | `/api/auth/logout`       | —    | Stub   | Revoke refresh token                                        |
| GET    | `/api/auth/verify-email` | —    | Done   | Verify email address via token link                         |

### Campus

| Method | Path            | Auth | Status  | Description                                              |
| ------ | --------------- | ---- | ------- | -------------------------------------------------------- |
| GET    | `/api/campuses` | —    | Done    | List campuses for registration dropdowns and admin forms |

### User Profile

| Method | Path                          | Auth    | Status  | Description                                  |
| ------ | ----------------------------- | ------- | ------- | -------------------------------------------- |
| GET    | `/api/users/me`               | any     | Done    | Get current user's profile                   |
| PUT    | `/api/users/me`               | any     | Done    | Replace `firstName`, `lastName`, and `phone` |
| PATCH  | `/api/users/me/password`      | any     | Planned | Change password; requires `currentPassword`  |
| PATCH  | `/api/users/me/notifications` | student | Done    | Toggle email notification preference         |

### Admin

| Method | Path                       | Auth  | Status  | Description                                                                                                                                         |
| ------ | -------------------------- | ----- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/admin/users`         | admin | Stub    | List users with optional filters (role, isActive, campus)                                                                                           |
| POST   | `/api/admin/users`         | admin | Stub    | Create a new user account                                                                                                                           |
| PATCH  | `/api/admin/users/:userId` | admin | Planned | Update user fields — `body` accepts `isActive`, `campusId`, `role`; to activate send `{ isActive: true }`, to deactivate send `{ isActive: false }` |

### Claims

| Method | Path                                              | Auth                   | Status | Description                                              |
| ------ | ------------------------------------------------- | ---------------------- | ------ | -------------------------------------------------------- |
| POST   | `/api/claims`                                     | student                | Done   | Submit a lost item claim                                 |
| GET    | `/api/claims`                                     | student/security/admin | Done   | List claims; student sees own, security/admin can filter |
| GET    | `/api/claims/:claimId`                            | student/security/admin | Done   | Get claim detail with ownership/authorization checks     |
| PATCH  | `/api/claims/:claimId/status`                     | security/admin         | Done   | Approve/reject and transition claim status               |
| DELETE | `/api/claims/:claimId`                            | student                | Done   | Cancel/delete own cancellable claim with audit logging   |
| PATCH  | `/api/claims/:claimId`                            | security/admin         | Done   | Link a stored item to the claim (`itemId` only)          |
| GET    | `/api/claims/:claimId/match-suggestions`          | security/admin         | Done   | Retrieve match suggestions for a claim                   |
| POST   | `/api/claims/:claimId/match-suggestions`          | security/admin         | Done   | Run semantic match scoring and upsert suggestions        |
| PATCH  | `/api/claims/:claimId/match-suggestions/:matchId` | security/admin         | Done   | Confirm or dismiss a match suggestion                    |

Match suggestions use precomputed `searchText` / `embedding` on claims and stored items (built on create/update). `POST` compares embeddings with hybrid re-ranking (category, date, campus, location). Security still confirms matches manually.

Claim cancellation uses `DELETE /api/claims/:claimId` because the original database `claim_status` enum does not include `withdrawn`.

Claim approval requires a linked stored item and updates that item to `claimed` in the same transaction as the claim status update. Rejection requires `rejectionReason`, leaves the linked item status unchanged, and returns the updated claim detail response with the current nested item status.

### Report Links & Found Item Reports

| Method | Path                                       | Auth           | Status  | Description                                                         |
| ------ | ------------------------------------------ | -------------- | ------- | ------------------------------------------------------------------- |
| POST   | `/api/report-links`                        | security/admin | Done    | Generate a one-time QR report link token                            |
| GET    | `/api/report-links`                        | security/admin | Planned | List report links generated for relevant campus scope               |
| GET    | `/api/report-links/:token/validate`        | —              | Done    | Validate a token and return availability status                     |
| POST   | `/api/report-links/:token/submit`          | student        | Done    | Submit a found item report and atomically consume token             |
| GET    | `/api/found-item-reports`                  | security/admin | Planned | List found item reports                                             |
| GET    | `/api/found-item-reports/:reportId`        | security/admin | Planned | Get found item report detail                                        |
| PATCH  | `/api/found-item-reports/:reportId/status` | security/admin | Planned | Transition report status (`submitted → processed → linked_to_item`) |

Report link tokens stay in the URL to match the current database model, but must be treated as one-time secrets: high entropy, rate-limited validation/submission, `Cache-Control: no-store`, redacted logs, and atomic consume on submit.

### Campuses

| Method | Path            | Auth | Status | Description               |
| ------ | --------------- | ---- | ------ | ------------------------- |
| GET    | `/api/campuses` | —    | Done   | List campuses for filters |

### Items

| Method | Path                        | Auth           | Status  | Description                                              |
| ------ | --------------------------- | -------------- | ------- | -------------------------------------------------------- |
| GET    | `/api/public/items`         | —              | Done    | Browse public-safe stored items with optional filters    |
| GET    | `/api/items/category-stats` | —              | Done    | Public item counts per category                          |
| GET    | `/api/items`                | security/admin | Done    | List items with filters and cursor pagination            |
| GET    | `/api/items/:itemId`        | security/admin | Done    | Get item detail (internal fields, images, linked claims) |
| POST   | `/api/items/batch`          | security/admin | Planned | Batch status update for items                            |
| POST   | `/api/items`                | security/admin | Done    | Register a found item into inventory                     |
| PATCH  | `/api/items/:itemId`        | security/admin | Done    | Update item fields; does not modify status               |
| DELETE | `/api/items/:itemId`        | admin          | Planned | Permanently delete only erroneous records with audit log |
| PATCH  | `/api/items/:itemId/status` | security/admin | Done    | Transition item lifecycle status                         |
| POST   | `/api/items/:itemId/walk-in-release` | security/admin | Done | Release item to student without a prior claim            |

**`GET /api/items` response:**

```json
{
  "data": [
    {
      "itemId": "uuid",
      "campusId": "uuid",
      "campusName": "Newnham",
      "category": "Electronics",
      "title": "Phone",
      "dateFound": "2026-01-20T00:00:00.000Z",
      "status": "stored",
      "retentionExpiryDate": "2026-02-19T00:00:00.000Z",
      "imageUrl": "https://..."
    }
  ],
  "nextCursor": "uuid-or-null"
}
```

**`GET /api/items/:itemId` response:** list fields plus `descriptionPublic`, `descriptionInternal`, `color`, `brand`, `locationFound`, `foundItemReportId`, `createdAt`, `updatedAt`, `images[]`, `registeredBy`, and `claims[]` (summary with `claimId`, `status`, `studentName`).

Normal item disposal should use `PATCH /api/items/:itemId/status` with `disposed`; `DELETE /api/items/:itemId` is reserved for admin correction of erroneous records.

**`PATCH /api/items/:itemId/status` request:**

```json
{ "status": "expired", "note": "Retention period ended" }
```

Allowed targets: `expired`, `disposed`. Transitions: `stored → expired|disposed`, `expired → disposed`. Blocked when item is `claimed` or `disposed`. Returns updated item detail; rejects active linked claims in the same transaction.

A daily cron job (`expireRetainedItems`) also transitions `stored → expired` when `retentionExpiryDate` has passed, with a defensive skip for stored items that already have an approved claim. Security should use `disposed` to record physical disposal after expiry.

### Notifications

| Method | Path                                        | Auth | Status | Description                                                                             |
| ------ | ------------------------------------------- | ---- | ------ | --------------------------------------------------------------------------------------- |
| GET    | `/api/notifications`                        | any  | Done   | Current user's notifications (newest first) + `unreadCount`; `?unreadOnly=true` filters |
| PATCH  | `/api/notifications/:notificationId/read`   | any  | Done   | Mark one of the caller's notifications read (404 if not owned)                          |
| PATCH  | `/api/notifications/:notificationId/unread` | any  | Done   | Mark one of the caller's notifications unread (404 if not owned)                        |
| PATCH  | `/api/notifications/read-all`               | any  | Done   | Mark all of the caller's notifications read; returns `updatedCount`                     |

Notifications are per-recipient rows, always scoped to the caller's JWT. They are
created transactionally by: claim submission and cancellation (fan-out to active
security/admin at the claim's campus), claim status changes and match approval
(to the student), the retention cron (auto-reject notices + per-campus
`item_expiring`), and found-item report submission (`report_confirmation` to the
finder). The unread-count "stats" endpoint from the original plan was folded into
`GET /api/notifications` as `unreadCount`. Student claim emails also send when
both `emailNotificationOptIn` and claim `notificationPreference === 'email'` are set.

### Audit Logs

Backend mutations and authentication outcomes use the append-only semantic audit contract documented in [`docs/audit-events.md`](docs/audit-events.md). Request events carry a server-generated correlation ID; scheduled jobs carry a per-run ID. Required audit rows commit with their database mutation, while denials and external delivery/authorization outcomes use sanitized best-effort persistence.

| Method | Path                     | Auth           | Status  | Description                   |
| ------ | ------------------------ | -------------- | ------- | ----------------------------- |
| GET    | `/api/audit-logs`        | security/admin | Planned | Query audit logs with filters |
| GET    | `/api/audit-logs/export` | admin          | Planned | Export audit logs as CSV      |

Audit log campus scoping must either use a denormalized `campusId` in a future schema change or define per-entity scope-resolution rules without changing the existing database.

### System

| Method | Path          | Auth | Status | Description           |
| ------ | ------------- | ---- | ------ | --------------------- |
| GET    | `/api/health` | —    | Done   | DB connectivity check |

---

## Notes

- All responses use **camelCase** field names (e.g. `userId`, `firstName`, `campusId`)
- `campus_id` in JWT payload is `string | null` — users who self-register without selecting a campus will have `null` until assigned by an admin
- Stub routes return `501 NOT_IMPLEMENTED` until implemented
- Login is rate-limited to 10 attempts per IP per 15 minutes
- Registration is planned to be rate-limited to 10 requests per IP per 15 minutes
- Security users are allowed by project design to self-register and view cross-campus operational records where the endpoint documents that behavior
