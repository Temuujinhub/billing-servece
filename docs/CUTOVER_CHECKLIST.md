# Домэйн шилжилтийн чеклист — msgbill.mn + bil.mn (B-40)

> Кодын өөрчлөлт PR #28-д бүгд орсон. Энэ файл нь **таны гараар хийх** үлдсэн
> ажлуудын заавар: DigitalOcean, сервер, CallPro, Bonum, LIME гэсэн 5 хэсэгтэй.
> Хийж дуусмагц чагтална уу.

---

## 1. DigitalOcean (DNS) — ~5 минут

Одоо байгаа байдал (2026-08-17-нд шалгасан): ✅ бараг бэлэн.

| Домэйн | Record | Одоогийн утга | Байдал |
|---|---|---|---|
| msgbill.mn | A (apex) | 202.37.235.16 | ✅ бэлэн |
| msgbill.mn | A `*.msgbill.mn` | 202.37.235.16 | ✅ бэлэн (www үүгээр орно) |
| bil.mn | A (apex) | 202.37.235.16 | ✅ бэлэн |
| bil.mn | A `www` эсвэл `*` | — | ⬜ СОНГОЛТТОЙ (доор) |

- [ ] **(Сонголттой) `bil.mn`-д `www` A record нэмэх.** SMS-ийн линк apex-ээр
  (`bil.mn/p/…`) явдаг тул заавал биш. Хэрэв нэмбэл надад хэлээрэй —
  `deploy/Caddyfile`-ийн `bil.mn {` мөрийг `bil.mn, www.bil.mn {` болгоно
  (DNS-гүйгээр нэмбэл Caddy ACME-г хий давтдаг тул зөриуд оруулаагүй).
- [ ] **NS шилжилт идэвхжсэнийг шалгах.** MagicNet дээр nameserver-ийг
  `ns1/ns2/ns3.digitalocean.com` болгож хадгалсан — идэвхжтэл **24 цаг хүртэл**
  зарлагддаг. Шалгах:

  ```bash
  dig NS msgbill.mn +short        # ns1-3.digitalocean.com гарвал болсон
  dig NS bil.mn +short
  dig A msgbill.mn +short         # 202.37.235.16
  dig A bil.mn +short             # 202.37.235.16
  ```

  Түр зуур шууд DO-гийн nameserver-ээс лавлаж болно (шилжилт хүлээхгүйгээр
  зөв тохирсныг батлах): `dig A msgbill.mn @ns1.digitalocean.com +short`

- [ ] DO дээр **өөр илүүдэл record нэмэхгүй** (MX, TXT гэх мэт хэрэг гарвал
  тусад нь). Хуучин `mastrsys.com`-ийн DNS-д гар хүрэх шаардлагагүй.

---

## 2. Сервер (202.37.235.16) — deploy + баталгаажуулалт

- [ ] **80, 443 порт гаднаас нээлттэй эсэхийг шалгах** (Let's Encrypt-ийн
  HTTP-01 challenge 80-аар явна):

  ```bash
  ssh root@202.37.235.16 'ufw status 2>/dev/null || iptables -L INPUT -n | head'
  # 80/tcp, 443/tcp ALLOW байх ёстой
  ```

- [ ] **PR #28-ыг merge хийх** → `main` push дээр `Deploy msgbill.mn` workflow
  автоматаар гарна. Deploy скрипт өөрөө:
  - серверийн `.env`-ийн `billing.mastrsys.com`-ийг `msgbill.mn` болгож,
    `SHORT_URL_BASE=https://bil.mn` нэмж, CORS-д bil.mn оруулна
    (backup: `.env.bak-<timestamp>`);
  - Caddy шинэ Caddyfile-ээр асч 3 хаягт сертификат автоматаар авна.

  > DNS шилжилт (§1) дуусаагүй байхад merge хийвэл Caddy сертификатаа авч
  > чадахгүй хэдэн минут тутам дахин оролдоно — аюулгүй, гэхдээ
  > **DNS-ээ баталгаажуулж байгаад merge хийхийг зөвлөе.**

- [ ] **Deploy-ийн дараа шалгах:**

  ```bash
  curl -sI https://msgbill.mn | head -3            # HTTP/2 200
  curl -sI https://bil.mn/p/TEST | head -3         # 200/404 = зөв, 502 = буруу
  curl -s  https://msgbill.mn/health/live          # commit SHA буцаана
  ssh root@202.37.235.16 'cd /opt/billingservice && docker compose -f docker-compose.prod.yml logs --tail=50 caddy | grep -i -E "certificate|acme"'
  ```

- [ ] Dashboard-д нэвтэрч **нэг тест нэхэмжлэх өөрийн дугаар руу илгээж** SMS
  доторх линк `https://bil.mn/p/…` байгааг, линк нээгдэж төлбөрийн хуудас
  гарч байгааг нүдээр батлах. (CallPro §3 бүртгэл дуустал mock/түр горим.)

---

## 3. CallPro (SMS) — ⚠ ХАМГИЙН ЧУХАЛ, P0 (B-41)

CallPro **урьдчилан бүртгүүлээгүй домэйн руу заасан линктэй SMS-ийг блоклодог**
(`400 unverified link`). Одоо бүртгэлтэй нь хуучин `billing.mastrsys.com` тул
юу ч хийхгүйгээр шинэ линкүүд **явахгүй**.

- [ ] CallPro-гийн менежер/support-тэй холбогдож дараах хүсэлт илгээх:

  > Сайн байна уу. Манай `[дансны нэр / API key-ийн эзэмшигч]` бүртгэлд
  > баталгаажсан (verified) линкийн домэйн болгож дараах 2 домэйныг нэмж өгнө
  > үү:
  >
  > 1. `bil.mn` — төлбөрийн богино линк (SMS болгонд явна)
  > 2. `msgbill.mn` — үндсэн домэйн (нөөц/fallback)
  >
  > Хуучин `billing.mastrsys.com` домэйныг цаашид ашиглахгүй тул хасаж болно.

  **Хоёуланг нь** бүртгүүлэх нь чухал: `SHORT_URL_BASE` хоосон үед систем
  msgbill.mn-ээр линк үүсгэдэг (fallback зам).

- [ ] Бүртгэл баталгаажтал SMS илгээлт хэрэгтэй бол — түр аргачлал:
  аль нэг нь бүртгэгдсэн бол тэр домэйноороо явуулна
  (`.env`-д `SHORT_URL_BASE=` хоосон болговол msgbill.mn-ээр,
  `SHORT_URL_BASE=https://bil.mn` бол bil.mn-ээр). Өөрчилсний дараа:
  `docker compose -f docker-compose.prod.yml --env-file .env up -d api`

- [ ] Баталгаажсаны дараа тест: Dashboard-оос нэг нэхэмжлэх өөрийн дугаар руу
  илгээж SMS **бодитоор ирж буйг** шалгах. Алдаа гарвал Admin → Provider
  health эсвэл API log-оос `unverified link` мөр хайх:

  ```bash
  ssh root@202.37.235.16 'cd /opt/billingservice && docker compose -f docker-compose.prod.yml logs --tail=300 api | grep -i -E "callpro|unverified"'
  ```

- [ ] (Хэрэв CallPro талд «callback / delivery report URL» бүртгэлтэй бол)
  түүнийг мөн `https://msgbill.mn/...` болгож шинэчлүүлэх — одоогийн
  интеграцад ашиглагдаагүй ч хуучин домэйн үлдээхгүй.

---

## 4. Bonum Gateway — P0 (B-42)

Bonum-ийн **server-to-server webhook URL нь тэдний талд гараар бүртгэгддэг**
(имэйлээр). Одоо `billing.mastrsys.com`-ээр бүртгэлтэй тул шинэчлүүлэхгүй бол
төлбөрийн мэдэгдэл хуучин, ажиллахаа больсон хаяг руу очно.

- [ ] Bonum-ийн харилцагчийн менежер рүү (өмнөх онбордингийн имэйл хэлхээнд
  хариу болгож) дараах хүсэлт илгээх:

  > Сайн байна уу. Манай платформын домэйн өөрчлөгдсөн тул Terminal
  > `[BONUM_TERMINAL_ID]`-ийн webhook/callback URL-ийг дараах шинэ хаягаар
  > солиж өгнө үү:
  >
  > `https://msgbill.mn/api/v1/webhooks/bonum/callback`
  >
  > Хуучин `https://billing.mastrsys.com/api/v1/webhooks/bonum/callback`
  > хаягийг хасна уу. (Мерчант байгууллагуудын нэрийн өмнөөс нээсэн бусад
  > терминал байвал мөн адил.)

  > **Multi-tenant санамж:** tenant бүр өөрийн терминалтай бол терминал
  > бүрийн webhook-ийг солиулах хэрэгтэй — жагсаалтыг Admin → Merchants-оос
  > харна.

- [ ] Browser-ийн буцах (return) хаяг код талаас `PUBLIC_URL`-ээр автоматаар
  явдаг тул **нэмэлт ажилгүй** — deploy хийгдсэн л бол шинэ домэйноор гарна.
- [ ] Солигдсоны дараа тест: 100₮-ийн тест нэхэмжлэх → Bonum линкээр төлөх →
  нэхэмжлэх `PAID` болж буйг шалгах. Webhook ирсэн эсэх:

  ```bash
  ssh root@202.37.235.16 'cd /opt/billingservice && docker compose -f docker-compose.prod.yml logs --tail=300 api | grep -i -E "bonum|webhook"'
  ```

  > Webhook удаж/алдагдсан ч манай тал төлбөрийг invoice-check-ээр давхар
  > баталгаажуулдаг тул мөнгө «алга болохгүй» — гэхдээ real-time мэдэгдэлд
  > webhook зөв байх ёстой.

---

## 5. LIME / eBarimt (ТЕГ POS API) — мэдээлэл төдий, яаралтай биш

eBarimt-ийн интеграц **манай серверээс гарах** хандалт (локал POS API instance
+ ТЕГ-ийн API) тул **домэйн солигдоход техникийн өөрчлөлт ШААРДЛАГАГҮЙ**.
`VAT_BASE_URL`, merchant TIN, операторын эрх — бүгд хэвээр.

- [ ] (Зөвлөмж) LIME-ийн холбогдох ажилтанд нэг мөр мэдэгдэл:

  > Манай платформын нэр «Message Billing Service», вэб хаяг
  > `https://msgbill.mn` боллоо (хуучин billing.mastrsys.com). Техникийн
  > хувьд instance/бүртгэлд өөрчлөлт шаардлагагүй — цаашдын албан
  > харилцаандаа шинэ нэр/хаягийг ашиглана уу.

  Шинэ мерчант бүртгүүлэх автомат имэйлүүд одооноос `[msgbill.mn]`
  нэрээр очно (код талаас солигдсон).

- [ ] Deploy-ийн дараа instance хэвийн эсэхийг батлах:

  ```bash
  ssh root@202.37.235.16 'source /opt/billingservice/.env 2>/dev/null; curl -s -m 10 "${VAT_BASE_URL%/}/rest/info" | head -c 300'
  ```

---

## 6. Бусад жижиг зүйлс

- [ ] Хөтчийн bookmark, гар утасны shortcut → `https://msgbill.mn`.
- [ ] Postman ашигладаг хүмүүст: collection-ий `baseUrl` шинэ хувилбарт
  `https://msgbill.mn/api/v1` болсон — collection-оо дахин татахад л болно.
- [ ] API түлхүүр ашигладаг гадаад партнёруудад (байвал) шинэ base URL-ийг
  мэдэгдэх: `https://msgbill.mn/api/v1/partner/...` (түлхүүрүүд хэвээр).
- [ ] Бүгд ажилласны дараа `docs/BACKLOG.md`-д B-41, B-42-ыг ✅ болгох.

---

## Товч дараалал (зөвлөх)

```
1. DNS шалгах (dig)  →  2. PR #28 merge (auto-deploy + SSL)  →  3. Smoke test
→  4. CallPro домэйн бүртгүүлэх (үүнээс өмнө SMS явахгүй!)
→  5. Bonum webhook солиулах  →  6. LIME-д мэдэгдэх  →  7. Тест нэхэмжлэх E2E
```
