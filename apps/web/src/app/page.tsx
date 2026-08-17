import Link from 'next/link';
import { Logo } from '@/components/logo';
import { PricingCalculator } from '@/components/landing/pricing-calculator';

const STEPS = [
  {
    n: '01',
    title: 'Excel-ээ оруулна',
    text: 'Бэлэн загвар татаад бөглөнө. Мөр бүрийн алдааг илгээхээс ӨМНӨ шалгаж, засаж баталгаажуулна.',
    icon: '📄',
  },
  {
    n: '02',
    title: 'Нэг товчоор илгээнэ',
    text: 'Төлөгч бүрт өвөрмөц төлбөрийн линк SMS-ээр очно. QPay QR, банкны апп-руу шууд үсэрнэ.',
    icon: '📨',
  },
  {
    n: '03',
    title: 'Төлөлт + eBarimt автоматаар',
    text: 'Төлбөр баталгаажмагц eBarimt үүсч, самбар дээр бодит цагаар тайлагнана. Тулгалт автоматаар.',
    icon: '✅',
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
  { title: 'Bulk-first импорт', text: '5000 хүртэлх мөрийг нэг дор — validation, давхардлын шалгалт, зардлын урьдчилсан тооцоотой.' },
  { title: 'Төлбөрийн orchestration', text: 'Карт хадгалахгүй. Лицензтэй банк/PSP-ийн QR, deeplink, callback + payment-check давхар баталгаажуулалт.' },
  { title: 'eBarimt автоматжуулалт', text: 'Төлбөр амжилттай болмогц баримт үүснэ. Provider унтарсан ч төлбөр алдагдахгүй — дараалалд орж дахина.' },
  { title: 'Идемпотент санхүү', text: 'Давхар төлөлт, давхар callback санхүүгийн үр дүн үүсгэхгүй. Ledger-д суурилсан үлдэгдэл.' },
  { title: '4 үйлчилгээ', text: 'Excel+SMS, API+SMS, eBarimt API, POS — хэрэгтэйгээ л асаана. Хэрэглээ бүр ил тод хэмжигдэнэ.' },
  { title: 'Audit + эрхийн хяналт', text: 'Үйлдэл бүр хэн/хэзээ/юу гэдгээр бүртгэгдэнэ. Owner, Operator, Accountant, Viewer эрхүүд.' },
];

export default function LandingPage() {
  return (
    <div className="bg-white">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-200/60/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-content items-center justify-between px-5">
          <Logo />
          <nav className="hidden items-center gap-7 text-sm font-medium text-navy-700 md:flex" aria-label="Үндсэн цэс">
            <a href="#how" className="hover:text-indigo-600">Хэрхэн ажилладаг</a>
            <a href="#use-cases" className="hover:text-indigo-600">Хэнд зориулагдсан</a>
            <a href="#pricing" className="hover:text-indigo-600">Үнэ</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="btn-secondary hidden sm:inline-flex">Нэвтрэх</Link>
            <Link href="/register" className="btn-primary">Үнэгүй эхлэх</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-navy-900 text-white">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              'radial-gradient(600px 300px at 80% 20%, rgba(18,161,134,0.35), transparent 60%), radial-gradient(500px 260px at 15% 85%, rgba(51,186,160,0.18), transparent 60%)',
          }}
        />
        <div className="relative mx-auto grid max-w-content items-center gap-12 px-5 py-20 lg:grid-cols-2 lg:py-28">
          <div className="animate-fade-up">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-teal-400/30 bg-teal-400/10 px-3.5 py-1.5 text-[13px] font-semibold text-teal-300">
              🇲🇳 Монголын бизнест зориулав
            </p>
            <h1 className="text-4xl font-extrabold leading-[1.12] tracking-tight sm:text-5xl">
              Нэхэмжлэхээс <span className="text-teal-300">eBarimt</span> хүртэл —<br className="hidden sm:block" /> авлага хураалтаа автоматжуул
            </h1>
            <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-navy-200">
              Excel-ээр мянга мянган нэхэмжлэх үүсгэж, төлбөрийн линк SMS-ээр илгээж, QPay/банкны төлөлтийг хүлээн авч,
              eBarimt-ийг автоматаар үүсгэ. Бүгдийг нэг самбараас.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href="/register" className="btn-primary px-6 py-3 text-[15px]">
                Үнэгүй туршиж эхлэх →
              </Link>
              <Link href="/login" className="btn border border-white/20 bg-white/5 px-6 py-3 text-[15px] text-white hover:bg-white/10">
                Демо самбар үзэх
              </Link>
            </div>
            <p className="mt-4 text-[13px] text-navy-300">Карт шаардлагагүй · 5 минутад тохируулна · Монгол хэл дээр</p>
          </div>

          {/* Hero mock dashboard card */}
          <div className="relative hidden animate-fade-up lg:block" aria-hidden="true">
            <div className="card rotate-1 p-5 text-ink shadow-lift">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-bold text-slate-900">Энэ сарын цугласан</p>
                <span className="rounded-full bg-teal-50 px-2.5 py-1 text-[12px] font-bold text-indigo-700">+18%</span>
              </div>
              <p className="text-3xl font-extrabold tracking-tight text-navy-900">12,480,000₮</p>
              <div className="mt-4 flex items-end gap-1.5" style={{ height: 90 }}>
                {[35, 55, 40, 70, 52, 78, 64, 90, 72, 60, 84, 96].map((h, i) => (
                  <div key={i} className="flex-1 rounded-t-md bg-gradient-to-t from-teal-500/80 to-teal-300" style={{ height: `${h}%` }} />
                ))}
              </div>
              <div className="mt-5 space-y-2.5 border-t border-slate-200/60 pt-4 text-[13px]">
                {[
                  ['INV-10041 · Сараа Болд', 'Төлсөн', 'text-indigo-600'],
                  ['INV-10040 · Төмөр Баяр', 'Нээсэн', 'text-indigo-600'],
                  ['INV-10039 · Наран Дорж', 'eBarimt үүссэн', 'text-indigo-600'],
                ].map(([l, s, c]) => (
                  <div key={l as string} className="flex items-center justify-between">
                    <span className="text-navy-700">{l}</span>
                    <span className={`font-semibold ${c}`}>{s}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3 steps */}
      <section id="how" className="mx-auto max-w-content px-5 py-20">
        <h2 className="text-center text-3xl font-extrabold tracking-tight text-navy-900">30 секундэд ойлгох 3 алхам</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-[15.5px] text-slate-500">
          Импортлох → илгээх → төлбөр, eBarimt-ээ хянах. Операторын ажил 5 алхмаас хэтрэхгүй.
        </p>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="card group p-7 transition hover:-translate-y-1 hover:shadow-lift">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-3xl">{s.icon}</span>
                <span className="text-[13px] font-black tracking-widest text-navy-200 group-hover:text-teal-400">{s.n}</span>
              </div>
              <h3 className="text-lg font-bold text-slate-900">{s.title}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-slate-500">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Use cases */}
      <section id="use-cases" className="bg-surface py-20">
        <div className="mx-auto max-w-content px-5">
          <h2 className="text-center text-3xl font-extrabold tracking-tight text-navy-900">Хэнд зориулагдсан бэ?</h2>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {USE_CASES.map((u) => (
              <div key={u.title} className="card flex gap-4 p-6">
                <span className="text-2xl">{u.icon}</span>
                <div>
                  <h3 className="font-bold text-slate-900">{u.title}</h3>
                  <p className="mt-1 text-[14px] leading-relaxed text-slate-500">{u.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-content px-5 py-20">
        <h2 className="text-center text-3xl font-extrabold tracking-tight text-navy-900">
          Найдвартай байдлыг <span className="text-indigo-600">архитектурын түвшинд</span> шийдсэн
        </h2>
        <div className="mt-12 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="border-l-2 border-teal-400 pl-4">
              <h3 className="font-bold text-slate-900">{f.title}</h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-slate-500">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-surface py-20">
        <div className="mx-auto max-w-content px-5">
          <h2 className="text-center text-3xl font-extrabold tracking-tight text-navy-900">Хэрэглээндээ тохирсон үнэ</h2>
          <p className="mx-auto mt-3 max-w-lg text-center text-[15.5px] text-slate-500">
            Суурь хураамжгүй — илгээлт бүр 100₮, eBarimt багтсан.
          </p>
          <div className="mt-10">
            <PricingCalculator />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-navy-900 py-16 text-center text-white">
        <div className="mx-auto max-w-2xl px-5">
          <h2 className="text-3xl font-extrabold tracking-tight">Өнөөдөр л эхэл</h2>
          <p className="mt-3 text-navy-200">Бүртгүүлээд 5 минутын дотор эхний нэхэмжлэхээ илгээ.</p>
          <Link href="/register" className="btn-primary mt-7 inline-flex px-8 py-3.5 text-[15px]">
            Үнэгүй бүртгүүлэх →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200/60 bg-white">
        <div className="mx-auto flex max-w-content flex-col items-center justify-between gap-4 px-5 py-8 text-[13.5px] text-slate-500 sm:flex-row">
          <Logo />
          <nav className="flex flex-wrap items-center gap-5" aria-label="Хөл цэс">
            <a href="/health/live" className="hover:text-indigo-600">Статус</a>
            <Link href="/login" className="hover:text-indigo-600">Нэвтрэх</Link>
          </nav>
          <p>© {new Date().getFullYear()} msgbill.mn — Message Billing Service</p>
        </div>
      </footer>
    </div>
  );
}
