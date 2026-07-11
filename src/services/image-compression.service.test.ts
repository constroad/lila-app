import sharp from 'sharp';
import { ImageCompressionService } from './image-compression.service.js';

/** PNG transparente cuadrado con una franja opaca; `sizePx` grande = pesa >1MB. */
const buildTransparentPng = async (sizePx: number): Promise<Buffer> => {
  const raw = Buffer.alloc(sizePx * sizePx * 4);
  for (let i = 0; i < raw.length; i += 4) {
    raw[i] = 40;
    raw[i + 1] = 90;
    raw[i + 2] = 200;
    // Mitad superior transparente, mitad inferior opaca.
    raw[i + 3] = i < raw.length / 2 ? 0 : 255;
  }
  return sharp(raw, { raw: { width: sizePx, height: sizePx, channels: 4 } }).png().toBuffer();
};

const cornerAlpha = async (buffer: Buffer): Promise<number> => {
  const px = await sharp(buffer)
    .ensureAlpha()
    .extract({ left: 0, top: 0, width: 1, height: 1 })
    .raw()
    .toBuffer();
  return px[3];
};

describe('ImageCompressionService.processImage', () => {
  const originalMax = process.env.PDF_IMAGE_MAX_MB;
  afterEach(() => {
    if (originalMax === undefined) delete process.env.PDF_IMAGE_MAX_MB;
    else process.env.PDF_IMAGE_MAX_MB = originalMax;
  });

  it('preserva la transparencia al comprimir un PNG con alfa (no caja negra)', async () => {
    process.env.PDF_IMAGE_MAX_MB = '0'; // fuerza el camino de compresión
    const png = await buildTransparentPng(600);
    const out = await ImageCompressionService.processImage(png, 'sello.png');
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('png');
    expect(meta.hasAlpha).toBe(true);
    // La esquina (zona transparente) sigue transparente; con JPEG sería 255/negro.
    expect(await cornerAlpha(out)).toBe(0);
  });

  it('comprime a JPEG las imágenes opacas (sin alfa)', async () => {
    process.env.PDF_IMAGE_MAX_MB = '0';
    const opaque = await sharp({
      create: { width: 600, height: 600, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .png()
      .toBuffer();
    const out = await ImageCompressionService.processImage(opaque, 'foto.png');
    expect((await sharp(out).metadata()).format).toBe('jpeg');
  });

  it('devuelve el buffer intacto si está por debajo del umbral', async () => {
    process.env.PDF_IMAGE_MAX_MB = '999';
    const png = await buildTransparentPng(64);
    const out = await ImageCompressionService.processImage(png, 'chico.png');
    expect(out).toBe(png);
  });
});
