jest.mock('fs-extra', () => ({
  __esModule: true,
  default: { pathExists: jest.fn().mockResolvedValue(false), readFile: jest.fn() },
}));
jest.mock('./storage-path.service.js', () => ({
  storagePathService: { resolvePath: jest.fn(() => '/storage/none.jpg') },
}));
jest.mock('./image-compression.service.js', () => ({
  ImageCompressionService: {
    processImage: jest.fn(async (buffer: Buffer) => buffer),
  },
}));
jest.mock('sharp', () => ({
  __esModule: true,
  default: jest.fn(() => ({ metadata: jest.fn().mockResolvedValue({ format: 'png' }) })),
}));
jest.mock('axios', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));
jest.mock('../utils/logger.js', () => ({
  __esModule: true,
  default: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

import axios from 'axios';
import { inlineCanvasHtmlImages } from './canvas-html-image-inliner.service.js';

const axiosGetMock = (axios as unknown as { get: jest.Mock }).get;

describe('inlineCanvasHtmlImages', () => {
  beforeEach(() => {
    axiosGetMock.mockReset();
  });

  it('devuelve el HTML intacto cuando no hay imágenes', async () => {
    const html = '<section><p>Sin fotos</p></section>';
    expect(await inlineCanvasHtmlImages(html, 'globofast')).toBe(html);
    expect(axiosGetMock).not.toHaveBeenCalled();
  });

  it('no toca las imágenes que ya son data URL', async () => {
    const html = '<img src="data:image/png;base64,AAAA" />';
    expect(await inlineCanvasHtmlImages(html, 'globofast')).toBe(html);
    expect(axiosGetMock).not.toHaveBeenCalled();
  });

  it('reemplaza el src http resoluble por un data URL', async () => {
    axiosGetMock.mockResolvedValue({ data: Buffer.from('imgbytes') });
    const html = '<img src="https://lila/files/companies/globofast/x.jpg" alt="foto" />';
    const result = await inlineCanvasHtmlImages(html, 'globofast');
    expect(result).toContain('src="data:image/png;base64,');
    expect(result).toContain('alt="foto"');
    expect(result).not.toContain('x.jpg');
  });

  it('deja intacto el src cuando la descarga falla (nunca rompe el HTML)', async () => {
    axiosGetMock.mockRejectedValue(new Error('timeout'));
    const html = '<img src="https://cdn.externo/foto.jpg" />';
    const result = await inlineCanvasHtmlImages(html, 'globofast');
    expect(result).toBe(html);
  });

  it('resuelve una sola vez URLs repetidas (dedupe)', async () => {
    axiosGetMock.mockResolvedValue({ data: Buffer.from('imgbytes') });
    const url = 'https://lila/files/companies/globofast/dup.jpg';
    const html = `<img src="${url}" /><img src="${url}" />`;
    const result = await inlineCanvasHtmlImages(html, 'globofast');
    expect(axiosGetMock).toHaveBeenCalledTimes(1);
    expect(result.match(/data:image\/png/g)?.length).toBe(2);
  });
});
