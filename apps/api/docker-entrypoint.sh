#!/bin/sh
set -e

echo "→ Applying database migrations..."
# P3009 self-heal: when a previous attempt left a migration recorded as
# FAILED, mark it rolled back and retry once — our migration SQL is
# idempotent, so re-running over a partially-applied state is safe.
if ! OUT=$(npx prisma migrate deploy 2>&1); then
  printf '%s\n' "$OUT"
  FAILED=$(printf '%s\n' "$OUT" | sed -n 's/^The `\(.*\)` migration started at .* failed$/\1/p' | head -1)
  if [ -n "$FAILED" ]; then
    echo "→ Migration '$FAILED' is recorded as failed — rolling the record back and retrying (idempotent SQL)."
    npx prisma migrate resolve --rolled-back "$FAILED"
    npx prisma migrate deploy
  else
    exit 1
  fi
else
  printf '%s\n' "$OUT"
fi

if [ "$SEED_ON_START" = "true" ]; then
  echo "→ Seeding demo data (SEED_ON_START=true)..."
  # Force CommonJS for ts-node: the runtime image has no tsconfig.json, so
  # ts-node would otherwise default to module=NodeNext and fail with TS5109.
  TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node"}' \
    npx prisma db seed || echo "⚠ Seed skipped/failed (continuing)"
fi

echo "→ Starting billingservice.mn API..."
exec node dist/main.js
