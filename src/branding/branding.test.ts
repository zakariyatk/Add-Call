import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generatedFiles, headTags, manifest } from '../../vite.brand';
import { brand, type Palette } from './brand.config';
import { logoSvg } from './logo';
import { contrast, themeCss } from './theme';

const HEX = /^#[0-9A-F]{6}$/i;

describe('branding config', () => {
  it('names the product Add Call', () => {
    expect(brand.name).toBe('Add Call');
    expect(brand.shortName.length).toBeLessThanOrEqual(12);
  });

  it('uses #RRGGBB for every colour', () => {
    for (const palette of [brand.colors.light, brand.colors.dark]) for (const v of Object.values(palette)) expect(v).toMatch(HEX);
    for (const logo of [brand.logo.light, brand.logo.dark]) for (const v of Object.values(logo)) expect(v).toMatch(HEX);
  });

  it.each(['light', 'dark'] as const)('meets WCAG AA contrast in %s mode', (mode) => {
    const p: Palette = brand.colors[mode];
    expect(contrast(p.text, p.background)).toBeGreaterThanOrEqual(7);
    expect(contrast(p.text, p.surface)).toBeGreaterThanOrEqual(7);
    expect(contrast(p.textMuted, p.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.textMuted, p.surfaceMuted)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.accentInk, p.accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.dangerInk, p.danger)).toBeGreaterThanOrEqual(4.5);
    // The accent is used for icons, focus rings and small labels on surfaces.
    expect(contrast(p.accent, p.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.danger, p.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['light', 'dark'] as const)('keeps the logo legible in %s mode', (mode) => {
    const c = brand.logo[mode];
    expect(contrast(c.glyph, c.tile)).toBeGreaterThanOrEqual(7);
    expect(contrast(c.plus, c.tile)).toBeGreaterThanOrEqual(3);
    expect(contrast(c.tile, brand.colors[mode].background)).toBeGreaterThanOrEqual(3);
  });
});

describe('logo', () => {
  it('draws the mark with the configured colours', () => {
    const svg = logoSvg(brand);
    expect(svg).toContain(brand.logo.light.tile);
    expect(svg).toContain(brand.logo.light.plus);
    expect(svg).toContain('aria-hidden="true"');
  });

  it('is named when given a title, with markup escaped', () => {
    expect(logoSvg(brand, { title: 'A <b> & C' })).toContain('<title>A &#60;b&#62; &#38; C</title>');
  });

  it('makes the favicon follow the OS theme', () => {
    const svg = logoSvg(brand, { adaptive: true });
    expect(svg).toContain('prefers-color-scheme:dark');
    expect(svg).toContain(brand.logo.dark.tile);
  });

  it('fills the full square for app icons', () => {
    expect(logoSvg(brand, { variant: 'icon' })).toContain(`<rect width="64" height="64" fill="${brand.logo.light.tile}"/>`);
  });
});

describe('page metadata', () => {
  const head = headTags(brand);

  it('puts the product name in the title and app metadata', () => {
    expect(head).toContain('<title>Add Call</title>');
    expect(head).toContain('<meta name="application-name" content="Add Call" />');
    expect(head).toContain('<meta name="apple-mobile-web-app-title" content="Add Call" />');
    expect(head).toContain('<meta property="og:site_name" content="Add Call" />');
    expect(head).toContain(`content="${brand.colors.dark.background}"`);
  });

  it('inlines the theme tokens and the storage key used by settings', () => {
    expect(head).toContain(themeCss(brand));
    expect(head).toContain(`"${brand.storageKey}.settings"`);
  });

  it('builds the web app manifest from the config', () => {
    const m = manifest(brand);
    expect(m.name).toBe('Add Call');
    expect(m.short_name).toBe(brand.shortName);
    expect(m.icons.some((i) => i.purpose === 'maskable')).toBe(true);
    expect(JSON.parse(generatedFiles(brand)['manifest.webmanifest'].body).name).toBe('Add Call');
  });

  it('ships every icon the metadata points to', () => {
    const icons = resolve(import.meta.dirname, '../../public');
    const paths = [...head.matchAll(/(?:href|content)="(\/icons\/[^"]+)"/g), ...manifest(brand).icons.map((i) => [i.src, i.src])]
      .map((m) => m[1])
      .filter((p) => p.startsWith('/icons/'));
    expect(paths.length).toBeGreaterThan(3);
    for (const p of paths) expect(statSync(join(icons, p)).size).toBeGreaterThan(0);
  });
});

describe('naming', () => {
  // Built from parts so this test file does not match itself.
  const legacy = new RegExp(['Connect', 'Call'].join('\\s*'), 'i');
  const root = resolve(import.meta.dirname, '../..');
  const skip = new Set(['node_modules', 'dist', '.git', 'icons']);

  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      if (skip.has(name)) return [];
      const p = join(dir, name);
      return statSync(p).isDirectory() ? files(p) : [p];
    });
  }

  it('has no leftovers of the temporary product name', () => {
    const offenders = files(root).filter((f) => !/\.(png|ico)$/.test(f) && legacy.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
