/**
 * Regenerates the PNG app icons in public/icons/ from the branding config.
 * Run after changing logo colours:  npm run icons
 * (The SVG favicon and the manifest are generated on the fly and need no step.)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
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
