import type { BrandConfig, LogoColors, Palette } from './brand.config';

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

function vars(p: Palette, logo: LogoColors): string {
  const colors = Object.entries(p).map(([k, v]) => `--${kebab(k)}:${v}`);
  const mark = Object.entries(logo).map(([k, v]) => `--logo-${k}:${v}`);
  return [...colors, ...mark].join(';');
}

/**
 * CSS custom properties for both appearances, generated from the branding
 * config. Light is the default; dark applies when the OS asks for it (unless
 * the user picked light) or when the user picked dark; `.always-dark` pins a
 * subtree to the dark palette. Inlined into
 * index.html at build time so the first paint is already on-brand.
 */
export function themeCss(brand: BrandConfig): string {
  const { light, dark } = brand.colors;
  const shared = `--radius:${brand.theme.radius}px;--font:${brand.theme.fontFamily}`;
  const lightVars = vars(light, brand.logo.light);
  const darkVars = vars(dark, brand.logo.dark);
  return (
    `:root{color-scheme:light;${shared};${lightVars}}` +
    `@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;${darkVars}}}` +
    `:root[data-theme="dark"]{color-scheme:dark;${darkVars}}` +
    // Surfaces that stay dark in both themes (sign-in hero, call screen).
    `.always-dark{color-scheme:dark;${darkVars}}`
  );
}

/** Logo colours that follow the active theme, for the in-app mark. */
export const themedLogoColors: LogoColors = {
  tile: 'var(--logo-tile)',
  glyph: 'var(--logo-glyph)',
  plus: 'var(--logo-plus)',
};

/** WCAG relative luminance of a #RRGGBB colour. */
export function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Expected #RRGGBB, got ${hex}`);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two #RRGGBB colours (1–21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
