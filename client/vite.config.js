// ─────────────────────────────────────────────────────────────────────────────
// Vite Configuration – MediShield AI Client
// Proxies /api and /uploads requests to the Express backend so the React dev
// server and the API share the same origin during development.
// ─────────────────────────────────────────────────────────────────────────────
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  server: {
    port: 3000,
    proxy: {
      // Forward all /api/* calls to the Express server
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      // Forward /uploads/* so profile photos load correctly
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});
