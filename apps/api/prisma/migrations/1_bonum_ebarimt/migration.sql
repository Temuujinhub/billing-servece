-- Bonum Gateway + eBarimt POS API 3.0 integration fields.

-- Hosted checkout link (Bonum web payment) — provider-side short-lived URL.
ALTER TABLE "PaymentIntent" ADD COLUMN "paymentUrl" TEXT;

-- PSP onboarding (anket) + per-tenant eBarimt POS registration.
ALTER TABLE "Tenant"
  ADD COLUMN "address" TEXT,
  ADD COLUMN "bankName" TEXT,
  ADD COLUMN "bankAccountNo" TEXT,
  ADD COLUMN "bankAccountName" TEXT,
  ADD COLUMN "ebarimtMerchantTin" TEXT,
  ADD COLUMN "ebarimtPosNo" TEXT,
  ADD COLUMN "ebarimtBranchNo" TEXT,
  ADD COLUMN "ebarimtDistrictCode" TEXT;
