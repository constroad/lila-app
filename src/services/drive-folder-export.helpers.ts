/**
 * Helpers puros del ZIP de una carpeta del drive.
 *
 * Van aparte del servicio para poder testear la regla que de verdad importa —
 * QUÉ entra al ZIP— sin tocar disco ni base de datos: un enlace comparte UNA
 * carpeta, así que el ZIP lleva esa carpeta y su descendencia, nunca las
 * hermanas ni el resto del drive.
 */

type LooseFolder = Record<string, unknown>;

const MAX_DEPTH = 20;

const sanitizeSegment = (name: string): string =>
  name.replace(/[\\/:"*?<>|]+/g, '_').trim() || 'archivo';

/** Ids de la carpeta pedida más todas sus descendientes. */
export const collectFolderSubtree = (folders: LooseFolder[], rootFolderId: string): Set<string> => {
  const root = String(rootFolderId ?? '').trim();
  const subtree = new Set<string>();
  if (!root) return subtree;
  if (!folders.some((folder) => String(folder._id ?? '') === root)) return subtree;

  subtree.add(root);

  // Varias pasadas en vez de recursión: un `parentId` que apunta a un
  // descendiente (dato corrupto) colgaría un descenso recursivo.
  for (let depth = 0; depth < MAX_DEPTH; depth += 1) {
    let grew = false;
    folders.forEach((folder) => {
      const id = String(folder._id ?? '');
      const parentId = String(folder.parentId ?? '');
      if (!id || subtree.has(id) || !subtree.has(parentId)) return;
      subtree.add(id);
      grew = true;
    });
    if (!grew) break;
  }

  return subtree;
};

/**
 * Ruta del archivo dentro del ZIP, relativa a la carpeta compartida: el
 * visitante abre el ZIP y ve el contenido, no la ruta completa del drive.
 */
export const buildRelativeEntryName = ({
  folderPath,
  rootPath,
  fileName,
}: {
  folderPath: string;
  rootPath: string;
  fileName: string;
}): string => {
  const relative = folderPath === rootPath ? '' : folderPath.replace(`${rootPath}/`, '');
  const safeName = sanitizeSegment(fileName);
  return relative ? `${relative}/${safeName}` : safeName;
};
