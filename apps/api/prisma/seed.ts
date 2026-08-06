/**
 * Demo seed for billingservice.mn — makes the dashboard immediately browsable.
 * Idempotent: skips entirely when the demo tenant already exists.
 *
 * Login: demo@billingservice.mn / Demo123$
 */
import { PrismaClient, InvoiceState } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'crypto';

const prisma = new PrismaClient();

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

const FIRST = ['Бат', 'Сараа', 'Төмөр', 'Оюунаа', 'Ганбаатар', 'Наран', 'Энхжин', 'Мөнх', 'Золжаргал', 'Ариунаа', 'Тэмүүлэн', 'Хулан', 'Дорж', 'Цэцэг', 'Билгүүн'];
const LAST = ['Болд', 'Баяр', 'Ганбат', 'Даваа', 'Эрдэнэ', 'Очир', 'Сүх', 'Жаргал', 'Мягмар', 'Пүрэв'];
const SERVICES = [
  'Сургалтын төлбөр 9-р сар',
  'Сургалтын төлбөр 10-р сар',
  'СӨХ-ийн ашиглалтын зардал',
  'Гэрээт үйлчилгээний төлбөр',
  'Дугуйлангийн төлбөр',
  'Хоолны төлбөр',
  'Автобусны үйлчилгээ',
  'Номын сангийн хураамж',
];

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

async function main() {
  const existing = await prisma.tenant.findFirst({ where: { name: 'Ирээдүй Цогцолбор Сургууль' } });
  if (existing) {
    console.log('Seed skipped — demo tenant already exists.');
    return;
  }

  const passwordHash = await bcrypt.hash('Demo123$', 12);
  const user = await prisma.user.upsert({
    where: { email: 'demo@billingservice.mn' },
    update: {},
    create: { email: 'demo@billingservice.mn', name: 'Демо Эзэмшигч', passwordHash, phone: '+97688001122' },
  });

  const tenant = await prisma.tenant.create({
    data: {
      name: 'Ирээдүй Цогцолбор Сургууль',
      type: 'ORGANIZATION',
      regNo: '2075423',
      kybStatus: 'APPROVED',
      invoicePrefix: 'INV',
      contactEmail: 'demo@billingservice.mn',
      contactPhone: '+97675001122',
      invoiceSeq: { create: { next: 1 } },
      modules: {
        create: [
          { code: 'SMS', enabled: true },
          { code: 'EBARIMT', enabled: true },
          { code: 'POS', enabled: true, quantity: 2 },
          { code: 'REMINDER', enabled: false },
        ],
      },
      memberships: { create: { userId: user.id, role: 'OWNER' } },
    },
  });

  // Platform staff — /admin/* (integration onboarding requests). VIEWER
  // membership in the demo tenant so the ordinary login flow works.
  await prisma.user.upsert({
    where: { email: 'admin@billingservice.mn' },
    update: { platformAdmin: true },
    create: {
      email: 'admin@billingservice.mn',
      name: 'Платформын Админ',
      passwordHash: await bcrypt.hash('Admin123$', 12),
      platformAdmin: true,
      memberships: { create: { tenantId: tenant.id, role: 'VIEWER' } },
    },
  });

  // 40 customers
  const customers = [] as { id: string; phone: string | null }[];
  for (let i = 0; i < 40; i++) {
    const c = await prisma.customer.create({
      data: {
        tenantId: tenant.id,
        name: `${pick(LAST, i + 3)} ${pick(FIRST, i)}`,
        phone: `+9769${String(9100000 + i * 137).slice(0, 7)}`,
        email: i % 3 === 0 ? `payer${i}@example.mn` : null,
        externalRef: `ST-${1000 + i}`,
      },
    });
    customers.push({ id: c.id, phone: c.phone });
  }

  // ~90 invoices over the past 60 days with a realistic state mix.
  let seq = 1;
  const now = Date.now();
  for (let i = 0; i < 90; i++) {
    const created = new Date(now - Math.floor((i / 90) * 60) * 864e5 - (i % 7) * 3600e3);
    const amount = [45000, 60000, 85000, 120000, 150000, 180000, 250000, 320000][i % 8];
    const customer = customers[i % customers.length];
    const desc = pick(SERVICES, i);
    const due = new Date(created.getTime() + 14 * 864e5);

    // State mix: ~55% paid, 15% viewed, 12% sent, 10% overdue, 5% cancelled, 3% partial
    const r = i % 20;
    let state: InvoiceState =
      r < 11 ? 'PAID' : r < 14 ? 'VIEWED' : r < 16 ? 'SENT' : r < 18 ? 'OVERDUE' : r < 19 ? 'CANCELLED' : 'PARTIALLY_PAID';
    if (state === 'OVERDUE' && due.getTime() > now) state = 'SENT';

    const paidAmount = state === 'PAID' ? amount : state === 'PARTIALLY_PAID' ? Math.floor(amount / 2) : 0;
    const number = `INV-${String(seq++).padStart(5, '0')}`;

    const invoice = await prisma.invoice.create({
      data: {
        tenantId: tenant.id,
        customerId: customer.id,
        number,
        description: desc,
        amount,
        balance: amount - paidAmount,
        state,
        dueDate: due,
        sentAt: created,
        viewedAt: ['VIEWED', 'PAID', 'PARTIALLY_PAID'].includes(state) ? new Date(created.getTime() + 3600e3) : null,
        paidAt: state === 'PAID' ? new Date(created.getTime() + 2 * 864e5) : null,
        cancelledAt: state === 'CANCELLED' ? new Date(created.getTime() + 864e5) : null,
        createdAt: created,
      },
    });

    await prisma.shortLink.create({
      data: {
        invoiceId: invoice.id,
        tokenHash: sha256(randomBytes(16).toString('base64url')),
        expiresAt: new Date(now + 60 * 864e5),
        clicks: ['VIEWED', 'PAID', 'PARTIALLY_PAID'].includes(state) ? 1 + (i % 3) : 0,
        createdAt: created,
      },
    });

    if (customer.phone && state !== 'CANCELLED') {
      const segments = 2;
      const job = await prisma.messageJob.create({
        data: {
          tenantId: tenant.id,
          invoiceId: invoice.id,
          channel: 'sms',
          recipient: customer.phone,
          body: `Ирээдүй Цогцолбор Сургууль: Танд ${amount.toLocaleString()}₮ нэхэмжлэх ирлээ.`,
          segments,
          status: 'DELIVERED',
          providerRef: `MOCK-${randomUUID().slice(0, 8)}`,
          createdAt: created,
        },
      });
      await prisma.usageEvent.create({
        data: { tenantId: tenant.id, meterCode: 'SMS_SEGMENT_SENT', qty: segments, occurredAt: created, sourceEventId: `sms:${job.id}` },
      });
    }
    await prisma.usageEvent.create({
      data: { tenantId: tenant.id, meterCode: 'INVOICE_CREATED', qty: 1, occurredAt: created, sourceEventId: `inv:${invoice.id}` },
    });

    if (paidAmount > 0) {
      const paidAt = new Date(created.getTime() + 2 * 864e5 > now ? now - 3600e3 : created.getTime() + 2 * 864e5);
      const intent = await prisma.paymentIntent.create({
        data: {
          tenantId: tenant.id,
          invoiceId: invoice.id,
          amount: paidAmount,
          provider: 'qpay_mock',
          providerInvoiceId: `MQP-${randomUUID()}`,
          state: 'SUCCEEDED',
          idemKey: randomUUID(),
          createdAt: paidAt,
          events: {
            create: [
              { type: 'intent.created', createdAt: paidAt },
              { type: 'payment.succeeded', createdAt: paidAt },
            ],
          },
        },
      });
      const tx = await prisma.paymentTransaction.create({
        data: {
          intentId: intent.id,
          provider: 'qpay_mock',
          providerPaymentId: `MQPAY-${randomUUID()}`,
          gross: paidAmount,
          fee: 0,
          net: paidAmount,
          paidAt,
          createdAt: paidAt,
        },
      });
      await prisma.usageEvent.create({
        data: { tenantId: tenant.id, meterCode: 'PAYMENT_SUCCEEDED', qty: 1, occurredAt: paidAt, sourceEventId: `pay:${tx.id}` },
      });
      const receiptState = i % 17 === 0 ? 'FAILED' : 'CREATED';
      await prisma.ebarimtReceipt.create({
        data: {
          tenantId: tenant.id,
          transactionId: tx.id,
          state: receiptState,
          receiptNo: receiptState === 'CREATED' ? randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase() : null,
          lottery: receiptState === 'CREATED' ? `${String(10 + (i % 90))} ${String(10 + ((i * 7) % 90))} ${String(100000 + i * 997).slice(0, 6)}` : null,
          qrData: receiptState === 'CREATED' ? randomBytes(48).toString('base64') : null,
          error: receiptState === 'FAILED' ? 'Provider timeout (mock)' : null,
          retries: receiptState === 'FAILED' ? 2 : 0,
          createdAt: paidAt,
        },
      });
      if (receiptState === 'CREATED') {
        await prisma.usageEvent.create({
          data: { tenantId: tenant.id, meterCode: 'RECEIPT_CREATED', qty: 1, occurredAt: paidAt, sourceEventId: `rcpt:${tx.id}` },
        });
      }
    }
  }

  await prisma.invoiceSequence.update({ where: { tenantId: tenant.id }, data: { next: seq } });
  await prisma.auditLog.create({
    data: { tenantId: tenant.id, action: 'seed.completed', targetType: 'tenant', targetId: tenant.id },
  });

  console.log(`Seed complete: tenant "${tenant.name}", ${customers.length} customers, ${seq - 1} invoices.`);
  console.log('Login → demo@billingservice.mn / Demo123$');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
