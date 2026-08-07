# Гадаад интеграцууд — Bonum Gateway + eBarimt POS API 3.0

Энэ баримт нь хоёр бодит интеграцын тохиргоо, ажиллах зарчмыг тайлбарлана:

1. **Төлбөр — Bonum Gateway** (psp.bonum.mn, Merchant Portal: merchant.bonum.mn)
2. **eBarimt — ТЕГ POS API 3.0** (LIME-ээр дамжуулан суулгасан локал instance)

> ⚠️ **Нууц мэдээлэл repo-д ХЭЗЭЭ Ч орохгүй.** Terminal ID, Secret Key,
> MERCHANT_CHECKSUM_KEY зэрэг нь зөвхөн серверийн `.env` дотор амьдарна.

---

## 1. Bonum Gateway (PAYMENT_PROVIDER=bonum)

### Орчин

| Хувьсагч | Тест | Production |
|---|---|---|
| `BONUM_BASE_URL` | `https://testapi.bonum.mn` | `https://apis.bonum.mn` |
| `BONUM_TERMINAL_ID` | Merchant Portal дээр үүсгэнэ | Bonum-оос ирсэн имэйл |
| `BONUM_APP_SECRET` | Merchant setup үед олгогдоно | Bonum-оос ирсэн имэйл |
| `BONUM_CHECKSUM_KEY` | — | MERCHANT_CHECKSUM_KEY |

```env
PAYMENT_PROVIDER=bonum
PAYMENT_SANDBOX=false
BONUM_BASE_URL=https://apis.bonum.mn
BONUM_TERMINAL_ID=...      # имэйлээр ирсэн Terminal ID
BONUM_APP_SECRET=...       # имэйлээр ирсэн Secret Key
BONUM_CHECKSUM_KEY=...     # имэйлээр ирсэн MERCHANT_CHECKSUM_KEY
```

> **Multi-tenant:** env доторх credentials нь платформын өөрийн (fallback)
> терминал. Байгууллага (tenant) бүр Bonum дээр өөрийн терминалтай — тэдгээрийн
> Terminal ID/Secret/Checksum нь Dashboard → Интеграци → «Bonum төлбөрийн гарц»
> картад шифрлэгдэж (AES-256-GCM, `Tenant.bonum*` багана) хадгалагдан, тухайн
> байгууллагын нэхэмжлэхэд автоматаар хэрэглэгдэнэ. Тэр картын асаах/унтраах
> төлөв нь `ProviderConfig(code='BONUM')` мөрөнд хадгалагдана — унтраасан үед
> credential байсан ч гарц ашиглагдахгүй, төлбөр mock горимд шилжинэ.
> Онбордингийн бүрэн дараалал: [`ONBOARDING.md`](ONBOARDING.md).

### Webhook бүртгүүлэх

Bonum-ийн имэйлд хариу болгон дараах WEBHOOK URL-ээ илгээж бүртгүүлнэ:

```
https://<PUBLIC_URL домэйн>/api/v1/webhooks/bonum/callback
```

**Webhook нь Bonum дээр мөнгөний үнэн** (албан doc §3.3: status endpoint нь
зөвхөн тест орчинд — "DO NOT USE THIS SERVICE ON PRODUCTION"). Ирсэн POST-ын
`x-checksum-v2` header = `hex(HMAC-SHA256(rawBody, MERCHANT_CHECKSUM_KEY))`
(§7). Манай сервер:

- checksum **таарвал** → криптографаар баталгаажсан тул `SUCCESS/PAID`
  мэдээллээр төлбөрийг шууд бичнэ; `FAILED/EXPIRED` бол intent-ийг EXPIRED
  болгоно;
- checksum **таарахгүй/байхгүй** бол → зөвхөн trigger гэж үзээд audit-д
  бүртгэж, invoice-check API-гаар (тест орчны backstop) дахин шалгана.

### Линкийн амьдрах хугацаа ба дахин үүсгэлт (ГОЛ ЛОЖИК)

Bonum-ийн төлбөрийн линк **богино хугацаанд амьдардаг** тул төлөгч рүү SMS-ээр
**хэзээ ч Bonum линк илгээхгүй**. Урсгал:

```
SMS  →  МАНАЙ богино линк (billingservice.mn/pay/<token>, урт хугацаанд хүчинтэй)
              │  төлөгч хэдэн өдрийн дараа ч дарж болно
              ▼
        Pay page «Төлбөр төлөх» дарахад:
          1. Нэхэмжлэх төлөгдсөн эсэхийг шалгана (хуучин линкээр төлсөн байж
             болзошгүй тул provider-оос дахин баталгаажуулна)
          2. Амьд (хугацаа нь дуусаагүй) intent байвал түүнийгээ дахин ашиглана
          3. Хугацаа нь дууссан бол хуучин intent-ийг EXPIRED болгож, Bonum дээр
             ШИНЭ invoice/линк үүсгээд төлөгчийг чиглүүлнэ
```

Өөрөөр хэлбэл — Bonum линк устсан байсан ч манай линк хэзээд ажиллана,
төлөгдөөгүй тохиолдолд шинэ Bonum линк автоматаар үүснэ.

### Auth rate limit

`GET /bonum-gateway/ecommerce/auth/create` нь rate-limit-тэй ("Use previous
token. Do not get token too frequently", 429) тул token терминал тус бүрээр
кэшлэгдэж (`expiresIn`=1800 сек), дуусахын өмнө `auth/refresh`-ээр сэргээгдэнэ
(single-flight). Headers: `Authorization: AppSecret {APP_SECRET}` +
`X-TERMINAL-ID`.

### Контрактын товчлол (албан doc-той тулгагдсан ✓)

| Үйлдэл | Endpoint | Тайлбар |
|---|---|---|
| Token авах | `GET /bonum-gateway/ecommerce/auth/create` | `AppSecret` + `X-TERMINAL-ID` headers |
| Token сэргээх | `GET /bonum-gateway/ecommerce/auth/refresh` | `Bearer {refreshToken}` |
| Нэхэмжлэх үүсгэх | `POST /bonum-gateway/ecommerce/invoices` | `{amount, callback, transactionId, expiresIn, items?}` → `{invoiceId, followUpLink}` |
| Статус (зөвхөн тест!) | `GET /bonum-gateway/ecommerce/invoices/{invoiceId}` | Production-д хориотой — webhook ашиглана |
| Webhook | манай URL руу POST | `x-checksum-v2` HMAC-SHA256 |

- `callback` нь төлбөрийн дараа **браузер** буцах хаяг — манай pay page.
  Сервер-сервер webhook нь Bonum талд урьдчилан бүртгэгдсэн URL.
- Линкийн амьдрах хугацааг бид өөрсдөө `expiresIn`-ээр тохируулна —
  `BONUM_LINK_TTL_MINUTES` (default 60 мин). Хугацаа дуусмагц Bonum
  `FAILED/EXPIRED` webhook илгээдэг ба бид intent-ийг EXPIRED болгоно;
  төлөгч дахин зочлоход шинэ линк үүснэ.
- Эхлээд `BONUM_BASE_URL=https://testapi.bonum.mn` дээр туршина —
  `GET /invoices/paid?invoiceId=...` тест endpoint-ээр төлөлт симуляц хийж
  болно.

### Мерчант анкет (PaymentGateway Anket.docx)

Bonum-д мерчант бүртгүүлэхэд байгууллага дараах заавал мэдээллийг бөглөнө
(`docs/PaymentGateway Anket.docx`). Эдгээрийг Dashboard → Тохиргоо хуудаснаас
бүртгэдэг боллоо:

- Байгууллагын нэр, **регистрийн дугаар**
- **Хаяг**, **утас**
- **Банк, дансны дугаар, дансны нэр**

---

## 2. eBarimt — ТЕГ POS API 3.0 (EBARIMT_PROVIDER=posapi)

### Юу ВЭ, юу БИШ вэ

- `VAT_BASE_URL` нь **ТЕГ-ийн нийтийн API БИШ** — энэ нь өөрийн сервер дээр
  ажиллах **POS API 3.0 локал үйлчилгээ** (ТЕГ-ээс өгдөг Docker image, LIME
  холболтоор суулгасан instance).
- Тухайн компани ТЕГ-т **өөрийн POS-оор бүртгүүлсэн** байх ёстой: өөрийн
  `merchantTin` + тэр POS-д олгогдсон `posNo`. **LIME-ийн posNo-г өөр
  компанийн баримтад ашиглаж болохгүй.**
- Суусны дараа, код ажиллуулахаас өмнө бүртгэлээ шалгана:

```bash
curl http://<pos-host>:<port>/rest/info
# merchants, branches, тохируулсан TIN-үүд зөв эсэхийг харна
```

Мөн Dashboard-аас: `GET /api/v1/receipts/provider-info` (OWNER/ACCOUNTANT эрх)
— идэвхтэй provider ба `/rest/info`-ийн хариуг харуулна. Adapter өөрөө ч
баримт үүсгэхийн өмнө TIN бүртгэлтэй эсэхийг lazy шалгаж, бүртгэлгүй бол
ойлгомжтой алдаа буцаана.

### Тохиргоо

> **`VAT_BASE_URL` гэж юу вэ?** Энэ нь ӨӨРИЙН сервер дээр ажиллаж буй eBarimt
> **POS API 3.0** үйлчилгээний хаяг. `api.ebarimt.mn` (нээлттэй лавлах) БИШ, мөн
> ямар нэг API-аар олж авдаг зүйл БИШ — LIME энэ үйлчилгээг танай сервер дээр
> суулгаж өгснөөр л бий болно. Docker дотор ихэвчлэн `http://ebarimt-pos:7080`.
> Зөв эсэхийг `curl {VAT_BASE_URL}/rest/info` — оператор, `posNo`, бүртгэлтэй
> мерчантууд буцах ёстой.

```env
EBARIMT_PROVIDER=posapi
VAT_BASE_URL=http://ebarimt-pos:7080        # локал POS API 3.0 instance
# Түрээслэгч (tenant) бүр өөрийн бүртгэлээ Тохиргоо хуудаснаас оруулна;
# доорх env утгууд нь fallback default:
EBARIMT_MERCHANT_TIN=
EBARIMT_POS_NO=
EBARIMT_BRANCH_NO=001
EBARIMT_DISTRICT_CODE=3505                  # өөрийн дүүргийн кодоор солино
EBARIMT_CLASSIFICATION_CODE=6499999         # бараа/үйлчилгээний ГХЭАТ код

# --- ТЕГ операторын сервис (оператороос мерчант бүртгүүлэх хүсэлт) ---
# Түлхүүрийг Posapi@itc.gov.mn-ээс авна. Тохируулаагүй бол «ТЕГ-т бүртгүүлэх
# хүсэлт» товч л идэвхгүй болно — бусад онбординг хэвийн ажиллана.
EBARIMT_OPR_BASE_URL=https://api.ebarimt.mn
EBARIMT_OPR_API_KEY=
EBARIMT_OPR_POS_NO=                         # операторын POS (мерчант үүн дээр бүртгэгдэнэ)
EBARIMT_OPR_TOKEN=                          # эсвэл доорх OIDC-ээр авна
EBARIMT_OIDC_TOKEN_URL=
EBARIMT_OIDC_CLIENT_ID=
EBARIMT_OIDC_CLIENT_SECRET=
```

**`districtCode`** нь 4 орон: аймаг/дүүрэг (2) + сум/хороо (2). Жагсаалтыг
`GET https://api.ebarimt.mn/api/info/check/getBranchInfo`-оос өдөрт нэг татаж
кэшлэнэ (жишээ: Архангай `01` + Чулуут `02` → `0102`).

Хэрэглэгч кодыг мэдэх шаардлагагүй: **Тохиргоо → Байгууллагын мэдээлэл** дотор
хаягийнхаа доор «Байршил (аймаг/дүүрэг — сум/хороо)» сонгоход код нь өөрөө
тодорхойлогдоно (`GET /api/v1/tenant/districts`). Лавлах татагдаагүй үед талбар
нь энгийн текст хэвээр үлдэж онбординг зогсохгүй.

### Онбординг: ТЕГ-т мерчант бүртгүүлэх

```
1. регистр  → ТТД (merchantTin) автоматаар          (getTinInfo)
2. байршил  → districtCode цэснээс                  (getBranchInfo)
3. «📨 ТЕГ-т бүртгүүлэх хүсэлт»                     (saveOprMerchants)
4. байгууллага ebarimt.mn дээрээ баталгаажуулна     (гараар, тэдний талд)
5. «⬇️ POS дугаар татах» → branchNo/posNo + НӨАТ-ын төлөв   (/rest/info + getInfo)
```

`saveOprMerchants` нь **хэсэгчилсэн амжилт** буцаадаг: HTTP 200 хэвээр байхад
`status: 201` + `data[]` дотор ТТД тус бүрийн шалтгаан ирнэ («… хүлээгдэж
байна», «… нэмэх боломжгүй»). Тиймээс 201-ийг алдаа гэж үзэлгүй мөр бүрийг
хэрэглэгчид ил харуулна.

Түрээслэгч бүрийн `merchantTin / posNo / branchNo / districtCode` нь
Dashboard → Интеграци → «eBarimt (POS API 3.0)» картад хадгалагдаж, env-ийн
default-ыг дарж хэрэглэгдэнэ (шинэ хэрэглэгч бүрийг LIME-ээр дамжуулан ТЕГ-т
бүртгэсний дараа POS дугаар нь эндээ бөглөгдөнө).

**`merchantTin` автоматаар**: `merchantTin` нь байгууллагын ТТД мөн тул
регистрийн дугаар мэдэгдмэгц ТЕГ-ийн нээлттэй бүртгэлээс татагдаж бөглөгдөнө
(`EbarimtRegistryService` → `GET https://api.ebarimt.mn/api/info/check/getTinInfo?regNo=`).
Хэрэглэгч Тохиргоо хуудсандаа регистрээ хадгалахад л хангалттай — гараар
бичих зүйл үлдэхгүй. Автомат бөглөлт нь ЗӨВХӨН хоосон талбарыг бөглөх тул
партнёрын буцаасан утгыг хэзээ ч дарж бичихгүй. Тусад нь тохируулаагүй бол
баримт хэвлэхэд байгууллагын ТТД (`Tenant.tin`) fallback болж ажиллана.

**Холболт шалгах**: Интеграци хуудасны «🔌 Холболт шалгах» товч нь
`GET {VAT_BASE_URL}/rest/info`-г шинээр татаад тухайн `merchantTin` уг локал
instance дээр бүртгэгдсэн эсэхийг хэлнэ — баримт хэвлэхийг оролдохоос өмнө
бүртгэлийн алдааг илрүүлнэ.

**`posNo` / `branchNo` автоматаар** (`POST /api/v1/integrations/EBARIMT/sync`):
компани e-invoice.ebarimt.mn дээрээ операторын хүсэлтийг баталгаажуулмагц түүний
POS-ууд `/rest/info` дээр гарч ирдэг. «⬇️ POS дугаар татах» товч үүнийг уншиж
`branchNo` / `posNo`-г хадгална. Хариуны бүтэц instance-ийн хувилбараас хамаардаг
тул мод даган ойрын `tin` / `branchNo`-г өвлүүлж уншдаг.

### Оператор ↔ мерчант загвар (ЧУХАЛ)

`/rest/info` нь **нэг instance = операторын НЭГ `posNo`** гэсэн бүтэцтэй:

```json
{ "operatorName": "Онлайм нетворк", "operatorTIN": "…",
  "posId": 0, "posNo": "10025383",
  "merchants": [ { "name": "Медиапрофессионал", "tin": "13101434448" } ] }
```

Өөрөөр хэлбэл `posNo` нь мерчант бүрд ӨӨР БИШ — операторын нэг POS дээр олон
мерчант бүртгэгдэж, баримт нь `merchantTin`-ээр ялгагдана:

| Үүрэг | Хэн | Талбар |
|---|---|---|
| Оператор (систем нийлүүлэгч) | Онлайм нетворк | `posNo` (ж: `10025383`) |
| Мерчант (борлуулагч) | Медиапрофессионал ХХК | `merchantTin` (`13101434448`) |

Тиймээс мерчантаас POS дугаар асуухгүй: `EBARIMT_OPR_POS_NO`-г нэг удаа
тохируулах (эсвэл `/rest/info`-оос уншина), «POS дугаар татах» товч нь тухайн
ТТД `merchants` жагсаалтад орсон эсэхийг шалгаад операторын POS-ыг олгоно.

Мерчант бүртгэгдээгүй байхад баримт хэвлэхийг оролдвол адаптер урьдчилан
зогсоож ойлгомжтой алдаа өгнө (`getRegisteredTins` хамгаалалт).

### Урсгал

1. Төлбөр баталгаажмагц баримт `PENDING` төлөвтэй үүснэ (төлбөр ХЭЗЭЭ Ч
   eBarimt-ээс болж буцахгүй — PRD §5.7).
2. `POST {VAT_BASE_URL}/rest/receipt` — B2C (иргэн) эсвэл B2B (байгууллага,
   payerRegNo/TIN-тэй) баримт үүсгэнэ; НӨАТ 10% дүнгээс задарган тооцно.
3. Амжилттай бол `CREATED` (ДДТД, сугалааны дугаар, QR хадгална); алдаа бол
   `FAILED` + 5 хүртэл retry.
4. `GET /rest/sendData` — ТЕГ рүү илгээлтийг best-effort өдөөнө (үйлчилгээ
   өөрөө ч хуваарийн дагуу sync хийдэг).

### Татварын төрөл (`taxType`) — БОРЛУУЛАГЧААС шалтгаална

`getInfo?tin=` нь `vatPayer` / `freeProject` / `cityPayer` талбарууд буцаадаг.
Эдгээрийг `Tenant.ebarimtVatPayer / ebarimtVatFreeProj / ebarimtCityPayer`-т
хадгалж, баримт бүрд:

| Бүртгэл | `taxType` | НӨАТ |
|---|---|---|
| `freeProject = true` | `VAT_FREE` (+ `taxProductCode: "304"`) | 0 |
| `vatPayer = false` | `NO_VAT` | 0 |
| бусад тохиолдолд | `VAT_ABLE` | дүнгээс 10% задална |

НӨАТ суутган төлөгч БИШ байгууллагад 10% задалж бичих нь буруу баримт үүсгэдэг
тул энэ лавлагаа заавал хийгдэнэ. Хараахан лавлаагүй (`null`) үед хуучин зан
төлөв (`VAT_ABLE`) хэвээр.

НХАТ (`totalCityTax`) одоогоор үргэлж 0. `cityPayer` нь тухайн байгууллага НХАТ
суутган төлөгч эсэхийг л хэлдэг бөгөөд татвар нь бараа/үйлчилгээний төрлөөс
хамаардаг — манай мөрүүд (нэхэмжлэхийн үйлчилгээ) НХАТ-ын хамрах хүрээнд
ороогүй. Хэрэв НХАТ-тай мөр гаргах хэрэгтэй бол мөр тус бүрийн тохиргоо болгож
өргөтгөнө.

### `lottery` / `qrData` — хадгалах хугацаа

ТЕГ-ийн заавар: «lottery болон qrData талбаруудын мэдээллийг төлбөрийн баримтанд
ХЭВЛЭХЭЭС өөрөөр ямар ч хэлбэрээр хадгалахыг хориглоно.»

Төлөгч баримтаа хараад QR-аа уншуулах хугацаа хэрэгтэй тул эдгээрийг ТҮР
хадгалж, хугацаа дуусмагц баганыг `NULL` болгоно (`ReceiptPurgeService`,
15 минут тутам):

```env
EBARIMT_QR_RETENTION_HOURS=72   # default 3 хоног; 0 = огт хадгалахгүй
```

`0` үед сугалаа/QR нь баримт үүсэх мөчид ч DB-д бичигдэхгүй — цэвэрлэгчийг
хүлээхгүй. ДДТД (`receiptNo`) нь баримтын албан ёсны дугаар тул үргэлж үлдэнэ;
хориг зөвхөн сугалаа болон QR-т хамаарна.

> `receipt.created` webhook нь `lottery`-г мерчантын өөрийнх нь систем рүү
> дамжуулсаар байна (бид түүнийг хадгалдаггүй) — мерчант өөрөө баримтаа хэвлэх
> зорилгоор ашиглана.

### eBarimt provider сонголт

| `EBARIMT_PROVIDER` | Хэрэглээ |
|---|---|
| `mock` | Демо — локал бодитой харагдах баримт (default) |
| `qpay` | QPay-ийн дагалдах `/v2/ebarimt/create` (зөвхөн qpay төлбөрт) |
| `posapi` | ТЕГ POS API 3.0 локал instance — **Bonum төлбөрт заавал энэ** |

---

## 3. Production жишээ (.env, Bonum + LIME хослол)

```env
PAYMENT_PROVIDER=bonum
PAYMENT_SANDBOX=false
BONUM_BASE_URL=https://apis.bonum.mn
BONUM_TERMINAL_ID=...
BONUM_APP_SECRET=...
BONUM_CHECKSUM_KEY=...

EBARIMT_PROVIDER=posapi
VAT_BASE_URL=http://ebarimt-pos:7080
EBARIMT_DISTRICT_CODE=...
```

Checklist:

- [ ] Bonum имэйлд WEBHOOK URL-ээ хариу илгээж бүртгүүлсэн
- [ ] `testapi.bonum.mn` дээр бүтэн урсгал (линк үүсэлт → төлөлт → webhook →
      ledger) туршсан
- [x] Bonum adapter-ийн endpoint/талбарын нэрс албан ёсны doc-той тулгагдсан
- [ ] POS API 3.0 instance суусан, `GET /rest/info` дээр tenant-уудын TIN зөв
- [ ] Тохиргоо хуудсанд tenant бүрийн анкет + eBarimt талбарууд бөглөгдсөн
- [ ] `docker compose -f docker-compose.prod.yml up -d --build` + migrate
