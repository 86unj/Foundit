# --- Non-secret, defaulted ---

variable "aws_profile" {
  description = "AWS CLI profile used to run this stack."
  type        = string
  default     = "foundit"
}

variable "aws_region" {
  description = "AWS region for the Lightsail instance and all Foundit infra."
  type        = string
  default     = "us-east-1"
}

variable "lightsail_bundle_id" {
  description = "Lightsail bundle (instance size). 2GB RAM is the recommended minimum: `next build` commonly needs 1GB+ and will OOM on the 1GB tier."
  type        = string
  default     = "small_3_0"
}

variable "lightsail_blueprint_id" {
  description = "Lightsail OS blueprint."
  type        = string
  default     = "ubuntu_22_04"
}

variable "frontend_domain" {
  description = "Subdomain serving the Next.js frontend."
  type        = string
  default     = "foundit.garychang1214.com"
}

variable "api_domain" {
  description = "Subdomain serving the Express backend."
  type        = string
  default     = "foundit-api.garychang1214.com"
}

variable "letsencrypt_email" {
  description = "Contact email for Let's Encrypt certificate registration."
  type        = string
  default     = "garychang1214@gmail.com"
}

variable "github_repo_ssh_url" {
  description = "SSH clone URL for the private Foundit repo."
  type        = string
  default     = "git@github.com:86unj/Foundit.git"
}

variable "cd_ssh_public_key" {
  description = "Public key for the dedicated GitHub Actions CD identity. Appended to ubuntu's authorized_keys so the deploy workflow can SSH in and run /opt/foundit/redeploy.sh. Not secret — only the matching private key (stored as a GitHub Actions secret, never here) grants access."
  type        = string
}

# --- Secrets: no defaults, must be supplied via terraform.tfvars (gitignored) ---

variable "cloudflare_api_token" {
  description = "Cloudflare API token with DNS edit permission on the garychang1214.com zone."
  type        = string
  sensitive   = true
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID for garychang1214.com."
  type        = string
  sensitive   = true
}

variable "github_deploy_key_private" {
  description = "Private key (PEM) for the read-only GitHub deploy key added to the Foundit repo."
  type        = string
  sensitive   = true
}

variable "database_url" {
  description = "Postgres connection string (Neon) for the backend."
  type        = string
  sensitive   = true
}

variable "jwt_access_secret" {
  description = "Backend JWT access token signing secret."
  type        = string
  sensitive   = true
}

variable "jwt_refresh_secret" {
  description = "Backend JWT refresh token signing secret."
  type        = string
  sensitive   = true
}

variable "r2_access_key_id" {
  description = "Cloudflare R2 access key ID."
  type        = string
  sensitive   = true
}

variable "r2_secret_access_key" {
  description = "Cloudflare R2 secret access key."
  type        = string
  sensitive   = true
}

variable "r2_endpoint" {
  description = "Cloudflare R2 S3-compatible endpoint URL."
  type        = string
  sensitive   = true
}

variable "r2_bucket" {
  description = "Cloudflare R2 bucket name."
  type        = string
  sensitive   = true
}

# --- Secrets: SMTP_USER/SMTP_PASS are NOT optional in practice — backend/src/lib/email.ts
# reads them eagerly via requireEnv() at module load time, and that module is imported
# transitively from index.ts (via routes/auth.ts), so a missing value crashes the whole
# backend on boot, not just email-sending requests. No default here on purpose. ---

variable "smtp_host" {
  description = "SMTP host for outbound email (e.g. smtp.gmail.com)."
  type        = string
  sensitive   = true
}

variable "smtp_port" {
  description = "SMTP port (e.g. 587)."
  type        = string
  default     = "587"
}

variable "smtp_user" {
  description = "SMTP username/login."
  type        = string
  sensitive   = true
}

variable "smtp_pass" {
  description = "SMTP password (for Gmail: an App Password, not your account password)."
  type        = string
  sensitive   = true
}

# --- Secrets: optional, backend already has a safe fallback for this one ---

variable "openrouter_api_key" {
  description = "Optional OpenRouter API key. Leave empty to fall back to local hash embeddings."
  type        = string
  sensitive   = true
  default     = ""
}

# --- Non-secret and optional. Not grouped with the R2 credentials above on
# purpose: this is a public hostname, not a secret. ---

variable "r2_public_base_url" {
  description = "Optional public base URL for the R2 bucket (an r2.dev domain or a custom domain, no trailing slash), e.g. https://images.garychang1214.com. When set, backend/src/utils/imageUrl.ts builds stable, cacheable image URLs from it. Leave empty to fall back to signing a per-image presigned GET URL, which still works but expires (R2_SIGNED_URL_TTL_SECONDS, default 24h) and cannot be cached."
  type        = string
  default     = ""
}
