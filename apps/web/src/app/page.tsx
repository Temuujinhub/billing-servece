import { CinematicLanding } from '@/components/landing/cinematic';

/**
 * Landing v2 (B-59) — «cinematic» бараан загвар. Бүх хөдөлгөөнт хэсэг
 * components/landing/cinematic.tsx-д (client); энэ файл server shell хэвээр
 * тул metadata/SEO layout-аас ирнэ, хуудас урьдчилан render хийгдэнэ.
 */
export default function LandingPage() {
  return <CinematicLanding />;
}
