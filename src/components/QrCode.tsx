import qrcode from 'qrcode-generator';
import { useMemo } from 'react';

/** A QR code for `value`, drawn as crisp SVG squares in the current text colour. */
export function QrCode({ value, size = 220, label }: { value: string; size?: number; label: string }) {
  const { count, path } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return { count: n, path: d };
  }, [value]);
  const quiet = 2;
  return (
    <svg className="qr" width={size} height={size} viewBox={`${-quiet} ${-quiet} ${count + quiet * 2} ${count + quiet * 2}`} role="img" aria-label={label}>
      <rect x={-quiet} y={-quiet} width={count + quiet * 2} height={count + quiet * 2} fill="#fff" />
      <path d={path} fill="#0a0a0a" shapeRendering="crispEdges" />
    </svg>
  );
}
