# Report Found Item — Flow & Status

> Status doc for the **Report Found Item** feature. Reflects the implementation as
> of 2026-07-06. Safe to commit/share (unlike the local-only `plan.md` /
> `implementation.md`).

## 1. What it is

A token-keyed page where a logged-in **student** submits a found-item report.
Security generates a single-use report link (intended as a QR code); the student
opens that link, the page validates the token, and the student fills + submits the
form. The page is **not** reachable from the navbar — the token in the URL is the
only entry point.

Route: `app/report-found/[token]/page.tsx` → URL `/report-found/<token>`.

## 2. End-to-end flow

```
[security] POST /api/report-links  ──►  /security/qr shows QR + link
        │
        ▼  hand link/QR to finder (in person)
[student] open /report-found/<token>
        │
        ├─ not logged in ──► /login?redirect=/report-found/<token> ──► back to form
        │
        ▼  GET /api/report-links/:token/validate          (public, rate-limited 30/15min)
        │     → { valid, reason, campusId, expiresAt?, usedAt? }
        │       reason ∈ available | not_found | used | expired
        ├─ reason !== available ──► message card (used / expired / invalid)
        └─ reason === available  ──► render the form
        │
        ▼  (optional) pick images
        │     ImageUploadGallery → POST /api/uploads/presigned-url (Bearer)
        │     → browser PUTs the file straight to Cloudflare R2
        │
        ▼  Submit
        │     POST /api/report-links/:token/submit          (Bearer + student role, 10/15min)
        │     body { title, description, category, locationFound, dateFound, images[] }
        │     → 201: creates FoundItemReport + Item (finderId = caller), links any
        │       uploaded images to the Item via ItemImage, consumes the link
        │     → 4xx mapped to a friendly message (see status map)
        └─ on success → router.push('/report-found/submitted')
```

Backend rules enforced on submit:

- Caller must be authenticated with the **student** role (else 401/403).
- The caller's `campusId` must equal the **link's** campus (else 403).
- Link is **single-use** + expiring; a second submit races to **409**.
- The submitter is recorded as the **finder** (`finderId = req.user.user_id`).

## 3. Files

### New (this feature)

| File                                | Responsibility                                                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `app/report-found/[token]/page.tsx` | Route. Validates token, renders form + shell. Login link with return URL when not authenticated.                 |
| `app/security/qr/page.tsx`          | Security UI to generate report links via `POST /api/report-links`; shows QR + copyable link.                     |
| `lib/api/reportLinks.ts`            | `createReportLink()` — authenticated POST to backend.                                                            |
| `hooks/useReportFoundItemForm.ts`   | Form state, client validation (mirrors the backend schema), submit (real POST) + cancel, status→message mapping. |
| `components/FormTextInput.tsx`      | 2-column text input (label left, input right), error below.                                                      |
| `components/SelectInput.tsx`        | 2-column `NativeSelect` wrapper.                                                                                 |
| `components/TextAreaInput.tsx`      | 2-column textarea; `stacked` prop renders label-above (used by Description).                                     |
| `components/FieldError.tsx`         | Error row with warning icon (`LuCircleAlert`); reserves one line of height to prevent layout shift.              |
| `constants/categories.ts`           | `CATEGORIES` options for the Category select.                                                                    |

### Reused (teammates' code — not modified)

| File                                                                                        | Used for                                                             |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `components/ImageUploadGallery.tsx`                                                         | Image upload UI (uploads to R2 on select).                           |
| `hooks/useImageUploadGallery.ts`, `utils/handleImageUpload.ts`, `utils/imageCompression.ts` | Upload pipeline (presign → PUT) + compression.                       |
| `utils/auth.ts`                                                                             | `getAccessToken` (Bearer), `getLoggedInUser` (identity + role gate). |
| `hooks/useLoggedInDisplayName.ts`                                                           | Display name for Navbar + Finder/Registrant rows.                    |
| `components/Navbar.tsx`, `components/Footer.tsx`                                            | Page shell (student variant).                                        |
| `constants/campuses.ts` (`CAMPUSES`)                                                        | Campus select options (stub).                                        |

### Backend (consumed, owned by backend team)

| File                                    | What                                                     |
| --------------------------------------- | -------------------------------------------------------- |
| `backend/src/routes/reportLinks.ts`     | `POST /`, `GET /:token/validate`, `POST /:token/submit`. |
| `backend/src/validators/reportLinks.ts` | `submitFoundItemReportSchema`.                           |
| `backend/src/routes/uploads.ts`         | `POST /api/uploads/presigned-url` (R2 presign).          |
| `backend/src/lib/r2.ts`                 | R2 / S3 client.                                          |
| `backend/prisma/schema.prisma`          | `FoundItemReport`, `ReportLink` models.                  |

## 4. Field mapping (form → backend)

`submitFoundItemReportSchema` accepts: `title` (≤100), `description` (≤1000),
`category` (≤50), `locationFound` (≤100), `dateFound` (YYYY-MM-DD, not future),
`images[]` (≤10, each `{ imageUrl, fileType, fileSizeKb }`).
`timeFound` / `additionalNotes` are valid optional columns but **not exposed**
(the design omits them).

| Form field                      | Required | Sent as                | Notes                                                                                                                                |
| ------------------------------- | -------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Item Name                       | ✅       | `title`                | Route folds `title` + `description` into the report/item's internal description column server-side.                                  |
| Category                        | ✅       | `category`             | Free-text column; dropdown is a product choice (`constants/categories.ts`).                                                          |
| Date                            | ✅       | `dateFound`            | Native date input, `max=today`, not-future validated.                                                                                |
| Contact Information             | ✅       | — (**STUB**, not sent) | No report column (only `User.phone`, a profile field).                                                                               |
| Location                        | ✅       | `locationFound`        |                                                                                                                                      |
| Campus                          | ✅       | — (**STUB**, not sent) | `campusId` exists on `report_link`/`user`/`item` and is **derived + validated from the link** server-side; the picker is decorative. |
| Image                           | optional | `images[]`             | Uploaded to R2 on select; submitted keys are linked to the created `Item` via `ItemImage` in the same transaction.                   |
| Description                     | ✅       | `description`          |                                                                                                                                      |
| Finder / Registrant (read-only) | —        | —                      | Both fall back to the logged-in user; the link carries no separate identity.                                                         |

## 5. Current status

**Working**

- Token validation + all link states (loading / available / used / expired / not_found / network error).
- Full client validation matching the backend; required asterisks (black); errors render below each field with a warning icon and reserved space (no layout shift).
- 2-column layout (labels aligned at 180px); Image + Description are label-above full width.
- Real submit to `POST /api/report-links/:token/submit` with status→message mapping and success redirect.
- Student-role gate + "must be logged in" notice with **Log in** link (`?redirect=/report-found/<token>`).
- Security QR generation at `/security/qr` via `POST /api/report-links`.

**Stubbed (intentional, kept for now)**

- **Contact Information** and **Campus** — rendered + validated for design parity but **not sent** (no/derived backend column). Documented in code.
- **Finder / Registrant** rows — display the logged-in user (no real per-role source yet).

## 6. Known gaps / risks

1. ~~**Images never linked to the report**~~ — **Done**. Submit schema accepts `images[]`; the route creates `ItemImage` rows (`itemId`) in the same transaction as the report/item.
2. **No R2 cleanup** + the gallery's remove doesn't delete from R2 → orphans accumulate.
3. **Immediate upload is fragile** — access token lives **15 min** with no refresh; uploads 401 if the user lingers.
4. **R2 bucket has no CORS policy** for `http://localhost:3000` → browser PUT is blocked locally until a CORS policy is added.
5. ~~**No security-side link generation**~~ — **Done** (`POST /api/report-links` + `/security/qr`).
6. **Campus name unresolvable** — `validate().campusId` is a UUID, but `constants/campuses.ts` uses slug ids; needs a campuses lookup to display the link's actual campus.
7. ~~**Login has no return-URL**~~ — **Done** (`/login?redirect=…` + `sanitizeRedirect` in `useLoginForm`).

## 7. How to test

**Setup**

```bash
# backend (Postgres + .env with DB, JWT, R2 vars)
cd backend && pnpm install && npx prisma migrate dev && npx prisma db seed && pnpm dev
# frontend (.env already has NEXT_PUBLIC_API_URL=http://localhost:3001)
cd foundit-ui && pnpm install && pnpm dev
```

**Run**

1. Log in as `carol@myseneca.ca` / `Test1234!` (security), open `/security/qr`, click **Generate QR Code** — note the `/report-found/<token>` URL.
2. Open that link in incognito (or log out). Click **Log in**, sign in as `alice@myseneca.ca` / `Test1234!` — you should return to the form.
3. Fill required fields and submit — 201 → `/report-found/submitted`; link is consumed.

**Alternate (seeded link):** open `http://localhost:3000/report-found/dev-sample-token-abc123` as alice (reset `is_used` in Prisma Studio if already consumed).

**Matrix**
| Case | How | Expect |
|---|---|---|
| QR generation | security `/security/qr` → Generate | 201, QR + link, ~30 min expiry |
| Login redirect | open link logged out → Log in → alice | lands back on `/report-found/<token>` |
| Happy path | fill required fields, Submit | 201 → redirect to `/report-found/submitted`; new `found_item_report` row |
| Validation | submit empty | each required field shows "{Field} is a required field" + icon, no layout shift |
| Future date | pick a future date | "Date cannot be in the future" |
| Used / expired / invalid | reuse a consumed token / bad token | matching message card |
| Campus 403 | log in as `bob@myseneca.ca` (Seneca@York) | "cannot submit reports for this campus" |
| Not logged in | clear localStorage | "must be logged in" notice + 401 on submit |
| Wrong role | log in as security (`carol@myseneca.ca`) | "Only student accounts can submit…" |

**Caveats**

- Image upload needs (a) an R2 CORS policy for `localhost:3000` and (b) a fresh (non-expired) token. The rest of the form works without images.
- Re-testing the happy path needs the link reset: `cd backend && npx prisma studio` → `report_link` → set `is_used`=false, `used_at`=null — or create a new `report_link` row and use its token.

Seed reference: users `alice`/`bob` (students), `carol` (security), password `Test1234!`;
report link token `dev-sample-token-abc123` (Newnham, 7-day expiry).

## 8. Future work

- Backend: consider a contact column or drop the field; `GET /api/report-links` list for security; R2 lifecycle rule/cleanup for removed or orphaned images.
- Frontend: resolve campus name on report form; align stubs to reality (Campus read-only, drop Contact/Registrant).
- Infra: R2 CORS policy for dev origins; R2 lifecycle rule to reap orphaned `reports/` objects.
