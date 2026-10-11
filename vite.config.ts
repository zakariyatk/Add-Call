/// <reference types="vitest/config" />
import type { Server } from 'node:http';
import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { brandPlugin } from './vite.brand';
import { createBackend } from './server/app.ts';

/**
 * Runs the backend (accounts API + signaling) inside `vite` and `vite preview`,
 * so one command starts everything. Dev accounts live in data/dev.db.
 */
function backendPlugin(): Plugin {
  const mount = (middlewares: Connect.Server, httpServer: Server | null) => {
    const backend = createBackend({ databasePath: process.env.DATABASE_PATH ?? 'data/dev.db' });
    middlewares.use((req, res, next) => {
      backend.handleApi(req, res).then((handled) => handled || next(), next);
    });
    if (httpServer) {
      backend.attach(httpServer);
      httpServer.on('close', () => backend.close());
    }
  };
  return {
    name: 'add-call-backend',
    configureServer: (server) => mount(server.middlewares, server.httpServer as Server | null),
    configurePreviewServer: (server) => mount(server.middlewares, server.httpServer as Server | null),
  };
}

export default defineConfig({
  plugins: [react(), brandPlugin(), backendPlugin()],
  server: { port: 5174 },
  preview: { port: 4174 },
  build: { outDir: 'dist', sourcemap: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
