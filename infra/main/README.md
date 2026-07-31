# Main infra stack

Provisions the box that actually runs Foundit in production: one Lightsail
instance (`small_3_0`, 2GB RAM, ~US$12/month) running the Next.js frontend
and Express backend under PM2, Nginx reverse-proxying two subdomains, TLS
via Let's Encrypt, DNS in Cloudflare. Depends on `../bootstrap` having
already created the state bucket and the manual `FounditGroup` IAM setup
(see `../bootstrap/README.md`) — `foundit-user`'s `FounditDeployPolicy`
already grants everything this stack needs (`lightsail:*` + state bucket
object access), so no further IAM changes are required.

This stack does **initial provisioning only** — `terraform apply` clones the
repo, builds both apps, and starts them once, on first boot. It is not
CI/CD. Later code changes are deployed by the `deploy` job in
`.github/workflows/ci.yml`, which SSHes in and runs `/opt/foundit/redeploy.sh`
on every push to `main`.

That file is a deliberately tiny shim: it pulls, then hands over to
`infra/deploy/redeploy.sh` in the repo, where the real deploy logic lives. So
deploy-logic changes ship with an ordinary push — **but the shim itself is
written by the boot script and only exists on a box provisioned after that
change landed.** See [Migrating an already-running instance](#migrating-an-already-running-instance).

## One-time manual prerequisites

1. **GitHub deploy key** (repo is private): generate a dedicated keypair —

   ```bash
   ssh-keygen -t ed25519 -f foundit-deploy-key -N ""
   ```

   Add `foundit-deploy-key.pub` to the `86unj/Foundit` repo under
   **Settings → Deploy keys → Add deploy key** (leave "Allow write access"
   unchecked — read-only). Put the contents of `foundit-deploy-key` (the
   private half) into `terraform.tfvars` as `github_deploy_key_private`.
   Don't reuse your personal SSH key for this.

2. **Cloudflare zone ID**: from the Cloudflare dashboard, Overview page for
   `garychang1214.com` → copy the Zone ID into `terraform.tfvars`.

3. **Cloudflare API token**: create a token scoped to `Zone.DNS: Edit` for
   just that zone, put it in `terraform.tfvars` as `cloudflare_api_token`.

4. **Real SMTP credentials.** `backend/src/lib/email.ts` requires
   `SMTP_USER`/`SMTP_PASS` eagerly — the backend process **crashes on boot**
   if they're missing, not just on email-sending requests — so these are
   not optional for a working deploy, unlike locally where Ethereal (fake
   SMTP) is the default. Simplest option: a Gmail account with 2FA enabled,
   then generate an [App
   Password](https://myaccount.google.com/apppasswords) — use
   `smtp_host = "smtp.gmail.com"`, `smtp_port = "587"`, `smtp_user` = the
   Gmail address, `smtp_pass` = the generated App Password (not your normal
   Gmail password). A dedicated transactional provider (Resend, Brevo,
   Mailgun, SES) is a better long-term choice for deliverability, but Gmail
   is fine to start with at this project's volume.

5. Copy `terraform.tfvars.example` to `terraform.tfvars` and fill in the
   rest (`DATABASE_URL`, JWT secrets, R2 credentials — same values as
   `backend/.env` in your local dev setup). This file is already covered by
   the repo's `.gitignore` (`*.tfvars`).

## Applying

```bash
cd infra/main
AWS_PROFILE=foundit terraform init
AWS_PROFILE=foundit terraform plan
AWS_PROFILE=foundit terraform apply
```

First boot takes several minutes (package installs, two builds, Prisma
migrate, certbot). If certbot fails because Cloudflare's DNS record hadn't
propagated yet, SSH in once `dig foundit.garychang1214.com` / `dig
foundit-api.garychang1214.com` resolve to the static IP and re-run the
`certbot --nginx ...` command shown near the end of
`templates/cloud-init.sh.tftpl` by hand.

## After a successful apply

- `terraform output frontend_url` / `api_url` — confirm both load over
  HTTPS.
- `terraform output -raw ssh_private_key_pem > foundit-app-key.pem && chmod
600 foundit-app-key.pem` — save the instance's SSH key locally to log in
  (`ssh -i foundit-app-key.pem root@$(terraform output -raw static_ip)`).
- Once TLS is confirmed working, you can flip `proxied = false` to `true`
  on the two `cloudflare_record` resources in `main.tf` and re-apply to put
  the domains behind Cloudflare's proxy (CDN/DDoS protection). **If you do,
  set `TRUST_PROXY_HOPS=2` in the backend `.env` and restart** — that adds a
  second proxy in front of Nginx, and leaving it at 1 makes every request
  look like it comes from the same address again, collapsing all rate
  limiters back into one shared bucket.
- `pm2 status` / `pm2 logs` on the instance to confirm both
  `foundit-backend` and `foundit-frontend` are running.

## Migrating an already-running instance

`templates/cloud-init.sh.tftpl` is **user_data — it runs once, on first boot,
and never again.** Editing it changes nothing on a box that is already up;
Terraform only re-runs it if the instance is replaced. Every change below
therefore has to be applied by hand, once, to the live instance. Until then
the corresponding fix is inert while CI still reports green.

SSH in as root (`ssh -i foundit-app-key.pem root@$(terraform output -raw static_ip)`)
and run:

1. **Replace the deploy script with the shim** — do this _after_ the change is
   merged to `main`, so the pull can find `infra/deploy/redeploy.sh`. Without
   it, every deploy keeps running the old inline logic: unpinned `pnpm install`,
   no `.env.production` rebuild, and both apps live during the frontend build.

   ```bash
   printf '#!/bin/bash\nset -eu\ncd /opt/foundit\ngit pull\nexec /opt/foundit/infra/deploy/redeploy.sh\n' > /opt/foundit/redeploy.sh
   chmod +x /opt/foundit/redeploy.sh
   ```

2. **Create the swap file** — the 2GB instance ships with none, and that is the
   usual reason a deploy gets OOM-killed during `next build`.

   ```bash
   fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
   grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
   ```

3. **Add the API proxy timeouts** to `/etc/nginx/sites-available/foundit`. Note
   certbot has rewritten this file into `listen 443 ssl` blocks since first
   boot, so add the three directives to the API server's `location /` by hand,
   then `nginx -t && systemctl reload nginx`:

   ```nginx
   proxy_connect_timeout 10s;
   proxy_send_timeout 180s;
   proxy_read_timeout 180s;
   ```

4. **Add the new backend env vars** to `/opt/foundit/backend/.env`, then
   `pm2 restart foundit-backend`. None are required — each has a working
   default — but see the sections below for what changes when they are set:
   `TRUST_PROXY_HOPS`, `R2_PUBLIC_BASE_URL`, `R2_SIGNED_URL_TTL_SECONDS`,
   `OPENROUTER_API_KEY`.

Verify with `pm2 status`, then push a trivial commit to `main` and watch the
workflow's "Verify backend is live" step go green.

## Semantic matching: API key and embedding backfill

Match suggestions rank almost entirely on semantic similarity (0.8 of the
hybrid score). Two things must be true in production or the feature looks
alive while returning nonsense:

1. **`OPENROUTER_API_KEY` must be set** in `/opt/foundit/backend/.env`. When it
   is absent the backend falls back to a meaningless local hash embedding. It
   is no longer silent — the boot log carries a `warn` saying semantic matching
   is degraded — so after restarting, confirm that warning is **not** present:

   ```bash
   pm2 logs foundit-backend --lines 50 | grep -i degraded
   ```

2. **Existing rows must be backfilled.** Items and claims created before the
   embedding column existed have none. A match request computes missing ones
   inline, but only up to `MATCH_INLINE_EMBEDDING_LIMIT` (default 25) per
   request; anything past the cap is scored with the fallback vector, which
   scores ~0 against a real embedding and therefore **cannot clear the match
   threshold at all** — those items silently never appear in suggestions. Prime
   them once:

   ```bash
   cd /opt/foundit/backend && pnpm backfill:embeddings
   ```

   Idempotent (only touches rows with no embedding), batched with progress
   output, and safe to interrupt and re-run.

## Image uploads: R2 bucket CORS (manual, Cloudflare dashboard)

Terraform does **not** manage the R2 bucket — R2 is already production-hosted
and deliberately out of scope for this stack. The bucket's CORS policy is a
manual Cloudflare console step and there is no way to do it from here.

It matters because uploads never touch the backend: the browser asks the API
for a presigned URL and then `PUT`s the file **directly to R2** from the page's
origin. That is a cross-origin request, so if the bucket's allowed origins are
still the local dev URL, every upload path on production fails — and it fails
_silently_ from the server's point of view: the error only appears in the
browser console, and the backend log stays completely clean.

In the Cloudflare dashboard: **R2 → the bucket → Settings → CORS Policy →
Edit**, and paste:

```json
[
  {
    "AllowedOrigins": ["https://foundit.garychang1214.com"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

- `PUT` is the upload itself; `GET` is there so images can also be fetched
  cross-origin (e.g. via `fetch`/canvas), not just rendered in an `<img>`.
- `Content-Type` is the only non-safelisted request header the browser sends:
  both `foundit-ui/utils/handleImageUpload.ts` and
  `foundit-ui/utils/uploadPhotoSessionImage.ts` do
  `fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': ... } })`.
  The `Authorization` header is **not** sent on the R2 request (auth is in the
  presigned query string), so it must not be listed here.
- Add every origin users can actually reach the site on — if you serve the
  apex or `www` host, they need their own entries in `AllowedOrigins`, exactly
  like `CORS_ORIGIN` below.

### Smoke-test all four upload paths after changing the policy

Browser devtools console must stay free of CORS errors in each case:

1. **Student report-found** — `/report-found/<token>`: attach a photo, submit,
   confirm the photo is visible afterwards.
2. **Security Report Found** — `/security/report-found`: attach a photo,
   submit, confirm it shows on the item detail page.
3. **Phone QR add-photos** — `/security/add-photos/<token>` (scan the QR on a
   phone): upload, confirm the photo lands on the right item.
4. **Profile avatar** — `/profile`: upload, confirm the nav bar avatar updates
   immediately.

(`/student/claim-item` uses the same presign + `PUT` path, so it is fixed by
the same policy; worth a quick check too.)

## Image URLs: `R2_PUBLIC_BASE_URL`

`backend/src/utils/imageUrl.ts` resolves stored object keys one of two ways:

- **`R2_PUBLIC_BASE_URL` set** — URLs are just `<base>/<key>`: stable across
  refreshes, cacheable by the browser and any CDN, and they never expire.
- **left empty** — the backend signs a temporary GET URL per image on every
  request. Works, but the URL changes on each response (no caching) and dies
  when the signature expires, so a tab left open long enough shows nothing but
  broken images.

Setting it is the preferred fix. To get a value: **R2 → the bucket →
Settings → Public access**, then either enable the managed `r2.dev` subdomain
(fine for a demo, rate-limited) or attach a custom domain such as
`images.garychang1214.com` (recommended). Copy the resulting origin — no
trailing slash — into `terraform.tfvars` as `r2_public_base_url`. Terraform
writes it into `/opt/foundit/backend/.env` at first boot; on an already-running
box, edit that file directly and `pm2 restart foundit-backend`.

If no public domain is available, the fallback is tuned instead of broken:
`R2_SIGNED_URL_TTL_SECONDS` controls the signature lifetime and now defaults to
86400 (24h, up from the old hard-coded 1h), capped at 604800 (7 days, the SigV4
maximum). Only the **GET/display** URLs use it — upload presigns stay
short-lived by design.

Be aware of what the fallback does **not** fix: a presigned URL is re-signed on
every response, so the image URL still changes on every page load and cannot be
cached by the browser or a CDN. Raising the TTL only stops an already-open page
from going to broken images. Stable, cacheable URLs require
`R2_PUBLIC_BASE_URL`; there is no way to get them from the fallback.

## Keep the domain / certificate / CORS triple in sync

Several separate lists decide which hostnames actually work, and a host missing
from any one of them breaks the site in a different way. Whenever a hostname is
added or removed, update every row below:

| Layer           | Where                                                       | Symptom if a host is missing                                    |
| --------------- | ----------------------------------------------------------- | --------------------------------------------------------------- |
| DNS             | `cloudflare_record` resources in `main.tf`                  | Host doesn't resolve at all                                     |
| TLS certificate | `certbot --nginx -d ...` in `templates/cloud-init.sh.tftpl` | Browser TLS warning / connection refused over HTTPS             |
| Backend CORS    | `CORS_ORIGIN` in the backend `.env`                         | Page loads, but every API call fails — site looks totally empty |
| R2 bucket CORS  | Cloudflare dashboard (see above)                            | Everything works except image uploads                           |
| CI health check | `Verify backend is live` in `.github/workflows/ci.yml`      | Deploys fail (or pass) against the wrong host                   |

`CORS_ORIGIN` is now a **comma-separated list** (a single value still behaves
exactly as before); parsing lives in `backend/src/utils/corsOrigins.ts`.
Unlisted origins are still rejected — it never reflects an arbitrary origin.

Current state: certbot only issues for `foundit.garychang1214.com` and
`foundit-api.garychang1214.com`, and Nginx only has `server_name` blocks for
those two. So the apex (`garychang1214.com`) and `www.` hosts are **not**
served today. If users are expected to reach the site on either of them, all of
the following must change together — adding them to `CORS_ORIGIN` alone is not
enough:

1. a Cloudflare DNS record for the extra host,
2. an Nginx `server_name` (or redirect) for it,
3. an extra `-d <host>` on the certbot invocation,
4. the host appended to `CORS_ORIGIN`,
5. the host added to the bucket's `AllowedOrigins` if uploads happen there.
