import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { createCanvas } from '@napi-rs/canvas';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { config } from '../config/environment.js';

type RenderOptions = {
  page: number;
  scale: number;
  gridSize?: number;
};

function getCacheKey(filePath: string, stat: fs.Stats, page: number, scale: number) {
  const raw = `${filePath}:${stat.size}:${stat.mtimeMs}:${page}:${scale}`;
  return crypto.createHash('sha1').update(raw).digest('hex');
}

function clampScale(value: number) {
  if (Number.isNaN(value)) return 1;
  return Math.min(3, Math.max(0.5, value));
}

export async function getPdfInfo(filePath: string) {
  const buffer = await fs.readFile(filePath);
  const data = new Uint8Array(buffer);
  const task = pdfjsLib.getDocument({ data, disableWorker: true });
  const pdf = await task.promise;
  return {
    pages: pdf.numPages,
  };
}

export async function renderPdfPageToPng(filePath: string, options: RenderOptions) {
  const stat = await fs.stat(filePath);
  const scale = clampScale(options.scale);
  const cacheKey = getCacheKey(filePath, stat, options.page, scale);
  const cacheDir = path.resolve(config.drive.cacheDir, cacheKey);
  const cacheFile = path.join(cacheDir, `page-${options.page}.png`);

  if (await fs.pathExists(cacheFile)) {
    return { cacheFile, fromCache: true };
  }

  await fs.ensureDir(cacheDir);
  const buffer = await fs.readFile(filePath);
  const data = new Uint8Array(buffer);
  const task = pdfjsLib.getDocument({ data, disableWorker: true });
  const pdf = await task.promise;

  if (options.page < 1 || options.page > pdf.numPages) {
    throw new Error('Page out of range');
  }

  const page = await pdf.getPage(options.page);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext('2d');

  await page.render({ canvasContext: ctx, viewport }).promise;
  const pngBuffer = canvas.toBuffer('image/png');
  await fs.writeFile(cacheFile, pngBuffer);

  return { cacheFile, fromCache: false };
}

export async function renderPdfPageToPngWithGrid(filePath: string, options: RenderOptions) {
  const stat = await fs.stat(filePath);
  const scale = clampScale(options.scale);
  const gridSize = options.gridSize && options.gridSize > 0 ? options.gridSize : 50;
  const cacheKey = getCacheKey(filePath, stat, options.page, scale) + `-g${gridSize}`;
  const cacheDir = path.resolve(config.drive.cacheDir, cacheKey);
  const cacheFile = path.join(cacheDir, `page-${options.page}-grid.png`);

  if (await fs.pathExists(cacheFile)) {
    return { cacheFile, fromCache: true };
  }

  await fs.ensureDir(cacheDir);
  const buffer = await fs.readFile(filePath);
  const data = new Uint8Array(buffer);
  const task = pdfjsLib.getDocument({ data, disableWorker: true });
  const pdf = await task.promise;

  if (options.page < 1 || options.page > pdf.numPages) {
    throw new Error('Page out of range');
  }

  const page = await pdf.getPage(options.page);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext('2d');

  await page.render({ canvasContext: ctx, viewport }).promise;

  const step = gridSize * scale;
  ctx.strokeStyle = 'rgba(255,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.font = `${Math.max(10, Math.floor(10 * scale))}px Arial`;
  ctx.fillStyle = 'rgba(255,0,0,0.7)';

  for (let x = 0; x <= canvas.width; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
    ctx.fillText(String(Math.round(x / scale)), x + 2, 12);
  }

  for (let y = 0; y <= canvas.height; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
    const coord = Math.round((canvas.height - y) / scale);
    ctx.fillText(String(coord), 2, y - 2);
  }

  const pngBuffer = canvas.toBuffer('image/png');
  await fs.writeFile(cacheFile, pngBuffer);

  return { cacheFile, fromCache: false };
}
