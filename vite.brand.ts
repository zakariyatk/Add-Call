import type { Plugin } from 'vite';
import { brand, type BrandConfig } from './src/branding/brand.config';
import { logoSvg } from './src/branding/logo';
import { themeCss } from './src/branding/theme';

/*
 * Applies src/branding/brand.config.ts to everything outside the React app:
 * <title>, meta tags, theme-color, inlined colour tokens, the SVG favicon and
 * the web app manifest. Generated files are served in dev and emitted at build,
 * so they can never drift from the config.
 */

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);

export function manifest(b: BrandConfig) {
  return {
    name: b.name,
    short_name: b.shortName,
    description: b.description,
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: b.colors.light.background,
    theme_color: b.colors.light.background,
    icons: [
      { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

export function headTags(b: BrandConfig): string {
  return [
    `<title>${esc(b.name)}</title>`,
    `<meta name="description" content="${esc(b.description)}" />`,
    `<meta name="application-name" content="${esc(b.name)}" />`,
    `<meta name="mobile-web-app-capable" content="yes" />`,
    `<meta name="apple-mobile-web-app-capable" content="yes" />`,
    `<meta name="apple-mobile-web-app-status-bar-style" content="default" />`,
    `<meta name="format-detection" content="telephone=no" />`,
    `<meta name="apple-mobile-web-app-title" content="${esc(b.shortName)}" />`,
    `<meta name="theme-color" media="(prefers-color-scheme: light)" content="${b.colors.light.background}" />`,
    `<meta name="theme-color" media="(prefers-color-scheme: dark)" content="${b.colors.dark.background}" />`,
    `<meta property="og:title" content="${esc(b.name)}" />`,
    `<meta property="og:site_name" content="${esc(b.name)}" />`,
    `<meta property="og:description" content="${esc(b.description)}" />`,
    `<meta property="og:image" content="/icons/icon-512.png" />`,
    `<link rel="icon" href="/favicon.svg" type="image/svg+xml" />`,
    `<link rel="icon" href="/icons/favicon-32.png" sizes="32x32" type="image/png" />`,
    `<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />`,
    `<link rel="manifest" href="/manifest.webmanifest" />`,
    `<style id="brand-tokens">${themeCss(b)}</style>`,
    // Apply the saved theme before first paint so there is no flash of the wrong one.
    `<script>try{var t=JSON.parse(localStorage.getItem(${JSON.stringify(`${b.storageKey}.settings`)})||'{}').theme;` +
      `if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}</script>`,
  ].join('\n    ');
}

export function generatedFiles(b: BrandConfig): Record<string, { body: string; type: string }> {
  return {
    'favicon.svg': { body: logoSvg(b, { adaptive: true, title: b.name }), type: 'image/svg+xml' },
    'manifest.webmanifest': { body: JSON.stringify(manifest(b), null, 2), type: 'application/manifest+json' },
  };
}

export function brandPlugin(b: BrandConfig = brand): Plugin {
  return {
    name: 'add-call-branding',
    transformIndexHtml: (html) => {
      if (!html.includes('<!-- brand:head -->')) throw new Error('index.html is missing the <!-- brand:head --> marker');
      return html.replace('<!-- brand:head -->', headTags(b));
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const file = generatedFiles(b)[(req.url ?? '').split('?')[0].replace(/^\//, '')];
        if (!file) return next();
        res.setHeader('Content-Type', file.type);
        res.end(file.body);
      });
    },
    generateBundle() {
      for (const [fileName, file] of Object.entries(generatedFiles(b))) {
        this.emitFile({ type: 'asset', fileName, source: file.body });
      }
    },
  };
}
