'use client';

/**
 * Cinematic landing (LP v2, B-59) — бараан тансаг фон, гэрлийн цацраг,
 * glassmorphism, скроллд өрнөх 3 үзэгдэлт түүх, амьд тоолуур бүхий демо.
 *
 * Бүх хөдөлгөөн framer-motion (scroll-scrub + spring) — three.js-гүйгээр
 * CSS 3D perspective-ээр «3D» мэдрэмжийг гаргасан тул бандл хөнгөн, LCP хурдан.
 * prefers-reduced-motion үед хүнд хөдөлгөөнүүд унтарна.
 */

import Link from 'next/link';
import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import {
  AnimatePresence,
  animate,
  motion,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'framer-motion';
import { Logo } from '@/components/logo';
import { PricingCalculator } from '@/components/landing/pricing-calculator';

/* ---------------------------------------------------------------- контент */

const STORY = [
  {
    n: '01',
    title: 'Нэхэмжлэх илгээх',
    text: 'Excel эсвэл API-аар мянга мянган нэхэмжлэх секундын дотор — төлөгч бүрт өвөрмөц линктэй SMS цахилгаан хурдаар тархана.',
  },
  {
    n: '02',
    title: 'QR-ээр шууд төлөх',
    text: 'Линк дээр дарахад бүх банкны апп-д уншигдах QR бэлэн. Төлөгч дуртай апп-аараа секундэд төлнө.',
  },
  {
    n: '03',
    title: 'eBarimt автоматаар',
    text: 'Төлбөр баталгаажмагц НӨАТ-ын баримт гэрэлтэн хэвлэгдэж, төлөгчид очно. Оператор юу ч дарахгүй.',
  },
];

const USE_CASES = [
  { icon: '🏫', title: 'Сургууль, цэцэрлэг', text: 'Сургалтын төлбөр, хоол, дугуйлангийн хураамжийг ангиар нь бөөнөөр илгээнэ.' },
  { icon: '🏢', title: 'СӨХ', text: 'Ашиглалтын зардлыг айл бүрт сар бүр автоматаар, үлдэгдлийг нэг дэлгэцээс.' },
  { icon: '🏥', title: 'Эмнэлэг, клиник', text: 'Үзлэг үйлчилгээний нэхэмжлэхийг пациентад линкээр, eBarimt-тэй нь.' },
  { icon: '🏋️', title: 'Клуб, гишүүнчлэл', text: 'Гишүүнчлэлийн сунгалт, сануулга, хугацаа хэтрэлтийн мэдэгдэл.' },
  { icon: '🧰', title: 'Үйлчилгээний бизнес', text: 'Гэрээт үйлчилгээний тогтмол нэхэмжлэх, авлагын хяналт.' },
  { icon: '👤', title: 'Хувь нэхэмжлэгч', text: 'Фрилансер, зөвлөх — мэргэжлийн нэхэмжлэх, хурдан төлөлт.' },
];

const FEATURES = [
  { icon: '📤', title: 'Bulk-first импорт', text: '5000 хүртэлх мөрийг нэг дор — validation, давхардлын шалгалт, зардлын урьдчилсан тооцоотой.' },
  { icon: '🔐', title: 'Төлбөрийн orchestration', text: 'Карт хадгалахгүй. Лицензтэй банк/PSP-ийн QR, deeplink, callback + payment-check давхар баталгаажуулалт.' },
  { icon: '🧿', title: 'eBarimt автоматжуулалт', text: 'Төлбөр амжилттай болмогц баримт үүснэ. Provider унтарсан ч төлбөр алдагдахгүй — дараалалд орж дахина.' },
  { icon: '⚖️', title: 'Идемпотент санхүү', text: 'Давхар төлөлт, давхар callback санхүүгийн үр дүн үүсгэхгүй. Ledger-д суурилсан үлдэгдэл.' },
  { icon: '🧩', title: '4 үйлчилгээ', text: 'Excel+SMS, API+SMS, eBarimt API, POS — хэрэгтэйгээ л асаана. Хэрэглээ бүр ил тод хэмжигдэнэ.' },
  { icon: '🛡️', title: 'Audit + эрхийн хяналт', text: 'Үйлдэл бүр хэн/хэзээ/юу гэдгээр бүртгэгдэнэ. Owner, Operator, Accountant, Viewer эрхүүд.' },
];

/* ------------------------------------------------------------ туслахууд */

/** Бодит QR (bil.mn демо линк) — libary аль хэдийн dependency тул үнэгүй. */
function useDemoQr(size = 220) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL('https://bil.mn/p/DEMO2026', {
      margin: 0,
      width: size,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then(setSrc)
      .catch(() => undefined);
  }, [size]);
  return src;
}

/** Скроллд орж ирэхэд зөөлөн илрэх wrapper. */
function Reveal({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.7, delay, ease: [0.21, 0.6, 0.35, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** Амьд тоолуур — дэлгэцэд ормогц 0-ээс зорилтот утга руу гүйнэ. */
function Counter({ to, format, className }: { to: number; format: (v: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const [val, setVal] = useState(0);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!inView) return;
    const ctrl = animate(0, to, {
      duration: 1.8,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setVal(v),
      onComplete: () => {
        setFlash(true);
        setTimeout(() => setFlash(false), 600);
      },
    });
    return () => ctrl.stop();
  }, [inView, to]);
  return (
    <span ref={ref} className={`${className ?? ''} transition-colors duration-500 ${flash ? 'text-emerald-300' : ''}`}>
      {format(val)}
    </span>
  );
}

/* ------------------------------------------------------------------ Hero */

function HeroCard() {
  const qr = useDemoQr();
  const reduced = useReducedMotion();
  // Хулганыг дагах 3D parallax (perspective + rotateX/Y, spring-ээр зөөллөнө).
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rotX = useSpring(useTransform(my, [-0.5, 0.5], [10, -10]), { stiffness: 120, damping: 16 });
  const rotY = useSpring(useTransform(mx, [-0.5, 0.5], [-14, 14]), { stiffness: 120, damping: 16 });

  return (
    <div
      className="relative hidden justify-center lg:flex"
      style={{ perspective: 1200 }}
      onMouseMove={(e) => {
        if (reduced) return;
        const r = e.currentTarget.getBoundingClientRect();
        mx.set((e.clientX - r.left) / r.width - 0.5);
        my.set((e.clientY - r.top) / r.height - 0.5);
      }}
      onMouseLeave={() => {
        mx.set(0);
        my.set(0);
      }}
    >
      {/* Арын гэрэлт цагираг */}
      <div className="absolute top-1/2 h-[430px] w-[430px] -translate-y-1/2 rounded-full bg-gradient-to-tr from-indigo-600/25 via-blue-500/10 to-emerald-400/20 blur-2xl" />

      <motion.div
        style={{ rotateX: rotX, rotateY: rotY, transformStyle: 'preserve-3d' }}
        initial={{ opacity: 0, y: 40, rotateY: reduced ? 0 : 32 }}
        animate={{ opacity: 1, y: 0, rotateY: 0 }}
        transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
        className="relative w-[320px] rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-[0_40px_80px_-20px_rgba(59,130,246,0.35)] backdrop-blur-xl"
      >
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-slate-400">Нэхэмжлэх INV-08492</span>
          <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/15 px-2 py-1 text-[11px] font-bold text-emerald-300">
            <motion.span
              className="h-1.5 w-1.5 rounded-full bg-emerald-400"
              animate={reduced ? undefined : { opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.6, repeat: Infinity }}
            />
            Идэвхтэй
          </span>
        </div>

        {/* Гэрэлтсэн QR — metal хүрээтэй, зөөлөн хөвөх хөдөлгөөнтэй */}
        <motion.div
          animate={reduced ? undefined : { y: [0, -6, 0] }}
          transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
          className="mx-auto mt-5 w-fit rounded-2xl bg-gradient-to-br from-slate-200/40 via-white/10 to-slate-500/30 p-[1.5px]"
          style={{ transform: 'translateZ(45px)' }}
        >
          <div className="rounded-2xl bg-white p-4 shadow-[0_0_50px_-8px_rgba(52,211,153,0.45)]">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="Төлбөрийн демо QR" width={172} height={172} className="h-[172px] w-[172px]" />
            ) : (
              <div className="h-[172px] w-[172px] animate-pulse rounded bg-slate-200" />
            )}
          </div>
        </motion.div>

        <div className="mt-5 text-center" style={{ transform: 'translateZ(30px)' }}>
          <p className="text-[12px] text-slate-400">Төлөх дүн</p>
          <p className="text-2xl font-extrabold tracking-tight text-white">150,000₮</p>
          <p className="mt-1 font-mono text-[11.5px] text-blue-300/80">bil.mn/p/DEMO2026</p>
        </div>

        {/* Хажуугийн жижиг мэдэгдэл — SMS очсоныг илэрхийлнэ */}
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 1.4, duration: 0.7 }}
          className="absolute -left-24 top-8 hidden rounded-2xl rounded-tl-sm border border-white/10 bg-slate-800/90 px-3.5 py-2.5 text-[11.5px] text-slate-200 shadow-xl backdrop-blur xl:block"
          style={{ transform: 'translateZ(60px)' }}
        >
          💬 Танд 150,000₮-ийн
          <br /> нэхэмжлэх ирлээ
        </motion.div>
        <motion.div
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 2.1, duration: 0.7 }}
          className="absolute -right-28 -bottom-6 hidden rounded-2xl border border-emerald-400/20 bg-slate-800/90 px-3.5 py-2.5 text-[11.5px] text-emerald-300 shadow-xl backdrop-blur xl:block"
          style={{ transform: 'translateZ(60px)' }}
        >
          ✓ Төлөгдлөө · eBarimt үүслээ
        </motion.div>
      </motion.div>
    </div>
  );
}

/* -------------------------------------------------- Скролл-түүх (3 үзэгдэл) */

function SceneSms({ reduced }: { reduced: boolean }) {
  const bubbles = [
    { x: -130, y: -80, d: 0 },
    { x: 120, y: -110, d: 0.15 },
    { x: -170, y: 40, d: 0.3 },
    { x: 160, y: 70, d: 0.45 },
    { x: -60, y: -150, d: 0.6 },
    { x: 60, y: 130, d: 0.75 },
  ];
  return (
    <div className="relative flex h-full items-center justify-center">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 rounded-3xl border border-blue-400/30 bg-slate-900/80 px-8 py-6 text-center shadow-[0_0_70px_-12px_rgba(59,130,246,0.5)] backdrop-blur"
      >
        <p className="text-4xl">📨</p>
        <p className="mt-2 text-sm font-bold text-white">5,000 нэхэмжлэх</p>
        <p className="text-[12px] text-slate-400">илгээгдэж байна…</p>
      </motion.div>
      {bubbles.map((b, i) => (
        <motion.div
          key={i}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
          animate={reduced ? { opacity: 0.9, x: b.x, y: b.y, scale: 1 } : { x: [0, b.x], y: [0, b.y], opacity: [0, 1, 0.85], scale: [0.4, 1] }}
          transition={{ duration: 1.4, delay: b.d, repeat: reduced ? 0 : Infinity, repeatDelay: 1.2, ease: 'easeOut' }}
          className="absolute rounded-xl rounded-bl-sm border border-white/10 bg-slate-800/90 px-3 py-1.5 text-[11px] text-slate-200 shadow-lg"
        >
          💬 bil.mn/p/…
        </motion.div>
      ))}
    </div>
  );
}

function SceneQr() {
  const qr = useDemoQr(150);
  return (
    <div className="flex h-full items-center justify-center">
      <motion.div
        initial={{ scale: 0.7, rotateY: 35, opacity: 0 }}
        animate={{ scale: 1, rotateY: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        style={{ perspective: 900 }}
        className="relative"
      >
        <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-[0_0_80px_-10px_rgba(99,102,241,0.5)] backdrop-blur">
          <div className="rounded-2xl bg-white p-4">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="QR" width={150} height={150} className="h-[150px] w-[150px]" />
            ) : (
              <div className="h-[150px] w-[150px] rounded bg-slate-200" />
            )}
          </div>
          <p className="mt-3 text-center text-[12px] text-slate-400">Бүх банкны апп уншина</p>
        </div>
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.9, type: 'spring', stiffness: 300, damping: 15 }}
          className="absolute -right-5 -top-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-2xl text-white shadow-[0_0_40px_-4px_rgba(16,185,129,0.8)]"
        >
          ✓
        </motion.div>
      </motion.div>
    </div>
  );
}

function SceneReceipt() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="relative w-[280px]">
        {/* Хэвлэгчийн ам */}
        <div className="absolute -top-3 left-1/2 z-20 h-4 w-[300px] -translate-x-1/2 rounded-full bg-slate-800 shadow-[0_6px_20px_rgba(0,0,0,0.5)]" />
        <div className="overflow-hidden pt-1">
          <motion.div
            initial={{ y: '-92%' }}
            animate={{ y: 0 }}
            transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-b-2xl border border-emerald-300/25 bg-gradient-to-b from-white to-emerald-50 p-5 font-mono text-[12px] text-slate-800 shadow-[0_0_60px_-10px_rgba(16,185,129,0.55)]"
          >
            <p className="text-center text-[13px] font-bold tracking-widest">НӨАТ-ЫН БАРИМТ</p>
            <p className="mt-1 text-center text-[10px] text-slate-500">ebarimt.mn · msgbill.mn</p>
            <div className="my-3 border-t border-dashed border-slate-300" />
            <div className="flex justify-between"><span>Нэхэмжлэх</span><span>INV-08492</span></div>
            <div className="flex justify-between"><span>Дүн</span><span>150,000₮</span></div>
            <div className="flex justify-between"><span>НӨАТ (10%)</span><span>13,636₮</span></div>
            <div className="my-3 border-t border-dashed border-slate-300" />
            <div className="flex justify-between font-bold"><span>Сугалаа</span><span className="text-emerald-600">AB 12345678</span></div>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.4 }}
              className="mt-3 text-center text-[11px] font-bold text-emerald-600"
            >
              ✓ Төлөгчид SMS-ээр очлоо
            </motion.p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function StoryScroll() {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const progress = useSpring(scrollYProgress, { stiffness: 90, damping: 25 });
  const [active, setActive] = useState(0);
  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    setActive(v < 0.34 ? 0 : v < 0.67 ? 1 : 2);
  });

  return (
    <section id="how" ref={ref} className="relative h-[320vh]">
      <div className="sticky top-0 flex h-screen flex-col justify-center overflow-hidden">
        <div className="mx-auto grid w-full max-w-content items-center gap-10 px-5 lg:grid-cols-2">
          {/* Зүүн: алхмын бичвэрүүд */}
          <div>
            <p className="text-[13px] font-bold uppercase tracking-[0.2em] text-blue-400">Хэрхэн ажилладаг</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              Скролл хийгээд <span className="bg-gradient-to-r from-blue-400 to-emerald-300 bg-clip-text text-transparent">30 секундэд</span> ойлго
            </h2>
            {/* Progress bar — киноны timeline мэт скроллыг дагана */}
            <div className="mt-6 h-1 w-full max-w-sm overflow-hidden rounded-full bg-white/10">
              <motion.div className="h-full origin-left rounded-full bg-gradient-to-r from-blue-500 to-emerald-400" style={{ scaleX: progress }} />
            </div>
            <div className="mt-8 space-y-3">
              {STORY.map((s, i) => (
                <div
                  key={s.n}
                  className={`rounded-2xl border p-5 transition-all duration-500 ${
                    active === i
                      ? 'border-blue-400/40 bg-white/[0.06] shadow-[0_0_40px_-14px_rgba(59,130,246,0.6)]'
                      : 'border-white/5 bg-transparent opacity-45'
                  }`}
                >
                  <div className="flex items-baseline gap-3">
                    <span className={`font-mono text-[13px] font-black ${active === i ? 'text-emerald-300' : 'text-slate-500'}`}>{s.n}</span>
                    <h3 className="text-lg font-bold text-white">{s.title}</h3>
                  </div>
                  <p className="mt-1.5 pl-9 text-[14px] leading-relaxed text-slate-400">{s.text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Баруун: идэвхтэй үзэгдэл */}
          <div className="relative hidden h-[440px] lg:block">
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -30 }}
                transition={{ duration: 0.45 }}
                className="absolute inset-0"
              >
                {active === 0 && <SceneSms reduced={!!reduced} />}
                {active === 1 && <SceneQr />}
                {active === 2 && <SceneReceipt />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------- Амьд статистик */

function LiveStats() {
  const bars = [35, 55, 40, 70, 52, 78, 64, 90, 72, 60, 84, 96];
  return (
    <section className="mx-auto max-w-content px-5 py-24">
      <Reveal>
        <h2 className="text-center text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Самбар чинь <span className="bg-gradient-to-r from-blue-400 to-emerald-300 bg-clip-text text-transparent">амьд</span> ажиллана
        </h2>
      </Reveal>
      <div className="mt-12 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        {/* Graph карт */}
        <Reveal className="rounded-3xl border border-white/10 bg-slate-900/60 p-7 backdrop-blur-lg">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-slate-200">Энэ сарын цугласан</p>
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[12px] font-bold text-emerald-300">+18%</span>
          </div>
          <p className="mt-2 text-4xl font-extrabold tracking-tight text-white">
            <Counter to={12480000} format={(v) => `${Math.round(v).toLocaleString()}₮`} />
          </p>
          <div className="mt-6 flex items-end gap-1.5" style={{ height: 110 }}>
            {bars.map((h, i) => (
              <motion.div
                key={i}
                initial={{ height: '6%' }}
                whileInView={{ height: `${h}%` }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.9, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                whileHover={{ scaleY: 1.06, filter: 'brightness(1.3)' }}
                className="flex-1 origin-bottom rounded-t-md bg-gradient-to-t from-blue-600/80 via-blue-400/80 to-emerald-300"
              />
            ))}
          </div>
          <div className="mt-6 space-y-2.5 border-t border-white/10 pt-4 text-[13px]">
            {[
              ['INV-10041 · Сараа Болд', 'Төлсөн', 'text-emerald-300'],
              ['INV-10040 · Төмөр Баяр', 'Нээсэн', 'text-blue-300'],
              ['INV-10039 · Наран Дорж', 'eBarimt үүссэн', 'text-emerald-300'],
            ].map(([l, s, c]) => (
              <div key={l} className="flex items-center justify-between">
                <span className="text-slate-300">{l}</span>
                <span className={`font-semibold ${c}`}>{s}</span>
              </div>
            ))}
          </div>
        </Reveal>

        {/* Тоон үзүүлэлтүүд */}
        <div className="grid grid-cols-2 gap-4">
          {[
            { to: 5000, format: (v: number) => `${Math.round(v).toLocaleString()}`, label: 'мөр нэг импортод', suffix: ' хүртэл' },
            { to: 99.98, format: (v: number) => v.toFixed(2), label: 'ажиллагааны бэлэн байдал', suffix: '%' },
            { to: 2, format: (v: number) => `<${Math.max(1, Math.round(v))}`, label: 'секундэд SMS хүрнэ', suffix: 'с' },
            { to: 100, format: (v: number) => `${Math.round(v)}`, label: 'нэг илгээлтийн үнэ — eBarimt багтсан', suffix: '₮' },
          ].map((s, i) => (
            <Reveal key={s.label} delay={i * 0.08} className="flex flex-col justify-center rounded-3xl border border-white/10 bg-slate-900/60 p-6 backdrop-blur-lg">
              <p className="text-3xl font-extrabold tracking-tight text-white">
                <Counter to={s.to} format={s.format} />
                <span className="text-emerald-300">{s.suffix}</span>
              </p>
              <p className="mt-1.5 text-[13px] leading-snug text-slate-400">{s.label}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ Page */

export function CinematicLanding() {
  const reduced = useReducedMotion();
  const { scrollY } = useScroll();
  const heroGlowY = useTransform(scrollY, [0, 700], [0, 160]);

  return (
    <div className="bg-slate-950 font-sans text-white [color-scheme:dark]">
      {/* Тансаг фонын гэрлүүд + нарийн grid */}
      <motion.div style={{ y: reduced ? 0 : heroGlowY }} className="pointer-events-none fixed -left-40 -top-40 h-[560px] w-[560px] rounded-full bg-blue-600/20 blur-[130px]" />
      <div className="pointer-events-none fixed -bottom-40 -right-40 h-[560px] w-[560px] rounded-full bg-emerald-500/10 blur-[130px]" />
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.15]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(148,163,184,0.09) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.09) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage: 'radial-gradient(ellipse 90% 60% at 50% 0%, black 40%, transparent 100%)',
        }}
      />

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-content items-center justify-between px-5">
          <Logo dark />
          <nav className="hidden items-center gap-7 text-sm font-medium text-slate-300 md:flex" aria-label="Үндсэн цэс">
            <a href="#how" className="transition hover:text-white">Хэрхэн ажилладаг</a>
            <a href="#use-cases" className="transition hover:text-white">Хэнд зориулагдсан</a>
            <a href="#pricing" className="transition hover:text-white">Үнэ</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="hidden rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10 sm:inline-flex">
              Нэвтрэх
            </Link>
            <Link
              href="/register"
              className="rounded-xl bg-gradient-to-r from-indigo-600 to-blue-500 px-4 py-2 text-sm font-bold text-white shadow-[0_8px_24px_-8px_rgba(79,70,229,0.7)] transition hover:shadow-[0_8px_32px_-6px_rgba(79,70,229,0.9)] hover:brightness-110"
            >
              Үнэгүй эхлэх
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative">
        <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-content items-center gap-12 px-5 py-16 lg:grid-cols-2">
          <div>
            <motion.p
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/10 px-4 py-2 text-[13px] font-semibold text-blue-300 backdrop-blur"
            >
              <motion.span
                className="h-2 w-2 rounded-full bg-emerald-400"
                animate={reduced ? undefined : { opacity: [1, 0.35, 1] }}
                transition={{ duration: 1.8, repeat: Infinity }}
              />
              msgbill.mn — Message Billing Service
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.15 }}
              className="mt-6 bg-gradient-to-br from-white via-slate-200 to-slate-500 bg-clip-text text-4xl font-extrabold leading-[1.1] tracking-tight text-transparent sm:text-6xl"
            >
              Нэг SMS-ээр{' '}
              <span className="bg-gradient-to-r from-blue-400 to-emerald-300 bg-clip-text text-transparent">төлбөр ба eBarimt</span>
              -ийг шийднэ
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.9, delay: 0.35 }}
              className="mt-6 max-w-xl text-[17px] leading-relaxed text-slate-400"
            >
              Excel эсвэл API-аар мянга мянган нэхэмжлэх үүсгэж SMS-ээр илгээ. Төлөгч QR-ээр шууд төлж, НӨАТ-ын баримтаа
              тухай бүрт нь авна — бүгдийг нэг самбараас.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.5 }}
              className="mt-9 flex flex-wrap items-center gap-4"
            >
              <Link
                href="/register"
                className="group rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-500 px-7 py-3.5 text-[15px] font-bold text-white shadow-[0_14px_40px_-10px_rgba(79,70,229,0.8)] transition hover:shadow-[0_16px_50px_-8px_rgba(59,130,246,0.9)] hover:brightness-110"
              >
                Үнэгүй туршиж эхлэх <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
              </Link>
              <Link
                href="/login"
                className="rounded-2xl border border-white/15 bg-white/5 px-7 py-3.5 text-[15px] font-semibold text-white backdrop-blur transition hover:border-white/30 hover:bg-white/10"
              >
                Демо самбар үзэх
              </Link>
            </motion.div>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} className="mt-5 text-[13px] text-slate-500">
              Карт шаардлагагүй · 5 минутад тохируулна · Монгол хэл дээр
            </motion.p>
          </div>

          <HeroCard />
        </div>

        {/* Доош гүйлгэх сануулга */}
        <motion.div
          animate={reduced ? undefined : { y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 text-slate-500"
          aria-hidden="true"
        >
          ↓
        </motion.div>
      </section>

      {/* Скролл-түүх */}
      <StoryScroll />

      {/* Амьд статистик */}
      <LiveStats />

      {/* Хэнд зориулагдсан */}
      <section id="use-cases" className="mx-auto max-w-content px-5 py-24">
        <Reveal>
          <h2 className="text-center text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Хэнд зориулагдсан бэ?</h2>
        </Reveal>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {USE_CASES.map((u, i) => (
            <Reveal key={u.title} delay={(i % 3) * 0.08}>
              <motion.div
                whileHover={{ y: -6 }}
                transition={{ duration: 0.25 }}
                className="flex h-full gap-4 rounded-3xl border border-white/10 bg-slate-900/50 p-6 backdrop-blur-lg transition-colors hover:border-blue-400/30"
              >
                <span className="text-2xl">{u.icon}</span>
                <div>
                  <h3 className="font-bold text-white">{u.title}</h3>
                  <p className="mt-1 text-[14px] leading-relaxed text-slate-400">{u.text}</p>
                </div>
              </motion.div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Архитектурын давуу тал */}
      <section className="mx-auto max-w-content px-5 py-24">
        <Reveal>
          <h2 className="text-center text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Найдвартай байдлыг <span className="bg-gradient-to-r from-blue-400 to-emerald-300 bg-clip-text text-transparent">архитектурын түвшинд</span> шийдсэн
          </h2>
        </Reveal>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 0.08}>
              <motion.div
                whileHover={{ y: -8 }}
                transition={{ duration: 0.25 }}
                className="h-full rounded-3xl border border-white/10 bg-slate-900/50 p-7 backdrop-blur-lg transition-colors hover:border-emerald-400/25"
              >
                <p className="text-2xl">{f.icon}</p>
                <h3 className="mt-3 font-bold text-white">{f.title}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-slate-400">{f.text}</p>
              </motion.div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Үнэ — calculator нь бараан фон дээр цагаан «цаас» шиг тодорно */}
      <section id="pricing" className="relative py-24">
        <div className="mx-auto max-w-content px-5">
          <Reveal>
            <h2 className="text-center text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Хэрэглээндээ тохирсон үнэ</h2>
            <p className="mx-auto mt-3 max-w-lg text-center text-[15.5px] text-slate-400">
              Суурь хураамжгүй — илгээлт бүр 100₮, eBarimt багтсан.
            </p>
          </Reveal>
          <Reveal delay={0.1} className="mt-10">
            <PricingCalculator />
          </Reveal>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden py-24 text-center">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[380px] w-[680px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-600/20 blur-[110px]" />
        <Reveal className="relative mx-auto max-w-2xl px-5">
          <h2 className="text-4xl font-extrabold tracking-tight text-white">Өнөөдөр л эхэл</h2>
          <p className="mt-4 text-slate-400">Бүртгүүлээд 5 минутын дотор эхний нэхэмжлэхээ илгээ.</p>
          <Link
            href="/register"
            className="mt-8 inline-flex rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-500 px-9 py-4 text-[15px] font-bold text-white shadow-[0_14px_44px_-10px_rgba(79,70,229,0.8)] transition hover:shadow-[0_18px_54px_-8px_rgba(59,130,246,0.95)] hover:brightness-110"
          >
            Үнэгүй бүртгүүлэх →
          </Link>
        </Reveal>
      </section>

      {/* Footer */}
      <footer className="relative border-t border-white/10">
        <div className="mx-auto flex max-w-content flex-col items-center justify-between gap-4 px-5 py-8 text-[13.5px] text-slate-500 sm:flex-row">
          <Logo dark />
          <nav className="flex flex-wrap items-center gap-5" aria-label="Хөл цэс">
            <a href="/health/live" className="transition hover:text-white">Статус</a>
            <Link href="/login" className="transition hover:text-white">Нэвтрэх</Link>
          </nav>
          <p>© {new Date().getFullYear()} msgbill.mn — Message Billing Service</p>
        </div>
      </footer>
    </div>
  );
}
