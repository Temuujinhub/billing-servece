'use client';

import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

/**
 * eBarimt-ийн qrData-г иргэн ebarimt аппликейшнээрээ уншуулж баримтаа
 * баталгаажуулах QR зураг болгон зурна. qrData нь ТЕГ-ийн урт raw мөр тул
 * error-correction L түвшинд (нягтрал багатай, уншигдац сайтай) рэндэрлэнэ.
 * Хадгалах хугацаа (EBARIMT_QR_RETENTION_HOURS) дууссан баримтад qrData=null
 * ирдэг — тэр үед юу ч зурахгүй.
 */
export function EbarimtQr({ data, size = 168, className = '' }: { data: string | null | undefined; size?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (ref.current && data) {
      QRCode.toCanvas(ref.current, data, {
        width: size,
        margin: 1,
        errorCorrectionLevel: 'L',
        color: { dark: '#0B1E33' },
      }).catch(() => undefined);
    }
  }, [data, size]);

  if (!data) return null;
  return (
    <div className={`inline-flex flex-col items-center gap-1.5 ${className}`}>
      <canvas ref={ref} width={size} height={size} className="rounded-lg bg-white p-1 shadow-sm" aria-label="eBarimt QR код" />
      <p className="text-[11.5px] text-slate-500">ebarimt аппаар уншуулна уу</p>
    </div>
  );
}
