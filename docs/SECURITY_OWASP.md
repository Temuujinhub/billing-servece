# OWASP Top 10 (2021) аудит — msgbill.mn

Огноо: 2026-08-17 · Хамрах хүрээ: `apps/api` (NestJS), `apps/web` (Next.js),
`deploy/` (Caddy, compose, deploy скрипт) · Арга: кодын бүрэн мөр-мөрөөр шалгалт.

**Ерөнхий дүгнэлт:** суурь нь ердийн системээс хамаагүй сайн — global
deny-by-default JWT guard, tenant тусгаарлалт бүрэн (IDOR **нэг ч олдоогүй**),
AES-256-GCM, bcrypt-12, rotation-той refresh token, гарын үсэгтэй webhook,
өргөн audit log. Гол дутагдлууд нь нэвтрэлтийн lockout байхгүй, нууц үг солих
боломж байхгүй, production-д seed-лэгдсэн данснууд, token localStorage-д.

Тэмдэглэгээ: ✅ хангасан · 🔧 энэ аудитаар засав (PR #30) · ⚠ үлдэгдэл эрсдэл
(backlog-т B-дугаартай) · 📋 бизнес шийдвэр хэрэгтэй.

---

## A01 — Broken Access Control

| Байдал | Дүгнэлт |
|---|---|
| ✅ | Global guard дараалал (Throttler → JWT → Roles) deny-by-default; нээлттэй зам бүр ил `@Public()`-тэй |
| ✅ | **Tenant тусгаарлалт бүрэн**: бүх query `tenantId`-аар шүүгддэг, `:id` авдаг 20+ endpoint бүгд эзэмшил шалгадаг — IDOR олдоогүй. Mutation-ууд `updateMany + count===0 → 404` (race-гүй) |
| ✅ | Partner API: түлхүүр hash-аар хадгалагдаж, test түлхүүр DB-д юу ч бичдэггүй, tenant-аар бүрэн тусгаарлагдсан, idempotency зөв |
| ✅ | Last-owner хамгаалалт, өөрийгөө хасах/бууруулах хориг, партнёр ажилтан зөвхөн өөрийн төрлийн хүсэлт шийддэг |
| 🔧 | `GET /reports/export` (10k мөр нэр/утастай CSV) VIEWER-т нээлттэй байсан → `@Roles(ACCOUNTANT, OPERATOR)` болов |
| 🔧 | API түлхүүр хоосон scope = бүх эрх (fail-open) байсан → шинэ түлхүүрт scope ил тодоор бичигддэг болов (хуучин түлхүүрүүд эвдрээгүй) |
| ⚠ B-46 | `GET /tenant` нь банкны данс, регистр зэргийг VIEWER-т ч буцаадаг — роль-аар талбар шүүх |
| ⚠ | `integrations` base path-д admin + tenant хоёр controller зэрэгцдэг — ирээдүйд route нэмэхэд болгоомжтой (одоо мөргөлдөөгүй) |

## A02 — Cryptographic Failures

| Байдал | Дүгнэлт |
|---|---|
| ✅ | AES-256-GCM (random IV, auth tag), түлхүүр 64-hex Joi-оор шаардлагатай; MD5/SHA1/ECB огт байхгүй |
| ✅ | Нууц үг bcrypt cost 12 (бүх зам дээр); refresh token/API key/pay token зөвхөн SHA-256 hash-аараа хадгалагддаг |
| ✅ | Нууц үгийн бодлого: мин 8, макс 72 (bcrypt таслалтын хамгаалалт), үсэг+тоо |
| ✅ | Secret-үүд deploy бүрт `openssl rand`-аар үүсдэг, repo-д нэг ч байхгүй, log-д хэзээ ч хэвлэгддэггүй |
| 🔧 | Legacy webhook `sha256(secret.body)` (length-extension эмзэг) + энгийн `!==` харьцуулалт байсан → жинхэнэ HMAC + `timingSafeEqual` болов (хуучин формат нийцтэй хэвээр) |
| 🔧 | JWT-д `algorithms: ['HS256']` pin нэмэв (defense-in-depth) |
| ⚠ B-47 | Гарах webhook-ийн secret DB-д plaintext (провайдерын credential шифрлэгддэгтэй зөрүүтэй) |

## A03 — Injection

| Байдал | Дүгнэлт |
|---|---|
| ✅ | Raw SQL байхгүй (ганц `$queryRaw\`SELECT 1\`` — параметргүй health check); `child_process`/`eval` байхгүй |
| ✅ | XSS: `dangerouslySetInnerHTML` нэг ч байхгүй — бүх рендер React-ийн escape-ээр |
| ✅ | Global `ValidationPipe` (`whitelist` + `forbidNonWhitelisted` + `transform`) — кодын хамгийн сайн хяналт |
| ✅ | Excel импорт: 5MB + 5000 мөр хязгаартай, OPERATOR эрхтэй, parse алдаа барьдаг |
| 🔧 | **CSV formula injection**: экспортод хэрэглэгчийн нэр/тайлбар `=`, `+`, `-`, `@`-аар эхэлбэл Excel томьёо болж ажилладаг байсан → `'` угтвараар саармагжуулав |
| ⚠ | Upload зөвхөн өргөтгөлөөр (MIME шалгадаггүй) — нөлөө бага (parse fail барьдаг) |

## A04 — Insecure Design

| Байдал | Дүгнэлт |
|---|---|
| ✅ | Төлбөрийн итгэлцлийн загвар маш зөв: **хуурамч webhook мөнгө бичиж чадахгүй** — баталгаагүй callback нь зөвхөн provider-оос дахин шалгах trigger болдог |
| ✅ | Replay-safe confirm (`updateMany` claim, P2002 no-op), идемпотент бүх зам |
| ✅ | Pay token: hash-тай, хугацаатай, цуцлагддаг; 48 бит + rate limit |
| ✅ B-44 | Нэвтрэлтийн lockout нэмэгдэв: 5 удаа буруу → 15 минут түгжинэ (`failedLoginCount/lockedUntil`), түгжигдсэн оролдлого audit log-д `auth.login_locked` |
| ✅ B-45 | Нууц үг солих (`POST /auth/change-password`, бусад session revoke) + SMS-ээр сэргээх (`/auth/forgot-password` → 6 оронтой код, 10 мин, 5 оролдлого, throttle 3/15мин → `/auth/reset-password`) нэмэгдэв |

## A05 — Security Misconfiguration

| Байдал | Дүгнэлт |
|---|---|
| ✅ | Helmet идэвхтэй, `trust proxy 1` зөв, Postgres гадагш ил гардаггүй (порт publish-гүй), Caddy admin зөвхөн контейнер дотор |
| ✅ | Env Joi-оор boot дээр шалгагддаг (дутуу secret = унана, чимээгүй ажиллахгүй) |
| 🔧 | Caddy: `X-Frame-Options DENY` + `frame-ancestors 'none'` (төлбөрийн хуудасны clickjacking!), `Permissions-Policy` нэмэв |
| 🔧 | CORS: `CORS_ORIGINS` хоосон үед бүх origin-д нээгддэг байсан → fail-closed болов |
| 🔧 | Login хуудасны «Демо: demo@…/Demo123$» бичиг production build-д харагдахаа болив |
| 🔧 | Swagger `SWAGGER_ENABLED=false`-аар унтраах боломжтой болов |
| ✅ | `/api/docs` (Swagger) DEFAULT ХААЛТТАЙ болов (2026-08-17, эзний шийдвэр) — партнёрт Postman collection + docs/API_TESTING.md. Нээх бол `.env`-д `SWAGGER_ENABLED=true` |
| ⚠ B-48 | Access/refresh token **localStorage-д** — XSS гарвал 7 хоногийн session хулгайлагдана. httpOnly cookie руу шилжих нь дунд хэмжээний refactor |

## A06 — Vulnerable and Outdated Components

`npm audit` (production deps): API 15 (4 high), Web 3 high. **Бүгд major
upgrade шаарддаг** (NestJS 10→11: multer/body-parser/qs; Next 14→15/16:
глобал CSS-ийн postcss) тул энэ PR-д хийгээгүй — production эвдэх эрсдэлгүй
цонхонд тусад нь хийнэ (**B-49**, P1). Тэмдэглэвэл:

- `multer` 1.x (deprecated, DoS advisory) — Nest 11-тэй хамт шинэчлэгдэнэ
- Next 14.2.35 ажиллаж байгаа нь CVE-2025-29927 (middleware bypass)-аас **дээш** хувилбар, мөн апп middleware ашигладаггүй — яаралтай биш
- JWT нь `@nestjs/jwt` 10.x (jsonwebtoken 9, CVE-2022-23529-ийн дараах) ✅

## A07 — Identification and Authentication Failures

| Байдал | Дүгнэлт |
|---|---|
| ✅ | Refresh rotation (нэг удаагийн хэрэглээ), нэвтрэлтийн enumeration-гүй, auth зам бүр Throttle-тэй |
| ✅ B-44 | Lockout нэмэгдэв (дээрх A04) |
| ✅ B-45 | Нууц үг солих/SMS сэргээх нэмэгдэв (дээрх A04); нууц үгийн бодлого: 8+, том/жижиг үсэг, тоо, тусгай тэмдэгт (бүх талбарт) |
| ⚠ B-50 | Refresh token хулгайн **reuse detection байхгүй** — цуцлагдсан token дахин ирэхэд бүх chain-ийг таслах хэрэгтэй; гишүүн хасагдахад token-ууд нь bulk revoke хийгддэггүй |
| 📋 **P0 гар ажил** | **Production DB-д seed данснууд амьд байна**: `demo@billingservice.mn / Demo123$` (OWNER) ба `admin@billingservice.mn / Admin123$` (**platform admin!**) — анхны deploy `SEED_ON_START=true`-тэй явсан. **Одоо шууд**: admin@-ийн нууц үгийг солих/устгах, demo-гийнхыг солих. Доорх «Яаралтай гар ажил» хэсгийг үз |

## A08 — Software and Data Integrity Failures

| Байдал | Дүгнэлт |
|---|---|
| ✅ | Bonum webhook: raw body дээрх HMAC-SHA256 (`x-checksum-v2`), баталгаажаагүй бол мөнгө бичихгүй; QPay callback триггер төдий (үнэн нь `/payment/check`) |
| ✅ | Гарах webhook-ууд endpoint тус бүрийн secret-ээр HMAC-лагдсан (`X-Billing-Signature`) |
| 🔧 | Legacy webhook HMAC + timingSafeEqual + 120/мин Throttle болов |
| ✅ | Deploy provenance: `/health/live` ажиллаж буй commit SHA-гаа буцааж, workflow таарахгүй бол унадаг |

## A09 — Security Logging and Monitoring Failures

| Байдал | Дүгнэлт |
|---|---|
| ✅ | Audit log 34 цэгт (түлхүүр, webhook, гишүүд, тохиргоо, нэхэмжлэх, админ үйлдэл...) — сайн бүтэцтэй (actor, target, meta) |
| ✅ | Алдааны хариу дотоод мэдээлэл задруулдаггүй (stack зөвхөн сервер талд, request_id-тай) |
| 🔧 | **Нэвтрэлтийн амжилт/бүтэлгүйтэл огт бүртгэгддэггүй байсан** → `auth.login_failed` / `auth.login_succeeded` (IP-тай) audit log-д бичигддэг болов — brute force одоо Admin → Audit-аас харагдана |
| ⚠ B-51 | Alerting байхгүй (Sentry/имэйл/SMS дохио) — log зөвхөн stdout, контейнер устахад алдагдана |

## A10 — SSRF

| Байдал | Дүгнэлт |
|---|---|
| ✅ | Бүх гарах хүсэлт timeout-той; провайдерын base URL-ууд env/админ түвшинд |
| 🔧 | **Tenant-ийн webhook URL дотоод сүлжээ рүү зааж болдог байсан** (`http://postgres:5432`, `http://169.254.169.254`...) → DTO-д TLD шаардлага + илгээхийн өмнө DNS resolve хийж private/loopback/link-local IP хориглох + `redirect: 'manual'` болов |
| ⚠ | Админы provider baseUrl талбар `@IsUrl` биш `@IsString` — админ эрх урссан үед credential өөр хост руу чиглүүлж болно (B-46-д багтаана) |

---

## Яаралтай ГАР ажил (код биш, өнөөдөр)

1. **Production-ы seed данснуудыг цэгцлэх** — сервер дээр:

   ```bash
   ssh root@202.37.235.16
   cd /opt/billingservice
   C="docker compose -f docker-compose.prod.yml"
   # admin@billingservice.mn-ийг platform admin-аас буулгаж НУУЦ ҮГИЙГ солино
   # (эсвэл ADMIN_BOOTSTRAP_* -ээр өөрийн жинхэнэ админ данс үүсгэсэн бол устгана):
   $C exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
     "UPDATE \"User\" SET \"platformAdmin\"=false WHERE email='"'"'admin@billingservice.mn'"'"';"'
   # demo дансны нууц үгийг сольж өг (эсвэл tenant-ийг нь SUSPENDED болго).
   ```

   Өөрийн админ эрх `ADMIN_EMAILS`/`ADMIN_BOOTSTRAP_*`-аар байгаа эсэхээ
   ЭХЛЭЭД шалгаарай — эс бөгөөс админ хандалтгүй үлдэнэ.

2. Бодит төлбөрийн провайдер асаахын өмнө `.env`-д `PAYMENT_SANDBOX=false`
   болгохоо мартахгүй (одоо mock+sandbox — зориудын демо төлөв).

## Backlog-т нэмэгдсэн (docs/BACKLOG.md)

| ID | Ажил | Тэргүүлэх |
|---|---|---|
| B-46 | `GET /tenant` талбаруудыг роль-аар шүүх; админ baseUrl-д `@IsUrl` | P2 |
| B-47 | Гарах webhook secret-ийг шифрлэж хадгалах | P2 |
| B-48 | Token-ийг localStorage-аас httpOnly cookie руу шилжүүлэх | P2 |
| B-49 | NestJS 11 + Next 15 major upgrade (npm audit цэвэрлэгээ, multer 2.x) | P1 |
| B-50 | Refresh token reuse detection + гишүүн хасагдахад bulk revoke | P2 |
| B-51 | Alerting (алдаа/health дохио имэйл эсвэл SMS-ээр) | P2 |
