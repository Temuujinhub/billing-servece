-- Integration onboarding requests (Bonum / eBarimt-LIME) + platform admin +
-- per-tenant Bonum merchant credentials.
--
-- IDEMPOTENT on purpose: the production DB may already carry overlapping
-- objects (schema evolved via `prisma db push` before this migration landed).

DO $$ BEGIN
  CREATE TYPE "IntegrationKind" AS ENUM ('BONUM', 'EBARIMT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "IntegrationRequestStatus" AS ENUM ('SUBMITTED', 'EMAIL_SENT', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Tenant"
  ADD COLUMN IF NOT EXISTS "bonumTerminalId" TEXT,
  ADD COLUMN IF NOT EXISTS "bonumAppSecretEnc" TEXT,
  ADD COLUMN IF NOT EXISTS "bonumChecksumKeyEnc" TEXT;

CREATE TABLE IF NOT EXISTS "IntegrationRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "IntegrationKind" NOT NULL,
    "status" "IntegrationRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "payload" JSONB NOT NULL,
    "note" TEXT,
    "error" TEXT,
    "emailedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IntegrationRequest_status_createdAt_idx" ON "IntegrationRequest"("status", "createdAt");

CREATE INDEX IF NOT EXISTS "IntegrationRequest_tenantId_kind_createdAt_idx" ON "IntegrationRequest"("tenantId", "kind", "createdAt");

DO $$ BEGIN
  ALTER TABLE "IntegrationRequest" ADD CONSTRAINT "IntegrationRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
