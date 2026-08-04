-- Per-invoice eBarimt opt-in (checkbox on invoice creation).
ALTER TABLE "Invoice" ADD COLUMN "ebarimtEnabled" BOOLEAN NOT NULL DEFAULT true;
