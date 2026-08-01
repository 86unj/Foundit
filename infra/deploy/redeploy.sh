#!/bin/bash
# Production redeploy logic for the Lightsail box.
#
# This is the real deploy script. It is invoked as root by the thin shim at
# /opt/foundit/redeploy.sh (written once by cloud-init), which is also what
# the GitHub Actions deploy job runs over SSH. The shim does the `git pull`
# and then execs this file, so this script always runs the version that was
# just pulled — meaning deploy-logic changes ship with a normal push instead
# of an SSH session. Keep it that way: never move logic back into the shim.
#
# Deploys whatever is currently checked out in /opt/foundit; updating the
# checkout is the caller's job.
set -eux

APP_DIR=/opt/foundit
BACKEND_ENV="$APP_DIR/backend/.env"

# The frontend env file is gitignored and, before this script existed, was
# only ever written at first boot — if it went missing the build silently
# produced a bundle with no API URL. Rebuild it every deploy from APP_URL in
# the backend env, which is exactly the API base URL. The pipeline keeps the
# exit status at 0 even when there is no match, so the emptiness check below
# is what reports the failure.
API_URL="$(grep -E '^APP_URL=' "$BACKEND_ENV" | tail -n 1 | cut -d '=' -f 2-)"
if [ -z "$API_URL" ]; then
  echo "FATAL: APP_URL is not set in $BACKEND_ENV; cannot build the frontend" >&2
  exit 1
fi

# --- Backend ---
# --frozen-lockfile matches CI: the server must install the exact dependency
# versions that were verified, never resolve fresher ones on its own.
cd "$APP_DIR/backend"
pnpm install --frozen-lockfile
pnpm exec prisma generate
pnpm exec prisma migrate deploy
pnpm build
pm2 restart foundit-backend

# --- Frontend ---
cd "$APP_DIR/foundit-ui"
cat > .env.production <<EOF
NEXT_PUBLIC_API_URL=$API_URL
EOF
pnpm install --frozen-lockfile

# The box has 2GB of RAM, and `next build` running alongside a live
# `next start` is the usual reason a deploy gets OOM-killed. Stop the
# frontend for the duration of the build, and bring it back up on any exit
# path rather than leaving the site dark; set -e still fails the deploy so
# CI goes red. INT/TERM/HUP as well as EXIT, so an SSH drop or a cancelled
# workflow does not strand the frontend in a stopped state.
#
# Caveat: `next build` writes in place, so a build killed midway leaves .next
# inconsistent and the restored process may serve errors until the next
# successful deploy. That is still preferable to no process at all, and the
# red CI health check is what tells you it happened.
trap 'pm2 start foundit-frontend || true' EXIT INT TERM HUP
pm2 stop foundit-frontend
pnpm build
pm2 restart foundit-frontend
trap - EXIT INT TERM HUP
