import esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

esbuild
  .build({
    entryPoints: [path.join(__dirname, 'src/index.ts')],
    outdir: path.join(__dirname, 'dist'),
    bundle: true,
    platform: 'node',
    target: 'es2020',
    format: 'esm',
    sourcemap: true,
    external: [
      'puppeteer',
      'node-cron',
      'express',
      '@anthropic-ai/sdk',
      'winston',
      '@whiskeysockets/baileys',
      '@hapi/boom',
      'cron',
      'axios',
      'joi',
      'cors',
      'helmet',
      'express-rate-limit',
      'handlebars',
      'pdf-lib',
      'pdfjs-dist',
      'pdfjs-dist/legacy/build/pdf.mjs',
      'qrcode',
      'qrcode-terminal',
      'multer',
      'swagger-ui-express',
      '@napi-rs/canvas',
    ],
  })
  .then(() => console.log('✅ Build completed successfully'))
  .catch((err) => {
    console.error('Build failed:', err);
    process.exit(1);
  });
