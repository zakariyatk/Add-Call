/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { brandPlugin } from './vite.brand';

// A static app (served from the root of call.adddots.com): accounts, calls and
// presence live in Supabase, audio and video in LiveKit.
export default defineConfig({
  plugins: [react(), brandPlugin()],
  server: { port: 5174 },
  preview: { port: 4174 },
  build: { outDir: 'dist' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
