-- Auth hardening (B-44/B-45/B-54): lockout, must-change-password, SMS reset.
-- Idempotent (IF NOT EXISTS) — журмын дагуу дахин ажиллуулахад аюулгүй.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "failedLoginCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "resetCodeHash" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "resetCodeExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "resetCodeAttempts" INTEGER NOT NULL DEFAULT 0;
