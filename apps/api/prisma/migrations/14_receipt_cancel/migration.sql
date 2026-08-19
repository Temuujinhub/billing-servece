-- eBarimt цуцлалт (B-22): POS API-ийн баримтын огноог хадгална — DELETE
-- /rest/receipt {id, date} хүсэлтэд яг энэ огноо шаардагдана. Idempotent.
ALTER TABLE "EbarimtReceipt" ADD COLUMN IF NOT EXISTS "receiptDate" TEXT;
