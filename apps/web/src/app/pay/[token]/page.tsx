'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { EbarimtQr } from '@/components/ebarimt-qr';
import { Spinner } from '@/components/ui';
import { apiPublic, ApiError } from '@/lib/api';
import { mnt, shortDate } from '@/lib/format';
import type { PayPageData } from '@/lib/types';

type Phase = 'loading' | 'ready' | 'qr' | 'checking' | 'paid' | 'error';

interface IntentView {
  intentId: string;
  state: string;
  qrText: string | null;
  paymentUrl: string | null;
  expiresAt: string | null;
  deeplinks?: { name: string; link: string }[];
}

const POLL_MS = 3000;
const POLL_LIMIT = 60; // bounded polling (PRD §5.5)
// Bonum-аас буцаж ирсний дараах ТҮРГЭН шалгалт: 2с тутам, ~90с хүртэл.
// Сервер тал 15с тутамд provider-оос бодитоор дахин лавладаг тул төлбөр
// ихэнхдээ эхний 1-2 шалгалтад баталгаажна.
const RETURN_POLL_MS = 2000;
const RETURN_POLL_LIMIT = 45;
/** Платформын тусламжийн утас — төлөгчид харагдана. */
const SUPPORT_PHONE = '72225700';

/** Bonum руу гарахдаа тавьдаг туг — буцаж ирэхэд (?r=1 алдагдсан ч) танина. */
function returnFlagKey(token: string) {
  return `mb.pay.out.${token}`;
}

export default function PayPage() {
  const { token } = useParams<{ token: string }>();
  const [phase, setPhase] = useState<Phase>('loading');
  const [data, setData] = useState<PayPageData | null>(null);
  const [intent, setIntent] = useState<IntentView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<PayPageData['receipt']>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pollCount = useRef(0);
  const [slowReturn, setSlowReturn] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await apiPublic<PayPageData>(`/public/pay/${token}`);
      setData(d);
      setReceipt(d.receipt);
      if (d.invoice.state === 'PAID') {
        try { sessionStorage.removeItem(returnFlagKey(token)); } catch { /* noop */ }
        setPhase('paid');
        return;
      }
      // Bonum-аас буцаж ирсэн үед төлбөрийн товчийг ДАХИН үзүүлэхгүй —
      // шууд баталгаажуулалтын горимд орно (давхар төлөлтөөс сэргийлнэ).
      let returning = false;
      try {
        returning =
          new URLSearchParams(window.location.search).get('r') === '1' ||
          sessionStorage.getItem(returnFlagKey(token)) === '1';
      } catch { /* noop */ }
      setPhase(returning ? 'checking' : 'ready');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Холбоос уншигдсангүй');
      setPhase('error');
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  // Draw QR whenever we have qrText.
  useEffect(() => {
    if (phase === 'qr' && intent?.qrText && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, intent.qrText, { width: 232, margin: 1, color: { dark: '#0B1E33' } }).catch(() => undefined);
    }
  }, [phase, intent]);

  // Буцаж ирсний дараах түргэн баталгаажуулалт (checking).
  useEffect(() => {
    if (phase !== 'checking') return;
    let n = 0;
    const slowTimer = setTimeout(() => setSlowReturn(true), 20_000);
    const t = setInterval(async () => {
      n += 1;
      if (n > RETURN_POLL_LIMIT) {
        clearInterval(t);
        setSlowReturn(true);
        return;
      }
      try {
        const s = await apiPublic<{ invoiceState: string; receipt: PayPageData['receipt'] }>(`/public/pay/${token}/status`);
        if (s.invoiceState === 'PAID' || s.invoiceState === 'PARTIALLY_PAID') {
          try { sessionStorage.removeItem(returnFlagKey(token)); } catch { /* noop */ }
          setReceipt(s.receipt);
          setPhase('paid');
          clearInterval(t);
        }
      } catch { /* transient */ }
    }, RETURN_POLL_MS);
    return () => { clearInterval(t); clearTimeout(slowTimer); };
  }, [phase, token]);

  // Төлөгдсөний дараа eBarimt бэлэн болтол (webhook хэдхэн секунд хоцорч
  // болно) баримтыг богино хугацаанд дахин татна.
  useEffect(() => {
    if (phase !== 'paid') return;
    if (receipt && receipt.state === 'CREATED') return;
    let n = 0;
    const t = setInterval(async () => {
      n += 1;
      if (n > 20) { clearInterval(t); return; }
      try {
        const s = await apiPublic<{ invoiceState: string; receipt: PayPageData['receipt'] }>(`/public/pay/${token}/status`);
        if (s.receipt) setReceipt(s.receipt);
        if (s.receipt?.state === 'CREATED') clearInterval(t);
      } catch { /* transient */ }
    }, 3000);
    return () => clearInterval(t);
  }, [phase, token, receipt]);

  // Bounded polling while the QR is displayed.
  useEffect(() => {
    if (phase !== 'qr') return;
    pollCount.current = 0;
    const t = setInterval(async () => {
      pollCount.current += 1;
      if (pollCount.current > POLL_LIMIT) {
        clearInterval(t);
        return;
      }
      try {
        const s = await apiPublic<{ invoiceState: string; receipt: PayPageData['receipt'] }>(`/public/pay/${token}/status`);
        if (s.invoiceState === 'PAID' || s.invoiceState === 'PARTIALLY_PAID') {
          setReceipt(s.receipt);
          setPhase('paid');
          clearInterval(t);
        }
      } catch {
        /* transient — keep polling */
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [phase, token]);

  async function startPayment() {
    setBusy(true);
    setError(null);
    try {
      const i = await apiPublic<IntentView>(`/public/pay/${token}/intent`, { method: 'POST' });
      setIntent(i);
      // Hosted checkout (Bonum): илүүц дунд хуудасгүйгээр ШУУД шилжинэ.
      // QR-тэй (QPay) горимд л QR дэлгэцээ үзүүлнэ.
      if (i.paymentUrl && !i.qrText) {
        try { sessionStorage.setItem(returnFlagKey(token), '1'); } catch { /* noop */ }
        window.location.assign(i.paymentUrl);
        // Хөтөч шилжилтийг хориглосон ховор тохиолдолд fallback линк харагдана.
        setPhase('qr');
        return;
      }
      setPhase('qr');
    } catch (e) {
      // Хуучирсан линкийг сэргээх үед нэхэмжлэх аль хэдийн төлөгдсөн байж
      // болно — хуудсыг дахин ачаалж «Төлбөр амжилттай» төлөвийг харуулна.
      if (e instanceof ApiError && e.code === 'NOT_PAYABLE') {
        await load();
        return;
      }
      setError(e instanceof ApiError ? e.message : 'Төлбөр эхлүүлж чадсангүй');
    } finally {
      setBusy(false);
    }
  }

  async function simulate() {
    setBusy(true);
    setError(null);
    try {
      await apiPublic(`/public/pay/${token}/simulate`, { method: 'POST' });
      setPhase('checking');
      const s = await apiPublic<{ invoiceState: string; receipt: PayPageData['receipt'] }>(`/public/pay/${token}/status`);
      setReceipt(s.receipt);
      setPhase('paid');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Симуляц амжилтгүй');
      setPhase('qr');
    } finally {
      setBusy(false);
    }
  }

  if (phase === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-navy-900">
        <Spinner className="h-8 w-8 text-teal-300" />
      </main>
    );
  }

  if (phase === 'error' || !data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-navy-900 px-4">
        <div className="card w-full max-w-sm p-8 text-center">
          <p className="text-4xl">🔗</p>
          <h1 className="mt-3 text-lg font-bold text-slate-900">Холбоос хүчингүй байна</h1>
          <p className="mt-2 text-sm text-slate-500">{error ?? 'Хугацаа дууссан эсвэл цуцлагдсан байж болно. Нэхэмжлэгчээс шинэ линк аваарай.'}</p>
        </div>
      </main>
    );
  }

  const inv = data.invoice;
  const cancelled = ['CANCELLED', 'EXPIRED'].includes(inv.state);

  return (
    <main className="flex min-h-screen flex-col items-center bg-navy-900 px-4 py-8">
      <div className="w-full max-w-md">
        {/* Merchant identity — always visible & prominent (trust) */}
        <div className="mb-4 text-center text-white">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-500 text-xl font-black shadow-cta">
            {data.merchant.name.slice(0, 1)}
          </div>
          <h1 className="text-lg font-bold">{data.merchant.name}</h1>
          <p className="text-[13px] text-navy-300">Нэхэмжлэх {inv.number}</p>
        </div>

        <div className="card overflow-hidden">
          {/* Amount header */}
          <div className="border-b border-slate-200/60 bg-slate-50/50 px-6 py-5 text-center">
            <p className="text-[13px] font-medium text-slate-500">{inv.description}</p>
            <p className="mt-1 text-4xl font-extrabold tracking-tight text-navy-900">{mnt(inv.balance || inv.amount)}</p>
            {inv.dueDate && !cancelled && phase !== 'paid' && (
              <p className="mt-1 text-[12.5px] text-slate-500">Төлөх хугацаа: {shortDate(inv.dueDate)}</p>
            )}
            <p className="mt-1 text-[12.5px] text-navy-400">Төлөгч: {inv.customerName}</p>
          </div>

          <div className="px-6 py-6">
            {cancelled && (
              <div className="rounded-xl bg-navy-50 px-4 py-5 text-center">
                <p className="text-2xl">🚫</p>
                <p className="mt-2 font-bold text-navy-800">Энэ нэхэмжлэх цуцлагдсан байна</p>
                <p className="mt-1 text-[13px] text-slate-500">Асуулт байвал {data.merchant.name}-тай холбогдоно уу.</p>
              </div>
            )}

            {phase === 'ready' && !cancelled && (
              <button onClick={startPayment} disabled={busy} className="btn-primary w-full py-4 text-[16px]">
                {busy ? <Spinner className="h-5 w-5 text-white" /> : 'Төлбөр төлөх'}
              </button>
            )}

            {phase === 'qr' && intent && (
              <div className="text-center">
                {/* Hosted checkout: автоматаар шилжсэн — энэ нь зөвхөн fallback */}
                {intent.paymentUrl && !intent.qrText && (
                  <div className="flex flex-col items-center gap-3 py-2">
                    <Spinner className="h-7 w-7" />
                    <p className="text-sm font-medium text-navy-700">Төлбөрийн хуудас руу шилжиж байна…</p>
                    <a href={intent.paymentUrl} className="text-[13px] font-semibold text-indigo-600 underline">
                      Автоматаар шилжээгүй бол энд дарна уу
                    </a>
                  </div>
                )}
                {intent.paymentUrl && intent.qrText && (
                  <a href={intent.paymentUrl} className="btn-primary w-full justify-center py-4 text-[16px]">
                    Төлбөрийн хуудас руу шилжих →
                  </a>
                )}
                {intent.qrText ? (
                  <>
                    <p className={`text-[14px] font-semibold text-navy-800 ${intent.paymentUrl ? 'mt-5' : ''}`}>Банкны апп-аараа уншуулна уу</p>
                    <div className="mx-auto mt-3 w-fit rounded-2xl border border-line bg-white p-3 shadow-card">
                      <canvas ref={canvasRef} aria-label="Төлбөрийн QR код" />
                    </div>
                  </>
                ) : null}
                <div className="mt-3 flex items-center justify-center gap-2 text-[13px] text-slate-500">
                  <span className="h-2 w-2 animate-pulse-soft rounded-full bg-teal-500" />
                  Төлөлтийг шалгаж байна…
                </div>

                {intent.deeplinks && intent.deeplinks.length > 0 && (
                  <div className="mt-5 grid grid-cols-2 gap-2.5">
                    {intent.deeplinks.map((d) => (
                      <a key={d.name} href={d.link} className="btn-secondary justify-center py-3 text-[13.5px]">
                        {d.name}
                      </a>
                    ))}
                  </div>
                )}

                {data.sandbox && (
                  <button onClick={simulate} disabled={busy} className="mt-6 w-full rounded-xl border-2 border-dashed border-gold/60 bg-amber-50 px-4 py-3.5 text-[14px] font-bold text-amber-700 hover:bg-amber-100">
                    {busy ? 'Түр хүлээнэ үү…' : '🧪 Туршилт: Төлбөр төлөгдсөнөөр симуляц хийх'}
                  </button>
                )}
              </div>
            )}

            {phase === 'checking' && (
              <div className="flex flex-col items-center gap-3 py-6">
                <Spinner className="h-8 w-8" />
                <p className="text-sm font-medium text-navy-700">Төлбөрийг баталгаажуулж байна…</p>
                <p className="text-[12.5px] text-slate-500">Ихэнхдээ хэдхэн секунд — түр хүлээнэ үү.</p>
                {slowReturn && (
                  <div className="mt-2 w-full rounded-xl bg-amber-50 p-4 text-center text-[13px] text-amber-800">
                    Төлөлт хараахан бүртгэгдээгүй байна. Банкны апп дээрээ төлөлт
                    амжилттай болсныг шалгаад түр хүлээнэ үү — бид автоматаар шалгасаар байна.
                    <button
                      onClick={() => { setSlowReturn(false); setPhase('ready'); }}
                      className="mt-3 w-full rounded-lg border border-amber-300 px-3 py-2 font-semibold hover:bg-amber-100"
                    >
                      Төлөөгүй — дахин төлөх
                    </button>
                  </div>
                )}
              </div>
            )}

            {phase === 'paid' && (
              <div className="text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-teal-50 text-3xl">✅</div>
                <h2 className="mt-3 text-xl font-extrabold text-navy-900">Төлбөр амжилттай</h2>
                <p className="mt-1 text-[13.5px] text-slate-500">{mnt(inv.amount)} — {data.merchant.name}</p>

                {receipt && receipt.state === 'CREATED' && (
                  <div className="mt-5 rounded-2xl border border-teal-200 bg-teal-50/60 p-5 text-left">
                    <p className="text-center text-[13px] font-bold uppercase tracking-wider text-indigo-700">eBarimt баримт</p>
                    <div className="mt-3 space-y-1.5 text-[13.5px]">
                      <div className="flex justify-between"><span className="text-slate-500">Баримтын №</span><span className="font-mono text-[12px] font-semibold">{receipt.receiptNo}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Сугалааны дугаар</span><b className="tracking-widest text-navy-900">{receipt.lottery}</b></div>
                    </div>
                    {receipt.qrData && (
                      <div className="mt-4 text-center">
                        <EbarimtQr data={receipt.qrData} size={184} />
                      </div>
                    )}
                  </div>
                )}
                {receipt && (receipt.state === 'PENDING' || receipt.state === 'FAILED') && (
                  <div className="mt-5 rounded-2xl bg-amber-50 p-4 text-[13px] text-amber-800">
                    Төлбөр <b>амжилттай</b>. eBarimt баримт үүсгэгдэж байна — бэлэн болмогц энэ хуудсанд харагдана.
                  </div>
                )}
              </div>
            )}

            {error && (
              <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-center text-[13px] text-red-600">{error}</p>
            )}
          </div>
        </div>

        <p className="mt-5 text-center text-[12px] leading-relaxed text-navy-400">
          Энэ хуудсыг <b className="text-navy-200">msgbill.mn</b> найдвартай дамжуулж байна.
          {' '}Тусламж: <a href={`tel:${SUPPORT_PHONE}`} className="font-semibold text-navy-200">{SUPPORT_PHONE}</a>
        </p>
      </div>
    </main>
  );
}
