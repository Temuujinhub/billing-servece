import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'billingservice.mn — Нэхэмжлэхээс eBarimt хүртэл',
    template: '%s · billingservice.mn',
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
