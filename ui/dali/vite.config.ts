import path from 'node:path';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

/**
 * La UI de Dali se sirve desde lila en la RAÍZ de `dali.constroad.com`
 * (`src/api/dali-ui.ts`): `base` absoluta, porque con una relativa un enlace
 * profundo (`/servicios/colocacion`) pedía los assets en `/servicios/assets/…`
 * y recibía el index. En desarrollo, `/api` va al lila local.
 */
export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss(), svgr()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: {
    port: 5180,
    proxy: { '/api': { target: process.env.VITE_API_TARGET || 'http://127.0.0.1:3111', changeOrigin: false } },
  },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 700 },
});
