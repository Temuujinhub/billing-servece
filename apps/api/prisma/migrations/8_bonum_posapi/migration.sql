-- Bonum Gateway + eBarimt POS API 3.0 fields, renumbered from main's
-- 1_bonum_ebarimt to follow this branch's 0-7 history (columns that already
-- exist here — address, bankName — are omitted; bankAccountNo is unified
-- into the existing bankAccount column).

-- Hosted checkout link (Bonum web payment) — provider-side short-lived URL.
ALTER TABLE "PaymentIntent" ADD COLUMN "paymentUrl" TEXT;

-- PSP onboarding (anket) + per-tenant eBarimt POS registration + Bonum creds.
ALTER TABLE "Tenant"
  ADD COLUMN "bankAccountName" TEXT,
  ADD COLUMN "ebarimtMerchantTin" TEXT,
  ADD COLUMN "ebarimtPosNo" TEXT,
  ADD COLUMN "ebarimtBranchNo" TEXT,
  ADD COLUMN "ebarimtDistrictCode" TEXT,
  ADD COLUMN "bonumTerminalId" TEXT,
  ADD COLUMN "bonumAppSecretEnc" TEXT,
  ADD COLUMN "bonumChecksumKeyEnc" TEXT;
