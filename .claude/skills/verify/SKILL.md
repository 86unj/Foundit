---
name: verify
description: Build/launch/drive recipe for verifying Foundit changes end-to-end (backend API on :3001, Next.js UI on :3000, Playwright headless drive).
---

# Verifying Foundit end-to-end

## Launch

- Backend: `cd backend && npm run dev` (tsx watch, port 3001). Check
  `.env` `DATABASE_URL` first — the team dev DB is Neon; `npx prisma
  migrate deploy` if migrations are pending. **Port 3001 is often already
  held by an older dev server running stale code** — `ss -tlnp | grep 3001`,
  kill the old tsx tree, restart. A 404 on a route you just added is the
  telltale.
- Frontend: `cd foundit-ui && pnpm dev` (port 3000). Next dev compiles
  from disk, so an already-running instance serves your working tree.
- Health check: `curl localhost:3001/api/health` → `{"status":"ok","db":true}`.

## Dev accounts (prisma/seed.ts, all password `Test1234!`)

- `alice@myseneca.ca` — student, Newnham
- `bob@myseneca.ca` — student, Seneca@York (cross-campus probe)
- `carol@myseneca.ca` — security, Newnham
- `admin@myseneca.ca` — admin, Newnham (`Admin@1234`)

## Drive the API

Login: `POST /api/auth/login {email,password}` → `{accessToken}`; pass as
`Authorization: Bearer`. Useful flows: student `POST /api/claims`,
security `GET /api/notifications`, `PATCH /api/claims/:id/status`.
Note: claim status transitions are constrained (submitted → under_review
directly returns 409 INVALID_STATUS_TRANSITION — that's the business rule).

## Drive the UI (headless browser)

Playwright 1.61 + chromium live in `~/.cache/ms-playwright` but this WSL2
box lacks `libnspr4/libnss3/libasound2` and there's no sudo. Fix without
root: `apt-get download libnspr4 libnss3 libasound2t64`, `dpkg -x` each
into a dir, run node with
`LD_LIBRARY_PATH=<dir>/usr/lib/x86_64-linux-gnu`. Install the `playwright`
npm lib in a scratch dir. Login page fields: `#email`, `#password`,
`button[type=submit]`; wait for `/dashboard/` URL.

## Gotchas

- A flaky pre-existing hydration error (next-themes script vs emotion
  style order in the root layout) fires on some pages (e.g. security
  dashboard) on `main` too — don't attribute it to your change without
  a stash A/B check.
- `app/dev/page.tsx` fixtures break typecheck whenever types/claims.ts
  gains required fields — check main before blaming your diff.
