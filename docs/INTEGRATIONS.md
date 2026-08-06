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
> Terminal ID/Secret/Checksum нь Dashboard → Тохиргоо → «Bonum холболт» хэсэгт
> шифрлэгдэж хадгалагдан, тухайн байгууллагын нэхэмжлэхэд автоматаар
> хэрэглэгдэнэ. Онбордингийн бүрэн дараалал: [`ONBOARDING.md`](ONBOARDING.md).

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
```

Түрээслэгч бүрийн `merchantTin / posNo / branchNo / districtCode` нь
Dashboard → Тохиргоо → «eBarimt бүртгэл» хэсэгт хадгалагдаж, env-ийн
default-ыг дарж хэрэглэгдэнэ (шинэ хэрэглэгч бүрийг LIME-ээр дамжуулан ТЕГ-т
бүртгэсний дараа эндээ оруулна).

### Урсгал

1. Төлбөр баталгаажмагц баримт `PENDING` төлөвтэй үүснэ (төлбөр ХЭЗЭЭ Ч
   eBarimt-ээс болж буцахгүй — PRD §5.7).
2. `POST {VAT_BASE_URL}/rest/receipt` — B2C (иргэн) эсвэл B2B (байгууллага,
   payerRegNo/TIN-тэй) баримт үүсгэнэ; НӨАТ 10% дүнгээс задарган тооцно.
3. Амжилттай бол `CREATED` (ДДТД, сугалааны дугаар, QR хадгална); алдаа бол
   `FAILED` + 5 хүртэл retry.
4. `GET /rest/sendData` — ТЕГ рүү илгээлтийг best-effort өдөөнө (үйлчилгээ
   өөрөө ч хуваарийн дагуу sync хийдэг).

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
