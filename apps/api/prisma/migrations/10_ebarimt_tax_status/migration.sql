-- ТЕГ-ийн бүртгэлээс (getInfo?tin=) татсан татварын төлөв.
-- Баримтын taxType үүнээс шалтгаална: НӨАТ суутган төлөгч БИШ байгууллагад
-- 10% НӨАТ задалж бичих нь буруу баримт үүсгэдэг.
--
-- NULL = хараахан лавлаагүй → өмнөх зан төлөв (VAT_ABLE) хэвээр.
-- IDEMPOTENT: багана аль хэдийн байвал алгасна.

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "ebarimtVatPayer" BOOLEAN;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "ebarimtVatFreeProj" BOOLEAN;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "ebarimtCityPayer" BOOLEAN;
