import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/manrope';
import './globals.css';

export const metadata: Metadata = {
  // Канон домэйн — богино линкийн хаягаас (bil.mn) нээгдсэн төлбөрийн хуудас ч
  // og/canonical мета-даа msgbill.mn-ийг заана (индексжилт хоёр хуваагдахгүй).
  metadataBase: new URL('https://msgbill.mn'),
  openGraph: {
    type: 'website',
    siteName: 'msgbill.mn — Message Billing Service',
    locale: 'mn_MN',
  },
  title: {
    default: 'msgbill.mn — Message Billing Service | Нэхэмжлэхээс eBarimt хүртэл',
    template: '%s · msgbill.mn',
  },
  description:
    'Нэхэмжлэх, төлбөр хураалт, SMS/payment link, eBarimt-ийг нэг дор автоматжуулсан Монголын B2B SaaS платформ.',
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0B1E33',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="mn">
      <body>{children}</body>
    </html>
  );
}
