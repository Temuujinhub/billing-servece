# Deploy заавар

## Production (msgbill.mn + bil.mn)

Сервер: `202.37.235.16` (Монголд хостлогдсон — `api.ebarimt.mn` нь МУ-ын IP
хаягаас л хандахыг зөвшөөрдөг).

| Домэйн | Зориулалт | DNS |
|---|---|---|
| `msgbill.mn` | Канон хаяг: landing, dashboard, admin, `/api/*` | A → 202.37.235.16 |
| `*.msgbill.mn` | `www` болон дараагийн subdomain-ууд | A → 202.37.235.16 |
| `bil.mn` | SMS-д явах богино төлбөрийн линк (`/p/<token>`) | A → 202.37.235.16 |

Nameserver: `ns1/ns2/ns3.digitalocean.com` (MagicNet-ийн бүртгэлээс DO рүү
заасан). Хуучин `billing.mastrsys.com` хаягийг **цаашид ашиглахгүй** —
`deploy/Caddyfile`-д байхгүй, гэхдээ хэрэгтэй болвол тайлбар хэлбэрээр бэлэн
redirect блок нь тэр файлд байна.

### SSL/TLS

Гараар юу ч хийхгүй: Caddy `msgbill.mn`, `www.msgbill.mn`, `bil.mn` гурван
хаягт Let's Encrypt сертификат **автоматаар** авч, дуусахаас 30 хоногийн өмнө
сунгана. `www.bil.mn` нь DNS-д байхгүй тул Caddyfile-д ЗӨРИУД оруулаагүй (DNS-д
`www` A record нэмсний дараа л нэмнэ). Шаардлага:

- 80 ба 443 порт гаднаас нээлттэй (ACME HTTP-01 challenge 80-аар явна);
- DNS нь ЭНЭ сервер рүү заасан байх (заагаагүй бол challenge бүтэлгүйтнэ);
- сертификатууд `caddy_data` volume-д хадгалагдана — стекийг `down -v`-гүйгээр
  дахин асаахад дахин авах шаардлагагүй.

Шалгах:

```bash
curl -sI https://msgbill.mn | head -3
curl -sI https://bil.mn/p/TEST | head -3      # 2xx/3xx/4xx = зөв (502 бол буруу)
docker compose -f docker-compose.prod.yml logs --tail=50 caddy | grep -i certificate
```

### GitHub Actions-аар (зөвлөмж)

`Deploy msgbill.mn` workflow (workflow_dispatch эсвэл `main` push):

1. Дүрсүүдийг CI дээр build хийж, сервер рүү `docker load`-оор шилжүүлнэ.
2. Кодыг `/opt/billingservice` руу rsync хийнэ.
3. `deploy/remote-deploy.sh` ажиллуулна:
   - swap шалгана/үүсгэнэ, Docker суулгана (байхгүй бол);
   - эхний удаад `.env`-д санамсаргүй production secret-үүд үүсгэнэ;
   - **байгаа `.env`-ийн домэйныг шинэчилнэ** (`billing.mastrsys.com` →
     `msgbill.mn`, `SHORT_URL_BASE=https://bil.mn`, CORS-д bil.mn нэмэх) —
     backup `.env.bak-<timestamp>` болж хадгалагдана;
   - стек build + up, health smoke test (хоёр домэйн + `/p/*`).
4. Deploy болсон commit нь `/health/live`-аар нотлогдоно.

Шаардлагатай secret: `DEPLOY_SSH_KEY` (серверийн `authorized_keys` дэх нийтийн
түлхүүрийн хос).

### Гараар (сервер дээр)

```bash
ssh root@202.37.235.16
cd /opt/billingservice
PUBLIC_URL=https://msgbill.mn SHORT_URL_BASE=https://bil.mn bash deploy/remote-deploy.sh
```

## Домэйнтой холбоотой env хувьсагчид

| Хувьсагч | Production утга | Тайлбар |
|---|---|---|
| `PUBLIC_URL` | `https://msgbill.mn` | Канон хаяг: QPay/Bonum callback, имэйл, API жишээ |
| `SHORT_URL_BASE` | `https://bil.mn` | **SMS-ийн** төлбөрийн линк. Хоосон бол `PUBLIC_URL` |
| `CORS_ORIGINS` | `https://msgbill.mn,https://bil.mn` | Хоёр домэйн хоёулаа |

Богино домэйн нь SMS-ийн зардлыг бууруулдаг: линк 20 тэмдэгтээр багасахад
кирилл (UCS-2) мессежийн segment-ийн тоо шууд буурна.

## Домэйн солих үед ГАРААР хийх зүйлс (код биш)

1. **CallPro (SMS)** — оператор урьдчилан бүртгээгүй домэйн руу заасан линкийг
   блоклодог (`unverified link`). `bil.mn`-ийг бүртгүүлнэ. Бүртгэгдэх хүртэл
   `SHORT_URL_BASE`-ийг хоосон болгож `msgbill.mn`-ээр илгээж болно.
2. **Bonum Gateway** — webhook/callback URL-ээ `https://msgbill.mn/api/v1/webhooks/bonum/callback`
   болгож имэйлээр шинэчлүүлнэ.
3. **QPay** — merchant тохиргоонд callback домэйн бүртгэлтэй бол шинэчилнэ.
4. **eBarimt / ТЕГ** — домэйн ашигладаггүй (POS API нь серверээс гарах хандалт),
   өөрчлөх зүйл байхгүй.
5. Хөтчийн bookmark, Postman `baseUrl`, гадаад интеграцчдын хаяг.

## Hotel PMS-ийг буцааж асаах

```bash
cd /opt/billingservice && docker compose -f docker-compose.prod.yml down
cd /opt/cloud-pms && docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```

Өгөгдөл хоёр стект тусдаа volume-д (`billingservice_pgdata`, `cloudpms_pgdata`)
тул хоорондоо огт нөлөөлөхгүй.

## Шалгах командууд

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=100 api
curl -s https://msgbill.mn/health/ready
curl -s https://msgbill.mn/health/live      # ажиллаж буй commit SHA-г буцаана
```
