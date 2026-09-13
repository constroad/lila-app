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
      'dotenv',
      'fs-extra',
      'mongoose',
      'pino',
      // El clasificador semántico del agente: trae `onnxruntime-node`, con
      // binarios nativos (.node) que esbuild no puede empaquetar. Se importa
      // dinámicamente en runtime desde node_modules, así que no hace falta:
      // afuera del bundle, como puppeteer o baileys. (Deploy fallido 13/09/2026:
      // «No loader is configured for ".node" files».)
      '@huggingface/transformers',
      'onnxruntime-node',
      'sharp',
    ],
  })
  .then(() => console.log('✅ Build completed successfully'))
  .catch((err) => {
    console.error('Build failed:', err);
    process.exit(1);
  });
