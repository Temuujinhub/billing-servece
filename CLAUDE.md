# msgbill.mn (Message Billing Service) — ажиллах журам

## Ажлын бүртгэл (заавал)

- Бүх ажил `docs/BACKLOG.md`-д ID-тай (B-XX) бүртгэгдэнэ. Шинэ ажил эхлэхдээ
  тэнд нэмж, дуусмагц статусыг ✅ болгож PR-ыг холбоно.
- Бизнесийн шийдвэрүүд (үнэ, дүрэм) BACKLOG.md-ийн «Бизнес шийдвэрүүд»
  хүснэгтэд D-дугаартай хадгалагдана — код өөрчлөхдөө үүнтэй зөрүүлэхгүй.

## Тарифын загвар v2 (2026-08)

Суурь хураамжгүй, 4 үйлчилгээ, бүх хураамжид НӨАТ нэмнэ. Нэг эх сурвалж:
`apps/api/src/modules/billing/billing.service.ts` доторх `PRICING` const +
PlatformSetting('pricing') admin override. Үнэ UI-д hard-code хийхгүй —
`GET /api/v1/public/pricing`-ээс уншина.

## Кодын дүрэм

- Модулийн кодууд: EXCEL_SMS, API_SMS, EBARIMT_API, POS_EBARIMT (+EBARIMT
  дотоод туг, REMINDER). Хуучин SMS/POS кодыг битгий сэргээ.
- Мөнгө бүхэл MNT integer; санхүүгийн бичилт append-only; balance derived.
- Query бүр tenantId-аар шүүгдэнэ; migration idempotent (IF NOT EXISTS).
- Build шалгалт: `apps/api`: `npm run lint && npm run build`;
  `apps/web`: мөн адил. CI (`.github/workflows/ci.yml`) хоёуланг барина.
- Production deploy: `main` руу push хийхэд `deploy.yml` автоматаар гарна.
