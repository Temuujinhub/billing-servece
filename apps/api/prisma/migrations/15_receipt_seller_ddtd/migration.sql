-- B-70: eBarimt ДДТД-ийн зөрүү. POS API-ийн top-level `id` (багц баримт,
-- операторын ТТД угтвартай) биш, борлуулагчийн дэд баримтын `receipts[].id`
-- (tenant-ийн ТТД угтвартай — ebarimt.mn дээр бүртгэгддэг дугаар) нь
-- `receiptNo` болно. Багцын дугаарыг цуцлалтад зориулж тусад нь хадгална,
-- POS API-ийн түүхий хариуг (lottery/qrData-гүй) тулгалтад зориулж хадгална,
-- `lockedAt` нь provider руу илгээх үеийн давхар илгээлтийн хамгаалалт.
-- Idempotent.
ALTER TABLE "EbarimtReceipt" ADD COLUMN IF NOT EXISTS "batchReceiptNo" TEXT;
ALTER TABLE "EbarimtReceipt" ADD COLUMN IF NOT EXISTS "providerResponse" JSONB;
ALTER TABLE "EbarimtReceipt" ADD COLUMN IF NOT EXISTS "lockedAt" TIMESTAMP(3);
