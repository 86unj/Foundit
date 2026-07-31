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
CI/CD. Later code changes are deployed by SSHing in and running
`/opt/foundit/redeploy.sh` (installed by the boot script), not by
re-running Terraform.

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
  the domains behind Cloudflare's proxy (CDN/DDoS protection).
- `pm2 status` / `pm2 logs` on the instance to confirm both
  `foundit-backend` and `foundit-frontend` are running.
