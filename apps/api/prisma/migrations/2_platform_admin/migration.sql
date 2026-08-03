-- AlterTable
ALTER TABLE "User" ADD COLUMN "platformAdmin" BOOLEAN NOT NULL DEFAULT false;

-- Bootstrap: the seeded demo owner becomes the first platform admin so the
-- admin area is reachable immediately after deploy.
UPDATE "User" SET "platformAdmin" = true WHERE "email" = 'demo@billingservice.mn';
