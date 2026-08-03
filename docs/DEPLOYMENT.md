# Deploy заавар

## Production (billing.mastrsys.com)

Сервер: DigitalOcean droplet `168.144.41.111` (mastrsys.com DNS wildcard →
энэ IP тул billing.mastrsys.com аль хэдийн зөв заадаг).

### GitHub Actions-аар (зөвлөмж)

`Deploy billingservice.mn` workflow (workflow_dispatch эсвэл main push):

1. Кодыг droplet-ийн `/opt/billingservice` руу rsync хийнэ.
2. `deploy/remote-deploy.sh` ажиллуулна:
   - swap шалгана/үүсгэнэ, Docker суулгана (байхгүй бол);
   - **hotel PMS стекийг унтраана** (`docker compose down`, volume хадгалагдана);
   - эхний удаад `.env`-д санамсаргүй production secret-үүд үүсгэнэ;
   - стек build + up, эхний удаад demo seed;
   - health smoke test.

Шаардлагатай secret: `DEPLOY_SSH_KEY` (droplet-ийн authorized_keys дэх
private key). HOTEL_PMS repo-д аль хэдийн байгаа — энэ repo-д мөн адил
нэмнэ (Settings → Secrets → Actions).

### Гараар (droplet дээр)

```bash
ssh root@168.144.41.111
git clone https://github.com/Temuujinhub/billing-servece.git /opt/billingservice
cd /opt/billingservice
PUBLIC_URL=https://billing.mastrsys.com bash deploy/remote-deploy.sh
```

## Hotel PMS-ийг буцааж асаах

Billing-ийг өөр сервер/домэйн руу нүүлгэсний дараа:

```bash
cd /opt/billingservice && docker compose -f docker-compose.prod.yml down
cd /opt/cloud-pms && docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```

Өгөгдөл хоёр стект тусдаа volume-д (`billingservice_pgdata`, `cloudpms_pgdata`)
тул хоорондоо огт нөлөөлөхгүй.

## Домэйн солих (billingservice.mn худалдаж авмагц)

1. DNS: `billingservice.mn` + `www` → 168.144.41.111 (A record).
2. `deploy/Caddyfile`: эхний site блокт `billingservice.mn, www.billingservice.mn,`
   нэмнэ.
3. Droplet `.env`: `PUBLIC_URL=https://billingservice.mn`, `CORS_ORIGINS`-д
   нэмээд redeploy. SMS линкүүд автоматаар шинэ домэйноор гарна.

## Шалгах командууд

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=100 api
curl -s https://billing.mastrsys.com/health/ready
```
