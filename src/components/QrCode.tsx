import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/** A QR code as one SVG path: dark squares on white in both themes, so any camera can read it. */
export function QrCode({ value, size = 200, label }: { value: string; size?: number; label: string }) {
  const { path, count } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return { path: d, count: n };
  }, [value]);
  // A quiet zone of 4 modules all round, as scanners expect.
  const box = count + 8;
  return (
    <svg className="qr-code" width={size} height={size} viewBox={`-4 -4 ${box} ${box}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect x={-4} y={-4} width={box} height={box} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
