import type { BrandConfig, LogoColors } from './brand.config';

/*
 * The Add Call mark: a speech-bubble tile (communication) holding an "A" whose
 * crossbar is a "+" (add). Drawn on a 64×64 grid so it stays crisp from a
 * 16px favicon up to a 512px app icon.
 */

const BUBBLE =
  'M18 4H46A14 14 0 0 1 60 18V40A14 14 0 0 1 46 54H28L15.5 61.5L18 54A14 14 0 0 1 4 40V18A14 14 0 0 1 18 4Z';
const A_GLYPH = 'M19.5 45L32 15.5L44.5 45';
const PLUS = 'M32 30.5V41.5M26.5 36H37.5';

const escapeXml = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

function glyphs(c: LogoColors, scale = 1): string {
  const t = scale === 1 ? '' : ` transform="translate(32 32) scale(${scale}) translate(-32 -32)"`;
  return (
    `<g${t} fill="none" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="${A_GLYPH}" stroke="${c.glyph}" stroke-width="6.5"/>` +
    `<path d="${PLUS}" stroke="${c.plus}" stroke-width="4.5"/>` +
    `</g>`
  );
}

export interface LogoOptions {
  /**
   * `mark` — the speech-bubble mark on a transparent background (favicon, in-app logo).
   * `icon` — a full-bleed square tile for app icons and Apple touch icons, with the
   *          glyph inside the maskable safe zone.
   */
  variant?: 'mark' | 'icon';
  /** Colours to draw with. In the app these can be CSS variables such as `var(--logo-tile)`. */
  colors?: LogoColors;
  /** Adds a dark-mode <style> so a standalone SVG file (the favicon) follows the OS theme. */
  adaptive?: boolean;
  /** Accessible name; omit for a decorative mark. */
  title?: string;
}

export function logoSvg(brand: BrandConfig, opts: LogoOptions = {}): string {
  const { variant = 'mark', adaptive = false, title } = opts;
  const c = opts.colors ?? brand.logo.light;
  const a11y = title ? ` role="img" aria-label="${escapeXml(title)}"` : ' aria-hidden="true"';
  const titleEl = title ? `<title>${escapeXml(title)}</title>` : '';

  if (variant === 'icon') {
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"${a11y}>${titleEl}` +
      `<rect width="64" height="64" fill="${c.tile}"/>${glyphs(c, 0.82)}</svg>`
    );
  }

  if (adaptive) {
    // Classes let a media query recolour the favicon for dark browser chrome.
    const d = brand.logo.dark;
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"${a11y}>${titleEl}` +
      `<style>.t{fill:${c.tile}}.g{stroke:${c.glyph}}.p{stroke:${c.plus}}` +
      `@media (prefers-color-scheme:dark){.t{fill:${d.tile}}.g{stroke:${d.glyph}}.p{stroke:${d.plus}}}</style>` +
      `<path class="t" d="${BUBBLE}"/>` +
      `<g fill="none" stroke-linecap="round" stroke-linejoin="round">` +
      `<path class="g" d="${A_GLYPH}" stroke-width="6.5"/><path class="p" d="${PLUS}" stroke-width="4.5"/></g></svg>`
    );
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"${a11y}>${titleEl}` +
    `<path d="${BUBBLE}" fill="${c.tile}"/>${glyphs(c)}</svg>`
  );
}
