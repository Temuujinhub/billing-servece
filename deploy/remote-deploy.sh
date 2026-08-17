#!/usr/bin/env bash
# =============================================================================
# Message Billing Service (msgbill.mn) — remote deploy script (runs ON the server).
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
#      then reuse it (so secrets stay stable across deploys). Existing .env
#      files are migrated in place to the current public/short domains.
#   5. Build and (re)start the whole stack behind the Caddy reverse proxy.
#   6. Smoke-test the API through the proxy.
# =============================================================================
set -euo pipefail

APP_DIR="/opt/billingservice"
COMPOSE_FILE="docker-compose.prod.yml"
PUBLIC_URL="${PUBLIC_URL:-https://msgbill.mn}"
# SMS-д явах төлбөрийн линкийн (богино) домэйн — Caddy дээр /p/* үйлчилдэг.
SHORT_URL_BASE="${SHORT_URL_BASE:-https://bil.mn}"
HOTEL_PMS_DIR="/opt/cloud-pms"

cd "$APP_DIR"

log() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }

# Deploy provenance: the workflow passes DEPLOY_SHA=$GITHUB_SHA; persist it so
# manual re-runs keep the last known SHA. /health/live serves it back, and the
# workflow FAILS the deploy when the live SHA doesn't match the pushed commit.
if [ -n "${DEPLOY_SHA:-}" ]; then
  echo "$DEPLOY_SHA" > .deploy-sha
else
  DEPLOY_SHA=$(cat .deploy-sha 2>/dev/null || echo '')
fi
export DEPLOY_SHA

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
# msgbill.mn production secrets — generated $(date -u +%FT%TZ). Keep private.
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
# SMS-ийн төлбөрийн линк энэ богино домэйнээр явна (Caddy /p/* -ийг үйлчилнэ).
SHORT_URL_BASE=${SHORT_URL_BASE}
# Web is served same-origin through Caddy, so the API base stays relative.
NEXT_PUBLIC_API_URL=
CORS_ORIGINS=${PUBLIC_URL},${SHORT_URL_BASE}
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

# --- 4b. Domain migration for an EXISTING .env (2026-08: billing.mastrsys.com →
#         msgbill.mn + bil.mn). .env deploy хооронд хадгалагдах тул домэйн
#         сольсныг энд тусгахгүй бол сервер хуучин хаягаараа линк үүсгэсээр
#         байна. Idempotent: аль хэдийн шинэ бол юу ч өөрчлөгдөхгүй.
if [ "$FIRST_RUN" != "1" ] && [ -f .env ]; then
  ENV_CHANGED=0
  if grep -q 'billing\.mastrsys\.com' .env; then
    cp -a .env ".env.bak-$(date -u +%Y%m%dT%H%M%SZ)"
    sed -i 's#https\{0,1\}://billing\.mastrsys\.com#https://msgbill.mn#g' .env
    ENV_CHANGED=1
    log "Migrated .env domain: billing.mastrsys.com → msgbill.mn (backup kept)"
  fi
  if ! grep -q '^SHORT_URL_BASE=' .env; then
    printf '\n# SMS-ийн төлбөрийн линкийн богино домэйн (Caddy /p/* үйлчилнэ).\nSHORT_URL_BASE=%s\n' "$SHORT_URL_BASE" >> .env
    ENV_CHANGED=1
    log "Added SHORT_URL_BASE=${SHORT_URL_BASE} to .env"
  fi
  # CORS: богино домэйнээс нээгдсэн төлбөрийн хуудас ижил origin-оор API-д
  # хандах ч, хөтөч redirect/embed үед хоёр домэйн хоёулаа зөвшөөрөгдсөн байх.
  CUR_CORS=$(sed -n 's/^CORS_ORIGINS=//p' .env | tail -1 | tr -d '\r"')
  case ",$CUR_CORS," in
    *",$SHORT_URL_BASE,"*) ;;
    *)
      if [ -n "$CUR_CORS" ]; then
        sed -i "s#^CORS_ORIGINS=.*#CORS_ORIGINS=${CUR_CORS},${SHORT_URL_BASE}#" .env
      else
        printf 'CORS_ORIGINS=%s,%s\n' "$PUBLIC_URL" "$SHORT_URL_BASE" >> .env
      fi
      ENV_CHANGED=1
      log "Added ${SHORT_URL_BASE} to CORS_ORIGINS"
      ;;
  esac
  if [ "$ENV_CHANGED" = "1" ]; then
    log ".env шинэ домэйнд тохирууллаа"
  fi
fi

# --- 5. Build and (re)start the stack
log "Building and starting containers"
# Prefer CI-built images (docker load) — an on-droplet build starves the live
# API/Postgres on a small droplet and causes 5xx during every deploy.
UP_FLAGS="--build"
if [ -f images.tar.gz ]; then
  log "Loading prebuilt images from CI (no on-droplet build)"
  gunzip -c images.tar.gz | docker load
  rm -f images.tar.gz
  UP_FLAGS="--no-build"
fi
docker compose -f "$COMPOSE_FILE" --env-file .env up -d $UP_FLAGS --remove-orphans

# --- 5b. Caddy тохиргоог ЗААВАЛ дахин ачаалах. Caddyfile нь bind-mount тул
#         `up -d` нь агуулга нь өөрчлөгдсөнийг мэдэхгүй, caddy контейнерийг
#         хөндөхгүй орхидог — 2026-08-17-нд домэйн сольсон Caddyfile сервер
#         дээр очсон ч caddy 9 хоногийн өмнөх тохиргоогоороо үйлчилсээр л
#         байсан. `caddy reload` нь graceful (нэг ч хүсэлт тасрахгүй);
#         бүтэлгүйтвэл restart-аар (1-2 сек тасалдал) нөхнө.
log "Reloading Caddy config"
if docker compose -f "$COMPOSE_FILE" exec -T caddy caddy reload --config /etc/caddy/Caddyfile 2>&1; then
  echo "✅ Caddy config reloaded."
else
  echo "⚠ caddy reload амжилтгүй (хуучин image дээр admin off байж магадгүй) — restart хийж байна."
  docker compose -f "$COMPOSE_FILE" restart caddy
fi

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
  echo "❌ API did not report healthy within the timeout. Container logs:"
  echo "----------------------------------------------------------------"
  docker compose -f "$COMPOSE_FILE" logs --tail=120 api || true
  echo "----------------------------------------------------------------"
  # Fail the deploy visibly — a dead API must never look like a green deploy.
  exit 1
fi

# -k because the very first run may still be provisioning the Let's Encrypt cert.
# --resolve: DNS сервер рүү заасан эсэхээс үл хамааран ЯГ энэ хостыг шалгана.
PUBLIC_HOST=$(printf '%s' "$PUBLIC_URL" | sed -e 's#^https\{0,1\}://##' -e 's#/.*$##')
SHORT_HOST=$(printf '%s' "$SHORT_URL_BASE" | sed -e 's#^https\{0,1\}://##' -e 's#/.*$##')
for HOST in "$PUBLIC_HOST" "$SHORT_HOST"; do
  [ -n "$HOST" ] || continue
  if curl -fsSk --resolve "$HOST:443:127.0.0.1" "https://$HOST/health/live" >/dev/null 2>&1; then
    echo "✅ $HOST reachable end-to-end through Caddy (HTTPS)."
  else
    echo "ℹ $HOST proxy/TLS check not green yet — certificate provisioning can take a minute."
  fi
done
# Богино домэйн нь төлбөрийн хуудсыг ҮНЭХЭЭР үйлчилж байгаа эсэх (redirect биш):
# буруу токен ч 200/404 буцаана, харин 502 бол web контейнер рүү заагаагүй гэсэн үг.
if [ -n "$SHORT_HOST" ]; then
  SHORT_CODE=$(curl -s -o /dev/null -w '%{http_code}' -k --resolve "$SHORT_HOST:443:127.0.0.1" \
    "https://$SHORT_HOST/p/HEALTHCHK" || echo ERR)
  case "$SHORT_CODE" in
    2*|3*|4*) echo "✅ $SHORT_HOST/p/* төлбөрийн хуудсыг үйлчилж байна (HTTP $SHORT_CODE)." ;;
    *) echo "⚠ $SHORT_HOST/p/* HTTP $SHORT_CODE — Caddyfile-ийн bil.mn блокыг шалгана уу." ;;
  esac
fi

# --- 8b. Diagnostics: migration state + recent API errors (no secrets in either)
log "Migration status"
docker compose -f "$COMPOSE_FILE" exec -T api npx prisma migrate status || true
log "Recent API error log"
docker compose -f "$COMPOSE_FILE" logs --no-color --tail=500 api 2>/dev/null | grep -B2 -A14 "ERROR \[" | tail -100 || echo "(no errors in recent log)"

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
  # /docs is the gateway's own API reference — 200 proves the base URL routes.
  SMS_CODE=$(curl -s -o /dev/null -w '%{http_code}' -m 15 \
    "${CALLPRO_BASE_URL:-https://api-text.callpro.mn/v1/sms}/docs" || echo "ERR")
  if [ "$SMS_CODE" = "200" ]; then
    echo "✅ CallPro SMS API OK (HTTP $SMS_CODE)"
  else
    echo "⚠ CallPro check returned HTTP $SMS_CODE — CALLPRO_BASE_URL-ээ шалгана уу."
  fi
fi
# eBarimt POS API instance (vat.onlime.mn) — vars read straight from .env via
# sed (NOT shell sourcing: a user-edited line can abort `source` midway and
# silently skip this check, which is exactly what happened on 2026-08-10).
EB_PROVIDER=$(sed -n 's/^EBARIMT_PROVIDER=//p' .env | tail -1 | tr -d '\r"' || true)
EB_VAT_URL=$(sed -n 's/^VAT_BASE_URL=//p' .env | tail -1 | tr -d '\r"' || true)
EB_TIN=$(sed -n 's/^EBARIMT_MERCHANT_TIN=//p' .env | tail -1 | tr -d '\r"' || true)
if [ "${EB_PROVIDER:-mock}" = "posapi" ] && [ -n "$EB_VAT_URL" ]; then
  VAT_CODE=$(curl -s -o /tmp/ebarimt-info.json -w '%{http_code}' -m 15 \
    -H 'Accept: application/json' "${EB_VAT_URL%/}/rest/info" || echo "ERR")
  if [ "$VAT_CODE" = "200" ]; then
    VAT_POS_NO=$(sed -n 's/.*"posNo"[[:space:]]*:[[:space:]]*"\{0,1\}\([0-9A-Za-z]*\).*/\1/p' /tmp/ebarimt-info.json | head -1 || true)
    echo "✅ eBarimt POS API OK (${EB_VAT_URL%/}/rest/info, posNo=${VAT_POS_NO:-?})"
    if [ -n "$EB_TIN" ] && ! grep -q "$EB_TIN" /tmp/ebarimt-info.json; then
      echo "⚠ merchantTin $EB_TIN нь instance-ийн /rest/info бүртгэлд алга — LIME-тэй шалгана уу."
    fi
  else
    echo "⚠ eBarimt POS API instance HTTP $VAT_CODE — VAT_BASE_URL-ээ шалгана уу (баримтууд PENDING-д хүлээгдэж, автоматаар дахин оролдоно)."
  fi
  rm -f /tmp/ebarimt-info.json
fi
# Open ebarimt registry (no auth) — used by the onboarding regNo→name/ТТД lookup.
# The lookup starts with getTinInfo?regNo= (getInfo takes ?tin=, not ?regNo=).
# HTTP 200 хангалттай биш — ТТД нь `data` талбараар ирж байж merchantTin
# автоматаар бөглөгдөнө, тиймээс хариуны бүтцийг нь мөн шалгана.
EBARIMT_BODY=$(curl -s -m 15 -H 'Accept: application/json' \
  "https://api.ebarimt.mn/api/info/check/getTinInfo?regNo=2657457" || echo "")
if echo "$EBARIMT_BODY" | grep -qE '"data"[[:space:]]*:[[:space:]]*"?[0-9]'; then
  echo "✅ ebarimt registry lookup OK (ТТД буцаалаа)"
else
  echo "⚠ ebarimt registry хариу хүлээгдсэн бүтэцтэй биш: ${EBARIMT_BODY:0:160}"
  echo "   → регистрээр ТТД (merchantTin) автоматаар бөглөх боломжгүй байж магадгүй."
fi

log "Deploy complete → ${PUBLIC_URL} (SMS линк: ${SHORT_URL_BASE}/p/…)"
