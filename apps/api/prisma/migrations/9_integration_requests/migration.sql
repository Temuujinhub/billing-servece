-- Integration onboarding requests (Bonum / eBarimt-LIME). IDEMPOTENT:
-- production may already have these from main's 2_onboarding_requests.

DO $$ BEGIN
  CREATE TYPE "IntegrationKind" AS ENUM ('BONUM', 'EBARIMT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "IntegrationRequestStatus" AS ENUM ('SUBMITTED', 'EMAIL_SENT', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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
