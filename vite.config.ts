/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { brandPlugin } from './vite.brand';

export default defineConfig({
  plugins: [react(), brandPlugin()],
  server: { port: 5174 },
  build: { outDir: 'dist', sourcemap: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
