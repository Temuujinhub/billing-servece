# Ажлын бүртгэл (BACKLOG)

> **Журам:** Энэ файл бол ажлын НЭГДСЭН бүртгэл. Ажил бүр ID-тай, статустай,
> PR-тай. Шинэ ажил гарвал энд нэмнэ; дуусмагц статусыг ✅ болгож PR-ыг холбоно.
> Ажлын агуулгыг дахин тайлбарлах шаардлагагүй — ID-гаар нь ярина (ж: «B-14»).
> Статус: ✅ дууссан · 🔄 хийгдэж байгаа · ⏳ хүлээгдэж буй · ❄ хойшлуулсан.

## Бизнес шийдвэрүүд (өөрчлөхөд энд шинэчилнэ)

2026-08-12, захиалагчийн шийдвэр (дүн шинжилгээний §6-ийн хариу):

| # | Шийдвэр |
|---|---|
| D1 | Үйлчилгээ 1-ийн үнэ = **100₮ / нэг нэхэмжлэх илгээлт** (~2 segment нийлээд), segment-ээр тоолохгүй. eBarimt үнэд **багтсан** (D4). |
| D2 | Үйлчилгээ 3-ын сарын хураамж **3 шатлалтай, тохируулах боломжтой**: ≤500 баримт → 20,000₮; ≤2,000 → 50,000₮; түүнээс дээш → 100,000₮ (хязгааргүй). |
| D3 | **Суурь хураамж байхгүй.** API холболтод (Үйлчилгээ 3) нэг удаагийн onboarding хураамж 100,000₮; тест хийх нөхцөл + Postman зааврыг үнэгүй өгнө. |
| D4 | Үйлчилгээ 1-ийн 100₮-д eBarimt багтана. |
| D5 | Үйлчилгээ 4: POS апп-ыг бид хийхгүй — API token + баримт бичгээр апп хөгжүүлэгчдийг хангана. Баримтын тоон хязгааргүй; **төхөөрөмжийг ялган таньж тоолж** терминал бүрд 20,000₮/сар. |
| D6 | Бүх үйлчилгээний хураамжид **НӨАТ нэмж**, өөрсдөө нэхэмжлэн eBarimt баримт олгоно. Сарын нэхэмжлэх **SMS-ээр** очиж, системд бүртгэгдэнэ. Нэхэмжлэгч: **Медиа Профессионал ХХК** (админ Pricing хуудсанд tenant ID-г нь тохируулна). |
| D7 | Систем production-д чөлөөтэй deploy хийж болно (одоогоор гадны хэрэглэгчгүй); одоогийн ажиллагааг муутгахгүй байх нөхцөлтэй. |

## Дууссан (2026-08-12, тариф v2 багц — PR #23)

| ID | Ажил | Статус |
|---|---|---|
| B-01 | Үйлчилгээний каталог: EXCEL_SMS / API_SMS / EBARIMT_API / POS_EBARIMT кодууд + шилжилтийн migration | ✅ |
| B-02 | Тарифын хөдөлгүүр v2: суурьгүй, 100₮/илгээлт, 3 шатлал, onboarding 100k, POS 20k, НӨАТ 10% (`billing.service.ts` PRICING) | ✅ |
| B-03 | Tenant гэрээт үнэ (`TenantModule.unitPrice`, ж: 75₮) + шатлал (`tier`) + админ PUT /admin/merchants/:id/pricing/:code | ✅ |
| B-04 | Meter-т serviceCode: INVOICE_MSG_SENT (илгээлт бүр 1) + SMS_SEGMENT_SENT (аналитик) | ✅ |
| B-05 | Standalone eBarimt API: POST/GET /partner/receipts, transaction-гүй баримт, B2B дэмжлэг, CASH/CARD/BANK_TRANSFER | ✅ |
| B-06 | Үйлчилгээ 3-ын сарын quota (шатлалын хязгаар, 429 RECEIPT_QUOTA_EXCEEDED) + onboarding нэг удаагийн хураамж (ServiceCharge) | ✅ |
| B-07 | POS терминал: device_id-гаар автомат бүртгэл/тоолол (PosTerminal), блоклох, идэвхтэй терминалаар хураамж | ✅ |
| B-08 | Сар хаах (MonthCloseService): ServiceBill + НӨАТ + Медиа Профессионалаас ААН (B2B) нэхэмжлэх SMS-ээр; админ close-month endpoint | ✅ |
| B-09 | API түлхүүрийн scope (invoice/receipt/pos) + тест горим (bsk_test_, юу ч бичихгүй симуляц) | ✅ |
| B-10 | Partner API-д Idempotency-Key | ✅ |
| B-11 | eBarimt авто retry sweeper (10 мин тутам) | ✅ |
| B-12 | Импортын preview үнэ тохиргооноос (hard-code 25₮ арилгав) | ✅ |
| B-13 | Үйлчилгээний enforcement: EXCEL_SMS/API_SMS идэвхгүй бол илгээлт хаагдана | ✅ |
| B-14 | Байгууллага өөрөө ТЕГ бүртгэлийн хүсэлт + POS sync хийх (OWNER, /tenant/ebarimt/*) | ✅ |
| B-15 | Landing калькулятор үнэ API-гаас (GET /public/pricing) + шинэ копи | ✅ |
| B-16 | Billing UI v2: 4 үйлчилгээний карт, шатлал сонгох, терминалын жагсаалт, НӨАТ-тэй тооцоо, түүхэн bills | ✅ |
| B-17 | Admin Pricing UI v2: бүх тариф + шатлал + НӨАТ + biller tenant + сар хаах товч | ✅ |
| B-18 | Postman collection + тест заавар (docs/API_TESTING.md) | ✅ |

## Дууссан (2026-08-12, админ feedback багц)

| ID | Ажил | Статус |
|---|---|---|
| B-29 | CallPro «Холболт шалгах» худал алдаа засав — квотын endpoint 404 ч сүүлийн 7 хоногт амжилттай илгээлт байвал OK гэж дүгнэнэ | ✅ |
| B-30 | Admin Provider health + System health хуудсуудад Bonum карт нэмэв; Сүпэр админ картыг хасав | ✅ |
| B-31 | Онбординг имэйл хүлээн авагчид (Bonum/LIME) админаас тохируулагддаг боллоо (Бүртгэлийн хүсэлт хуудас, env fallback) | ✅ |
| B-32 | Бүртгэлийн хүсэлт хуудсанд төрлийн шүүлт (Бүгд/Bonum/eBarimt) | ✅ |
| B-33 | Integrations хуудасны eBarimt картад бэлэн байдлын чеклист («Тохируулаагүй»-н оронд яг юу дутуу, хаана засахыг заана) | ✅ |

## Дууссан (2026-08-12, feedback 2-р багц)

| ID | Ажил | Статус |
|---|---|---|
| B-34 | Admin Pricing шошго: «Excel файл ашиглан лист үүсгэж нэхэмжлэл илгээх» / «API ашиглан нэхэмжлэл илгээх үйлчилгээ» | ✅ |
| B-35 | CallPro глобал тохиргоо: «Бүх байгууллагад энэ түлхүүрийг хэрэглэх» товч — нэг ажиллаж буй түлхүүр платформ даяар, зөрүүтэй tenant түлхүүрүүд устна | ✅ |
| B-36 | CallPro тест: нотолгоог платформ даяарх амжилттай илгээлтээс хайдаг боллоо (админ tenant-д илгээлтгүй байхад ч зөв дүгнэнэ) | ✅ |
| B-37 | Developers хуудас үйлчилгээ тус бүрийн таб (Үйлчилгээ 2/3/4) болж өөрчлөгдөв | ✅ |

## Дууссан (2026-08-12, онбордингийн оношилгоо)

| ID | Ажил | Статус |
|---|---|---|
| B-38 | ТЕГ операторын эрх (saveOprMerchants түлхүүр + операторын POS дугаар) админ UI-аас тохируулагддаг боллоо — Интеграци хуудасны eBarimt карт доторх «ТЕГ операторын эрх» хэсэг. Оношилгоо: Ийзи паркинг ebarimt.mn-д гарч ирээгүйн шалтгаан нь EBARIMT_OPR_API_KEY production-д тохируулаагүйгээс «ТЕГ-т бүртгүүлэх хүсэлт» огт илгээгдээгүй байсан. | ✅ |

| B-39 | ТЕГ-ийн нэгдсэн нэвтрэлт (OIDC password grant, client_id=vatps): нэвтрэх нэр/нууц үг админаас тохируулж «🔑 Токен шалгах» товчоор сервер бодит токен авч буйг шалгана | ✅ |

## Дууссан (2026-08-17, OWASP Top 10 аудит — PR #30)

| ID | Ажил | Статус |
|---|---|---|
| B-44 | Нэвтрэлтийн lockout: 5 удаа буруу → 15 мин түгжинэ (`failedLoginCount`/`lockedUntil`, migration 12) + `auth.login_locked` audit | ✅ |
| B-45 | Нууц үг солих (`/auth/change-password`, бусад session revoke) + **SMS-ээр сэргээх** (`/auth/forgot-password` 6 оронтой код 10 мин / `/auth/reset-password`, throttle, enumeration-гүй) + `/forgot-password` UI | ✅ |
| B-50 | Refresh token reuse detection: солигдсон token дахин ирвэл хулгайн дохио гэж үзэн тухайн хэрэглэгчийн БҮХ session revoke + `auth.refresh_reuse_detected` audit | ✅ |
| B-55 | Өдөр тутмын автомат DB backup (deploy бүрд cron суулгана: 03:30 УБ, pg_dump→gzip, 14 хоног, `/opt/billingservice/backups`) + контейнер hardening (`USER node`, `no-new-privileges` бүх сервист) | ✅ |
| B-56 | Админ SMS 2FA (SCA): `ADMIN_2FA=true` үед нэвтрэлт 2 алхамтай (утас руу 6 оронтой код, 5 мин, 5 оролдлого, migration 13). Стандартын үнэлгээ: `docs/SECURITY_STANDARDS.md` (PCI DSS/ISO 27001/SCA/Zero Trust) | ✅ |
| B-54 | Нууц үгийн бодлого бүх талбарт (8+, том/жижиг үсэг, тоо, тусгай тэмдэгт — API DTO + web live чеклист); демо данс АДМИНААС үүсдэг боллоо (Admin → Ops, нэг удаа харагдах санамсаргүй нууц үг, login хуудасны демо hint устгав); bootstrap админ `mustChangePassword`-тэй үүсч UI сольтол анхааруулна; Swagger `/api/docs` **default хаалттай** болов (landing линкүүд хасагдав) | ✅ |
| B-52 | OWASP Top 10 аудит (тайлан: `docs/SECURITY_OWASP.md`) + шууд засварууд: CSV formula injection саармагжуулалт; нэвтрэлтийн амжилт/бүтэлгүйтлийн audit log (IP-тай); tenant webhook-ийн SSRF хамгаалалт (private IP хориг + redirect manual + TLD шаардлага); legacy webhook HMAC + timingSafeEqual + throttle; цуцалсан/хугацаа дууссан pay линк status/simulate-д ажиллахгүй болов; reports export VIEWER-т хаагдав; API түлхүүрийн scope ил тод болов; CORS fail-closed; JWT HS256 pin; Caddy clickjacking/Permissions-Policy header; login хуудасны демо нууц үг prod-д нуугдав; SWAGGER_ENABLED унтраалга | ✅ |

## Дууссан (2026-08-17, домэйн + брэнд шилжилт)

| ID | Ажил | Статус |
|---|---|---|
| B-40 | Үйлчилгээний нэр **Message Billing Service**, канон домэйн **msgbill.mn**, SMS-ийн богино линк **bil.mn** болов. Caddy дээр 4 хаягт (msgbill.mn, www, bil.mn, www) auto-HTTPS; bil.mn нь `/p/*`-ийг ижил web контейнерээр redirect-гүй үйлчилж, нүүр хуудсаа канон хаяг руу заана + `X-Robots-Tag: noindex`. Сервер тал: шинэ `SHORT_URL_BASE` env (хоосон бол PUBLIC_URL) — SMS/сануулга/API тест хариу бүх төлбөрийн линк `payLinkFor()`-оор нэг эх сурвалжаас гарна. `remote-deploy.sh` нь БАЙГАА `.env`-ийн домэйныг idempotent шинэчилж (backup-тай), CORS-д bil.mn нэмнэ. Хуучин `billing.mastrsys.com` ашиглахаа больсон. | ✅ |
| B-43 | Deploy бүрд Caddy тохиргоог дахин ачаалдаг болов (`caddy reload`, fallback restart) — Caddyfile bind-mount тул `up -d` өөрчлөлтийг авдаггүй, 2026-08-17-ны эхний domain deploy үүнээс болж verify дээр унасан. Мөн `www.bil.mn` (DNS-д нэмэгдсэн) Caddy-д орж, verify unaлтад caddy log-ийн оношилгоо нэмэгдэв. | ✅ |

## Хүлээгдэж буй (дараагийн ээлж)

| ID | Ажил | Тэргүүлэх | Тайлбар |
|---|---|---|---|
| B-20 | Production дээр Медиа Профессионал tenant-ийн ID-г Admin → Pricing-д тохируулах | P0 | Гар тохиргоо — deploy-ийн дараа хийнэ |
| B-21 | Платформын нэхэмжлэхийн төлөлт хоцрох үеийн сануулга/зогсоолт (dunning) | P1 | Одоо REMINDER модулиар сануулах боломжтой; автомат зогсоолт алга |
| B-22 | eBarimt баримт ЦУЦЛАХ API (буцаалт/refund-ийн баримт) | P1 | posapi adapter-т cancel зам + /partner/receipts/:id/cancel |
| B-23 | Онбордингийн нэгдсэн статус самбар (Bonum/LIME/ТЕГ алхам бүр нэг дэлгэцэд) | P1 | IntegrationRequest төлвүүд бэлэн, UI нэгтгэл дутуу |
| B-24 | Төлбөрийн хуудсанд төлөгч ААН-ийн баримт сонгох (B2B) | P2 | Суурь талбарууд бэлэн (receiptType/payerRegNo) |
| B-25 | Quota дөхөх үеийн анхааруулга (имэйл/SMS) + шатлал upsell | P2 | |
| B-26 | Хуучин SMS_SEGMENT_SENT түүхэн тооцооны тайлан (25₮ үеийн) архивлах | P2 | Түүх meter-т хадгалаатай — шаардлага гарвал |
| B-27 | Bonum онбордингийг API гарвал автоматжуулах | P2 | Одоо имэйл + админ бүртгэл |
| B-28 | Reconciliation (settlement тулгалт), PII field-level encryption | P2 | RISKS.md Phase 2 |
| B-41 | `bil.mn`-ийг CallPro-д баталгаажсан домэйн болгож бүртгүүлэх | P0 | Гар ажил. Бүртгэгдэх хүртэл `SHORT_URL_BASE`-ийг хоосон болговол msgbill.mn-ээр илгээгдэнэ (B-40) |
| B-42 | Bonum webhook/callback URL-ийг `https://msgbill.mn/...` болгож шинэчлүүлэх | P0 | Гар ажил — Bonum-той имэйлээр |
| B-57 | Backup-ийг off-site (DO Spaces/S3) хуулах + сард нэг restore drill | P1 | B-55-ийн үргэлжлэл |
| B-58 | Production-д `ADMIN_2FA=true` асаах | P1 | CallPro (B-41) баталгаажсаны дараа |
| B-53 | **P0 гар ажил:** production-ы seed данснууд (`admin@billingservice.mn/Admin123$` platform admin, `demo@…/Demo123$`) — нууц үг солих/эрх буулгах (`docs/SECURITY_OWASP.md` §Яаралтай) | P0 | Анхны deploy SEED_ON_START=true-тэй явсан |
| B-44 | Нэвтрэлтийн lockout (failedLoginCount/lockedUntil + backoff) | P1 | OWASP A07 |
| B-45 | Нууц үг солих + имэйлээр сэргээх урсгал | P1 | Одоо endpoint огт алга |
| B-46 | `GET /tenant`-ийн банк/регистр талбаруудыг роль-аар шүүх; админ provider baseUrl-д `@IsUrl` | P2 | |
| B-47 | Гарах webhook secret-ийг шифрлэж хадгалах | P2 | |
| B-48 | JWT-ийг localStorage → httpOnly cookie | P2 | XSS үед session хулгайг таслана |
| B-49 | NestJS 11 + Next 15 major upgrade (npm audit цэвэрлэгээ, multer 2.x) | P1 | Production audit: API 4 high, web 3 high |
| B-50 | Refresh token reuse detection + гишүүн хасагдахад bulk revoke | P2 | |
| B-51 | Alerting (алдаа/health-ийн идэвхтэй дохио) | P2 | Одоо зөвхөн stdout log |

## Хойшлуулсан / санаанууд

- ❄ Илгээлтийн үнийг сувгаар (Excel vs UI) ялгах — одоогоор хоёулаа EXCEL_SMS.
- ❄ Багц (Starter/Growth/...) — PRD §4.4; 4 үйлчилгээний load харж байж шийднэ.
- ❄ Олон валют, олон улсын бэлэн байдал.
