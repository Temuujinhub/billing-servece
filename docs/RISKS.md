# Эрсдэлийн бүртгэл ба бууруулах арга (v0.1)

PRD §16-гийн эрсдэлүүдийг кодын түвшинд хэрхэн шийдсэн/шийдэхээр төлөвлөснийг
энд бүртгэв. Статус: ✅ шийдсэн · 🟡 хэсэгчлэн · 🔜 дараагийн үе.

## Санхүүгийн бүрэн бүтэн байдал

| Эрсдэл | Бууруулалт | Статус |
|---|---|---|
| Давхар төлбөр (callback давхардах) | `(provider, providerPaymentId)` unique constraint + state-guard `updateMany` — давхар callback санхүүгийн үр дүнгүй | ✅ |
| Callback хуурамч байх | HMAC гарын үсэг шалгана; амжилтгүй бол audit log + 401 (PAY-02). Callback-ийг хэзээ ч шууд итгэхгүй — provider `getPaymentStatus`-аар давхар шалгана (PAY-03) | ✅ |
| Batch давхар илгээгдэх | `status=VALIDATED → APPROVED` atomic claim (`updateMany`) — давхар товшилт no-op | ✅ |
| Invoice үлдэгдэл зөрөх | Balance-ийг ledger (гүйлгээний нийлбэр)-ээс тооцно, гараар бичихгүй | ✅ |
| Төлөв буруу шилжих | Invoice/intent state machine-ийн зөвшөөрөгдсөн шилжилтийг код дээр enforce хийнэ | ✅ |
| Provider settlement зөрүү | Reconciliation модуль (settlement report import + тулгалт) | 🔜 Phase 2 |

## Аюулгүй байдал

| Эрсдэл | Бууруулалт | Статус |
|---|---|---|
| Tenant өгөгдөл алдагдах (cross-tenant) | Бүх query `tenantId`-аар шүүгдэнэ; JWT-д tenantId+role суулгаж guard шалгана | ✅ (Phase 2: Postgres RLS давхарга) |
| Brute force / credential stuffing | Login/register-т хатуу rate limit (5–10/мин), нэгдсэн "буруу имэйл/нууц үг" хариу (enumeration хаах), bcrypt-12 | ✅ |
| Токен хулгай | Access 15 мин, refresh rotation (нэг удаа хэрэглэгдэнэ), зөвхөн SHA-256 hash хадгална | ✅ |
| Payment link таагдах | 128-bit random token, зөвхөн hash хадгална, хугацаатай, цуцлах боломжтой | ✅ |
| File upload халдлага | 5MB хязгаар, зөвхөн .xlsx/.csv, мөрийн тоо 5000, cell утга бүр текст болгож normalize | ✅ (Phase 2: virus scan) |
| Injection / XSS | Prisma parameterized query, class-validator whitelist, React auto-escaping, Helmet, CSP-хэвшил | ✅ |
| Нууц мэдээлэл лог руу гарах | Error envelope зөвхөн код + MN/EN мессеж буцаана; stack зөвхөн серверийн логт request_id-тай | ✅ |
| PII encryption at rest | Утас/имэйл plaintext (dev) — filed-level AES-256-GCM + hash index | 🔜 Phase 2 |

## Ажиллагаа / инфра

| Эрсдэл | Бууруулалт | Статус |
|---|---|---|
| Жижиг droplet OOM | Deploy script автоматаар 2G swap үүсгэнэ | ✅ |
| DB гаднаас нээлттэй байх | Postgres зөвхөн docker internal network; host port нээхгүй | ✅ |
| TLS/сертификат | Caddy auto-HTTPS (Let's Encrypt), HSTS header | ✅ |
| Config буруу орох | Joi env validation — дутуу/буруу secret үед boot fail | ✅ |
| eBarimt provider унтрах | Төлбөр PAID хэвээр; receipt PENDING/FAILED + retry (5 хүртэл) + UI-аас гар retry | ✅ |
| Backup / restore | `pgdata` volume; өдөр тутмын dump + offsite copy | 🔜 (cron + object storage) |
| Hotel PMS өгөгдөл устах | Switchover нь `docker compose down` (**-v биш**) — volume бүрэн хадгалагдана, буцааж асаах заавар docs-д | ✅ |

## Бизнес / хууль зүй (кодоос гадуур — шийдвэр шаардана)

- **Лицензийн зааг**: Платформ мөнгө хүлээж авахгүй (SaaS orchestrator загвар).
  Transaction fee / split settlement нэвтрүүлэхийн өмнө Монголбанкны
  зохицуулалтын дүгнэлт заавал авах (PRD §10.1).
- **Тарифын таамаг**: 20,000₮/25₮ нь захиалагчийн таамаг — provider гэрээ,
  НӨАТ, unit economics-оор баталгаажуулж `PRICING` const-ийг шинэчилнэ.
- **SMS sender ID, гэрээ**: Оператортой гэрээгүйгээр production SMS илгээхгүй.
- **Хувийн мэдээллийн хууль**: retention/устгах workflow, зөвшөөрлийн бүртгэл
  Phase 2-т; нууцлалын бодлого нийтлэхээс өмнө хуульчийн хяналт.

## Mock → бодит интеграцийн шилжилт

`PaymentProviderPort` интерфэйсийг өөрчлөхгүйгээр:
1. QPay Merchant V2 adapter (auth token cache, invoice create, payment check,
   webhook signature) — `MockQpayAdapter`-тай ижил гэрээ.
2. eBarimt 3.0 adapter (`ReceiptsService.callProvider` солино).
3. SMS provider adapter (`MessagingService.sendSms` доторх mock хэсэг).
4. `PAYMENT_SANDBOX=false` болгосноор симуляцийн endpoint бүрэн хаагдана.
