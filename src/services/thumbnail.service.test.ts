import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { generateThumbnailForFile } from './thumbnail.service';

// Solo probamos el path de IMAGEN (foto de asistencia). El path de PDF/VIDEO no se
// ejercita aquí, así que sus deps (@napi-rs/canvas, pdfjs, ffmpeg) no se usan.

describe('generateThumbnailForFile — imagen (foto de asistencia)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lila-thumb-gen-'));
  });

  afterEach(async () => {
    await fs.remove(dir);
  });

  it('genera un thumbnail JPG reducido (≤640px, más liviano que el original)', async () => {
    const fileName = 'asistencia_PAREDES_VERA_entry_20260717.jpg';
    const filePath = path.join(dir, fileName);
    // Foto "real" grande, como la que sube la cámara antes de reducir en cliente.
    await sharp({
      create: { width: 1600, height: 1200, channels: 3, background: { r: 20, g: 120, b: 200 } },
    })
      .jpeg({ quality: 90 })
      .toFile(filePath);
    const original = await fs.stat(filePath);

    const result = await generateThumbnailForFile({
      filePath,
      fileName,
      mimeType: 'image/jpeg',
      outputDir: dir,
    });

    expect(result.status).toBe('ready');
    expect(result.thumbnailName).toMatch(/^thumb_.*\.jpg$/);
    expect(result.thumbnailAbsolutePath).toContain(`${path.sep}.thumbs${path.sep}`);

    // El thumb existe y su lado mayor está topado a 640 (miniatura real).
    const thumbMeta = await sharp(result.thumbnailAbsolutePath as string).metadata();
    expect(Math.max(thumbMeta.width ?? 0, thumbMeta.height ?? 0)).toBeLessThanOrEqual(640);
    // Y pesa menos que el original.
    expect(result.sizeBytes ?? Infinity).toBeLessThan(original.size);
  });

  it('marca unsupported para tipos sin miniatura (p. ej. .txt)', async () => {
    const fileName = 'nota.txt';
    const filePath = path.join(dir, fileName);
    await fs.writeFile(filePath, 'hola');

    const result = await generateThumbnailForFile({
      filePath,
      fileName,
      mimeType: 'text/plain',
      outputDir: dir,
    });

    expect(result.status).toBe('unsupported');
  });
});
