/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { brandPlugin } from './vite.brand';
import { createSignaling, iceServersFromEnv } from './server/signaling.ts';

/** Runs the signaling WebSocket (/ws) inside `vite` and `vite preview`, so one command starts everything. */
function signalingPlugin(): Plugin {
  const attach = (httpServer: Parameters<ReturnType<typeof createSignaling>['attach']>[0] | null) => {
    if (!httpServer) return;
    const signaling = createSignaling({ iceServers: iceServersFromEnv() });
    signaling.attach(httpServer);
    httpServer.on('close', () => signaling.close());
  };
  return {
    name: 'add-call-signaling',
    configureServer: (server) => attach(server.httpServer as never),
    configurePreviewServer: (server) => attach(server.httpServer as never),
  };
}

export default defineConfig({
  plugins: [react(), brandPlugin(), signalingPlugin()],
  server: { port: 5174 },
  preview: { port: 4174 },
  build: { outDir: 'dist', sourcemap: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
