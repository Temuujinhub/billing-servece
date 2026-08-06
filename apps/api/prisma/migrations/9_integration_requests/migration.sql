-- Integration onboarding requests (Bonum / eBarimt-LIME) + platform admin +
-- per-tenant Bonum merchant credentials.

CREATE TYPE "IntegrationKind" AS ENUM ('BONUM', 'EBARIMT');

CREATE TYPE "IntegrationRequestStatus" AS ENUM ('SUBMITTED', 'EMAIL_SENT', 'APPROVED', 'REJECTED');



CREATE TABLE "IntegrationRequest" (
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

CREATE INDEX "IntegrationRequest_status_createdAt_idx" ON "IntegrationRequest"("status", "createdAt");

CREATE INDEX "IntegrationRequest_tenantId_kind_createdAt_idx" ON "IntegrationRequest"("tenantId", "kind", "createdAt");

ALTER TABLE "IntegrationRequest" ADD CONSTRAINT "IntegrationRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
