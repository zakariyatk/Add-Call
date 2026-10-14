import type { CapacitorConfig } from '@capacitor/cli';

/*
 * The Android (and later iOS) app: the same React app from dist/, inside a
 * native shell. Build with `npm run android` (see README → Android app).
 */
const config: CapacitorConfig = {
  appId: 'com.adddots.call',
  appName: 'Add Call',
  webDir: 'dist',
  android: {
    // The app is served from https://localhost inside the WebView.
    allowMixedContent: false,
  },
  plugins: {
    // Pad the app clear of the status and navigation bars (see src/main.tsx).
    SystemBars: { insetsHandling: 'native', initialViewportFitValueHint: 'auto' },
  },
};

export default config;
