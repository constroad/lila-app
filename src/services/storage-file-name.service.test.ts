import {
  buildUniqueStorageFileName,
  sanitizeStorageFileName,
} from './storage-file-name.service';

describe('storage-file-name.service', () => {
  it('sanitizes unsafe display file names for storage', () => {
    expect(sanitizeStorageFileName(' 1000646758 (1).JPG ')).toBe('1000646758_1.jpg');
    expect(sanitizeStorageFileName('../foto\\campo.png')).toBe('foto_campo.png');
  });

  it('keeps the visible base but adds a unique physical suffix', () => {
    const first = buildUniqueStorageFileName('1000646758.jpg', 'upload-a');
    const second = buildUniqueStorageFileName('1000646758.jpg', 'upload-b');

    expect(first).toMatch(/^1000646758_[a-f0-9]{10}\.jpg$/);
    expect(second).toMatch(/^1000646758_[a-f0-9]{10}\.jpg$/);
    expect(first).not.toBe(second);
  });
});
