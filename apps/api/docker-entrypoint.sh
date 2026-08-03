#!/bin/sh
set -e

echo "→ Applying database migrations..."
npx prisma migrate deploy

if [ "$SEED_ON_START" = "true" ]; then
  echo "→ Seeding demo data (SEED_ON_START=true)..."
  # Force CommonJS for ts-node: the runtime image has no tsconfig.json, so
  # ts-node would otherwise default to module=NodeNext and fail with TS5109.
  TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node"}' \
    npx prisma db seed || echo "⚠ Seed skipped/failed (continuing)"
fi

echo "→ Starting billingservice.mn API..."
exec node dist/main.js
