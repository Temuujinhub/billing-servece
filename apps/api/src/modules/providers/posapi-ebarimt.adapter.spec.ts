import { PosApiEbarimtAdapter, redactReceiptResponse } from './posapi-ebarimt.adapter';

/**
 * B-70: POS API 3.0 хариуны top-level `id` нь БАГЦ баримтын ДДТД (операторын
 * ТТД угтвартай); борлуулагчийн ebarimt.mn дээр бүртгэгдэх дугаар нь
 * `receipts[].id` (merchantTin = борлуулагчийн ТТД). Adapter яг тэрийг
 * `receiptNo` болгож, багцынхыг `batchReceiptNo`-д тусад нь өгөх ёстой.
 */
const OPERATOR_TIN = '02910024410';
const SELLER_TIN = '01520002009';

function makeAdapter(env: Record<string, string> = {}) {
  const config = { get: (k: string) => ({ VAT_BASE_URL: 'http://posapi.local', ...env })[k] } as any;
  return new PosApiEbarimtAdapter(config);
}

function mockFetch(receiptBody: unknown) {
  const calls: { url: string; init?: RequestInit }[] = [];
  (global as any).fetch = jest.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url.endsWith('/rest/info')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          operatorTIN: OPERATOR_TIN,
          posNo: '10012345',
          merchants: [{ name: 'Оператор', tin: OPERATOR_TIN, customers: [{ name: 'EasyParking', tin: SELLER_TIN }] }],
        }),
      };
    }
    if (url.endsWith('/rest/sendData')) return { ok: true, status: 200, text: async () => '' };
    return { ok: true, status: 200, text: async () => JSON.stringify(receiptBody) };
  });
  return calls;
}

const baseArgs = {
  tenantId: 't1',
  amount: 5000,
  description: 'Зогсоол',
  receiptType: 'CITIZEN' as const,
  paymentProvider: 'card',
  providerPaymentId: 'p1',
  merchant: { merchantTin: SELLER_TIN, posNo: '10012345' },
};

describe('PosApiEbarimtAdapter.createReceipt — ДДТД', () => {
  afterEach(() => {
    delete (global as any).fetch;
  });

  it('returns the seller sub-receipt id as receiptNo and the batch id separately', async () => {
    const calls = mockFetch({
      id: `${OPERATOR_TIN}0001000000010001796`,
      status: 'SUCCESS',
      date: '2026-09-07 19:12:00',
      lottery: 'AB 12345678',
      qrData: 'QR',
      receipts: [
        { id: `${OPERATOR_TIN}0001000000110001796`, merchantTin: OPERATOR_TIN, taxType: 'VAT_ABLE' },
        { id: `${SELLER_TIN}0001000000210001796`, merchantTin: SELLER_TIN, taxType: 'VAT_ABLE' },
      ],
    });
    const adapter = makeAdapter();
    const result = await adapter.createReceipt(baseArgs);

    expect(result.receiptNo).toBe(`${SELLER_TIN}0001000000210001796`);
    expect(result.batchReceiptNo).toBe(`${OPERATOR_TIN}0001000000010001796`);
    expect(result.receiptDate).toBe('2026-09-07 19:12:00');
    expect(result.lottery).toBe('AB 12345678');
    // Түүхий хариуг хадгална, гэхдээ ТЕГ-ийн хориотой талбаргүй.
    expect(result.raw).toBeDefined();
    expect(result.raw).not.toHaveProperty('lottery');
    expect(result.raw).not.toHaveProperty('qrData');
    expect((result.raw as any).receipts).toHaveLength(2);

    // Оператор-дамжуулсан загвар: багц = оператор, дэд баримт = борлуулагч.
    const post = calls.find((c) => c.url.endsWith('/rest/receipt'))!;
    const payload = JSON.parse(String(post.init?.body));
    expect(payload.merchantTin).toBe(OPERATOR_TIN);
    expect(payload.receipts[0].merchantTin).toBe(SELLER_TIN);
  });

  it('falls back to the only sub-receipt when merchantTin is missing in the response', async () => {
    mockFetch({
      id: 'BATCH',
      status: 'SUCCESS',
      receipts: [{ id: 'SUB-ONLY' }],
    });
    const result = await makeAdapter().createReceipt(baseArgs);
    expect(result.receiptNo).toBe('SUB-ONLY');
    expect(result.batchReceiptNo).toBe('BATCH');
  });

  it('falls back to the batch id when no sub-receipt id is present', async () => {
    mockFetch({ id: 'BATCH', status: 'SUCCESS' });
    const result = await makeAdapter().createReceipt(baseArgs);
    expect(result.receiptNo).toBe('BATCH');
    expect(result.batchReceiptNo).toBe('BATCH');
  });

  it('rejects non-SUCCESS responses', async () => {
    mockFetch({ id: 'X', status: 'ERROR', message: 'bad' });
    await expect(makeAdapter().createReceipt(baseArgs)).rejects.toThrow(/ERROR/);
  });
});

describe('redactReceiptResponse', () => {
  it('drops lottery/qrData and keeps everything else', () => {
    expect(redactReceiptResponse({ id: '1', lottery: 'L', qrData: 'Q', date: 'd', receipts: [{ id: '2' }] })).toEqual({
      id: '1',
      date: 'd',
      receipts: [{ id: '2' }],
    });
    expect(redactReceiptResponse(null)).toBeNull();
    expect(redactReceiptResponse([1])).toBeNull();
  });
});
