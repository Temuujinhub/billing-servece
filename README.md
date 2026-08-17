# msgbill.mn — Message Billing Service

**Нэхэмжлэхээс eBarimt хүртэлх авлага хураалтын автоматжуулалт** — Монголын
байгууллагуудад зориулсан B2B SaaS платформ. Excel-ээр бөөнөөр нэхэмжлэх үүсгэж,
төлбөрийн линкийг SMS-ээр илгээж, QPay/банкны төлөлтийг хүлээн авч, eBarimt-ийг
автоматаар үүсгэнэ.

> **Статус:** MVP v0.1 — бүрэн ажиллагаатай, deploy хийгдэхэд бэлэн.
> Гадаад интеграцууд ports & adapters загвараар: демо орчинд **mock**,
> production-д **Bonum Gateway** (төлбөрийн линк, `PAYMENT_PROVIDER=bonum`)
> болон **ТЕГ eBarimt POS API 3.0** (LIME instance, `EBARIMT_PROVIDER=posapi`)
> adapter-ууд env-ээр сонгогдоно — дуудаж буй код өөрчлөгдөхгүй.
> Дэлгэрэнгүй: [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md)

Демо нэвтрэлт: `demo@billingservice.mn` / `Demo123$`

## Юу ажилладаг вэ (v0.1)

| Модуль | Байдал |
|---|---|
| Landing page + үнийн калькулятор | ✅ Монгол хэлээр, Wave-загварын UI |
| Бүртгэл / нэвтрэлт (JWT + refresh rotation, RBAC 4 роль) | ✅ |
| Нэг нэхэмжлэх үүсгэх + SMS линк | ✅ (SMS mock) |
| Excel/CSV bulk импорт: валидаци → preview → баталгаажуулалт → илгээлт | ✅ 5000 мөр хүртэл |
| Төлөгчийн мобайл payment page (QR + deeplink + polling) | ✅ |
| Төлбөрийн orchestration: intent → callback → **payment-check** → ledger | ✅ идемпотент |
| eBarimt: PENDING → CREATED/FAILED + retry, сугалааны дугаар | ✅ (mock) |
| Хянах самбар: KPI, 30 хоногийн трэнд, төлөвийн задаргаа | ✅ |
| Billing v2: 4 үйлчилгээ (Excel+SMS 100₮/илгээлт · API+SMS гэрээт үнэ · eBarimt API шатлалтай · POS терминал 20к/сар), НӨАТ, сар хаалт + өөрийн нэхэмжлэх SMS-ээр | ✅ |
| Partner API: нэхэмжлэх + standalone eBarimt + POS баримт, scope-той түлхүүр, тест горим (Postman) | ✅ |
| Audit log (хэн/хэзээ/юу) | ✅ |

## Архитектур

```
Next.js 14 (landing + dashboard + pay page)
        │  JWT / REST
NestJS 10 API — modular monolith (auth · tenants · customers · invoices ·
imports · messaging · payments · receipts · billing · analytics)
        │  Prisma
PostgreSQL 16        Mock adapters: QPay · eBarimt · SMS (swap-ready ports)
```

Дэлгэрэнгүй: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) ·
Эрсдэлийн бүртгэл: [`docs/RISKS.md`](docs/RISKS.md) ·
Deploy: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)

## Хөгжүүлэлтийн орчин

```bash
docker compose up -d                 # PostgreSQL 16 (localhost:5432)

cd apps/api
cp .env.example .env
npm install
npx prisma migrate deploy && npx prisma db seed
npm run start:dev                    # http://localhost:4000 (Swagger: /api/docs)

cd ../web
npm install
NEXT_PUBLIC_API_URL=http://localhost:4000 npm run dev   # http://localhost:3000
```

Бүтэн стек нэг командаар: `docker compose --profile full up -d --build` → http://localhost:8080

## Production

| Домэйн | Зориулалт |
|---|---|
| `https://msgbill.mn` | Канон хаяг — landing, dashboard, admin, `/api/*` |
| `https://bil.mn/p/<token>` | SMS-д явах богино төлбөрийн линк (ижил web контейнер) |

Сервер: `202.37.235.16` (Монголд хостлогдсон), Docker + Caddy auto-HTTPS
(Let's Encrypt, гараар тохируулах шаардлагагүй). GitHub Actions "Deploy
msgbill.mn" workflow нь дүрсүүдийг CI дээр build хийж, кодыг rsync хийж
`deploy/remote-deploy.sh` ажиллуулна. Дэлгэрэнгүй:
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

Хуучин `billing.mastrsys.com` хаягийг ашиглахаа больсон (2026-08, B-40).

## Санхүүгийн найдвартай байдлын зарчмууд

- **Идемпотент бүх зам дээр**: provider payment ID unique constraint, batch
  давхар илгээлтийн хамгаалалт, refresh token rotation.
- **Callback-д итгэхгүй**: төлбөрийг зөвхөн provider status check-ээр
  баталгаажуулж дараа нь ledger бичнэ (PAY-03).
- **Ledger-derived balance**: нэхэмжлэхийн үлдэгдлийг гүйлгээний нийлбэрээс
  тооцно — гараар засварлагдахгүй.
- **eBarimt провайдер унтарсан ч төлбөр алдагдахгүй** — баримт PENDING төлөвт
  орж автоматаар дахин оролдоно.
- Rate limiting, Helmet, whitelist validation, error envelope (MN/EN),
  нууц үг bcrypt-12, токенууд зөвхөн hash-аар хадгалагдана.
