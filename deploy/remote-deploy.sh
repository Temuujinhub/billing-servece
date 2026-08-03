#!/usr/bin/env bash
# =============================================================================
# billingservice.mn — remote deploy script (runs ON the DigitalOcean droplet).
#
# Invoked by the GitHub Actions deploy workflow after the repository has been
# rsynced to /opt/billingservice. Idempotent and safe to run on every deploy.
#
# It will, in order:
#   1. Create a swapfile on small droplets so the build doesn't OOM.
#   2. Install Docker Engine + Compose plugin if missing.
#   3. Pause the hotel PMS stack if it is running (frees ports 80/443).
#      Its database volumes are NOT touched, so it can be resumed later with:
#        cd /opt/cloud-pms && docker compose -f docker-compose.prod.yml up -d
#   4. Generate a strong .env with random secrets on the FIRST deploy only,
#      then reuse it (so secrets stay stable across deploys).
#   5. Build and (re)start the whole stack behind the Caddy reverse proxy.
#   6. Smoke-test the API through the proxy.
# =============================================================================
set -euo pipefail

APP_DIR="/opt/billingservice"
COMPOSE_FILE="docker-compose.prod.yml"
PUBLIC_URL="${PUBLIC_URL:-https://billing.mastrsys.com}"
HOTEL_PMS_DIR="/opt/cloud-pms"

cd "$APP_DIR"

log() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }

# --- 1. Ensure some swap so building Next.js/Nest won't OOM on a small droplet
if [ "$(awk '/SwapTotal/{print $2}' /proc/meminfo)" = "0" ]; then
  MEM_KB=$(awk '/MemTotal/{print $2}' /proc/meminfo)
  if [ "${MEM_KB:-0}" -lt 2097152 ]; then
    log "Low memory and no swap detected — creating a 2G swapfile"
    fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
fi

# --- 2. Ensure Docker + Compose plugin are installed and running
if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker Engine"
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker >/dev/null 2>&1 || true
if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: Docker Compose plugin is not available on this host." >&2
  exit 1
fi

# --- 3. Pause the hotel PMS stack (temporary, per project decision 2026-08).
#        `down` without -v keeps every volume (Postgres data) intact.
if [ -d "$HOTEL_PMS_DIR" ]; then
  log "Pausing hotel PMS stack (data volumes are preserved)"
  (cd "$HOTEL_PMS_DIR" && docker compose -f docker-compose.prod.yml down --remove-orphans) || true
fi

# --- 4. Generate .env with strong secrets on first deploy; reuse it afterwards
FIRST_RUN=0
if [ ! -f .env ]; then
  log "First deploy — generating .env with random production secrets"
  FIRST_RUN=1
  umask 077
  cat > .env <<EOF
# billingservice.mn production secrets — generated $(date -u +%FT%TZ). Keep private.
POSTGRES_USER=billing
POSTGRES_PASSWORD=$(openssl rand -hex 24)
POSTGRES_DB=billingservice
JWT_ACCESS_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
JWT_ACCESS_TTL=900
JWT_REFRESH_TTL=604800
ENCRYPTION_KEY=$(openssl rand -hex 32)
WEBHOOK_SIGNING_SECRET=$(openssl rand -hex 32)
PUBLIC_URL=${PUBLIC_URL}
# Web is served same-origin through Caddy, so the API base stays relative.
NEXT_PUBLIC_API_URL=
CORS_ORIGINS=${PUBLIC_URL}
# Mock providers + demo data until real QPay/eBarimt/SMS contracts are signed.
PAYMENT_SANDBOX=true
SEED_ON_START=true

# --- Real provider switch (fill in and set the *_PROVIDER values) ----------
# PAYMENT_PROVIDER=qpay
# QPAY_BASE_URL=https://merchant.qpay.mn
# QPAY_USERNAME=...
# QPAY_PASSWORD=...
# QPAY_INVOICE_CODE=...
# SMS_PROVIDER=callpro
# CALLPRO_API_KEY=...
# CALLPRO_FROM=72225700
PAYMENT_PROVIDER=qpay_mock
SMS_PROVIDER=mock
EOF
fi

# --- 5. Build and (re)start the stack
log "Building and starting containers"
docker compose -f "$COMPOSE_FILE" --env-file .env up -d --build --remove-orphans

# --- 6. After a successful first run, stop re-seeding on later deploys
if [ "$FIRST_RUN" = "1" ]; then
  sed -i 's/^SEED_ON_START=true/SEED_ON_START=false/' .env
fi

# --- 7. Tidy up dangling images (keeps the small droplet disk healthy)
docker image prune -f >/dev/null 2>&1 || true

log "Container status"
docker compose -f "$COMPOSE_FILE" ps

# --- 8. Smoke test: API container first, then end-to-end through Caddy/TLS
log "Waiting for the API to report healthy…"
API_OK=0
for i in $(seq 1 40); do
  if docker compose -f "$COMPOSE_FILE" exec -T api wget -qO- http://127.0.0.1:4000/health/live >/dev/null 2>&1; then
    API_OK=1
    echo "✅ API container healthy."
    break
  fi
  sleep 3
done
if [ "$API_OK" != "1" ]; then
  echo "⚠ API did not report healthy within the timeout."
  echo "  Check logs with: docker compose -f $COMPOSE_FILE logs --tail=100 api"
fi

# -k because the very first run may still be provisioning the Let's Encrypt cert.
if curl -fsSk --resolve billing.mastrsys.com:443:127.0.0.1 \
    "https://billing.mastrsys.com/health/live" >/dev/null 2>&1; then
  echo "✅ Reachable end-to-end through Caddy (HTTPS)."
else
  echo "ℹ Proxy/TLS check not green yet — certificate provisioning can take a minute."
fi

# --- 9. Provider connectivity checks (status codes only — never secrets)
set +u
# shellcheck disable=SC1091
. ./.env 2>/dev/null || true
set -u
if [ "${PAYMENT_PROVIDER:-qpay_mock}" = "qpay" ] && [ -n "${QPAY_USERNAME:-}" ]; then
  QPAY_CODE=$(curl -s -o /dev/null -w '%{http_code}' -m 15 -X POST \
    -u "${QPAY_USERNAME}:${QPAY_PASSWORD}" "${QPAY_BASE_URL:-https://merchant.qpay.mn}/v2/auth/token" || echo "ERR")
  if [ "$QPAY_CODE" = "200" ]; then
    echo "✅ QPay auth OK (HTTP $QPAY_CODE)"
  else
    echo "⚠ QPay auth check returned HTTP $QPAY_CODE — шалгана уу (credential/whitelist)."
  fi
fi
if [ "${SMS_PROVIDER:-mock}" = "callpro" ] && [ -n "${CALLPRO_API_KEY:-}" ]; then
  SMS_CODE=$(curl -s -o /dev/null -w '%{http_code}' -m 15 \
    -H "x-api-key: ${CALLPRO_API_KEY}" \
    "${CALLPRO_BASE_URL:-https://api-text.callpro.mn/v1/sms}/tenant-daily-message-count?operator=unitel" || echo "ERR")
  if [ "$SMS_CODE" = "200" ]; then
    echo "✅ CallPro SMS API OK (HTTP $SMS_CODE)"
  else
    echo "⚠ CallPro check returned HTTP $SMS_CODE — API key-г шалгана уу."
  fi
fi

log "Deploy complete → ${PUBLIC_URL}"
