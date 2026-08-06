-- Bonum Gateway + eBarimt POS API 3.0 integration fields.
--
-- IDEMPOTENT on purpose: the production DB may already carry some of these
-- columns (schema evolved via `prisma db push` on the Mongolian server before
-- this migration landed), so every statement must survive a partial overlap.

-- Hosted checkout link (Bonum web payment) — provider-side short-lived URL.
ALTER TABLE "PaymentIntent" ADD COLUMN IF NOT EXISTS "paymentUrl" TEXT;

-- PSP onboarding (anket) + per-tenant eBarimt POS registration.
ALTER TABLE "Tenant"
  ADD COLUMN IF NOT EXISTS "address" TEXT,
  ADD COLUMN IF NOT EXISTS "bankName" TEXT,
  ADD COLUMN IF NOT EXISTS "bankAccountNo" TEXT,
  ADD COLUMN IF NOT EXISTS "bankAccountName" TEXT,
  ADD COLUMN IF NOT EXISTS "ebarimtMerchantTin" TEXT,
  ADD COLUMN IF NOT EXISTS "ebarimtPosNo" TEXT,
  ADD COLUMN IF NOT EXISTS "ebarimtBranchNo" TEXT,
  ADD COLUMN IF NOT EXISTS "ebarimtDistrictCode" TEXT;
