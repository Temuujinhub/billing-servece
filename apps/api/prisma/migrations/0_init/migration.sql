-- CreateEnum
CREATE TYPE "TenantType" AS ENUM ('ORGANIZATION', 'INDIVIDUAL');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "KybStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'NEEDS_INFO');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'OPERATOR', 'ACCOUNTANT', 'VIEWER');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('UPLOADED', 'VALIDATED', 'APPROVED', 'DISPATCHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceState" AS ENUM ('DRAFT', 'SENT', 'VIEWED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('QUEUED', 'SUBMITTED', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "IntentState" AS ENUM ('CREATED', 'PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TxStatus" AS ENUM ('SUCCEEDED', 'REFUND_PENDING', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ReceiptState" AS ENUM ('NOT_REQUIRED', 'PENDING', 'CREATED', 'DELIVERED', 'CANCEL_PENDING', 'CANCELLED', 'FAILED');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "type" "TenantType" NOT NULL DEFAULT 'ORGANIZATION',
    "name" TEXT NOT NULL,
    "regNo" TEXT,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "kybStatus" "KybStatus" NOT NULL DEFAULT 'DRAFT',
    "invoicePrefix" TEXT NOT NULL DEFAULT 'INV',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Ulaanbaatar',
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "externalRef" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'excel',
    "fileName" TEXT,
    "status" "BatchStatus" NOT NULL DEFAULT 'UPLOADED',
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "validCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRow" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowNo" INTEGER NOT NULL,
    "raw" JSONB NOT NULL,
    "normalized" JSONB,
    "errors" JSONB,
    "warnings" JSONB,
    "valid" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "batchId" TEXT,
    "number" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "state" "InvoiceState" NOT NULL DEFAULT 'DRAFT',
    "dueDate" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceSequence" (
    "tenantId" TEXT NOT NULL,
    "next" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "InvoiceSequence_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "ShortLink" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShortLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'sms',
    "recipient" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "segments" INTEGER NOT NULL DEFAULT 1,
    "status" "MessageStatus" NOT NULL DEFAULT 'QUEUED',
    "providerRef" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentIntent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'qpay_mock',
    "providerInvoiceId" TEXT,
    "state" "IntentState" NOT NULL DEFAULT 'CREATED',
    "idemKey" TEXT,
    "qrText" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTransaction" (
    "id" TEXT NOT NULL,
    "intentId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerPaymentId" TEXT NOT NULL,
    "gross" INTEGER NOT NULL,
    "fee" INTEGER NOT NULL DEFAULT 0,
    "net" INTEGER NOT NULL,
    "status" "TxStatus" NOT NULL DEFAULT 'SUCCEEDED',
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "intentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EbarimtReceipt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "receiptNo" TEXT,
    "lottery" TEXT,
    "qrData" TEXT,
    "receiptType" TEXT NOT NULL DEFAULT 'CITIZEN',
    "payerRegNo" TEXT,
    "state" "ReceiptState" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "retries" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EbarimtReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantModule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "meterCode" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceEventId" TEXT NOT NULL,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "response" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_tenantId_userId_key" ON "Membership"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "Customer_tenantId_name_idx" ON "Customer"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Customer_tenantId_phone_idx" ON "Customer"("tenantId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_tenantId_externalRef_key" ON "Customer"("tenantId", "externalRef");

-- CreateIndex
CREATE INDEX "InvoiceBatch_tenantId_createdAt_idx" ON "InvoiceBatch"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ImportRow_batchId_rowNo_key" ON "ImportRow"("batchId", "rowNo");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_state_dueDate_idx" ON "Invoice"("tenantId", "state", "dueDate");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_customerId_createdAt_idx" ON "Invoice"("tenantId", "customerId", "createdAt");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_createdAt_idx" ON "Invoice"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_tenantId_number_key" ON "Invoice"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "ShortLink_tokenHash_key" ON "ShortLink"("tokenHash");

-- CreateIndex
CREATE INDEX "ShortLink_invoiceId_idx" ON "ShortLink"("invoiceId");

-- CreateIndex
CREATE INDEX "MessageJob_tenantId_createdAt_idx" ON "MessageJob"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentIntent_tenantId_createdAt_idx" ON "PaymentIntent"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentIntent_invoiceId_idx" ON "PaymentIntent"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIntent_provider_providerInvoiceId_key" ON "PaymentIntent"("provider", "providerInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIntent_tenantId_idemKey_key" ON "PaymentIntent"("tenantId", "idemKey");

-- CreateIndex
CREATE INDEX "PaymentTransaction_intentId_idx" ON "PaymentTransaction"("intentId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTransaction_provider_providerPaymentId_key" ON "PaymentTransaction"("provider", "providerPaymentId");

-- CreateIndex
CREATE INDEX "PaymentEvent_intentId_createdAt_idx" ON "PaymentEvent"("intentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EbarimtReceipt_transactionId_key" ON "EbarimtReceipt"("transactionId");

-- CreateIndex
CREATE INDEX "EbarimtReceipt_tenantId_state_createdAt_idx" ON "EbarimtReceipt"("tenantId", "state", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TenantModule_tenantId_code_key" ON "TenantModule"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "UsageEvent_sourceEventId_key" ON "UsageEvent"("sourceEventId");

-- CreateIndex
CREATE INDEX "UsageEvent_tenantId_meterCode_occurredAt_idx" ON "UsageEvent"("tenantId", "meterCode", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_tenantId_key_key" ON "IdempotencyKey"("tenantId", "key");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceBatch" ADD CONSTRAINT "InvoiceBatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InvoiceBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InvoiceBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceSequence" ADD CONSTRAINT "InvoiceSequence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortLink" ADD CONSTRAINT "ShortLink_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageJob" ADD CONSTRAINT "MessageJob_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "PaymentIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "PaymentIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EbarimtReceipt" ADD CONSTRAINT "EbarimtReceipt_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "PaymentTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantModule" ADD CONSTRAINT "TenantModule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

