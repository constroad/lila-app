import {
  buildFolderPathResolver,
  resolveMediaAbsolutePath,
} from './order-export.service.js';
import { storagePathService } from './storage-path.service.js';
import path from 'path';

describe('resolveMediaAbsolutePath', () => {
  const companyRoot = storagePathService.getCompanyRoot('test');

  it('mapea URL absoluta de lila a la ruta local del archivo', () => {
    const resolved = resolveMediaAbsolutePath(
      'http://localhost:3001/files/companies/test/orders/abc/DISPATCH_PICTURES/foto.jpg',
      'test'
    );

    expect(resolved).toBe(
      path.join(companyRoot, 'orders', 'abc', 'DISPATCH_PICTURES', 'foto.jpg')
    );
  });

  it('acepta URLs relativas (/files/companies/…) y decodifica percent-encoding', () => {
    const resolved = resolveMediaAbsolutePath(
      '/files/companies/test/dispatches/vales/nro-1/vale%20unidad%201.pdf',
      'test'
    );

    expect(resolved).toBe(
      path.join(companyRoot, 'dispatches', 'vales', 'nro-1', 'vale unidad 1.pdf')
    );
  });

  it('rechaza URLs de otra company', () => {
    const resolved = resolveMediaAbsolutePath(
      'http://localhost:3001/files/companies/otra/orders/abc/foto.jpg',
      'test'
    );

    expect(resolved).toBeNull();
  });

  it('rechaza path traversal fuera del root de la company', () => {
    const resolved = resolveMediaAbsolutePath(
      '/files/companies/test/../otra/secreto.pdf',
      'test'
    );

    expect(resolved).toBeNull();
  });

  it('rechaza URLs que no son del storage (blob externo, texto)', () => {
    expect(resolveMediaAbsolutePath('https://blob.vercel-storage.com/x.zip', 'test')).toBeNull();
    expect(resolveMediaAbsolutePath('no-es-url', 'test')).toBeNull();
  });
});

describe('buildFolderPathResolver', () => {
  it('resuelve la cadena parent → child con nombres sanitizados', () => {
    const resolve = buildFolderPathResolver([
      { _id: 'f1', name: 'Documentos' },
      { _id: 'f2', name: 'Vales: 2026', parentId: 'f1' },
    ]);

    expect(resolve('f2')).toBe('Documentos/Vales_ 2026');
  });

  it('folder desconocido o sin folderId → raíz del zip', () => {
    const resolve = buildFolderPathResolver([]);

    expect(resolve('nope')).toBe('');
    expect(resolve(undefined)).toBe('');
  });

  it('corta ciclos de parentId sin colgarse', () => {
    const resolve = buildFolderPathResolver([
      { _id: 'a', name: 'A', parentId: 'b' },
      { _id: 'b', name: 'B', parentId: 'a' },
    ]);

    expect(typeof resolve('a')).toBe('string');
  });
});
