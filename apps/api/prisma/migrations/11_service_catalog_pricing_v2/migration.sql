-- Үнийн загвар v2 — 4 үйлчилгээний каталог (2026-08-12 бизнес шийдвэрүүд):
--   EXCEL_SMS   (Үйлчилгээ 1) — 100₮/нэхэмжлэх илгээлт, eBarimt багтсан
--   API_SMS     (Үйлчилгээ 2) — tenant бүр тохиролцооны нэгж үнэ (default 100₮)
--   EBARIMT_API (Үйлчилгээ 3) — onboarding 100,000₮ + шатлалтай сарын хураамж
--   POS_EBARIMT (Үйлчилгээ 4) — идэвхтэй терминал × 20,000₮/сар
-- Суурь хураамж байхгүй болсон. Бүх хураамжид НӨАТ нэмж тооцно.
-- IDEMPOTENT: багана/хүснэгт аль хэдийн байвал алгасна.

-- TenantModule: tenant үнэ + шатлал
ALTER TABLE "TenantModule" ADD COLUMN IF NOT EXISTS "unitPrice" INTEGER;
ALTER TABLE "TenantModule" ADD COLUMN IF NOT EXISTS "tier" INTEGER;

-- Модулийн кодын шилжилт: SMS → EXCEL_SMS, POS → POS_EBARIMT (EBARIMT, REMINDER хэвээр).
UPDATE "TenantModule" SET "code" = 'EXCEL_SMS' WHERE "code" = 'SMS'
  AND NOT EXISTS (SELECT 1 FROM "TenantModule" t2 WHERE t2."tenantId" = "TenantModule"."tenantId" AND t2."code" = 'EXCEL_SMS');
UPDATE "TenantModule" SET "code" = 'POS_EBARIMT' WHERE "code" = 'POS'
  AND NOT EXISTS (SELECT 1 FROM "TenantModule" t2 WHERE t2."tenantId" = "TenantModule"."tenantId" AND t2."code" = 'POS_EBARIMT');
-- Шинэ үйлчилгээний мөрүүдийг бүх tenant-д нэмнэ (унтраалттай).
INSERT INTO "TenantModule" ("id", "tenantId", "code", "enabled", "quantity", "updatedAt")
SELECT gen_random_uuid(), t."id", c.code, false, 0, now()
FROM "Tenant" t
CROSS JOIN (VALUES ('API_SMS'), ('EBARIMT_API')) AS c(code)
ON CONFLICT ("tenantId", "code") DO NOTHING;

-- UsageEvent: үйлчилгээний код
ALTER TABLE "UsageEvent" ADD COLUMN IF NOT EXISTS "serviceCode" TEXT;
CREATE INDEX IF NOT EXISTS "UsageEvent_tenantId_serviceCode_occurredAt_idx"
  ON "UsageEvent"("tenantId", "serviceCode", "occurredAt");
-- Хуучин SMS segment хэрэглээг Үйлчилгээ 1-д хамааруулна.
UPDATE "UsageEvent" SET "serviceCode" = 'EXCEL_SMS' WHERE "meterCode" = 'SMS_SEGMENT_SENT' AND "serviceCode" IS NULL;

-- Invoice: гарал + B2B төлөгчийн регистр
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'ui';
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "payerRegNo" TEXT;
-- Импортын багцтай нэхэмжлэхүүд import гаралтай.
UPDATE "Invoice" SET "source" = 'import' WHERE "batchId" IS NOT NULL AND "source" = 'ui';

-- EbarimtReceipt: standalone баримт (transactionId nullable + гарал/дүн/төхөөрөмж)
ALTER TABLE "EbarimtReceipt" ALTER COLUMN "transactionId" DROP NOT NULL;
ALTER TABLE "EbarimtReceipt" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'payment';
ALTER TABLE "EbarimtReceipt" ADD COLUMN IF NOT EXISTS "amount" INTEGER;
ALTER TABLE "EbarimtReceipt" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "EbarimtReceipt" ADD COLUMN IF NOT EXISTS "deviceId" TEXT;
CREATE INDEX IF NOT EXISTS "EbarimtReceipt_state_retries_createdAt_idx"
  ON "EbarimtReceipt"("state", "retries", "createdAt");

-- ApiKey: эрхийн хүрээ + live/test горим
ALTER TABLE "ApiKey" ADD COLUMN IF NOT EXISTS "scopes" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "ApiKey" ADD COLUMN IF NOT EXISTS "mode" TEXT NOT NULL DEFAULT 'live';

-- POS терминалын бүртгэл (Үйлчилгээ 4)
CREATE TABLE IF NOT EXISTS "PosTerminal" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "name" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "receiptCount" INTEGER NOT NULL DEFAULT 0,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PosTerminal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PosTerminal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "PosTerminal_tenantId_deviceId_key" ON "PosTerminal"("tenantId", "deviceId");
CREATE INDEX IF NOT EXISTS "PosTerminal_tenantId_lastSeenAt_idx" ON "PosTerminal"("tenantId", "lastSeenAt");

-- Платформын сарын тооцоо (сар хаах — идемпотент unique(tenantId, cycle))
CREATE TABLE IF NOT EXISTS "ServiceBill" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "cycle" TEXT NOT NULL,
  "lines" JSONB NOT NULL,
  "subtotal" INTEGER NOT NULL,
  "vat" INTEGER NOT NULL,
  "total" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CREATED',
  "invoiceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceBill_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceBill_tenantId_cycle_key" ON "ServiceBill"("tenantId", "cycle");
CREATE INDEX IF NOT EXISTS "ServiceBill_cycle_idx" ON "ServiceBill"("cycle");

-- Нэг удаагийн төлбөр (onboarding г.м.)
CREATE TABLE IF NOT EXISTS "ServiceCharge" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "billedCycle" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceCharge_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ServiceCharge_tenantId_billedCycle_idx" ON "ServiceCharge"("tenantId", "billedCycle");
