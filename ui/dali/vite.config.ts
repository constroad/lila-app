import path from 'node:path';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

/**
 * La UI de Dali se sirve desde lila SIEMPRE bajo `/dali/` (en
 * `dali.constroad.com`, la raíz redirige ahí): `base` absoluta, porque con una
 * relativa un enlace profundo (`/dali/servicios/colocacion`) pedía los assets
 * en `/dali/servicios/assets/…` y recibía el index. En desarrollo, `/api` va
 * al lila local.
 */
export default defineConfig({
  base: '/dali/',
  plugins: [react(), tailwindcss(), svgr()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: {
    port: 5180,
    proxy: { '/api': { target: process.env.VITE_API_TARGET || 'http://127.0.0.1:3111', changeOrigin: false } },
  },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 700 },
});
