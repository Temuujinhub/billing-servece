-- Bonum Gateway + eBarimt POS API 3.0 fields. IDEMPOTENT (IF NOT EXISTS):
-- production may already carry some of these columns from main's
-- 1_bonum_ebarimt/2_onboarding_requests, which were applied there before
-- this renumbered history landed.

ALTER TABLE "PaymentIntent" ADD COLUMN IF NOT EXISTS "paymentUrl" TEXT;

ALTER TABLE "Tenant"
  ADD COLUMN IF NOT EXISTS "bankAccountName" TEXT,
  ADD COLUMN IF NOT EXISTS "ebarimtMerchantTin" TEXT,
  ADD COLUMN IF NOT EXISTS "ebarimtPosNo" TEXT,
  ADD COLUMN IF NOT EXISTS "ebarimtBranchNo" TEXT,
  ADD COLUMN IF NOT EXISTS "ebarimtDistrictCode" TEXT,
  ADD COLUMN IF NOT EXISTS "bonumTerminalId" TEXT,
  ADD COLUMN IF NOT EXISTS "bonumAppSecretEnc" TEXT,
  ADD COLUMN IF NOT EXISTS "bonumChecksumKeyEnc" TEXT;
