/**
 * Regenerates the PNG app icons in public/icons/ from the branding config.
 * Run after changing logo colours:  npm run icons
 * (The SVG favicon and the manifest are generated on the fly and need no step.)
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { brand } from '../src/branding/brand.config';
import { logoSvg } from '../src/branding/logo';

const out = resolve(import.meta.dirname, '../public/icons');
mkdirSync(out, { recursive: true });

const icons: { file: string; size: number; variant: 'mark' | 'icon' }[] = [
  { file: 'favicon-32.png', size: 32, variant: 'mark' },
  { file: 'apple-touch-icon.png', size: 180, variant: 'icon' },
  { file: 'icon-192.png', size: 192, variant: 'mark' },
  { file: 'icon-512.png', size: 512, variant: 'mark' },
  { file: 'icon-maskable-512.png', size: 512, variant: 'icon' },
];

for (const { file, size, variant } of icons) {
  const svg = logoSvg(brand, { variant });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(resolve(out, file), png);
  console.log(`public/icons/${file}  ${size}×${size}`);
}

// Android launcher icons (android/ exists once `npx cap add android` has run).
const res = resolve(import.meta.dirname, '../android/app/src/main/res');
if (existsSync(res)) {
  const tile = logoSvg(brand, { variant: 'icon' });
  const background = /<rect[^>]*fill="([^"]+)"/.exec(tile)?.[1] ?? '#ffffff';
  // Adaptive icons crop to the middle 72 of 108dp, so the mark sits smaller on a transparent layer.
  const foreground = tile.replace(/<rect[^>]*\/>/, '').replace(/scale\([\d.]+\)/, 'scale(0.56)');
  const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  const render = (svg: string, size: number) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  for (const [density, scale] of Object.entries(densities)) {
    const dir = resolve(res, `mipmap-${density}`);
    writeFileSync(resolve(dir, 'ic_launcher.png'), render(tile, 48 * scale));
    writeFileSync(resolve(dir, 'ic_launcher_round.png'), render(tile, 48 * scale));
    writeFileSync(resolve(dir, 'ic_launcher_foreground.png'), render(foreground, 108 * scale));
  }
  writeFileSync(
    resolve(res, 'values/ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${background}</color>\n</resources>\n`,
  );
  console.log(`android launcher icons (background ${background})`);
}
