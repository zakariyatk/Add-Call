/**
 * Add Call — branding configuration.
 *
 * This is the single source of truth for the product name, logo colours and
 * theme. Everything else derives from it:
 *   - the browser title, meta tags, theme-color and web app manifest (vite.brand.ts)
 *   - the favicon and app icon SVG (src/branding/logo.ts)
 *   - the CSS colour tokens for light and dark mode (src/branding/theme.ts)
 *   - every place the UI shows the product name
 *
 * After changing logo colours, run `npm run icons` to regenerate the PNG icons
 * in public/icons/ (the SVG favicon and manifest update on their own).
 */

export type ThemeMode = 'system' | 'light' | 'dark';

/** Colour tokens for one appearance (light or dark). */
export interface Palette {
  /** Page background. */
  background: string;
  /** Cards, sidebar, inputs. */
  surface: string;
  /** Hover / pressed / subtle fills. */
  surfaceMuted: string;
  border: string;
  text: string;
  textMuted: string;
  /** The one distinctive brand colour. */
  accent: string;
  /** Text and icons drawn on top of the accent. */
  accentInk: string;
  /** Functional colour for ending calls and errors — not a brand colour. */
  danger: string;
  dangerInk: string;
}

/** Colours of the logo mark (speech-bubble tile, "A" glyph, "+" crossbar). */
export interface LogoColors {
  tile: string;
  glyph: string;
  plus: string;
}

export interface BrandConfig {
  /** Product name, shown everywhere. */
  name: string;
  /** Name under the home-screen icon; keep to ~12 characters. */
  shortName: string;
  tagline: string;
  /** Used for <meta name="description"> and the manifest. */
  description: string;
  version: string;
  /** Where the website lives (links to the privacy policy point here, also from the apps). */
  website: string;
  /** Who runs the service, as named in the privacy policy. */
  operator: string;
  /** Where people write about privacy, account deletion and reports. */
  supportEmail: string;
  /** Last change to the privacy policy (YYYY-MM-DD). */
  privacyUpdated: string;
  /** Prefix for localStorage keys, so a rename never collides with old data. */
  storageKey: string;
  logo: { light: LogoColors; dark: LogoColors };
  colors: { light: Palette; dark: Palette };
  theme: {
    defaultMode: ThemeMode;
    /** Corner radius for cards and controls, in px. */
    radius: number;
    fontFamily: string;
  };
}

export const brand: BrandConfig = {
  name: 'Add Call',
  shortName: 'Add Call',
  tagline: 'Calls, simply added.',
  description: 'Add Call is a web calling app for clear, fast voice and video calls right from your browser.',
  version: '0.1.0',
  website: 'https://call.adddots.com',
  operator: 'Adddots',
  supportEmail: 'support@adddots.com',
  privacyUpdated: '2026-10-18',
  storageKey: 'addcall',

  logo: {
    light: { tile: '#0A0A0A', glyph: '#FFFFFF', plus: '#7B61FF' },
    dark: { tile: '#FAFAFA', glyph: '#0A0A0A', plus: '#5B3DF5' },
  },

  colors: {
    light: {
      background: '#FAFAFA',
      surface: '#FFFFFF',
      surfaceMuted: '#F2F2F3',
      border: '#E4E4E7',
      text: '#0A0A0A',
      textMuted: '#62626A',
      accent: '#5B3DF5',
      accentInk: '#FFFFFF',
      danger: '#D93036',
      dangerInk: '#FFFFFF',
    },
    dark: {
      background: '#0A0A0A',
      surface: '#141415',
      surfaceMuted: '#1E1E20',
      border: '#2A2A2E',
      text: '#FAFAFA',
      textMuted: '#A1A1AA',
      accent: '#8C7BFF',
      accentInk: '#0A0A0A',
      danger: '#F0545A',
      dangerInk: '#0A0A0A',
    },
  },

  theme: {
    defaultMode: 'system',
    radius: 14,
    fontFamily: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  },
};
