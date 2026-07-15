import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { resolveThumbnailRequestTarget } from './thumbnail-request.service';

describe('resolveThumbnailRequestTarget', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'lila-thumb-request-'));
  });

  afterEach(async () => {
    await fs.remove(root);
  });

  it('returns the thumbnail when it exists', async () => {
    const thumbPath = path.join(
      root,
      'globofas-s8k',
      'services',
      'svc-1',
      'field-reports',
      'report-1',
      'panelFotografico',
      '.thumbs',
      'thumb_1000646758_d71afe79b0.jpg'
    );
    await fs.ensureDir(path.dirname(thumbPath));
    await fs.writeFile(thumbPath, 'thumb');

    const result = await resolveThumbnailRequestTarget(
      root,
      '/globofas-s8k/services/svc-1/field-reports/report-1/panelFotografico/.thumbs/thumb_1000646758_d71afe79b0.jpg'
    );

    expect(result).toEqual({
      absolutePath: thumbPath,
      source: 'thumbnail',
    });
  });

  it('serves a SIBLING thumbnail when the requested hash is stale (move/re-upload)', async () => {
    const baseDir = path.join(root, 'globofas-s8k', 'services', 'svc-1', 'panelFotografico');
    const currentThumb = path.join(baseDir, '.thumbs', 'thumb_1000646758_aaaaaaaaaa.jpg');
    await fs.ensureDir(path.dirname(currentThumb));
    await fs.writeFile(currentThumb, 'thumb-vigente');
    // También existe el original; el hermano debe ganar (liviano vs multi-MB).
    await fs.writeFile(path.join(baseDir, '1000646758.jpg'), 'original');

    const result = await resolveThumbnailRequestTarget(
      root,
      '/globofas-s8k/services/svc-1/panelFotografico/.thumbs/thumb_1000646758_bbbbbbbbbb.jpg'
    );

    expect(result).toEqual({
      absolutePath: currentThumb,
      source: 'thumbnail',
    });
  });

  it('falls back to the original image when a stale thumbnail is requested', async () => {
    const originalPath = path.join(
      root,
      'globofas-s8k',
      'services',
      'svc-1',
      'field-reports',
      'report-1',
      'panelFotografico',
      '1000646758.jpg'
    );
    await fs.ensureDir(path.dirname(originalPath));
    await fs.writeFile(originalPath, 'original');

    const result = await resolveThumbnailRequestTarget(
      root,
      '/globofas-s8k/services/svc-1/field-reports/report-1/panelFotografico/.thumbs/thumb_1000646758_d71afe79b0.jpg'
    );

    expect(result).toEqual({
      absolutePath: originalPath,
      source: 'original-fallback',
    });
  });

  it('rejects path traversal attempts', async () => {
    const result = await resolveThumbnailRequestTarget(
      root,
      '/globofas-s8k/services/.thumbs/../../secret/thumb_1000646758_d71afe79b0.jpg'
    );

    expect(result).toBeNull();
  });
});
