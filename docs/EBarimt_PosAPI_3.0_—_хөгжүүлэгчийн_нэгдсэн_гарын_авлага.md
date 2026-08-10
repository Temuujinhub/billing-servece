# EBarimt PosAPI 3.0 — хөгжүүлэгчийн нэгдсэн гарын авлага

> **Зориулалт:** PosAPI 3.0-ийг касс, ERP, худалдаа, үйлчилгээ, эмийн сан, төлбөрийн систем болон бусад хэрэглэгчийн системтэй холбоход ашиглах хөгжүүлэлтийн лавлах.
> 
> **Мэдээлэл шалгасан огноо:** 2026-08-09
> 
> **Үндсэн эх сурвалж:** СМТТ УТҮГ/ITC-ийн `developer.itc.gov.mn` дээрх “Цахим төлбөрийн баримт” төслийн PosAPI 3.0 баримт бичгүүд.
> 
> **Анхааруулга:** Төрийн API-ийн бизнес дүрэм, талбар, enum, орчны URL өөрчлөгдөж болно. Шинэ хөгжүүлэлт болон production release бүрийн өмнө Developer ITC-ээс тухайн API-г **Original/OpenAPI** хэлбэрээр export хийж, энэхүү гарын авлагын “Хувилбарын зөрүү” хэсэгтэй тулгана.

## 1\. Энэхүү баримт бичигт юу багтсан бэ?

Энэ файлд дараах материалыг нэгтгэв.

-   PosAPI 3.0-ийн архитектур, суулгалт, татах холбоос, идэвхжүүлэлт
-   `posapi.ini` тохиргоо
-   дэмждэг өгөгдлийн сан, сүлжээ, storage-ийн шаардлага
-   үндсэн local REST API endpoint-ууд
-   төлбөрийн баримтын бүрэн JSON бүтэц
-   B2C, B2B, invoice, буцаалт, карт, эмийн сан, ОАТ-ын жишээ
-   TIN, District, татвар төлөгч, татварын бүтээгдэхүүний код, БҮНА/баркодын лавлагаа
-   оператор–мерчант, түрээслэгчийн урсгал
-   гуравдагч төлбөрийн системийн callback загвар
-   Postman import/export заавар
-   энэ баримтаас хуулж файл болгоод import хийх боломжтой Postman collection
-   cURL, JavaScript/TypeScript, Python, C#, Java жишээ
-   алдаа боловсруулах, retry, idempotency, logging, security-ийн зөвлөмж
-   хөгжүүлэлт, интеграц, production нэвтрүүлэлтийн checklist
-   ITC сайтын PosAPI 3.0-той холбоотой бүх хуудасны индекс

Албан ёсны навигацад PosAPI 3.0-ийн үндсэн сервисүүд, lookup сервисүүд, туршилтын орчин, ХСН шаардлага/эрх, оператор систем, token, Postman болон дагалдах API-ууд тусдаа хуудсаар байрладаг. [[1]](#ref1)

## 2\. Эх сурвалжийн эрэмбэ ба хувилбарын дүрэм

Мэдээлэл зөрсөн үед дараах эрэмбийг баримтална.

1.  Developer ITC-ийн тухайн endpoint-ийн одоогийн Original/OpenAPI export
2.  Developer ITC-ийн тухайн endpoint-ийн веб хуудас
3.  ITC-ийн PosAPI 3.0 татах багцад дагалдсан тохиргоо, schema, release note
4.  ITC-ийн 2023 оны “POS API 3.0.1” PDF гарын авлага
5.  Нээлттэй эхийн SDK/binding
6.  Энэхүү баримт дахь ерөнхий хөгжүүлэлтийн зөвлөмж

### 2.1. Илэрсэн хувилбарын зөрүү

| Сэдэв | Одоогийн ITC хуудсанд | Хуучин PDF/зарим SDK-д | Хэрэгжүүлэх дүрэм |
| --- | --- | --- | --- |
| НӨАТ тооцохгүй төрөл | `NO_VAT` | `NOT_VAT` | Одоогийн OpenAPI export-ийг дагах |
| Багцын suffix | `billIdSuffix` жишээнд байна | Хуучин PDF-д байхгүй | Шинэ хүсэлтэд явуулах |
| IBAN | `iBan` гэж баримтжуулсан | `bankAccountNo` л байсан | Танай суулгасан PosAPI version-оор шалгах |
| Картын terminal | `terminalID` гэж албан ёсны жишээнд гарсан | SDK-д camelCase-оор `terminalId` байж болно | Export хийсэн JSON property-г яг дагах |
| ОАТ/эмийн serial | `stockQR`, `stockQrs` нэршлийн зөрүү тааралдана | SDK-д `stockQR` | Туршилтын endpoint дээр contract test хийх |
| Буцаалтын огноо | Зарим endpoint жишээнд `yyyy-MM-dd` | PDF-д `yyyy-MM-dd HH:mm:ss` | PosAPI version-оос хамааруулж integration test хийх |
| `PaymentCode` | Албан ёсны хуудасны индексжсэн schema-д `CASH`, `PAYMENT_CARD` | Зарим community binding-д нэмэлт код байж болно | Төрийн OpenAPI-д байхгүй код бүү илгээ |

Эдгээр зөрүү нь PosAPI-ийн version-ийг production-д “хөшөөсөн” байдлаар удирдах шаардлагатайг харуулна. Албан ёсны одоогийн жишээнд `billIdSuffix`, `iBan`, `terminalID`, `NO_VAT` зэрэг талбар/утга харагдаж байна. [[2]](#ref2)

## 3\. Архитектур

PosAPI 3.0 нь хэрэглэгчийн системийн сан/library биш, тусдаа ажилладаг service application. Хэрэглэгчийн систем PosAPI-тай REST-ээр server–client хэлбэрээр харилцана. Нэг PosAPI instance-д нэгээс олон ААН, иргэн буюу merchant бүртгэж, тэдгээрийн баримтыг боловсруулах боломжтой. [[3]](#ref3)

Ерөнхий урсгал:

```text
Касс / ERP / App
       |
       | HTTP JSON (local/LAN)
       v
PosAPI 3.0 service :7080
       |
       | ITC/EBarimt central services
       v
EBarimt нэгдсэн систем
```

Нэмэлт урсгалууд:

```text
POS систем ──> PosAPI ──> EBarimt
     │            │
     │            ├── merchant / customer / bank account cache
     │            ├── lottery / QR / DDТД
     │            └── offline queue / sendData
     │
     ├── public lookup APIs: TIN, merchant, district, BҮНА, tax code
     ├── easy registration APIs
     ├── OAT inventory/stock QR APIs
     └── third-party payment callback
```

## 4\. Нэр томьёо

| Нэр | Тайлбар |
| --- | --- |
| PosAPI | Касс/ERP болон EBarimt төв системийн хооронд ажиллах local REST service |
| ХСН | Хэрэглэгчийн систем нийлүүлэгч |
| Operator | PosAPI-г ажиллуулах, merchant бүртгэх эрх бүхий систем нийлүүлэгч |
| Merchant | Баримт олгогч ААН эсвэл иргэн |
| TIN / ТТД | Татвар төлөгчийн дугаар |
| Civil ID | Иргэний бүртгэлийн таних дугаар |
| ДДТД | Баримт/нэхэмжлэхийн дахин давтагдашгүй дугаар |
| B2C | Бизнесээс эцсийн хэрэглэгч/иргэнд |
| B2B | Бизнесээс бизнест |
| Sub-receipt | Татварын төрөл, merchant зэргээр бүлэглэсэн дэд баримт |
| БҮНА | Бараа, үйлчилгээний нэгдсэн ангилал |
| НӨАТ | Нэмэгдсэн өртгийн албан татвар |
| НХАТ | Нийслэл хотын албан татвар |
| ОАТ | Онцгой албан татвар |
| Easy registration | Карт/утас/хэрэглэгчийн дугаараар баримтыг хэрэглэгчтэй холбох урсгал |

## 5\. PosAPI 3.0 татах

Албан ёсны холболтын зааварт дараах багцууд байна. [[3]](#ref3)

-   Production: `https://share.itc.gov.mn/share/developer/PosService_3.0.12-Prod.zip`
-   Staging: `https://share.itc.gov.mn/share/developer/ST_PosService_3.0.12-Staging.zip`

> Татаж авахын өмнө Developer ITC-ийн холболтын хуудсыг дахин шалгана. Файлын version шинэчлэгдсэн байж болно.

Ангиллын албан ёсны Excel:

-   Бүтээгдэхүүн, үйлчилгээний нэгдсэн ангилал: `https://share.itc.gov.mn/share/developer/gs1_gs1.xlsx`

Хуучин боловч суурь ойлголт, callback, тохиргооны дэлгэрэнгүйтэй PDF:

-   `https://share.itc.gov.mn/share/developer/POS%20API%203.0.1.pdf` [[4]](#ref4)

## 6\. Суулгалт ба `posapi.ini`

PosAPI суусны дараа `posapi.ini`\-г тохируулна. `P101.poi`, `P102.poi` зэрэг ажиллагааны нууцлагдсан тохиргооны файл `workDir`\-т байрлаж болно. `workDir` доторх файлууд өөрчлөгдөх тул service ажиллуулж буй OS user-д унших, бичих эрх шаардлагатай; хавтсыг read-only/freeze хийж болохгүй. [[3]](#ref3)

### 6.1. Үндсэн талбарууд

| Талбар | Зориулалт | Зөвлөмж |
| --- | --- | --- |
| `authUrl` | Нэгдсэн нэвтрэлтийн URL | ITC-ээс өгснийг өөрчлөхгүй |
| `authRealm` | Auth realm | Өөрчлөхгүй |
| `authClientId` | Auth client ID | Өөрчлөхгүй |
| `authClientSecret` | Auth secret | Нууцын санд хадгална |
| `ebarimtUrl` | EBarimt төв системийн URL | Өөрчлөхгүй |
| `db` | Qt database driver | Ачаалалд тохируулж сонго |
| `dbHost` | DB host эсвэл SQLite file path | Network DB бол DNS/IP тогтвортой байх |
| `dbPort` | DB port | SQLite-д хоосон |
| `dbUser` | DB хэрэглэгч | Least privilege |
| `dbPass` | DB нууц үг | Repo-д commit хийхгүй |
| `dbName` | DB нэр | Тусдаа schema/database санал болгоно |
| `dbOptions` | Нэмэлт DB тохиргоо | Driver-ийн дагуу |
| `workDir` | Ажиллагааны файл, төлөвийн хавтас | Read/write, backup, disk monitoring |
| `webServiceHost` | REST service bind IP | `127.0.0.1` эсвэл private LAN IP |
| `webServicePort` | REST service port | Default `7080` |
| `noEasyResponse` | Картын easy registration банкны хариу хүлээх эсэх | `true` үед response-ийн `easy`\-д найдахгүй |

### 6.2. Жишээ `posapi.ini`

Доорх нь бүтцийн жишээ; auth болон EBarimt-ийн утгыг татсан багцын утгаар хадгална.

```ini
[POSAPI]
authUrl=<ITC-provided-url>
authRealm=<ITC-provided-realm>
authClientId=<ITC-provided-client-id>
authClientSecret=<secret>
ebarimtUrl=<ITC-provided-ebarimt-url>

db=QPSQL
dbHost=127.0.0.1
dbPort=5432
dbUser=posapi_app
dbPass=<secret>
dbName=posapi
dbOptions=

workDir=/var/lib/posapi
webServiceHost=127.0.0.1
webServicePort=7080

noEasyResponse=false
```

> Файлын section нэр, separator, executable-ийн шаардах яг формат нь багцаас хамаарч болох тул дагалдсан анхны `posapi.ini`\-г суурь болгоно.

## 7\. Дэмждэг өгөгдлийн сан

Албан ёсны зааварт дараах Qt driver-уудыг дурдсан. PosAPI эхлэхдээ хүснэгтүүдээ автоматаар үүсгэдэг тул DB user-д schema/table үүсгэх эрх шаардлагатай. [[3]](#ref3)

| Driver | Database |
| --- | --- |
| `QMYSQL` | MySQL / MariaDB |
| `QPSQL` | PostgreSQL |
| `QODBC` | ODBC, Microsoft SQL Server |
| `QSQLITE` | SQLite 3 |

### 7.1. Сонголтын зөвлөмж

-   Бага ачаалал, нэг касс, энгийн deployment: SQLite
-   Олон касс, олон merchant, өндөр баримтын тоо: PostgreSQL/MySQL/MariaDB/SQL Server
-   SQLite ашиглаж байвал:
    -   `workDir`\-ийг network share дээр бүү байрлуул
    -   disk full monitoring хий
    -   process crash-ийн дараах integrity check төлөвлө
    -   backup хийхдээ service consistency-г тооц
-   Server database ашиглаж байвал:
    -   connection limit
    -   timezone
    -   UTF-8
    -   backup/restore drill
    -   DB latency monitoring
    -   least-privilege user
    -   schema migration-ийг PosAPI өөрөө хариуцахыг анхаар

## 8\. Сүлжээ ба хүчин чадлын шаардлага

Албан ёсны холболтын хуудас дараах minimum-ийг тэмдэглэсэн. [[3]](#ref3)

| Үзүүлэлт | Шаардлага |
| --- | --- |
| Storage | Хамгийн багадаа 1 GB сул зай |
| Network | Хамгийн багадаа 80 Mbps |
| Гадаад хандалт | Үндсэндээ Монгол Улсын сүлжээнээс |
| Гадаадаас | Монгол IP бүхий VPN шаардлагатай байж болно |
| `api.ebarimt.mn` | `103.17.108.216`, `103.17.108.217` |
| `auth.itc.gov.mn` | `103.87.69.75`, `103.87.69.76` |

### 8.1. Firewall

Зөвхөн шаардлагатай урсгалыг нээнэ.

```text
POS/ERP -> PosAPI:webServicePort
PosAPI -> auth.itc.gov.mn:443
PosAPI -> api.ebarimt.mn:443
PosAPI -> configured database port
```

PosAPI local endpoint-ийг public internet-д шууд expose хийхгүй. Reverse proxy ашиглавал authentication, IP allowlist, TLS, rate limit нэмнэ.

## 9\. Идэвхжүүлэлт

PosAPI суулгасны дараа анх идэвхгүй байна. Operator эрхтэй хэрэглэгч PosAPI UI-д нэвтэрч operator-оо сонгон идэвхжүүлнэ. Идэвхжих үед PosAPI тухайн operator-ын бүртгэлд холбогдож, сугалааны нөөц авна. Default port нь `7080`. [[3]](#ref3)

Идэвхжүүлсний дараах smoke test:

```bash
curl --fail --show-error \
  --header 'Accept: application/json' \
  'http://127.0.0.1:7080/rest/info'
```

Шалгах зүйл:

-   HTTP connection амжилттай
-   JSON parse хийгдэж байгаа
-   `posNo`, `posId`, `operatorName`, `operatorTIN` ирж байгаа
-   merchant жагсаалт хоосон эсэх
-   `lastSendDate`
-   `leftLotteries`
-   DB болон `workDir` мэдээлэл
-   PosAPI version

## 10\. Үндсэн local REST endpoint-ууд

Local base URL:

```text
http://{webServiceHost}:{webServicePort}
```

Жишээ:

```text
http://127.0.0.1:7080
```

| Үйлдэл | Method | Path | Body/Query |
| --- | --- | --- | --- |
| Баримт хадгалах | `POST` | `/rest/receipt` | Receipt JSON |
| Баримт буцаах | `DELETE` | `/rest/receipt` | `id`, `date` |
| Ажиллагааны мэдээлэл | `GET` | `/rest/info` | — |
| Төв систем рүү илгээх | `GET` | `/rest/sendData` | — |
| Банкны данс | `GET` | `/rest/bankAccounts?tin={TIN}` | TIN query |

Энэ endpoint-ийн багц нь ITC-ийн PosAPI навигаци болон нээлттэй SDK implementation-тай нийцнэ. [[1]](#ref1) [[5]](#ref5)

## 11\. Enum ба тогтмол утгууд

### 11.1. Баримтын төрөл

| Утга | Тайлбар |
| --- | --- |
| `B2C_RECEIPT` | Иргэн/эцсийн хэрэглэгчийн төлбөрийн баримт |
| `B2B_RECEIPT` | ААН-д олгох төлбөрийн баримт |
| `B2C_INVOICE` | Иргэний нэхэмжлэх |
| `B2B_INVOICE` | ААН-ийн нэхэмжлэх |

### 11.2. Татварын төрөл

| Утга | Тайлбар |
| --- | --- |
| `VAT_ABLE` | НӨАТ тооцох |
| `VAT_FREE` | НӨАТ-аас чөлөөлөгдөх |
| `VAT_ZERO` | НӨАТ-ын 0 хувь |
| `NO_VAT` | НӨАТ тооцохгүй ангилал |

> Хуучин эх сурвалжид `NOT_VAT` байж болно. Одоогийн ITC schema-д `NO_VAT` гэж харагдаж байгаа тул runtime OpenAPI-г шалгана. [[2]](#ref2)

### 11.3. Баркодын төрөл

-   `UNDEFINED`
-   `GS1`
-   `ISBN`

### 11.4. Төлбөрийн код

Албан ёсны нийтэд харагдах schema-д:

-   `CASH`
-   `PAYMENT_CARD`

### 11.5. Төлбөрийн төлөв

| Утга | Тайлбар |
| --- | --- |
| `PAID` | Төлбөр амжилттай |
| `PAY` | Гуравдагч системээр төлбөр гүйцэтгэх шаардлагатай |
| `REVERSED` | Төлбөр буцаагдсан |
| `ERROR` | Төлбөр амжилтгүй |

### 11.6. Баримт үүсгэх response status

| Утга | Тайлбар |
| --- | --- |
| `SUCCESS` | Баримт амжилттай үүссэн |
| `ERROR` | Алдаа |
| `PAYMENT` | Төлбөрийн мэдээлэл/үйлдэл шаардлагатай |

## 12\. `POST /rest/receipt` — төлбөрийн баримт хадгалах

Энэ сервис нь борлуулалтын мэдээллийг хүлээн авч, ДДТД, QR data, сугалааны дугаар, огноо, төлөв зэрэг боловсруулсан мэдээллийг буцаана. [[2]](#ref2) [[4]](#ref4)

### 12.1. Request top-level талбар

| Талбар | Төрөл | Шаардлага | Тайлбар |
| --- | --- | --: | --- |
| `totalAmount` | number | Тийм | Багцын нийт дүн |
| `totalVAT` | number | Нөхцөлт | Багцын НӨАТ |
| `totalCityTax` | number | Нөхцөлт | Багцын НХАТ |
| `branchNo` | string | Тийм | Merchant-ийн 3 оронтой салбар, ж. `001` |
| `districtCode` | string | Тийм | 4 оронтой байршлын код |
| `merchantTin` | string | Тийм | Баримт олгогчийн TIN |
| `posNo` | string | Тийм | Дотоод кассын дугаар |
| `customerTin` | string/null | B2B-д тийм | Худалдан авагчийн TIN |
| `consumerNo` | string/null | Нөхцөлт | EBarimt хэрэглэгчийн дугаар |
| `type` | enum | Тийм | B2C/B2B receipt/invoice |
| `inactiveId` | string/null | Засварт | Идэвхгүй болгох/засварлах хуучин ДДТД |
| `invoiceId` | string/null | Нэхэмжлэх төлөхөд | Холбогдох invoice ДДТД |
| `reportMonth` | string/null | Нөхцөлт | Тайлант сар |
| `billIdSuffix` | string | Одоогийн schema-д | Багцын дотоод suffix |
| `data` | object/null | Үгүй | Нэмэлт metadata |
| `receipts` | array | Тийм | Нэг ба түүнээс олон sub-receipt |
| `payments` | array | Receipt-д | Төлбөрийн задаргаа |

### 12.2. `receipts[]` — дэд баримт

| Талбар | Төрөл | Шаардлага | Тайлбар |
| --- | --- | --: | --- |
| `totalAmount` | number | Тийм | Дэд баримтын нийт дүн |
| `taxType` | enum | Тийм | `VAT_ABLE`, `VAT_FREE`, `VAT_ZERO`, `NO_VAT` |
| `merchantTin` | string | Тийм | Тухайн дэд баримтын merchant |
| `customerTin` | string/null | Нөхцөлт | Худалдан авагч TIN |
| `totalVAT` | number | Нөхцөлт | Дэд баримтын НӨАТ |
| `totalCityTax` | number | Нөхцөлт | Дэд баримтын НХАТ |
| `invoiceId` | string/null | Нөхцөлт | Дэд түвшний invoice |
| `bankAccountNo` | string/null | Нөхцөлт | Хуучин дансны дугаар |
| `iBan` | string/null | Одоогийн schema-д | Merchant-д бүртгэлтэй IBAN |
| `data` | object/null | Үгүй | Нэмэлт metadata |
| `items` | array | Тийм | Борлуулсан бараа/үйлчилгээ |

### 12.3. `items[]`

| Талбар | Төрөл | Шаардлага | Тайлбар |
| --- | --- | --: | --- |
| `name` | string | Тийм | Бараа/үйлчилгээний нэр |
| `barCode` | string/null | Нөхцөлт | Баркод |
| `barCodeType` | enum/null | Нөхцөлт | `UNDEFINED`, `GS1`, `ISBN` |
| `classificationCode` | string | Тийм | БҮНА/ангиллын 7 оронтой код |
| `taxProductCode` | string/null | Нөхцөлт | VAT\_FREE/VAT\_ZERO/NO\_VAT код |
| `measureUnit` | string | Тийм | Хэмжих нэгж |
| `qty` | number | Тийм | Тоо хэмжээ; эерэг |
| `unitPrice` | number | Тийм | Татвар шингэсэн нэгж үнэ |
| `totalAmount` | number | Тийм | Татвар шингэсэн нийт дүн |
| `totalVAT` | number | Нөхцөлт | Item НӨАТ |
| `totalCityTax` | number | Нөхцөлт | Item НХАТ |
| `totalBonus` | number | Version-dependent | Bonus/discount-тэй холбоотой дүн |
| `data` | object/null | Нөхцөлт | lot/stock QR зэрэг domain metadata |

### 12.4. Эмийн сангийн `items[].data`

Албан ёсны холболтын зааварт эмийн сангийн PosAPI нөхцөлийг идэвхжүүлж, эмийн бүтээгдэхүүнүүдийг нэг дэд баримтад илгээх, item-ийн `data`\-д `lotNo` дамжуулахыг заасан. [[3]](#ref3)

```json
{
  "data": {
    "lotNo": "LOT-2026-000123"
  }
}
```

Зарим schema/implementation-д:

```json
{
  "data": {
    "lotNo": "LOT-2026-000123",
    "stockQR": [
      "QR-001",
      "QR-002"
    ]
  }
}
```

> `stockQR` эсвэл `stockQrs` гэсэн capitalization/schema-ийн ялгааг production OpenAPI export болон staging contract test-ээр тогтооно.

### 12.5. `payments[]`

| Талбар | Төрөл | Шаардлага | Тайлбар |
| --- | --- | --: | --- |
| `code` | enum | Тийм | `CASH`, `PAYMENT_CARD` |
| `exchangeCode` | string/null | Нөхцөлт | Төлбөр гүйцэтгэх гуравдагч системийн код |
| `status` | enum | Тийм | `PAID`, `PAY`, `REVERSED`, `ERROR` |
| `paidAmount` | number | Тийм | Төлсөн дүн |
| `data` | object/null | Картанд | Карт/банк metadata |

Картын metadata-ийн албан ёсны жишээнд:

```json
{
  "terminalID": "11111",
  "rrn": "123456789123",
  "maskedCardNumber": "123456XXXXXX7890",
  "easy": true
}
```

Нэмэлтээр `bankCode` байж болно. Картын бүтэн PAN, CVV, PIN хадгалж/дамжуулж болохгүй.

### 12.6. Бүрэн B2C cash request

```json
{
  "totalAmount": 5600,
  "totalVAT": 500,
  "totalCityTax": 100,
  "branchNo": "001",
  "districtCode": "2501",
  "merchantTin": "110718991986",
  "posNo": "001",
  "customerTin": null,
  "consumerNo": null,
  "type": "B2C_RECEIPT",
  "inactiveId": null,
  "invoiceId": null,
  "reportMonth": null,
  "billIdSuffix": "01",
  "data": null,
  "receipts": [
    {
      "totalAmount": 5600,
      "taxType": "VAT_ABLE",
      "merchantTin": "110718991986",
      "customerTin": null,
      "totalVAT": 500,
      "totalCityTax": 100,
      "invoiceId": null,
      "bankAccountNo": null,
      "iBan": null,
      "data": null,
      "items": [
        {
          "name": "Талх",
          "barCode": "19059010880001",
          "barCodeType": "GS1",
          "classificationCode": "2349010",
          "taxProductCode": null,
          "measureUnit": "ш",
          "qty": 1,
          "unitPrice": 5600,
          "totalAmount": 5600,
          "totalVAT": 500,
          "totalCityTax": 100,
          "data": null
        }
      ]
    }
  ],
  "payments": [
    {
      "code": "CASH",
      "exchangeCode": null,
      "status": "PAID",
      "paidAmount": 5600,
      "data": null
    }
  ]
}
```

### 12.7. B2B request

B2B үед top-level болон шаардлагатай дэд баримтын `customerTin`\-д худалдан авагчийн TIN өгнө.

```json
{
  "totalAmount": 110000,
  "totalVAT": 10000,
  "totalCityTax": 0,
  "branchNo": "001",
  "districtCode": "2501",
  "merchantTin": "110718991986",
  "posNo": "001",
  "customerTin": "110000000000",
  "consumerNo": null,
  "type": "B2B_RECEIPT",
  "inactiveId": null,
  "invoiceId": null,
  "reportMonth": null,
  "billIdSuffix": "B2B-01",
  "data": {
    "orderId": "ORD-2026-000001"
  },
  "receipts": [
    {
      "totalAmount": 110000,
      "taxType": "VAT_ABLE",
      "merchantTin": "110718991986",
      "customerTin": "110000000000",
      "totalVAT": 10000,
      "totalCityTax": 0,
      "invoiceId": null,
      "iBan": null,
      "items": [
        {
          "name": "Програм хангамжийн үйлчилгээ",
          "barCode": null,
          "barCodeType": "UNDEFINED",
          "classificationCode": "6201000",
          "taxProductCode": null,
          "measureUnit": "үйлчилгээ",
          "qty": 1,
          "unitPrice": 110000,
          "totalAmount": 110000,
          "totalVAT": 10000,
          "totalCityTax": 0,
          "data": null
        }
      ]
    }
  ],
  "payments": [
    {
      "code": "CASH",
      "status": "PAID",
      "paidAmount": 110000
    }
  ]
}
```

> `classificationCode` нь зөвхөн жишээ. Бодит бараа/үйлчилгээний кодыг БҮНА лавлагаанаас авна.

### 12.8. Картын төлбөрийн request fragment

```json
{
  "payments": [
    {
      "code": "PAYMENT_CARD",
      "exchangeCode": null,
      "status": "PAID",
      "paidAmount": 5600,
      "data": {
        "terminalID": "TERM-001",
        "rrn": "123456789123",
        "maskedCardNumber": "411111XXXXXX1111",
        "easy": true,
        "bankCode": "BANK-CODE"
      }
    }
  ]
}
```

### 12.9. Invoice үүсгэх

```json
{
  "type": "B2B_INVOICE",
  "customerTin": "110000000000",
  "payments": []
}
```

Invoice үүсгэхэд payment заавал биш байж болно. Дараа нь invoice-ийн дагуу receipt үүсгэхдээ:

```json
{
  "type": "B2B_RECEIPT",
  "invoiceId": "<INVOICE_DDTD>"
}
```

Холбогдох invoice ДДТД-г top-level болон шаардлагатай бол sub-receipt-ийн `invoiceId`\-д ашиглана.

### 12.10. Response

| Талбар | Тайлбар |
| --- | --- |
| `id` | Багц баримтын ДДТД |
| `version` | PosAPI/version |
| `totalAmount` | Нийт дүн |
| `totalVAT` | НӨАТ |
| `totalCityTax` | НХАТ |
| `branchNo` | Салбар |
| `districtCode` | Байршлын код |
| `merchantTin` | Merchant TIN |
| `posNo` | POS дугаар |
| `customerTin` | Худалдан авагч TIN |
| `consumerNo` | EBarimt хэрэглэгч |
| `type` | Баримтын төрөл |
| `receipts` | Дэд баримтууд; тус бүр `id`\-тай |
| `payments` | Төлбөрийн мэдээлэл |
| `posId` | PosAPI instance ID |
| `status` | `SUCCESS`, `ERROR`, `PAYMENT` |
| `message` | Тайлбар/алдаа |
| `qrData` | QR код үүсгэх raw data |
| `lottery` | Сугалааны дугаар |
| `date` | Баримтын огноо |
| `easy` | Easy registration амжилт |

Жишээ response:

```json
{
  "id": "037900846788001095330000010012619",
  "version": "3.x",
  "totalAmount": 5600,
  "totalVAT": 500,
  "totalCityTax": 100,
  "branchNo": "001",
  "districtCode": "2501",
  "merchantTin": "110718991986",
  "posNo": "001",
  "consumerNo": null,
  "type": "B2C_RECEIPT",
  "receipts": [
    {
      "id": "037900846788001095330000110012619",
      "totalAmount": 5600,
      "taxType": "VAT_ABLE",
      "merchantTin": "110718991986",
      "totalVAT": 500,
      "totalCityTax": 100,
      "items": []
    }
  ],
  "payments": [
    {
      "code": "CASH",
      "paidAmount": 5600,
      "status": "PAID"
    }
  ],
  "posId": 101321077,
  "status": "SUCCESS",
  "message": null,
  "qrData": "<LONG_QR_DATA>",
  "lottery": "<LOTTERY>",
  "date": "2026-01-01 12:00:00",
  "easy": false
}
```

### 12.11. cURL

```bash
curl --request POST \
  --url 'http://127.0.0.1:7080/rest/receipt' \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data @receipt.json
```

### 12.12. Дүнгийн invariant

Хүсэлт илгээхийн өмнө application талд:

```text
top.totalAmount == sum(receipts[].totalAmount)
top.totalVAT == sum(receipts[].totalVAT)
top.totalCityTax == sum(receipts[].totalCityTax)
receipt.totalAmount == sum(items[].totalAmount)
receipt.totalVAT == sum(items[].totalVAT)
receipt.totalCityTax == sum(items[].totalCityTax)
sum(payments[].paidAmount) == top.totalAmount  // receipt үед
```

Floating-point алдаанаас сэргийлж мөнгөн дүнг decimal төрөл эсвэл integer minor unit-аар тооцоод JSON number болгон хөрвүүлнэ.

## 13\. `DELETE /rest/receipt` — баримт буцаах

Энэ сервис нь барааны буцаалт эсвэл алдаатай үүссэн B2C төлбөрийн баримтыг идэвхгүй болгоход ашиглагдана. Баталгаажаагүй баримт шууд идэвхгүй болж болно. Иргэн баталгаажуулсан баримт буцаагдвал “баталгаажаагүй буцаалт” төлөвт орж, иргэн EBarimt апп-аас зөвшөөрсний дараа идэвхгүй болох урсгалтай. [[6]](#ref6)

Request:

```json
{
  "id": "<RECEIPT_DDTD>",
  "date": "2026-01-01 12:00:00"
}
```

cURL:

```bash
curl --request DELETE \
  --url 'http://127.0.0.1:7080/rest/receipt' \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data '{
    "id": "<RECEIPT_DDTD>",
    "date": "2026-01-01 12:00:00"
  }'
```

Буцаалтын өмнө:

-   зөвхөн баримтын `id` биш `date`\-ийг хамт хадгалсан байх
-   operator user-д audit trail үүсгэх
-   буцаалтын шалтгаан, эх баримт, хэрэглэгч, касс, timestamp хадгалах
-   нэг баримтыг давтан буцаахаас хамгаалах
-   HTTP timeout гарсан ч blind retry хийхээс өмнө төлөв шалгах
-   application database-д буцаалтын state machine ашиглах

Жишээ state:

```text
ACTIVE
  -> RETURN_REQUESTED
  -> RETURN_PENDING_CUSTOMER
  -> INACTIVE

Алдаатай:
RETURN_REQUESTED
  -> RETURN_FAILED
```

## 14\. `GET /rest/info` — ажиллагааны мэдээлэл

```bash
curl --request GET \
  --url 'http://127.0.0.1:7080/rest/info' \
  --header 'Accept: application/json'
```

Response-ийн үндсэн бүтэц:

```json
{
  "operatorName": "Operator name",
  "operatorTIN": "11000000000",
  "posId": 123456,
  "posNo": "001",
  "lastSendDate": "2026-01-01 12:00:00",
  "leftLotteries": 1000,
  "appInfo": {
    "applicationDir": "...",
    "currentDir": "...",
    "database": "QPSQL",
    "database-host": "...",
    "supportedDatabases": [
      "QMYSQL",
      "QPSQL",
      "QODBC",
      "QSQLITE"
    ],
    "workDir": "..."
  },
  "merchants": [
    {
      "name": "Merchant LLC",
      "tin": "11000000000",
      "customers": [
        {
          "name": "Customer LLC",
          "tin": "22000000000",
          "vatPayer": true
        }
      ]
    }
  ]
}
```

> `operatorTIN`, `database-host`, `lastSendDate` зэрэг property-ийн capitalization/hyphen нь version-оор ялгаатай байж болно. JSON parser-аа unknown field-д tolerant, шаардлагатай талбарт strict болго.

Monitoring-д:

-   process reachable
-   `lastSendDate` хэт хуучирсан эсэх
-   `leftLotteries` threshold
-   зөв `posNo`
-   merchant бүртгэл
-   expected DB driver
-   version change
-   response latency

## 15\. `GET /rest/sendData` — төв систем рүү илгээх

```bash
curl --request GET \
  --url 'http://127.0.0.1:7080/rest/sendData' \
  --header 'Accept: application/json'
```

Зориулалт:

-   PosAPI-д queue/DB-д хадгалагдсан мэдээллийг нэгдсэн систем рүү илгээх процессыг trigger хийх
-   offline/түр тасалдсан орчны дараа мэдээлэл дамжуулах
-   операторын manual “send now” үйлдэл хийх

Production зөвлөмж:

-   хэрэглэгчийн UI request дээр удаан блоклохгүй
-   background job ашиглах
-   concurrent `sendData`\-г lock хийх
-   timeout гарсан ч мэдээлэл заавал алдагдсан гэж үзэхгүй
-   дараа нь `/rest/info` болон дотоод төлөвөөр баталгаажуулах
-   retry-д exponential backoff + jitter ашиглах

## 16\. `GET /rest/bankAccounts?tin=...`

```bash
curl --request GET \
  --url 'http://127.0.0.1:7080/rest/bankAccounts?tin=110718991986' \
  --header 'Accept: application/json'
```

Response-ийн боломжит бүтэц:

```json
[
  {
    "id": 1,
    "tin": "110718991986",
    "bankAccountNo": "5000000000",
    "bankAccountName": "Merchant account",
    "bankId": 1,
    "bankName": "Bank",
    "iban": "MN00000000000000000000",
    "data": null
  }
]
```

Дүрэм:

-   invoice эсвэл IBAN шаардсан урсгалд энэ endpoint-оор merchant-ийн бүртгэлтэй дансыг авна
-   хэрэглэгч дурын IBAN гараар бичихээс илүү returned list-ээс сонгоно
-   top/sub-receipt-ийн merchant-д харьяалагдах IBAN ашиглана
-   дансны жагсаалтыг богино TTL-тэй cache хийж болно
-   response-ийн `iban` ба request-ийн `iBan` capitalization өөр байж болзошгүй

## 17\. Оператороос merchant бүртгэх

PosAPI-д merchant ашиглахын өмнө operator хүсэлт илгээж, merchant баталгаажуулах урсгалтай. Оператор–ИБаримт системийн зааварт ХСН шалгалт, operator эрх, merchant хүсэлт, merchant-ийн зөвшөөрөл гол алхмууд гэж тайлбарлагдсан. [[7]](#ref7)

Нээлттэй binding-д дараах request загвар байна:

```json
{
  "oprRegNo": "<OPERATOR_REG_NO>",
  "posNo": "<POS_NO>",
  "list": [
    "<MERCHANT_REG_OR_TIN>"
  ]
}
```

Зарим нийтэд харагдах implementation-д endpoint:

```text
POST https://api.ebarimt.mn/api/tpi/receipt/saveOprMerchants
```

> Production endpoint, auth, request field-ийг Operator/Developer ITC-ийн одоогийн OpenAPI-аас заавал export хийж баталгаажуулна. Зарим хуучин code-д URL дотор санамсаргүй space (`%20`) орсон алдаа байдаг.

## 18\. Түрээслэгч бүртгэх

Developer ITC-ийн PosAPI навигацад түрээслэгч бүртгэх тусдаа POST endpoint байна. [[1]](#ref1)

Ашиглах тохиолдол:

-   худалдааны төв
-   зах, лангуу
-   олон tenant бүхий нэг operator/POS
-   түрээслүүлэгчийн дэд merchant-ууд

Энэ endpoint нь public төв API тул credential болон production access-ийг `posapi@itc.gov.mn`\-ээр баталгаажуулна. Request/response-ийг Postman/OpenAPI export-оос авна.

## 19\. ОАТ барааны QR/stock

PosAPI-ийн receipt endpoint-ээр ОАТ бараа илгээхдээ тухайн барааны тэмдгийн QR/stock identifier-ийг item metadata-д дамжуулах урсгалтай. Developer ITC дээр:

-   ОАТ барааны баркодын мэдээлэл лавлах
-   ОАТ тэмдгийн үлдэгдэл
-   ОАТ тэмдгийн зарлага хадгалах
-   хуудаслалттай үлдэгдэл
-   үйлдвэрлэгч эсэх
-   хагарал, хорогдол, урамшууллын бүртгэл

гэсэн тусдаа API-ууд бий. [[1]](#ref1)

Ерөнхий lookup:

```text
GET https://service.itc.gov.mn/api/inventory/stock/{QR_OR_QUERY}
```

> Яг path/query нь тухайн OAT endpoint-ийн Original/OpenAPI export-оос авна.

Receipt item-ийн боломжит metadata:

```json
{
  "data": {
    "stockQR": [
      "<EXCISE_MARK_QR>"
    ]
  }
}
```

Шалгах зүйл:

-   QR давхар борлуулагдаагүй
-   item qty болон stock QR count нийцсэн
-   зөв merchant
-   зөв barcode/classification
-   OAT lookup амжилтгүй бол receipt үүсгэх бодлого
-   partial failure-ийн нөхөн сэргээх урсгал

## 20\. Лавлагааны public API-ууд

Production base:

```text
https://api.ebarimt.mn
```

Staging base:

```text
https://st-api.ebarimt.mn
```

Нээлттэй implementation болон Developer ITC-ийн endpoint index-д дараах lookup-ууд байна. [[1]](#ref1) [[8]](#ref8)

### 20.1. District code

```http
GET /api/info/check/getBranchInfo
```

cURL:

```bash
curl --request GET \
  --url 'https://api.ebarimt.mn/api/info/check/getBranchInfo' \
  --header 'Accept: application/json'
```

Response:

```json
{
  "msg": "success",
  "status": 200,
  "data": [
    {
      "branchCode": "...",
      "branchName": "...",
      "subBranchCode": "...",
      "subBranchName": "..."
    }
  ]
}
```

### 20.2. Регистр/Civil ID-аас TIN

```http
GET /api/info/check/getTinInfo?regNo={regNo}
```

```bash
curl --request GET \
  --url 'https://api.ebarimt.mn/api/info/check/getTinInfo?regNo=<REG_NO>' \
  --header 'Accept: application/json'
```

Response:

```json
{
  "msg": "success",
  "status": 200,
  "data": "<TIN>"
}
```

Merchant бүртгэхдээ:

-   хуулийн этгээд: TIN
-   иргэн: Civil ID/TIN урсгал

ашиглагддаг. [[9]](#ref9)

### 20.3. Татвар төлөгчийн бүртгэлийн мэдээлэл

```http
GET /api/info/check/getInfo?tin={tin}
```

```json
{
  "msg": "success",
  "status": 200,
  "data": {
    "name": "Taxpayer name",
    "freeProject": false,
    "cityPayer": false,
    "vatPayer": true,
    "found": true,
    "vatpayerRegisteredDate": "2020-01-01",
    "isGovernment": false
  }
}
```

Энэ endpoint-оор:

-   TIN олдсон эсэх
-   НӨАТ суутган төлөгч эсэх
-   НХАТ төлөгч эсэх
-   чөлөөлөгдөх төсөл эсэх
-   төрийн байгууллага эсэх

зэргийг шалгаж болно.

### 20.4. VAT\_FREE/VAT\_ZERO/NO\_VAT бүтээгдэхүүний татварын код

```http
GET /api/receipt/receipt/getProductTaxCode
```

Response-ийн ерөнхий бүтэц:

```json
{
  "msg": "success",
  "status": 200,
  "data": [
    {
      "startDate": "2026-01-01T00:00:00",
      "endDate": null,
      "taxProductCode": "001",
      "taxProductName": "...",
      "taxTypeCode": 1,
      "taxTypeName": "VAT_FREE"
    }
  ]
}
```

`taxType` нь `VAT_FREE`, `VAT_ZERO`, `NO_VAT` үед тохирох `taxProductCode`\-г явуулна.

### 20.5. БҮНА, ангилал, баркод

```http
GET /api/info/check/barcode/v2
GET /api/info/check/barcode/v2/{segment1}
GET /api/info/check/barcode/v2/{segment1}/{segment2}/...
```

Hierarchy:

1.  Салбар
2.  Дэд салбар
3.  Бүлэг
4.  Анги
5.  Дэд анги
6.  БҮНА код
7.  Баркодын жагсаалт

Response row:

```json
[
  ["код", "нэр"]
]
```

Leaf barcode row:

```json
[
  ["barcode", "name", "registeredDate"]
]
```

> Stoplight spec-ийн path parameter order бодит API-тай зөрөх тохиолдол community SDK-д тэмдэглэгдсэн. Variable-depth path-ийг staging/production-д тусад нь шалгана. [[8]](#ref8)

### 20.6. Баркод жагсаалтаар лавлах

Developer ITC-д олон баркодын жагсаалтаар lookup хийх тусдаа endpoint байна. Batch product import, каталог sync, validation-д ашиглана. [[1]](#ref1)

## 21\. Token ба public protected API

Developer ITC-ийн төслийн навигацад:

-   ИБАРИМТ нэвтрэлт
-   ИБАРИМТ token авах
-   Бараа бүртгэл нэвтрэлт
-   Бараа бүртгэл token авах

гэсэн тусдаа хэсэг бий. [[1]](#ref1)

Known environment endpoints:

```text
Staging:
https://st.auth.itc.gov.mn/auth/realms/Staging/protocol/openid-connect/token

Production:
https://auth.itc.gov.mn/auth/realms/ITC/protocol/openid-connect/token
```

Ерөнхий password grant жишээ:

```bash
curl --request POST \
  --url 'https://st.auth.itc.gov.mn/auth/realms/Staging/protocol/openid-connect/token' \
  --header 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=password' \
  --data-urlencode 'client_id=<CLIENT_ID>' \
  --data-urlencode 'username=<USERNAME>' \
  --data-urlencode 'password=<PASSWORD>'
```

Response:

```json
{
  "access_token": "<TOKEN>",
  "expires_in": 300,
  "refresh_token": "<REFRESH_TOKEN>",
  "refresh_expires_in": 1800,
  "token_type": "Bearer",
  "not-before-policy": 0,
  "session_state": "...",
  "scope": "..."
}
```

Security:

-   credential-ийг frontend/mobile binary-д бүү embed
-   backend secret manager ашигла
-   token log хийхгүй
-   `Authorization` header redact хийх
-   refresh token-ийг encrypted storage-д хадгалах
-   environment credential-ийг тусгаарлах
-   production token-ийг Postman collection дотор export хийхгүй

## 22\. Гуравдагч төлбөрийн системийн callback

ITC-ийн PDF гарын авлагад PosAPI болон гуравдагч төлбөрийн системийн хооронд `exchangeCode`\-оор payment exchange хийх callback загварыг тайлбарласан. [[4]](#ref4)

### 22.1. `GET_CONFIG`

PosAPI гуравдагч системээс тохиргоо авна.

```http
GET http://{third_party_system}/pos/payment?type=GET_CONFIG
```

Жишээ response:

```json
{
  "title": "Payment provider",
  "apiUrl": "http://payment-provider.local/api/pay",
  "headers": {
    "Authorization": "Bearer <TOKEN>"
  }
}
```

### 22.2. `SEND`

```http
POST http://{third_party_system}/pos/payment?type=SEND
Content-Type: application/json
```

Body-д `payment` объект ирнэ.

### 22.3. `SEND_AND_RECEIVE`

```http
POST http://{third_party_system}/pos/payment?type=SEND_AND_RECEIVE
Content-Type: application/json
```

Body-д:

```json
{
  "payment": {},
  "receipt": {}
}
```

### 22.4. `RECEIVE`

```http
POST http://{third_party_system}/pos/payment?type=RECEIVE
Content-Type: application/json
```

Body-д `payment` объект байна.

### 22.5. `PAYMENT`

```http
POST http://{third_party_system}/pos/payment?type=PAYMENT
Content-Type: application/json
```

Body-д `payment` объект байна.

### 22.6. Callback хөгжүүлэлтийн дүрэм

-   callback бүрийг idempotent болго
-   `rrn`, internal payment ID, receipt ID-аар duplicate detection хий
-   request signature/HMAC нэмэх боломжийг төлбөрийн системтэй тохир
-   IP allowlist
-   TLS
-   timeout богино
-   async processing
-   raw card number log хийхгүй
-   callback request/response-д correlation ID ашиглах
-   PosAPI-д буцаах response contract-ийг staging-д баталгаажуулах

## 23\. Картын хялбар бүртгэл

`noEasyResponse=true` тохируулбал картын easy registration үед банкны хариуг хүлээлгүй баримт үүсгэх боломжтой. Энэ тохиолдолд PosAPI response-ийн `easy` талбарт найдаж болохгүй. [[3]](#ref3)

Сонголтын trade-off:

| `noEasyResponse` | Давуу тал | Сул тал |
| --- | --- | --- |
| `false` | `easy` response бодит үр дүнг илэрхийлнэ | Банкны хариуг хүлээж latency нэмэгдэнэ |
| `true` | Баримт үүсгэх latency багасна | `easy` талбар ашиглах боломжгүй |

## 24\. Хялбар бүртгэлийн дагалдах API

Developer ITC-д дараах endpoint-ууд байна. [[1]](#ref1)

-   Иргэнийг Civil ID/регистрээр лавлах
-   Утас эсвэл EBarimt хэрэглэгчийн дугаараар profile лавлах
-   QR баримт баталгаажуулах
-   Гадаад жуулчныг паспорт/F дугаараар лавлах
-   Гадаад жуулчныг EBarimt loginName-аар лавлах
-   Гадаад жуулчин бүртгэх
-   Easy registration-аар бүртгэгдсэн баримтын буцаалтыг баталгаажуулах

Нээлттэй implementation-д харагдах route-ууд:

```text
GET  https://service.itc.gov.mn/api/easy-register/api/info/consumer/{regNo}
POST https://service.itc.gov.mn/api/easy-register/rest/v1/getProfile
POST https://service.itc.gov.mn/api/easy-register/rest/v1/approveQr
GET  https://service.itc.gov.mn/api/easy-register/api/info/foreigner/{...}
GET  https://service.itc.gov.mn/api/easy-register/api/info/foreigner/customerNo/{loginName}
PUT  https://service.itc.gov.mn/api/easy-register/api/info/foreigner/{passportNo}
```

Profile request:

```json
{
  "phoneNum": "99112233",
  "customerNo": null
}
```

эсвэл:

```json
{
  "phoneNum": null,
  "customerNo": "12345678"
}
```

QR approve request:

```json
{
  "customerNo": "12345678",
  "qrData": "<QR_DATA>"
}
```

## 25\. PosAPI дагалдах төв API-ууд

Developer ITC-ийн “Pos Api дагалдах сервисүүд” хэсэгт дараах төв API-ууд байна. [[1]](#ref1)

### 25.1. Борлуулалтын задаргаа

```http
POST https://api.ebarimt.mn/api/tpi/receipt/getSalesTotalData
Authorization: Bearer <TOKEN>
```

Ерөнхий request:

```json
{
  "year": "2026",
  "month": "08",
  "day": "09",
  "status": 0,
  "startCount": 0,
  "endCount": 100
}
```

Status-ийн хуучин enum mapping:

| Тоо | Тайлбар |
| --: | --- |
| `0` | Нийт |
| `1` | B2B |
| `2` | Сугалаатай/B2C |
| `3` | Invoice |
| `4` | Batch |

### 25.2. Толгой компани охин компанийн худалдан авалт татах

```http
POST https://api.ebarimt.mn/api/tpi/receipt/getSaleListERP
Authorization: Bearer <TOKEN>
```

Ерөнхий request:

```json
{
  "Pin": "<PARENT_REG_NO>",
  "StartDate": "2026-08-01",
  "EndDate": "2026-08-09",
  "subPin": [
    "<SUBSIDIARY_REG_NO>"
  ]
}
```

> Хуучин binding-д `EndDate`\-ийн төрөл буруу (`int`) бичигдсэн байж болно. Current OpenAPI-г дагана.

### 25.3. Хуулийн этгээдийн гаалийн мэдүүлэг

Developer ITC-д тусдаа POST endpoint байна. Гаалийн мэдүүлгийн integration шаардлагатай бол тухайн endpoint-ийг Original/OpenAPI-аар export хийж collection-д нэмнэ.

## 26\. Postman ашиглах

Developer ITC өөрийн API хуудсыг Original/OpenAPI хэлбэрээр export хийгээд Postman-д Collection болгон import хийхийг заасан. [[10]](#ref10)

Албан ёсны алхам:

1.  Developer ITC дээр ашиглах API/төслөө нээ.
2.  Export хэсгээс `Original` сонго.
3.  Export хийсэн OpenAPI файлыг хадгал.
4.  Postman → `Import`.
5.  Export хийсэн файл/collection-оо сонго.
6.  Postman Collection үүссэний дараа environment variable тохируул.
7.  Secret/token-ийг collection JSON-д hardcode хийхгүй.

### 26.1. Environment variables

| Variable | Жишээ |
| --- | --- |
| `posBaseUrl` | `http://127.0.0.1:7080` |
| `ebarimtApiBaseUrl` | `https://api.ebarimt.mn` |
| `ebarimtStagingBaseUrl` | `https://st-api.ebarimt.mn` |
| `serviceBaseUrl` | `https://service.itc.gov.mn` |
| `tin` | Merchant TIN |
| `customerTin` | B2B customer TIN |
| `regNo` | Регистр/Civil ID |
| `receiptId` | Буцаах ДДТД |
| `receiptDate` | `yyyy-MM-dd HH:mm:ss` |
| `accessToken` | Runtime token |

### 26.2. Import хийхэд бэлэн Postman collection

Доорх JSON-ийг `ebarimt-posapi3.postman_collection.json` нэрээр хадгалаад Postman-д import хийж болно.

```json
{
  "info": {
    "_postman_id": "19d49843-e177-4e96-9f75-posapi3guide",
    "name": "EBarimt PosAPI 3.0 - Developer Guide",
    "description": "Generated developer collection. Validate endpoint schemas against the latest Developer ITC Original/OpenAPI export before production.",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "variable": [
    {
      "key": "posBaseUrl",
      "value": "http://127.0.0.1:7080"
    },
    {
      "key": "ebarimtApiBaseUrl",
      "value": "https://api.ebarimt.mn"
    },
    {
      "key": "serviceBaseUrl",
      "value": "https://service.itc.gov.mn"
    },
    {
      "key": "tin",
      "value": "110718991986"
    },
    {
      "key": "customerTin",
      "value": "110000000000"
    },
    {
      "key": "regNo",
      "value": ""
    },
    {
      "key": "receiptId",
      "value": ""
    },
    {
      "key": "receiptDate",
      "value": "2026-01-01 12:00:00"
    },
    {
      "key": "accessToken",
      "value": ""
    }
  ],
  "item": [
    {
      "name": "Local PosAPI",
      "item": [
        {
          "name": "Health - Info",
          "request": {
            "method": "GET",
            "header": [
              {
                "key": "Accept",
                "value": "application/json"
              }
            ],
            "url": {
              "raw": "{{posBaseUrl}}/rest/info",
              "host": [
                "{{posBaseUrl}}"
              ],
              "path": [
                "rest",
                "info"
              ]
            }
          }
        },
        {
          "name": "Create B2C Cash Receipt",
          "event": [
            {
              "listen": "test",
              "script": {
                "exec": [
                  "pm.test('HTTP success', function () { pm.expect(pm.response.code).to.be.within(200, 299); });",
                  "const json = pm.response.json();",
                  "pm.test('Receipt status SUCCESS', function () { pm.expect(json.status).to.eql('SUCCESS'); });",
                  "if (json.id) pm.collectionVariables.set('receiptId', json.id);",
                  "if (json.date) pm.collectionVariables.set('receiptDate', json.date);"
                ]
              }
            }
          ],
          "request": {
            "method": "POST",
            "header": [
              {
                "key": "Accept",
                "value": "application/json"
              },
              {
                "key": "Content-Type",
                "value": "application/json"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"totalAmount\": 5600,\n  \"totalVAT\": 500,\n  \"totalCityTax\": 100,\n  \"branchNo\": \"001\",\n  \"districtCode\": \"2501\",\n  \"merchantTin\": \"{{tin}}\",\n  \"posNo\": \"001\",\n  \"customerTin\": null,\n  \"consumerNo\": null,\n  \"type\": \"B2C_RECEIPT\",\n  \"inactiveId\": null,\n  \"invoiceId\": null,\n  \"reportMonth\": null,\n  \"billIdSuffix\": \"01\",\n  \"data\": null,\n  \"receipts\": [\n    {\n      \"totalAmount\": 5600,\n      \"taxType\": \"VAT_ABLE\",\n      \"merchantTin\": \"{{tin}}\",\n      \"customerTin\": null,\n      \"totalVAT\": 500,\n      \"totalCityTax\": 100,\n      \"invoiceId\": null,\n      \"bankAccountNo\": null,\n      \"iBan\": null,\n      \"data\": null,\n      \"items\": [\n        {\n          \"name\": \"Талх\",\n          \"barCode\": \"19059010880001\",\n          \"barCodeType\": \"GS1\",\n          \"classificationCode\": \"2349010\",\n          \"taxProductCode\": null,\n          \"measureUnit\": \"ш\",\n          \"qty\": 1,\n          \"unitPrice\": 5600,\n          \"totalAmount\": 5600,\n          \"totalVAT\": 500,\n          \"totalCityTax\": 100,\n          \"data\": null\n        }\n      ]\n    }\n  ],\n  \"payments\": [\n    {\n      \"code\": \"CASH\",\n      \"exchangeCode\": null,\n      \"status\": \"PAID\",\n      \"paidAmount\": 5600,\n      \"data\": null\n    }\n  ]\n}"
            },
            "url": {
              "raw": "{{posBaseUrl}}/rest/receipt",
              "host": [
                "{{posBaseUrl}}"
              ],
              "path": [
                "rest",
                "receipt"
              ]
            }
          }
        },
        {
          "name": "Delete/Return Receipt",
          "request": {
            "method": "DELETE",
            "header": [
              {
                "key": "Accept",
                "value": "application/json"
              },
              {
                "key": "Content-Type",
                "value": "application/json"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"id\": \"{{receiptId}}\",\n  \"date\": \"{{receiptDate}}\"\n}"
            },
            "url": {
              "raw": "{{posBaseUrl}}/rest/receipt",
              "host": [
                "{{posBaseUrl}}"
              ],
              "path": [
                "rest",
                "receipt"
              ]
            }
          }
        },
        {
          "name": "Send Pending Data",
          "request": {
            "method": "GET",
            "header": [
              {
                "key": "Accept",
                "value": "application/json"
              }
            ],
            "url": {
              "raw": "{{posBaseUrl}}/rest/sendData",
              "host": [
                "{{posBaseUrl}}"
              ],
              "path": [
                "rest",
                "sendData"
              ]
            }
          }
        },
        {
          "name": "Bank Accounts",
          "request": {
            "method": "GET",
            "header": [
              {
                "key": "Accept",
                "value": "application/json"
              }
            ],
            "url": {
              "raw": "{{posBaseUrl}}/rest/bankAccounts?tin={{tin}}",
              "host": [
                "{{posBaseUrl}}"
              ],
              "path": [
                "rest",
                "bankAccounts"
              ],
              "query": [
                {
                  "key": "tin",
                  "value": "{{tin}}"
                }
              ]
            }
          }
        }
      ]
    },
    {
      "name": "Public Lookups",
      "item": [
        {
          "name": "District Codes",
          "request": {
            "method": "GET",
            "header": [
              {
                "key": "Accept",
                "value": "application/json"
              }
            ],
            "url": {
              "raw": "{{ebarimtApiBaseUrl}}/api/info/check/getBranchInfo",
              "host": [
                "{{ebarimtApiBaseUrl}}"
              ],
              "path": [
                "api",
                "info",
                "check",
                "getBranchInfo"
              ]
            }
          }
        },
        {
          "name": "TIN by Registration/Civil ID",
          "request": {
            "method": "GET",
            "header": [
              {
                "key": "Accept",
                "value": "application/json"
              }
            ],
            "url": {
              "raw": "{{ebarimtApiBaseUrl}}/api/info/check/getTinInfo?regNo={{regNo}}",
              "host": [
                "{{ebarimtApiBaseUrl}}"
              ],
              "path": [
                "api",
                "info",
                "check",
                "getTinInfo"
              ],
              "query": [
                {
                  "key": "regNo",
                  "value": "{{regNo}}"
                }
              ]
            }
          }
        },
        {
          "name": "Taxpayer Info",
          "request": {
            "method": "GET",
            "header": [
              {
                "key": "Accept",
                "value": "application/json"
              }
            ],
            "url": {
              "raw": "{{ebarimtApiBaseUrl}}/api/info/check/getInfo?tin={{tin}}",
              "host": [
                "{{ebarimtApiBaseUrl}}"
              ],
              "path": [
                "api",
                "info",
                "check",
                "getInfo"
              ],
              "query": [
                {
                  "key": "tin",
                  "value": "{{tin}}"
                }
              ]
            }
          }
        },
        {
          "name": "Product Tax Codes",
          "request": {
            "method": "GET",
            "header": [
              {
                "key": "Accept",
                "value": "application/json"
              }
            ],
            "url": {
              "raw": "{{ebarimtApiBaseUrl}}/api/receipt/receipt/getProductTaxCode",
              "host": [
                "{{ebarimtApiBaseUrl}}"
              ],
              "path": [
                "api",
                "receipt",
                "receipt",
                "getProductTaxCode"
              ]
            }
          }
        },
        {
          "name": "BUNA Top Level",
          "request": {
            "method": "GET",
            "header": [
              {
                "key": "Accept",
                "value": "application/json"
              }
            ],
            "url": {
              "raw": "{{ebarimtApiBaseUrl}}/api/info/check/barcode/v2",
              "host": [
                "{{ebarimtApiBaseUrl}}"
              ],
              "path": [
                "api",
                "info",
                "check",
                "barcode",
                "v2"
              ]
            }
          }
        }
      ]
    }
  ]
}
```

## 27\. JavaScript/TypeScript жишээ

```ts
type ReceiptResponse = {
  id: string;
  status: "SUCCESS" | "ERROR" | "PAYMENT";
  message?: string | null;
  qrData?: string;
  lottery?: string | null;
  date: string;
};

const POS_BASE_URL = process.env.POS_BASE_URL ?? "http://127.0.0.1:7080";

async function posRequest<T>(
  path: string,
  init: RequestInit,
  timeoutMs = 10_000,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${POS_BASE_URL}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...init.headers,
      },
      signal: controller.signal,
    });

    const text = await response.text();
    let body: unknown;

    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(`PosAPI invalid JSON: HTTP ${response.status}`);
    }

    if (!response.ok) {
      throw new Error(`PosAPI HTTP ${response.status}: ${JSON.stringify(body)}`);
    }

    return body as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function createReceipt(payload: unknown): Promise<ReceiptResponse> {
  const result = await posRequest<ReceiptResponse>("/rest/receipt", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (result.status !== "SUCCESS") {
    throw new Error(`Receipt failed: ${result.status} ${result.message ?? ""}`);
  }

  return result;
}

export async function returnReceipt(id: string, date: string): Promise<void> {
  await posRequest<unknown>("/rest/receipt", {
    method: "DELETE",
    body: JSON.stringify({ id, date }),
  });
}
```

## 28\. Python жишээ

Энгийн `httpx`:

```python
from __future__ import annotations

from decimal import Decimal
from typing import Any

import httpx

POS_BASE_URL = "http://127.0.0.1:7080"


class PosApiError(RuntimeError):
    pass


def create_receipt(payload: dict[str, Any]) -> dict[str, Any]:
    with httpx.Client(base_url=POS_BASE_URL, timeout=10.0) as client:
        response = client.post(
            "/rest/receipt",
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            json=payload,
        )

        response.raise_for_status()
        data = response.json()

        if data.get("status") != "SUCCESS":
            raise PosApiError(
                f"status={data.get('status')} message={data.get('message')}"
            )

        return data


payload = {
    "totalAmount": Decimal("5600"),
    "totalVAT": Decimal("500"),
    "totalCityTax": Decimal("100"),
    "branchNo": "001",
    "districtCode": "2501",
    "merchantTin": "110718991986",
    "posNo": "001",
    "type": "B2C_RECEIPT",
    "billIdSuffix": "01",
    "receipts": [
        {
            "totalAmount": Decimal("5600"),
            "totalVAT": Decimal("500"),
            "totalCityTax": Decimal("100"),
            "taxType": "VAT_ABLE",
            "merchantTin": "110718991986",
            "items": [
                {
                    "name": "Талх",
                    "measureUnit": "ш",
                    "qty": 1,
                    "unitPrice": Decimal("5600"),
                    "totalAmount": Decimal("5600"),
                    "totalVAT": Decimal("500"),
                    "totalCityTax": Decimal("100"),
                    "classificationCode": "2349010",
                    "barCodeType": "UNDEFINED",
                }
            ],
        }
    ],
    "payments": [
        {
            "code": "CASH",
            "status": "PAID",
            "paidAmount": Decimal("5600"),
        }
    ],
}

receipt = create_receipt(payload)
print(receipt["id"], receipt["qrData"])
```

Нээлттэй эхийн `ebarimt-pos-sdk` нэртэй Python SDK байдаг боловч production-д ашиглахаас өмнө schema-г танай PosAPI version-той тулгах шаардлагатай. [[11]](#ref11)

## 29\. C# жишээ

```csharp
using System.Net.Http.Json;
using System.Text.Json;

public sealed class PosApiClient
{
    private readonly HttpClient _http;

    public PosApiClient(HttpClient http)
    {
        _http = http;
        _http.BaseAddress ??= new Uri("http://127.0.0.1:7080");
        _http.Timeout = TimeSpan.FromSeconds(10);
    }

    public async Task<JsonDocument> CreateReceiptAsync(
        object payload,
        CancellationToken cancellationToken = default)
    {
        using var response = await _http.PostAsJsonAsync(
            "/rest/receipt",
            payload,
            cancellationToken);

        var raw = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            throw new HttpRequestException(
                $"PosAPI HTTP {(int)response.StatusCode}: {raw}");
        }

        var document = JsonDocument.Parse(raw);
        var status = document.RootElement.GetProperty("status").GetString();

        if (!string.Equals(status, "SUCCESS", StringComparison.Ordinal))
        {
            var message = document.RootElement.TryGetProperty("message", out var m)
                ? m.GetString()
                : null;

            throw new InvalidOperationException(
                $"Receipt failed: {status} {message}");
        }

        return document;
    }
}
```

DI:

```csharp
services.AddHttpClient<PosApiClient>(client =>
{
    client.BaseAddress = new Uri(
        configuration["PosApi:BaseUrl"] ?? "http://127.0.0.1:7080");
    client.Timeout = TimeSpan.FromSeconds(10);
});
```

## 30\. Java жишээ

```java
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

public final class PosApiClient {
    private final HttpClient client;
    private final String baseUrl;

    public PosApiClient(String baseUrl) {
        this.baseUrl = baseUrl;
        this.client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();
    }

    public String createReceipt(String json) throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(baseUrl + "/rest/receipt"))
            .timeout(Duration.ofSeconds(10))
            .header("Accept", "application/json")
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(json))
            .build();

        HttpResponse<String> response =
            client.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IllegalStateException(
                "PosAPI HTTP " + response.statusCode() + ": " + response.body());
        }

        return response.body();
    }
}
```

## 31\. Алдаа боловсруулах стандарт

Алдааг дараах бүлэгт хуваа.

| Бүлэг | Жишээ | Retry |
| --- | --- | --- |
| Validation | JSON field, enum, invariant | Үгүй; payload зас |
| Business | TIN, merchant, tax code, duplicate, lottery | Нөхцөлт |
| HTTP 4xx | Contract/auth/request | Ихэнхдээ үгүй |
| HTTP 5xx | PosAPI/server | Backoff-той |
| Transport | timeout, connection refused, DNS | Нөхцөлт |
| Decode | HTML/хоосон/буруу JSON | Богино retry + alert |
| Unknown outcome | POST timeout after server accepted | Шууд давтахгүй; reconciliation |

### 31.1. Retry policy

```text
GET /rest/info                 retry safe
GET /rest/bankAccounts         retry safe
GET public lookup              retry safe
GET /rest/sendData             duplicate trigger guard хэрэгтэй
POST /rest/receipt             blind retry хийхгүй
DELETE /rest/receipt           blind retry хийхгүй
```

POST/DELETE timeout үед:

1.  correlation/business ID-аар local log шалга
2.  PosAPI/DB төлөв шалга
3.  төв тайлан/борлуулалтын lookup боломжтой бол шалга
4.  баталгаагүй бол operator workflow руу оруул
5.  duplicate receipt үүсгэх эрсдэлийг хаа

## 32\. Idempotency ба audit

PosAPI request-д стандарт `Idempotency-Key` баримтжуулагдаагүй тул хэрэглэгчийн систем өөрөө дараах key-г хадгална.

```text
merchantTin + branchNo + posNo + localOrderId + billIdSuffix
```

Database table-ийн жишээ:

```sql
create table ebarimt_receipt_operation (
    id bigserial primary key,
    local_order_id varchar(100) not null,
    merchant_tin varchar(20) not null,
    pos_no varchar(20) not null,
    bill_id_suffix varchar(50) not null,
    request_hash varchar(64) not null,
    request_json jsonb not null,
    response_json jsonb,
    ebarimt_receipt_id varchar(64),
    ebarimt_date timestamp,
    status varchar(40) not null,
    attempt_count integer not null default 0,
    created_at timestamp not null,
    updated_at timestamp not null,
    unique (merchant_tin, pos_no, local_order_id, bill_id_suffix)
);
```

PCI/PII:

-   бүтэн картын дугаар хадгалахгүй
-   `maskedCardNumber` л хадгал
-   token/secret log хийхгүй
-   регистр/Civil ID/TIN-ийн access log хамгаал
-   request JSON retention policy тогтоо

## 33\. QR ба хэвлэл

Response-ийн `qrData`\-г QR encoder-д өгч хэвлэнэ.

Хэвлэх баримтад дор хаяж:

-   merchant нэр/TIN
-   салбар/POS
-   огноо
-   item
-   татварын задаргаа
-   нийт дүн
-   төлбөрийн төрөл
-   ДДТД
-   сугалааны дугаар
-   QR

орох шаардлагыг албан ёсны баримтын стандарттай тулгана.

QR үүсгэхдээ:

-   raw `qrData`\-г өөрчлөхгүй
-   error correction level-ийг хэвлэгчид тохируул
-   хангалттай quiet zone
-   thermal printer DPI дээр scan test
-   урт `qrData`\-г log-д бүтнээр бүү бич
-   QR scan integration test хий

## 34\. Тестийн матриц

### 34.1. Суурь

-   [ ]  PosAPI start/stop
-   [ ]  `/rest/info`
-   [ ]  зөв DB driver
-   [ ]  зөв merchant
-   [ ]  lottery \> threshold
-   [ ]  төв системтэй outbound connection
-   [ ]  service restart-ийн дараа өгөгдөл хэвээр

### 34.2. Receipt type

-   [ ]  B2C receipt
-   [ ]  B2B receipt
-   [ ]  B2C invoice
-   [ ]  B2B invoice
-   [ ]  invoice payment
-   [ ]  inactiveId/засварын урсгал

### 34.3. Tax

-   [ ]  VAT\_ABLE
-   [ ]  VAT\_FREE + taxProductCode
-   [ ]  VAT\_ZERO + taxProductCode
-   [ ]  NO\_VAT + taxProductCode/дүрэм
-   [ ]  НХАТ
-   [ ]  mixed tax sub-receipts
-   [ ]  rounding

### 34.4. Payment

-   [ ]  cash
-   [ ]  card
-   [ ]  mixed payment
-   [ ]  payment sum mismatch
-   [ ]  masked card data
-   [ ]  easy true/false
-   [ ]  `noEasyResponse=true`
-   [ ]  third-party `PAY`
-   [ ]  payment reverse

### 34.5. Merchant

-   [ ]  нэг merchant
-   [ ]  олон merchant
-   [ ]  unregistered merchant
-   [ ]  B2B customer validation
-   [ ]  bank account/IBAN

### 34.6. Domain

-   [ ]  pharmacy lotNo
-   [ ]  OAT stock QR
-   [ ]  barcode
-   [ ]  ISBN
-   [ ]  БҮНА code
-   [ ]  fractional qty
-   [ ]  bonus/discount
-   [ ]  zero/negative rejection

### 34.7. Failure

-   [ ]  PosAPI down
-   [ ]  DB down
-   [ ]  EBarimt outbound down
-   [ ]  timeout
-   [ ]  invalid JSON
-   [ ]  unknown enum
-   [ ]  duplicate local order
-   [ ]  POST unknown outcome
-   [ ]  disk full
-   [ ]  lottery low/empty
-   [ ]  system clock skew

### 34.8. Return

-   [ ]  unconfirmed B2C return
-   [ ]  confirmed B2C pending customer approval
-   [ ]  duplicate return
-   [ ]  wrong date
-   [ ]  nonexistent ID
-   [ ]  audit trail

## 35\. Production нэвтрүүлэлтийн checklist

### Infrastructure

-   [ ]  PosAPI version pin хийсэн
-   [ ]  checksum хадгалсан
-   [ ]  production/staging binary тусгаарласан
-   [ ]  dedicated OS user
-   [ ]  `workDir` read/write
-   [ ]  disk monitoring
-   [ ]  DB backup
-   [ ]  DB restore test
-   [ ]  NTP/time sync
-   [ ]  firewall
-   [ ]  Монгол IP/VPN
-   [ ]  process supervisor/service unit
-   [ ]  restart policy
-   [ ]  log rotation

### Configuration

-   [ ]  `auth*` утга багцаас
-   [ ]  `ebarimtUrl`
-   [ ]  DB
-   [ ]  `webServiceHost`
-   [ ]  `webServicePort`
-   [ ]  `noEasyResponse`
-   [ ]  pharmacy flag
-   [ ]  operator activation
-   [ ]  merchant approvals
-   [ ]  bank accounts/IBAN

### Application

-   [ ]  decimal calculation
-   [ ]  schema validation
-   [ ]  enum validation
-   [ ]  idempotency
-   [ ]  timeout
-   [ ]  retry policy
-   [ ]  unknown outcome handling
-   [ ]  audit
-   [ ]  PII/PCI redaction
-   [ ]  QR print test
-   [ ]  return workflow
-   [ ]  manual recovery UI
-   [ ]  reconciliation job

### Release gate

-   [ ]  Developer ITC Original/OpenAPI дахин export хийсэн
-   [ ]  diff шалгасан
-   [ ]  staging smoke
-   [ ]  staging contract test
-   [ ]  test receipt
-   [ ]  test return
-   [ ]  operator sign-off
-   [ ]  rollback plan

## 36\. Түгээмэл асуудал

### Connection refused

Шалгах:

```bash
curl -v http://127.0.0.1:7080/rest/info
ss -ltnp | grep 7080
```

-   PosAPI ассан эсэх
-   `webServiceHost`
-   `webServicePort`
-   firewall
-   container/host network

### PosAPI идэвхгүй

-   operator login хийсэн эсэх
-   operator сонгосон эсэх
-   activation амжилттай эсэх
-   auth/EBarimt outbound
-   system clock

### Merchant олдохгүй

-   operator merchant request
-   merchant approval
-   TIN vs regNo/Civil ID
-   `/rest/info` merchant list
-   зөв PosAPI instance

### Дүн зөрсөн

-   decimal ашигла
-   item → sub-receipt → top aggregation
-   tax rounding policy
-   payment sum
-   discount/bonus

### `NO_VAT` rejected

-   танай version `NOT_VAT` хүлээж авч байгаа эсэх
-   OpenAPI export
-   PosAPI upgrade
-   `taxProductCode`
-   staging test

### `terminalID` rejected

-   `terminalID` vs `terminalId`
-   card data schema
-   field required эсэх
-   `PAYMENT_CARD` + `PAID`
-   `rrn`
-   masked PAN

### IBAN rejected

-   `/rest/bankAccounts`
-   merchant TIN
-   `iBan` capitalization
-   top/sub-receipt байрлал
-   account approval

### HTML response/JSON parse error

-   reverse proxy
-   Stoplight/OpenAPI URL-г local PosAPI гэж андуураагүй эсэх
-   server error page
-   wrong port
-   content-type
-   response body-г secret redaction-тай хадгал

## 37\. Developer ITC-ийн PosAPI 3.0 хуудасны индекс

Доорх нь 2026-08-09-нд төслийн навигацаас илэрсэн PosAPI 3.0 болон шууд дагалдах хуудаснууд. [[1]](#ref1)

### Үндсэн

1.  POSAPI 3.0 – Таны хөтөч  
    `https://developer.itc.gov.mn/docs/ebarimt-api/9ebc8iaq69ipw-posapi-3-0-sistemijn-zaavar`
2.  Release notes / 2026-05-11 мэдэгдэл  
    `https://developer.itc.gov.mn/docs/ebarimt-api/hbtdfmovl87p0-medegdel-span-style-background-color-1-aabff-color-white-padding-4px-8px-border-radius-12px-font-size-14px-v1-0-span-span-style-background-color-138-b5-b-color-white-padding-4px-8px-border-radius-12px-font-size-14px-medegdel-oruulsan-ognoo-2026-05-11-span`
3.  PosAPI 3.0 API холболтын заавар  
    `https://developer.itc.gov.mn/docs/ebarimt-api/inbishdm2zj3x-pos-api-3-0-sistemijn-api-holbolt-zaavruud`
4.  Төлбөрийн баримт хадгалах  
    `https://developer.itc.gov.mn/docs/ebarimt-api/etzeubckb91df-t-lb-rijn-barimt-hadgalah`
5.  Төлбөрийн баримт буцаах  
    `https://developer.itc.gov.mn/docs/ebarimt-api/w7pedek4l5nu8-t-lb-rijn-barimt-buczaah`
6.  Ажиллагааны мэдээлэл  
    `https://developer.itc.gov.mn/docs/ebarimt-api/xy84sum9avx4v-azhillagaany-medeelel-h-leen-avah`
7.  Нэгдсэн системд мэдээлэл илгээх  
    `https://developer.itc.gov.mn/docs/ebarimt-api/q2dg4cjtbfsdx-t-lb-rijn-barimtyn-negdsen-sistemd-medeelel-ilgeeh`
8.  Банкны дансны мэдээлэл  
    `https://developer.itc.gov.mn/docs/ebarimt-api/i5pt9wo7bxq0y-bankny-dansny-medeelel-lavlah`
9.  Оператороос merchant бүртгэх  
    `https://developer.itc.gov.mn/docs/ebarimt-api/5l5d2e9b18ve0-operatoroos-merchant-b-rtgeh-h-selt-ilgeeh`
10.  Түрээслэгч бүртгэх  
     `https://developer.itc.gov.mn/docs/ebarimt-api/b0xntb7pqs0g8-t-reeslegch-b-rtgeh-h-selt-ilgeeh`
11.  ОАТ барааны баркод/QR  
     `https://developer.itc.gov.mn/docs/ebarimt-api/zxu5zjs7j91db-oat-baraany-barkodyn-medeelel-lavlah-qr`

### Лавлагаа

12.  District code  
     `https://developer.itc.gov.mn/docs/ebarimt-api/fbdleubwxraqa-district-code-lavlah`
13.  TIN/Civil ID  
     `https://developer.itc.gov.mn/docs/ebarimt-api/fmm0i9s4dq2t9-tatvar-t-l-gchijn-dugaar-lavlah-tin-civil-id`
14.  Бүртгэлийн мэдээлэл  
     `https://developer.itc.gov.mn/docs/ebarimt-api/0lh6tut76i7lb-b-rtgelijn-medeelel-lavlah`
15.  VAT\_FREE/VAT\_ZERO/NO\_VAT код  
     `https://developer.itc.gov.mn/docs/ebarimt-api/16ukw8k7rdro5-vat-free-vat-zero-no-vat-baraa-jlchilgeenij-kod-lavlah`
16.  БҮНА/ангилал/баркод  
     `https://developer.itc.gov.mn/docs/ebarimt-api/said1mgfz0gb7-b-na-baraa-b-teegdeh-nij-angilal-barkod-lavlah`
17.  Баркод жагсаалтаар лавлах  
     `https://developer.itc.gov.mn/docs/ebarimt-api/tb2umi3rs1u85-barkod-zhagsaaltaar-lavlah`

### Нэвтрүүлэлт, эрх

18.  Staging орчинд холбох  
     `https://developer.itc.gov.mn/docs/ebarimt-api/u0vpfrq242mtu-posapi-3-0-sistemijn-turshiltyn-orching-ashiglah-zaavar`
19.  ХСН системд тавигдах шаардлага  
     `https://developer.itc.gov.mn/docs/ebarimt-api/zm085dap73b7m-hereglegchijn-sistem-nijl-legchdijn-hereglegchijn-sistemd-tavigdah-shaardlaga`
20.  ХСН эрх авах хүсэлт  
     `https://developer.itc.gov.mn/docs/ebarimt-api/zm085dap73b9m-hereglegchijn-sistem-nijl-legcheer-b-rtg-leh-h-selt-gargah-zaavar-bodit-orchnoos`
21.  Оператор–ИБаримт  
     `https://developer.itc.gov.mn/docs/ebarimt-api/3y4wht9xi9vxw-operator-i-barimt-sistem`

### Token/Postman

22.  ИБАРИМТ нэвтрэлт  
     `https://developer.itc.gov.mn/docs/ebarimt-api/2nwp699osi264-ibarimt-nevtrelt`
23.  ИБАРИМТ token  
     `https://developer.itc.gov.mn/docs/ebarimt-api/h4qz7kqjzd3p3-token-avah`
24.  Бараа бүртгэл нэвтрэлт  
     `https://developer.itc.gov.mn/docs/ebarimt-api/wpx0o8qwuuw02-baraa-b-rtgel-nevtrelt`
25.  Бараа бүртгэл token  
     `https://developer.itc.gov.mn/docs/ebarimt-api/9rqhn92wut2zg-token-avah`
26.  Postman  
     `https://developer.itc.gov.mn/docs/ebarimt-api/uunzbhjh8se4c-postman`

### Дагалдах API

27.  Цахим төлбөрийн баримт API холболт  
     `https://developer.itc.gov.mn/docs/ebarimt-api/c1tfgzwv4fe23-czahim-t-lb-rijn-barimt-api-holbolt`
28.  Борлуулалтын задаргаа  
     `https://developer.itc.gov.mn/docs/ebarimt-api/amem8bql9kgmn-borluulaltyn-zadargaany-medeelel-tatah-servis`
29.  Толгой/охин компанийн худалдан авалт  
     `https://developer.itc.gov.mn/docs/ebarimt-api/2mi7tvxyzkxsi-tolgoj-tatvar-t-l-gch-rijn-ohin-kompanijn-hudaldan-avalt-tatah-servis`
30.  Хуулийн этгээдийн гаалийн мэдүүлэг  
     `https://developer.itc.gov.mn/docs/ebarimt-api/6q7guc0bs8yyd-huulijn-etgeedijn-gaalijn-med-leg-tatah-servis`
31.  Хялбар бүртгэлийн API  
     `https://developer.itc.gov.mn/docs/ebarimt-api/i6179fzdicgrc-hyalbar-b-rtgelijn-api-holbolt`
32.  Иргэн Civil ID-аар лавлах  
     `https://developer.itc.gov.mn/docs/ebarimt-api/tw03kv02n3xto-irgenij-medeelel-registr-irgenij-b-rtgel-civil-id-ijn-dugaaraar-lavlah`
33.  Иргэнийг утас/customerNo-оор лавлах  
     `https://developer.itc.gov.mn/docs/ebarimt-api/rjhebiacnaqu3-irgenij-medeellijg-utasny-dugaaraar-bolon-hereglegchijn-dugaaraar-lavlah`
34.  Баримт баталгаажуулах  
     `https://developer.itc.gov.mn/docs/ebarimt-api/2ngrrpggc33bt-t-lb-rijn-barimt-batalgaazhuulah`
35.  Гадаад жуулчин паспорт/F регистрээр  
     `https://developer.itc.gov.mn/docs/ebarimt-api/w2iwr4v1735yx-gadaad-zhuulchny-medeellijg-gadaad-pasport-esvel-f-registrijn-dugaaraar-lavlah`
36.  Гадаад жуулчин loginName-аар  
     `https://developer.itc.gov.mn/docs/ebarimt-api/46fhh5l44b8n7-gadaad-zhuulchny-medeellijg-e-barimt-n-nevtreh-nereer-lavlah`
37.  Гадаад жуулчин бүртгэх  
     `https://developer.itc.gov.mn/docs/ebarimt-api/5vir10g82j2k0-gadaad-zhuulchny-medeellijg-e-barimt-n-sistemd-b-rtgeh`
38.  Easy registration буцаалт баталгаажуулах  
     `https://developer.itc.gov.mn/docs/ebarimt-api/3fkgf3eaxg24i-hyalbar-b-rtgeleer-b-rtgegdsen-t-lb-rijn-barimtyn-buczaaltyg-batalgaazhuulah-servis`

### ОАТ дагалдах API

39.  ОАТ API холболт  
     `https://developer.itc.gov.mn/docs/ebarimt-api/fbfzitmq36spz-onczgoj-alban-tatvar-api-holbolt`
40.  ОАТ баркод  
     `https://developer.itc.gov.mn/docs/ebarimt-api/4f2cl550kod3e-oat-baraany-barkodyn-medeelel-lavlah-servis`
41.  ОАТ тэмдгийн үлдэгдэл  
     `https://developer.itc.gov.mn/docs/ebarimt-api/sglj3t1klfryv-oat-baraany-temdgijn-ldegdel-lavlah-servis`
42.  ОАТ тэмдгийн зарлага  
     `https://developer.itc.gov.mn/docs/ebarimt-api/rvrbn4ootrak5-oat-baraany-temdgijn-zarlagyn-medeelel-hadgalah-servis`
43.  ОАТ үлдэгдэл, хуудаслалттай  
     `https://developer.itc.gov.mn/docs/ebarimt-api/avxqqfdke81ih-oat-baraany-temdgijn-ldegdel-lavlah-servis-huudaslalttaj`
44.  ОАТ үйлдвэрлэгч эсэх  
     `https://developer.itc.gov.mn/docs/ebarimt-api/hpcltofyw2b8b-oat-baraany-jldverlegch-esehijg-todorhojloh-servis`
45.  ОАТ хагарал/хорогдол/урамшуулал  
     `https://developer.itc.gov.mn/docs/ebarimt-api/y9j403rf42xu6-oat-baraany-hagaral-horogdol-uramshuullyn-b-rtgel`

## 38\. Холбоо барих

Албан ёсны холболтын хуудсанд:

-   И-мэйл: `posapi@itc.gov.mn`
-   Хариуцагч: Б.Булганжаргал
-   Утас: `99974468`

гэж нийтэлсэн байна. Холбоо барих мэдээлэл өөрчлөгдөж болох тул Developer ITC-ийн холболтын хуудсыг эхэлж шалгана. [[3]](#ref3)

## 39\. Эх сурвалж

<p id="ref1" class="ref_item" data-cid="xOVUZN">[1] Developer ITC — PosAPI 3.0 төслийн навигаци ба endpoint-ийн бүрэн индекс. <a target="_blank" rel="noreferrer" href="https://developer.itc.gov.mn/docs/ebarimt-api/8mw1byololjkv-cz-ahim-t-lb-rijn-barimtyn-sistem-pos-api-3-0" data-cid="mZfNTM">https://developer.itc.gov.mn/docs/ebarimt-api/8mw1byololjkv-cz-ahim-t-lb-rijn-barimtyn-sistem-pos-api-3-0</a></p>

<p id="ref2" class="ref_item" data-cid="KT9PJ4">[2] Developer ITC — Төлбөрийн баримт хадгалах. <a target="_blank" rel="noreferrer" href="https://developer.itc.gov.mn/docs/ebarimt-api/etzeubckb91df-t-lb-rijn-barimt-hadgalah" data-cid="utlyyA">https://developer.itc.gov.mn/docs/ebarimt-api/etzeubckb91df-t-lb-rijn-barimt-hadgalah</a></p>

<p id="ref3" class="ref_item" data-cid="TmXFR7">[3] Developer ITC — PosAPI 3.0 системийн API холболтын заавар. <a target="_blank" rel="noreferrer" href="https://developer.itc.gov.mn/docs/ebarimt-api/inbishdm2zj3x-pos-api-3-0-sistemijn-api-holbolt-zaavruud" data-cid="XcXTbd">https://developer.itc.gov.mn/docs/ebarimt-api/inbishdm2zj3x-pos-api-3-0-sistemijn-api-holbolt-zaavruud</a></p>

<p id="ref4" class="ref_item" data-cid="Eon4ei">[4] ITC — “Цахим төлбөрийн баримтын систем POS API 3.0.1” PDF гарын авлага. <a target="_blank" rel="noreferrer" href="https://share.itc.gov.mn/share/developer/POS%20API%203.0.1.pdf" data-cid="nbHFoB">https://share.itc.gov.mn/share/developer/POS%20API%203.0.1.pdf</a></p>

<p id="ref5" class="ref_item" data-cid="I8seor">[5] Techpartners Asia — ebarimt-go PosAPI 3.0 binding; local endpoint ба schema-г cross-check хийхэд ашиглав. <a target="_blank" rel="noreferrer" href="https://pkg.go.dev/github.com/techpartners-asia/ebarimt-go/pos3.0" data-cid="KejEhp">https://pkg.go.dev/github.com/techpartners-asia/ebarimt-go/pos3.0</a></p>

<p id="ref6" class="ref_item" data-cid="Xh-E_o">[6] Developer ITC — Төлбөрийн баримт буцаах. <a target="_blank" rel="noreferrer" href="https://developer.itc.gov.mn/docs/ebarimt-api/w7pedek4l5nu8-t-lb-rijn-barimt-buczaah" data-cid="rAm2xv">https://developer.itc.gov.mn/docs/ebarimt-api/w7pedek4l5nu8-t-lb-rijn-barimt-buczaah</a></p>

<p id="ref7" class="ref_item" data-cid="g5R-fp">[7] Developer ITC — Оператор–ИБаримт систем. <a target="_blank" rel="noreferrer" href="https://developer.itc.gov.mn/docs/ebarimt-api/3y4wht9xi9vxw-operator-i-barimt-sistem" data-cid="WRN86d">https://developer.itc.gov.mn/docs/ebarimt-api/3y4wht9xi9vxw-operator-i-barimt-sistem</a></p>

<p id="ref8" class="ref_item" data-cid="2xeydi">[8] Amraa1 — ebarimt-pos-sdk; public lookup route, typed schema ба compatibility note-уудыг cross-check хийхэд ашиглав. <a target="_blank" rel="noreferrer" href="https://github.com/Amraa1/ebarimt-pos-sdk" data-cid="XxEJ4G">https://github.com/Amraa1/ebarimt-pos-sdk</a></p>

<p id="ref9" class="ref_item" data-cid="hZIu0f">[9] Developer ITC — Татвар төлөгчийн дугаар лавлах / TIN, Civil ID. <a target="_blank" rel="noreferrer" href="https://developer.itc.gov.mn/docs/ebarimt-api/fmm0i9s4dq2t9-tatvar-t-l-gchijn-dugaar-lavlah-tin-civil-id" data-cid="xPrce3">https://developer.itc.gov.mn/docs/ebarimt-api/fmm0i9s4dq2t9-tatvar-t-l-gchijn-dugaar-lavlah-tin-civil-id</a></p>

<p id="ref10" class="ref_item" data-cid="44n0px">[10] Developer ITC — Postman Collection ашиглах заавар. <a target="_blank" rel="noreferrer" href="https://developer.itc.gov.mn/docs/ebarimt-api/uunzbhjh8se4c-postman" data-cid="H7awDZ">https://developer.itc.gov.mn/docs/ebarimt-api/uunzbhjh8se4c-postman</a></p>

<p id="ref11" class="ref_item" data-cid="NBxRbb">[11] PyPI — ebarimt-pos-sdk. <a target="_blank" rel="noreferrer" href="https://pypi.org/project/ebarimt-pos-sdk/" data-cid="Je06IB">https://pypi.org/project/ebarimt-pos-sdk/</a></p>

## 40\. Хамгийн богино хэрэгжүүлэлтийн дараалал

1.  Staging PosAPI багц татах.
2.  `posapi.ini`, DB, `workDir`, port тохируулах.
3.  Operator-оор идэвхжүүлэх.
4.  `/rest/info` smoke test.
5.  Merchant approval хийх.
6.  District, TIN, taxpayer, БҮНА, tax product code lookup-уудыг интеграцлах.
7.  `POST /rest/receipt` B2C cash.
8.  B2B.
9.  Invoice/payment.
10.  Card/easy registration.
11.  Return.
12.  Offline/sendData.
13.  Pharmacy/OAT шаардлагатай бол domain test.
14.  Postman/OpenAPI contract test.
15.  Production checklist, reconciliation, monitoring.