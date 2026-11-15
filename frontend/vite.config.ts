import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served by FastAPI under /ui/ (see src/spaceapp_logar/main.py).
// Dev: `npm run dev` proxies /v1 and /health to the backend.
// Override the backend with VITE_BACKEND=http://127.0.0.1:8101 (agents use their own port).
const backend = process.env.VITE_BACKEND ?? 'http://127.0.0.1:8000';

export default defineConfig({
  base: '/ui/',
  plugins: [react()],
  server: {
    port: Number(process.env.VITE_PORT ?? 5173),
    strictPort: true,
    proxy: {
      '/v1': backend,
      '/health': backend,
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
});
