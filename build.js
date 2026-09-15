import esbuild from 'esbuild';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * LA UI DE DALI (`ui/dali`, Vite) se compila en el mismo build y lila la
 * sirve como estáticos (spec DALI §2.1). `--include=dev` porque el deploy corre
 * con NODE_ENV=production y `npm ci` omitiría vite y typescript. Si la UI no
 * compila, lila igual se despliega (la API de WhatsApp no depende de ella) y
 * `/dali` responde que no está compilada: el aviso queda en el log del deploy.
 */
const buildUiDali = () => {
  const cwd = path.join(__dirname, 'ui', 'dali');
  try {
    execSync('npm ci --include=dev --no-audit --no-fund', { cwd, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'development' } });
    execSync('npm run build', { cwd, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' } });
    console.log('✅ UI de Dali compilada (ui/dali/dist)');
  } catch (error) {
    console.error('⚠️  La UI de Dali NO se compiló; lila sigue sin ella:', error instanceof Error ? error.message : error);
  }
};

buildUiDali();

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
      // Modelo generativo local (binario nativo + Metal): nunca dentro del bundle.
      'node-llama-cpp',
    ],
  })
  .then(() => console.log('✅ Build completed successfully'))
  .catch((err) => {
    console.error('Build failed:', err);
    process.exit(1);
  });
