import { collectFolderSubtree, buildRelativeEntryName } from './drive-folder-export.helpers.js';

// Árbol real de producción: la carpeta compartida tiene una subcarpeta y los
// archivos viven adentro de esa subcarpeta.
const folders = [
  { _id: 'raiz', name: 'DOCUMENTOS PARA EJECUCION DE OBRA', parentId: null },
  { _id: 'sub', name: 'DOCUMENTOS DEL TREN DE ASFALTO', parentId: 'raiz' },
  { _id: 'nieta', name: 'POLIZAS', parentId: 'sub' },
  { _id: 'ajena', name: 'OTRA CARPETA', parentId: null },
];

describe('qué carpetas entran al ZIP', () => {
  it('incluye la carpeta pedida y toda su descendencia', () => {
    const subtree = collectFolderSubtree(folders, 'raiz');

    expect([...subtree].sort()).toEqual(['nieta', 'raiz', 'sub']);
  });

  it('NO incluye carpetas hermanas: se comparte una, no el drive', () => {
    expect(collectFolderSubtree(folders, 'raiz').has('ajena')).toBe(false);
  });

  it('desde una subcarpeta baja solo esa rama', () => {
    expect([...collectFolderSubtree(folders, 'sub')].sort()).toEqual(['nieta', 'sub']);
  });

  it('una carpeta inexistente no arrastra nada', () => {
    expect(collectFolderSubtree(folders, 'no-existe').size).toBe(0);
  });

  it('tolera un ciclo sin colgarse', () => {
    // Datos corruptos no deben congelar el proceso de lila.
    const ciclo = [
      { _id: 'a', name: 'A', parentId: 'b' },
      { _id: 'b', name: 'B', parentId: 'a' },
    ];

    expect(collectFolderSubtree(ciclo, 'a').size).toBeGreaterThan(0);
  });
});

describe('ruta de cada archivo dentro del ZIP', () => {
  it('cuelga de la carpeta pedida, sin repetir su nombre completo', () => {
    const entry = buildRelativeEntryName({
      folderPath: 'DOCUMENTOS PARA EJECUCION DE OBRA/DOCUMENTOS DEL TREN DE ASFALTO',
      rootPath: 'DOCUMENTOS PARA EJECUCION DE OBRA',
      fileName: 'CV_JAIMITO.pdf',
    });

    expect(entry).toBe('DOCUMENTOS DEL TREN DE ASFALTO/CV_JAIMITO.pdf');
  });

  it('un archivo en la raíz queda suelto en el ZIP', () => {
    const entry = buildRelativeEntryName({
      folderPath: 'DOCUMENTOS PARA EJECUCION DE OBRA',
      rootPath: 'DOCUMENTOS PARA EJECUCION DE OBRA',
      fileName: 'acta.pdf',
    });

    expect(entry).toBe('acta.pdf');
  });

  it('sanea nombres que romperían el ZIP o escaparían de la carpeta', () => {
    const entry = buildRelativeEntryName({
      folderPath: 'raiz/sub',
      rootPath: 'raiz',
      fileName: '../../etc/passwd',
    });

    expect(entry).toBe('sub/.._.._etc_passwd');
  });
});
