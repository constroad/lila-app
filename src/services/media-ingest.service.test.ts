/**
 * Tests de integración (sharp + fs reales en tmp) de la normalización de
 * imágenes al ingerir: acota lo que supera el techo, no toca lo optimizado.
 */
import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import path from 'path';
import os from 'os';
import fsExtra from 'fs-extra';
import sharp from 'sharp';

jest.unstable_mockModule('../utils/logger.js', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

type Subject = typeof import('./media-ingest.service.js');
let normalizeImageInPlace: Subject['normalizeImageInPlace'];

const TEST_DIR = path.join(os.tmpdir(), `lila-ingest-test-${process.pid}`);

const writeJpeg = async (name: string, width: number, height: number) => {
  const filePath = path.join(TEST_DIR, name);
  await fsExtra.writeFile(
    filePath,
    await sharp({
      create: { width, height, channels: 3, background: { r: 90, g: 90, b: 120 } },
    })
      .jpeg({ quality: 90 })
      .toBuffer()
  );
  return filePath;
};

beforeAll(async () => {
  ({ normalizeImageInPlace } = await import('./media-ingest.service.js'));
  await fsExtra.ensureDir(TEST_DIR);
});

afterAll(async () => {
  await fsExtra.remove(TEST_DIR);
});

describe('normalizeImageInPlace', () => {
  it('acota una imagen que supera el techo (in-place, atómico) y reporta el delta', async () => {
    const filePath = await writeJpeg('grande.jpg', 4000, 3000);
    const before = (await fsExtra.stat(filePath)).size;

    const result = await normalizeImageInPlace({
      filePath,
      fileName: 'grande.jpg',
      mimeType: 'image/jpeg',
      maxPx: 2560,
    });

    expect(result.normalized).toBe(true);
    const metadata = await sharp(filePath).metadata();
    expect(Math.max(metadata.width ?? 0, metadata.height ?? 0)).toBeLessThanOrEqual(2560);
    const after = (await fsExtra.stat(filePath)).size;
    expect(result.sizeDeltaBytes).toBe(after - before);
    expect(after).toBeLessThan(before);
  });

  it('NO re-encodea imágenes dentro del techo (cero pérdida para las ya optimizadas)', async () => {
    const filePath = await writeJpeg('optimizada.jpg', 1600, 1200);
    const before = await fsExtra.readFile(filePath);

    const result = await normalizeImageInPlace({
      filePath,
      fileName: 'optimizada.jpg',
      mimeType: 'image/jpeg',
      maxPx: 2560,
    });

    expect(result).toEqual({ normalized: false, sizeDeltaBytes: 0, reason: 'within-limit' });
    expect((await fsExtra.readFile(filePath)).equals(before)).toBe(true); // intacta byte a byte
  });

  it('preserva PNG y transparencia al acotar imágenes con alfa', async () => {
    const filePath = path.join(TEST_DIR, 'sello.png');
    await fsExtra.writeFile(
      filePath,
      await sharp({
        create: { width: 3200, height: 1600, channels: 4, background: { r: 10, g: 10, b: 10, alpha: 0.4 } },
      })
        .png()
        .toBuffer()
    );

    const result = await normalizeImageInPlace({
      filePath,
      fileName: 'sello.png',
      mimeType: 'image/png',
      maxPx: 2560,
    });

    expect(result.normalized).toBe(true);
    const metadata = await sharp(filePath).metadata();
    expect(metadata.format).toBe('png');
    expect(metadata.hasAlpha).toBe(true);
  });

  it('maxPx=0 deshabilita la normalización (originales intactos)', async () => {
    const filePath = await writeJpeg('sin-tocar.jpg', 4000, 3000);

    const result = await normalizeImageInPlace({
      filePath,
      fileName: 'sin-tocar.jpg',
      maxPx: 0,
    });

    expect(result).toEqual({ normalized: false, sizeDeltaBytes: 0, reason: 'disabled' });
  });

  it('ignora archivos que no son imágenes normalizables (video/gif/svg/otros)', async () => {
    const filePath = path.join(TEST_DIR, 'nota.txt');
    await fsExtra.writeFile(filePath, 'no soy imagen');

    const result = await normalizeImageInPlace({ filePath, fileName: 'nota.txt' });
    expect(result.reason).toBe('not-an-image');

    const gif = await normalizeImageInPlace({
      filePath,
      fileName: 'anim.gif',
      mimeType: 'image/gif',
    });
    expect(gif.reason).toBe('not-an-image');
  });

  it('ante un archivo corrupto conserva el original y no lanza', async () => {
    const filePath = path.join(TEST_DIR, 'corrupta.jpg');
    await fsExtra.writeFile(filePath, Buffer.from('esto-no-es-un-jpeg'));

    const result = await normalizeImageInPlace({
      filePath,
      fileName: 'corrupta.jpg',
      mimeType: 'image/jpeg',
      maxPx: 100,
    });

    expect(result.normalized).toBe(false);
    expect((await fsExtra.readFile(filePath)).toString()).toBe('esto-no-es-un-jpeg');
  });
});
