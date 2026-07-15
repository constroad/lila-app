/**
 * Tests de integración del inliner: fs y sharp REALES sobre un árbol temporal
 * (solo se mockean storage-path → tmp, axios y logger). Cubre el incidente PDF
 * jul-2026: thumb faltante → ORIGINAL local (sin HTTP) + resize incondicional.
 */
import { describe, it, expect, jest, beforeAll, beforeEach, afterAll } from '@jest/globals';
import path from 'path';
import os from 'os';
import fsExtra from 'fs-extra';
import sharp from 'sharp';

const TEST_ROOT = path.join(os.tmpdir(), `lila-inliner-test-${process.pid}`);
const companyRoot = (companyId: string) => path.join(TEST_ROOT, 'companies', companyId);

jest.unstable_mockModule('../utils/logger.js', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.unstable_mockModule('./storage-path.service.js', () => ({
  __esModule: true,
  storagePathService: {
    resolvePath: (companyId: string, relative: string) =>
      path.join(companyRoot(companyId), ...relative.split('/')),
    getCompanyRoot: (companyId: string) => companyRoot(companyId),
  },
}));

const axiosGet = jest.fn<() => Promise<{ data: Buffer }>>();
jest.unstable_mockModule('axios', () => ({
  __esModule: true,
  default: { get: axiosGet },
}));

type Subject = typeof import('./canvas-html-image-inliner.service.js');
let inlineCanvasHtmlImages: Subject['inlineCanvasHtmlImages'];

const PICTURES_DIR = 'orders/o1/DISPATCH_PICTURES';

const makeJpeg = (width: number, height: number) =>
  sharp({
    create: { width, height, channels: 3, background: { r: 120, g: 40, b: 40 } },
  })
    .jpeg({ quality: 90 })
    .toBuffer();

const makeAlphaPng = (width: number, height: number) =>
  sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 100, b: 0, alpha: 0.5 } },
  })
    .png()
    .toBuffer();

const dataUrlToBuffer = (dataUrl: string) => {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return Buffer.from(base64, 'base64');
};

const extractSrc = (html: string): string => {
  const match = html.match(/src="([^"]+)"/);
  return match?.[1] ?? '';
};

beforeAll(async () => {
  ({ inlineCanvasHtmlImages } = await import('./canvas-html-image-inliner.service.js'));
  const picturesAbs = path.join(companyRoot('test'), PICTURES_DIR);
  await fsExtra.ensureDir(path.join(picturesAbs, '.thumbs'));
  // Original grande (debe redimensionarse) y firma con alfa (debe quedar PNG).
  await fsExtra.writeFile(path.join(picturesAbs, 'foto.jpg'), await makeJpeg(2400, 1800));
  await fsExtra.writeFile(path.join(picturesAbs, 'firma.png'), await makeAlphaPng(300, 150));
});

afterAll(async () => {
  await fsExtra.remove(TEST_ROOT);
});

beforeEach(() => {
  axiosGet.mockReset();
  axiosGet.mockRejectedValue(new Error('network disabled in test'));
});

describe('inlineCanvasHtmlImages — resolución local', () => {
  it('embebe una imagen de storage local REDIMENSIONADA a tamaño de PDF', async () => {
    const html = `<img src="https://lila.host/files/companies/test/${PICTURES_DIR}/foto.jpg" />`;

    const result = await inlineCanvasHtmlImages(html, 'test');

    const src = extractSrc(result);
    expect(src.startsWith('data:image/jpeg;base64,')).toBe(true);
    const metadata = await sharp(dataUrlToBuffer(src)).metadata();
    expect(Math.max(metadata.width ?? 0, metadata.height ?? 0)).toBeLessThanOrEqual(1600);
    expect(axiosGet).not.toHaveBeenCalled(); // disco, no HTTP
  });

  it('con un THUMB inexistente cae al ORIGINAL local (sin HTTP) — caso del incidente', async () => {
    const thumbUrl = `https://lila.host/files/companies/test/${PICTURES_DIR}/.thumbs/thumb_foto_abcdef1234.jpg`;
    const html = `<img src="${thumbUrl}" />`;

    const result = await inlineCanvasHtmlImages(html, 'test');

    const src = extractSrc(result);
    expect(src.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it('preserva PNG (transparencia) para imágenes con canal alfa', async () => {
    const html = `<img src="/files/companies/test/${PICTURES_DIR}/firma.png" />`;

    const result = await inlineCanvasHtmlImages(html, 'test');

    const src = extractSrc(result);
    expect(src.startsWith('data:image/png;base64,')).toBe(true);
    const metadata = await sharp(dataUrlToBuffer(src)).metadata();
    expect(metadata.hasAlpha).toBe(true);
  });
});

describe('inlineCanvasHtmlImages — HTTP y casos borde', () => {
  it('descarga por HTTP solo URLs realmente externas', async () => {
    axiosGet.mockResolvedValue({ data: await makeJpeg(800, 600) });
    const html = '<img src="https://externo.example.com/logo.jpg" />';

    const result = await inlineCanvasHtmlImages(html, 'test');

    expect(axiosGet).toHaveBeenCalledTimes(1);
    expect(extractSrc(result).startsWith('data:image/jpeg;base64,')).toBe(true);
  });

  it('deja intactas las imágenes que no puede resolver (nunca rompe el HTML)', async () => {
    const html = '<img src="https://externo.example.com/caida.jpg" />';

    const result = await inlineCanvasHtmlImages(html, 'test');

    expect(result).toBe(html);
  });

  it('no toca data URLs existentes ni HTML sin imágenes', async () => {
    const dataUrlHtml = '<img src="data:image/png;base64,AAAA" />';
    expect(await inlineCanvasHtmlImages(dataUrlHtml, 'test')).toBe(dataUrlHtml);
    expect(await inlineCanvasHtmlImages('<p>sin imagenes</p>', 'test')).toBe('<p>sin imagenes</p>');
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it('inlinea múltiples imágenes distintas en un solo pase', async () => {
    const html = [
      `<img src="/files/companies/test/${PICTURES_DIR}/foto.jpg" />`,
      `<img src="/files/companies/test/${PICTURES_DIR}/firma.png" />`,
    ].join('\n');

    const result = await inlineCanvasHtmlImages(html, 'test');

    const sources = result.match(/src="data:image\/(jpeg|png);base64,/g) ?? [];
    expect(sources).toHaveLength(2);
  });
});
