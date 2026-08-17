# Архитектур (v0.1)

PRD/architecture баримтын (billingservice_mn_prd_architecture_uiux) шийдлийг
MVP хэмжээнд хэрэгжүүлсэн байдал.

## Стек

| Давхарга | Сонголт | Тайлбар |
|---|---|---|
| Frontend | Next.js 14 (App Router), React 18, Tailwind | Landing SSG + dashboard/pay page client-render |
| Backend | NestJS 10 modular monolith | Домэйн модулиуд микросервисийн хил дагасан |
| ORM/DB | Prisma 5 + PostgreSQL 16 | Integer MNT, unique constraints санхүүгийн хамгаалалт |
| Proxy | Caddy 2 | Auto-HTTPS, HSTS, same-origin `/api` |
| Deploy | Docker Compose + GitHub Actions | DigitalOcean droplet дээр rsync + remote script |

Queue (Redis/BullMQ) v0.1-д зориуд ОРУУЛААГҮЙ — moving parts багасгаж, mock
provider-ууд synchronous тул шаардлагагүй. Бодит provider холбогдохоор
BullMQ + transactional outbox нэмэх нь ROADMAP-ын эхний ажил.

## Модулиуд (apps/api/src/modules)

- **auth** — register (user+tenant+owner нэг transaction), login, refresh
  rotation, JWT guard (global) + Roles guard.
- **tenants** — байгууллагын мэдээлэл, баг, тохиргоо.
- **customers** — төлөгчийн бүртгэл, import-ын find-or-create.
- **invoices** — дугаарын sequence, state machine, short link, илгээлт/цуцлалт.
- **imports** — xlsx/csv parse (exceljs + өөрийн RFC4180 splitter), мөр бүрийн
  валидаци (утас E.164 MN, бүхэл дүн, 160 тэмдэгт, огноо, файл доторх
  давхардал), preview + SMS зардлын тооцоо, chunked approve (50 мөр/tx).
- **messaging** — SMS порт (mock), segment тооцоолол (GSM7 160/153, UCS-2 70/67),
  usage meter бичилт.
- **payments** — intent → provider invoice (QR/deeplink) → callback →
  **payment-check** → transaction + balance + receipt нэг transaction дотор.
  Идемпотент: unique providerPaymentId + state-guarded updateMany.
- **receipts** — eBarimt state machine, PENDING drain + retry.
- **billing** — модулийн toggle, usage aggregation, сарын урьдчилсан тооцоо
  (PRICING const нэг газарт).
- **analytics** — dashboard KPI, 30 хоногийн цуваа, төлөвийн задаргаа.
- **health** — /health/live (liveness), /health/ready (DB ping).

## Гол урсгал: Excel → мөнгө → eBarimt

```
Upload (multipart 5MB)
  → parse + validate (бүх мөр, алдаа/санамж тус бүр)
  → InvoiceBatch(VALIDATED) + ImportRow[] хадгална       ← санхүүгийн бичилт ХИЙГДЭЭГҮЙ
  → Preview: нийт дүн, зөв/алдаатай мөр, SMS segment est.
  → Approve (atomic claim VALIDATED→APPROVED)
  → 50 мөрөөр transaction: customer upsert → invoice + seq → short link
     → SMS job + usage meter → batch DISPATCHED
Payer link нээнэ → SENT→VIEWED (regress хийхгүй)
  → intent create (PENDING, provider QR)
  → төлөлт → webhook/simulate → payment-check → SUCCEEDED claim
  → PaymentTransaction insert (unique) → balance recompute → PAID
  → EbarimtReceipt PENDING → provider → CREATED (сугалаа, QR)
```

## Multi-tenancy

Shared schema + заавал `tenantId` шүүлт (PRD §6.3). JWT-д `tenantId`+`role`
суусан тул controller бүр `user.tenantId`-аас л уншина; query бүр service
дотор tenant-scoped. Phase 2: Postgres RLS давхар хамгаалалт, cross-tenant
admin role.

## API гэрээ

- Prefix `/api/v1`; Swagger `/api/docs` нь default хаалттай (`SWAGGER_ENABLED=true` үед л нээгдэнэ).
- Error envelope: `{code, message_mn, message_en, field_errors, retryable, request_id}`.
- Public endpoints (payment page) нь short-link token-оор өөрөө authorize
  болно — token нь 128-bit random, DB-д зөвхөн SHA-256.
- Rate limits: global 300/мин, auth 5–10/мин, public pay 10–60/мин.

## Дараагийн үеийн extension point-ууд

1. Bodit QPay/eBarimt/SMS adapters (порт бэлэн).
2. BullMQ + outbox — batch dispatch, reminder scheduler, receipt retry worker.
3. Reconciliation (settlement import + matching hierarchy).
4. Merchant outbound webhooks + API keys (Integration Hub).
5. Admin console (KYB, provider health, DLQ) — тусдаа app эсвэл /admin route.
