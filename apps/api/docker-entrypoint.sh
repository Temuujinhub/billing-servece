#!/bin/sh
set -e

echo "→ Applying database migrations..."
# Self-heal a stuck P3009: a failed migration row always means the migration
# rolled back (transactional DDL), and our migrations are idempotent — so a
# leftover unfinished row can be purged and the migration safely retried.
echo 'DELETE FROM "_prisma_migrations" WHERE "finished_at" IS NULL AND "rolled_back_at" IS NULL;' \
  | npx prisma db execute --stdin --url "$DATABASE_URL" || true
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
