-- Optional Latin transliteration for outbound SMS (GSM-7 segment savings).
ALTER TABLE "Tenant" ADD COLUMN "smsTransliterate" BOOLEAN NOT NULL DEFAULT false;
