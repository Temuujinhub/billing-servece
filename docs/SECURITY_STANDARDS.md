# Төлбөрийн системийн стандартуудтай харьцуулсан үнэлгээ

> 2026-08-17. OWASP Top 10 аудитын (`SECURITY_OWASP.md`) үргэлжлэл — олон
> улсын стандартууд болон архитектурын зарчмуудаар msgbill.mn-ийг үнэлж,
> кодоор шийдэж болох зүйлсийг хийсэн бүртгэл. Статус: ✅ хангасан ·
> 🔧 энэ PR-аар нэмэгдсэн · ⚠ дутуу (backlog) · ◻ бидэнд хамааралгүй.

## 1. PCI DSS (картын мэдээллийн стандарт)

**Гол дүгнэлт: бид картын мэдээлэл огт хүлээж авдаггүй, хадгалдаггүй,
дамжуулдаггүй** — төлбөр бүхэлдээ QPay (QR/апп) болон Bonum (hosted checkout,
тэдний хуудсан дээр) дээр хийгддэг. Тиймээс PCI DSS-ийн хамрах хүрээ (scope)
хамгийн бага «redirect/hosted» түвшинд байна — энэ нь зориудын, ЗӨВ
архитектурын шийдвэр: PAN/CVV манай кодод ч, DB-д ч, log-д ч байхгүй.

| # | Байдал |
|---|---|
| ✅ | Картын өгөгдөл системд орж ирэх ямар ч зам байхгүй (форм ч байхгүй) |
| ✅ | Provider-ийн нууцууд (terminal ID, secret, checksum key) AES-256-GCM-ээр шифрлэгдэж хадгалагддаг |
| ✅ | Төлбөрийн баталгаажилт webhook signature (HMAC-SHA256, timingSafeEqual) + status recheck давхар шалгалттай |
| ✅ | Мөнгөн бичилт append-only ledger, balance нь derived — гараар засварлагдахгүй |
| ⚠ | Хэрэв ирээдүйд карт шууд хүлээж авбал (Stripe-маягийн iframe/token биш өөрийн форм) PCI DSS SAQ D бүрэн хэрэгжинэ — **тэгэхгүй байхыг зөвлөнө** |

## 2. PA-DSS / PCI Secure Software Framework

Бид төлбөрийн application vendor биш (карт боловсруулдаггүй) тул шууд
хамааралгүй ◻. Гэхдээ түүний суурь зарчмуудыг мөрддөг:

| # | Байдал |
|---|---|
| ✅ | Нууцууд repo-д хэзээ ч ордоггүй (анхны deploy үед random үүсч серверийн .env-д л амьдардаг) |
| ✅ | Идэмпотент төлбөрийн зам: provider payment ID unique, Idempotency-Key, давхар бичилтийн хамгаалалт |
| ✅ | Deploy бүр commit SHA-гаар нотлогддог (/health/live) — supply chain-ий үндсэн хяналт |
| 🔧 | Хамаарлын эмзэг байдлын бүртгэл `npm audit`-аар; үлдэгдэл нь major upgrade шаардana (B-49) |

## 3. ISO/IEC 27001 (мэдээллийн аюулгүй байдлын удирдлага)

Энэ нь техник + **байгууллагын** стандарт — сертификаци нь бодлого, журам,
эрсдэлийн бүртгэл шаарддаг. Техник талын хяналтуудын байдал:

| Хяналт | Байдал |
|---|---|
| Хандалтын удирдлага (A.9) | ✅ RBAC 4 роль + platformAdmin + партнёрын хязгаарлагдмал эрх; API түлхүүр scope-той |
| Криптограф (A.10) | ✅ bcrypt(12), AES-256-GCM, HMAC-SHA256, JWT HS256 pin |
| Үйл ажиллагааны аюулгүй байдал (A.12) | 🔧 **Өдөр тутмын автомат DB backup нэмэгдэв** (03:30 УБ, gzip, 14 хоног, `/opt/billingservice/backups`) — өмнө нь backup огт байгаагүй нь хамгийн том цоорхой байсан |
| Log/мониторинг (A.12.4) | ✅ AuditLog (нэвтрэлт, админ үйлдэл, төлбөр); ⚠ гадагш alerting байхгүй (B-51) |
| Нөхөн сэргээлт (A.17) | 🔧 backup + `DEPLOYMENT.md`-ийн сэргээх заавар; ⚠ сэргээх сургуулилт (restore drill) хийгдээгүй — сард нэг удаа `gunzip -c backups/db-YYYY-MM-DD.sql.gz | psql ...`-ээр туршихыг зөвлөнө |
| Нийлүүлэгчийн харилцаа (A.15) | ✅ QPay/Bonum/CallPro/LIME бүгд гэрээт, интеграц бүр өөрийн итгэлцлийн шалгуурtai |
| Бодлого/журам (A.5, A.6, A.16) | ⚠ Бичгийн бодлого, инцидентийн журам байхгүй — сертификаци руу явбал зохион байгуулалтын ажил (код биш) |

## 4. SCA (Strong Customer Authentication)

| # | Байдал |
|---|---|
| 🔧 | **Админ SMS 2FA нэмэгдэв** (`ADMIN_2FA=true` env): платформын админ нэвтрэхдээ утсандаа ирсэн 6 оронтой кодоор давхар баталгаажна (5 мин хүчинтэй, 5 оролдлого, throttle). CallPro бүрэн ажилладаг болмогц асаана — утасгүй админ түгжирэхгүй fallback-тай |
| ✅ | Төлбөр төлөгчийн баталгаажуулалт QPay/Bonum-ийн (банкны апп) түвшинд хийгддэг — тэнд SCA нь банкны хариуцлага |
| ⚠ | Энгийн хэрэглэгчийн 2FA (сонголтоор) + TOTP app дэмжлэг — дараагийн ээлж (B-56 өргөтгөл) |

## 5. Архитектурын зарчмууд

### Security by Design ✅
Анхнаас нь: mock/бодит provider-ийг ports & adapters-ээр тусгаарласан,
callback-д итгэдэггүй (status recheck), мөнгө integer MNT, append-only ledger,
токен hash-лагдаж хадгалагддаг, идэмпотент migration. Шинэ шийдвэр бүр
BACKLOG-д D/B дугаартай бичигддэг.

### Defense in Depth 🔧
Давхаргууд: Caddy (TLS, security headers, rate-limited public routes) → NestJS
(helmet, CORS fail-closed, ValidationPipe whitelist, guards, throttler) → DB
(tenant-scoped query бүр, unique constraints) → Ledger (derived balance).
Энэ PR-аар нэмэгдсэн: контейнерууд **root-гүй** ажиллана (`USER node`),
бүх сервис `no-new-privileges`, DB backup давхарга.

### Least Privilege 🔧
| # | Байдал |
|---|---|
| ✅ | RBAC + tenant scoping + API key scopes + партнёрын partnerKind |
| 🔧 | API/web контейнер root биш `node` хэрэглэгчээр ажилладаг боллоо |
| 🔧 | Бүх контейнерт `no-new-privileges:true` (privilege escalation хаалттай) |
| ✅ | Postgres/API/web гадагш порт нээдэггүй — зөвхөн Caddy 80/443 |
| ⚠ | DB нэг хэрэглэгчтэй (read-only replica/хэрэглэгч ялгаагүй) — одоогийн хэмжээнд тохиромжтой, өсөхөөр тусгаарлана |

### Threat Modeling 🔧
Гол аюулын загварууд ба хамгаалалт:

| Аюул | Хамгаалалт |
|---|---|
| Хуурамч төлбөрийн webhook | HMAC + timingSafeEqual; itгэхгүй бол provider status recheck; audit |
| Төлбөрийн линк таамаглах | 48-bit random token, hash хадгалалт, expiry, rate limit, цуцлагдсан линк идэвхгүй |
| Credential stuffing / brute force | Lockout (5→15мин), per-route throttle, audit log IP-тай, нууц үгийн бодлого |
| Token хулгай (XSS) | 🔧 refresh reuse detection — хуучин token дахин ирвэл бүх session revoke; ⚠ httpOnly cookie шилжилт (B-48) |
| SMS код brute force | 6 оронтой код 5-10 мин, 5 оролдлого, hash хадгалалт, хүсэлтийн throttle |
| Дотоод хортой хэрэглэгч (tenant) | Бүх query tenantId-аар; экспортын CSV injection саармагжуулсан; SSRF хориг |
| Сервер эвдрэх | Нууцууд .env-д (repo-гүй), контейнер non-root, no-new-privileges, DB дотоод сүлжээнд |
| Өгөгдөл алдагдах | 🔧 өдөр тутмын шифргүй локал backup — ⚠ off-site хуулбар (S3/Spaces) дараагийн алхам |

### Zero Trust 🔧
| # | Байдал |
|---|---|
| ✅ | Бүх API хүсэлт guard-аар (default deny, @Public нь цөөн тодорхой зам) |
| ✅ | Webhook-ийн гарын үсэг байхгүй/буруу бол trigger төдий — мөнгөний үнэн provider status |
| 🔧 | Refresh token reuse detection: солигдсон token дахин ирэх = хулгайн дохио → БҮХ session revoke + audit |
| 🔧 | Админ нэвтрэлт password + SMS эзэмшлийн давхар нотолгоо (ADMIN_2FA) |
| ✅ | Дотоод сервисүүд ч нэрээр биш — интеграц бүр өөрийн credential-ээр |

## Энэ PR-аар нэмэгдсэн кодын өөрчлөлтүүд (хураангуй)

1. **DB backup автоматжуулалт** — deploy бүрд cron суулгана (B-55).
2. **Refresh token reuse detection** — bulk revoke + audit (B-50).
3. **Админ SMS 2FA** — `ADMIN_2FA=true` env, migration 13 (B-56).
4. **Контейнер hardening** — `USER node` (api, web) + `no-new-privileges` (бүгд).

## Дараагийн ээлжийн зөвлөмж (кодоос гадуур эсвэл том ажил)

| Ажил | Тэргүүлэх |
|---|---|
| Backup-ийг off-site хуулах (DO Spaces/S3, шифрлэлттэй) + сард нэг restore drill | P1 |
| `ADMIN_2FA=true` production-д асаах (CallPro баталгаажсаны дараа) | P1 |
| Alerting: health/error дохио имэйл/SMS-ээр (B-51) | P2 |
| httpOnly cookie session (B-48), NestJS 11/Next 15 (B-49) | P2 |
| ISO 27001 бичгийн бодлого/инцидентийн журам (сертификаци шаардвал) | P3 |
