# ТЕГ eBarimt API — албан ёсны тодорхойлолт

- **Эх сурвалж:** https://developer.itc.gov.mn/docs/ebarimt-api
- **Татсан:** 2026-08-07 (хэрэглэгч хуулж өгсөн)
- **Хамрах хүрээ:** нээлттэй лавлах (`api.ebarimt.mn`), операторын сервис,
  локал POS API 3.0 (`{VAT_BASE_URL}`)

> **Тайлбар:** Энэ орчноос `developer.itc.gov.mn` руу хандах боломжгүй
> (egress proxy блоклодог). Заавар шинэчлэгдвэл хуулж энд оруулна уу.

---

## 1. Нээлттэй лавлах — `https://api.ebarimt.mn` (auth шаардахгүй)

### 1.1 `GET /api/info/check/getTinInfo?regNo=`

Регистрийн дугаараар татвар төлөгчийн дугаар (ТТД / TIN) лавлана. ААН-ийн хувьд
ТИН, хувь хүний хувьд Civil_id.

```json
{ "status": 200, "msg": "Амжилттай", "data": 31654321554 }
```

> **Тайлбар:** `data` нь **тоо** хэлбэрээр ирдэг — мөр гэж үзвэл алдаа өгнө.

### 1.2 `GET /api/info/check/getInfo?tin=`

ТТД-гээр бүртгэлийн мэдээлэл. `tin` нь **заавал** (`regNo` авдаггүй).

```json
{
  "msg": "Амжилттай", "status": 200,
  "data": {
    "name": "ТЕСТИЙН ХЭРЭГЛЭГЧ 1",
    "freeProject": false,
    "cityPayer": true,
    "vatPayer": true,
    "found": true,
    "vatpayerRegisteredDate": "2019-02-16",
    "isGovernment": false
  }
}
```

| Талбар | Утга |
|---|---|
| `freeProject` | НӨАТ-аас чөлөөлөгдөх төсөл. `true` → `taxType: VAT_FREE`, `items[].taxProductCode: "304"` |
| `vatPayer` | НӨАТ суутган төлөгч мөн эсэх. `false` → `taxType: NO_VAT` |
| `cityPayer` | НХАТ суутган төлөгч (зөвхөн УБ-д үйл ажиллагаа явуулах салбарт хамаарна) |
| `isGovernment` | Төрийн байгууллага эсэх |

### 1.3 `GET /api/info/check/getBranchInfo`

`districtCode`-ийн лавлах: татварын алба + дэд албаны код.

```json
{ "status": 200, "msg": "Амжилттай",
  "data": { "branchCode": "01", "branchName": "Архангай",
            "subBranchCode": "02", "subBranchName": "Чулуут" } }
```

`districtCode` = `branchCode` + `subBranchCode` (4 орон). Жишээ: Номин холдинг
ХХК-ийн Архангай аймгийн Чулуут сум дахь салбар → `0102`.

---

## 2. Операторын сервис — `https://api.ebarimt.mn`

Header: `X-API-KEY` (Posapi@itc.gov.mn-ээс авна) + `Authorization: Bearer <token>`
(нэгдсэн нэвтрэлт, OpenID Connect).

### 2.1 `POST /api/tpi/receipt/saveOprMerchants`

«Хэрэглэгчийн систем нийлүүлэгч» (оператор компани) өөрийн системээс мерчант
(борлуулагч) бүртгэх хүсэлт үүсгэнэ.

```json
{ "posNo": "10****99", "merchantTins": ["770*****076", "830*****855"] }
```

Хариу — **хэсэгчилсэн амжилт боломжтой** (`status: 201`):

```json
{
  "msg": "Түрээслэгч нэмэх хүсэлт дутуу илгээгдлээ. Илгээгдээгүй түрээслэгчид /шалтгаан/-ийг илгээв.",
  "status": 201, "code": null,
  "data": [
    "33101500642 - Түрээслэгч бүртгэгдхээр хүлээгдэж байна",
    "80001057582 - Монгол Улсад бүртгэлтэй төлөөлөгчийн газар нь ашгийн төлөө үйл ажиллагаа явуулах эрхгүй тул нэмэх боломжгүй."
  ]
}
```

> **Тайлбар:** `201`-ийг алдаа гэж үзэхгүй — `data` доторх мөр бүр нэг ТТД-ийн
> шалтгааныг хэлнэ, тэдгээрийг хэрэглэгчид ил харуулна.

### 2.2 `POST /api/tpi/receipt/saveOprLessors`

Түрээслэгч бүртгэх. Биет нь ТТД-ийн энгийн жагсаалт: `["37900846788", "61200064714"]`

---

## 3. Локал POS API 3.0 — `http://{VAT_BASE_URL}`

> **Тайлбар:** `VAT_BASE_URL` нь ӨӨРИЙН сервер дээр ажиллаж буй POS API 3.0
> үйлчилгээний хаяг. `api.ebarimt.mn` БИШ, API-аар олж авдаг зүйл ч биш.

### 3.1 `GET /rest/info`

```json
{
  "operatorName": "string", "operatorTIN": "string",
  "posId": 0, "posNo": "string",
  "lastSentDate": "string", "leftLotteries": 0,
  "appInfo": { "applicationDir": "…", "database": "…", "workDir": "…" },
  "merchants": [
    { "name": "string", "tin": "string",
      "customers": [ { "name": "…", "tin": "…", "vatPayer": "…" } ] }
  ]
}
```

> **Тайлбар (чухал):** нэг instance = **операторын НЭГ `posNo`**. Мерчант бүрд
> өөр POS байдаггүй — нэг POS дээр олон мерчант бүртгэгдэж, баримт нь
> `merchantTin`-ээр ялгагдана.

### 3.2 `GET /rest/bankAccounts?tin=`

Мерчант болон түүний түрээслэгчийн идэвхтэй дансны мэдээлэл.

```json
[ { "id": 0, "tin": "…", "bankAccountNo": "…", "bankAccountName": "…",
    "bankId": 0, "bankName": "…", "iBan": "100100015121212121111" } ]
```

Дансны мэдээлэл нь `/rest/sendData` дуудагдах үед Оператор-Ибаримт систем дэх
бүртгэлтэй тулгагдаж автоматаар шинэчлэгдэнэ. Нэг POS дээр илгээх нь зөвхөн
тухайн POS-ийн дансыг шинэчилнэ.

### 3.3 `POST /rest/receipt`

**Заавал талбарууд** (толгой): `branchNo`, `totalAmount`, `merchantTin`,
`posNo`, `type`, `billIdSuffix`, `receipts[]`.

```json
{
  "branchNo": "001",
  "totalAmount": 5600,
  "totalVAT": 500,
  "totalCityTax": 100,
  "districtCode": "2501",
  "merchantTin": "110718991986",
  "posNo": "001",
  "customerTin": null,
  "consumerNo": "10038071",
  "type": "B2C_RECEIPT",
  "inactiveId": null,
  "reportMonth": null,
  "billIdSuffix": "01",
  "receipts": [
    {
      "totalAmount": 5600, "taxType": "VAT_ABLE",
      "merchantTin": "110718991986", "customerTin": null,
      "totalVAT": 500, "totalCityTax": 100,
      "bankAccountNo": "", "iBan": "", "invoiceId": null,
      "items": [
        { "name": "Талх", "barCode": "19059010880001", "barCodeType": "GS1",
          "classificationCode": "2349010", "taxProductCode": null,
          "measureUnit": "ш", "qty": 1, "unitPrice": 5000,
          "totalVAT": 500, "totalCityTax": 100, "totalAmount": 5600 }
      ]
    }
  ],
  "payments": [ { "code": "CASH", "status": "PAID", "paidAmount": 5600 } ]
}
```

**Enum-ууд:**

| Талбар | Утгууд |
|---|---|
| `type` | `B2C_RECEIPT`, `B2B_RECEIPT`, `B2C_INVOICE`, `B2B_INVOICE`, `STOCK_QR` |
| `receipts[].taxType` | `VAT_ABLE`, `VAT_FREE`, `VAT_ZERO`, `NO_VAT` |
| `payments[].code` | `CASH`, `PAYMENT_CARD`, `BANK_TRANSFER`, `BANK_TRANSFER_QPAY` |
| `payments[].status` | `PAID`, `PAY`, `REVERSED`, `ERROR` |

> **Тайлбар:** төлсөн дүнгийн талбар нь `paidAmount` (`amount` БИШ).
> `customerTin` нь зөвхөн `B2B_RECEIPT` / `B2B_INVOICE` үед бөглөгдөнө.
> `consumerNo` нь зөвхөн `B2C_RECEIPT` үед.
> НӨАТ тооцох, чөлөөлөгдөх, 0 хувь тооцох бараа хамт зарагдвал татварын
> төрөл тус бүрээр **тусдаа дэд баримт** үйлдэнэ.

`payments[].data` — `code: PAYMENT_CARD` үед картын гүйлгээний мэдээлэл нэмж
болно (`terminalID`, `rrn`, `maskedCardNumber`, `easy`). `easy: true` нь
хэрэглэгч банкны апп дээр ИБАРИМТ хялбар бүртгэл хийсэн бол баримтыг автоматаар
баталгаажуулна.

**Хариу:**

```json
{
  "id": "037900846788001096190000210005299",
  "version": "3.2.44",
  "totalAmount": 5600, "totalVAT": 500, "totalCityTax": 100,
  "branchNo": "001", "districtCode": "2501",
  "merchantTin": "37900846788", "posNo": "101317077",
  "consumerNo": "10038071", "type": "B2C_RECEIPT",
  "receipts": [ { "id": "0379…", "totalAmount": 5600, "taxType": "VAT_ABLE", "items": [...] } ],
  "payments": [ { "code": "CASH", "paidAmount": 5600, "status": "PAID" } ],
  "posId": 101317077,
  "status": "SUCCESS",
  "qrData": "3089232652190338989305…",
  "lottery": "FG 57069045",
  "date": "2026-05-09 13:44:46",
  "easy": false
}
```

| `status` | Утга |
|---|---|
| `SUCCESS` | Баримт амжилттай үүссэн |
| `ERROR` | Баримт үүсгэхэд алдаа гарсан |
| `PAYMENT` | Төлбөрийн мэдээлэл дутуу |

`id` нь толгой баримтын **33 орон бүхий ДДТД**.

> ⚠️ **Хууль зүйн хязгаарлалт (шууд иш):** «Эдгээр буцаасан мэдээллүүдээс
> `lottery` болон `qrData` талбаруудын мэдээллийг төлбөрийн баримтанд хэвлэхээс
> өөрөөр ямар ч хэлбэрээр хадгалахыг хориглоно.»
>
> Бидний шийдэл: `EBARIMT_QR_RETENTION_HOURS` (default 72 цаг) хугацааны дараа
> `ReceiptPurgeService` эдгээр баганыг `NULL` болгоно; `0` үед огт бичихгүй.

### 3.4 `GET /rest/sendData`

ТЕГ рүү илгээлтийг өдөөнө. Үйлчилгээ өөрөө ч хуваарийн дагуу sync хийдэг.
Дансны мэдээллийн шинэчлэл мөн энэ үед хийгддэг.
