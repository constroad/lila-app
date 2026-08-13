/**
 * Backfill: genera las miniaturas de los archivos que no tienen ninguna.
 *
 * Nace del incidente 13/08/2026: en el drive de producción los PDFs mostraban un
 * recuadro roto porque su `thumbnailUrl` apuntaba **al propio PDF**. Portal ya
 * corrigió la causa y saneó 2703 registros dejándolos en
 * `thumbnailUrl: ''` + `thumbnailStatus: 'pending'`; falta PRODUCIR la miniatura,
 * y eso solo puede hacerse donde viven los archivos (la Mac mini): este equipo de
 * desarrollo apunta a otro `FILE_STORAGE_ROOT`.
 *
 * Qué hace por cada media sin miniatura: ubica el archivo en el storage, genera
 * el thumb con el MISMO servicio que usa la subida (`generateThumbnailForFile`,
 * pdfjs + sharp) y escribe `thumbnailUrl` + `thumbnailStatus` en la base de
 * Portal. No toca el archivo original.
 *
 *   npx tsx scripts/backfill-media-thumbnails.ts --dry-run              # simula (default)
 *   npx tsx scripts/backfill-media-thumbnails.ts --apply
 *   npx tsx scripts/backfill-media-thumbnails.ts --apply --company constroad --limit 200
 *
 * Es IDEMPOTENTE y reanudable: solo mira las que siguen sin `thumbnailUrl`, así
 * que se puede cortar y volver a lanzar. Los archivos que no existen en disco o
 * cuyo tipo no soporta miniatura se marcan (`missing`/`unsupported`) y no se
 * vuelven a intentar en cada corrida.
 */

import 'dotenv/config';
import path from 'path';
import fs from 'fs-extra';
import { getMediaModel } from '../src/database/models.js';
import { resolveMediaAbsolutePath } from '../src/services/order-export.service.js';
import {
  buildThumbnailRelativePath,
  generateThumbnailForFile,
} from '../src/services/thumbnail.service.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const companyId = args.includes('--company') ? args[args.indexOf('--company') + 1] : undefined;
const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) || 0 : 0;

interface Resumen {
  generadas: number;
  sinArchivo: number;
  noSoportado: number;
  errores: number;
}

/** Ruta pública que Portal guarda en `thumbnailUrl` (relativa: la resuelve el front). */
const buildPublicThumbUrl = (company: string, fileRelative: string, thumbName: string): string => {
  const dir = path.posix.dirname(fileRelative);
  const relative = buildThumbnailRelativePath(dir === '.' ? '' : dir, thumbName);
  return `/files/companies/${company}/${relative}`;
};

/** `…/files/companies/{id}/drive/x.pdf` → `drive/x.pdf` */
const relativeFromUrl = (mediaUrl: string, company: string): string | null => {
  try {
    const pathname = new URL(mediaUrl, 'http://localhost').pathname;
    const marker = `/files/companies/${company}/`;
    if (!pathname.startsWith(marker)) return null;
    return decodeURIComponent(pathname.slice(marker.length));
  } catch {
    return null;
  }
};

const main = async () => {
  const Media = await getMediaModel();
  const filter: Record<string, unknown> = {
    $or: [{ thumbnailUrl: { $in: [null, ''] } }, { thumbnailUrl: { $exists: false } }],
    thumbnailStatus: { $nin: ['unsupported', 'missing'] },
    ...(companyId ? { companyId } : {}),
  };

  const query = Media.find(filter)
    .select({ companyId: 1, name: 1, url: 1, mimeType: 1, mimeTye: 1 })
    .sort({ updatedAt: -1 });
  if (limit > 0) query.limit(limit);
  const pendientes = await query.lean();

  console.log(`sin miniatura: ${pendientes.length}${companyId ? ` (empresa ${companyId})` : ''}`);
  if (!apply) {
    const muestra = pendientes.slice(0, 8).map((m: any) => m.name);
    console.log('muestra:', muestra);
    console.log('\nDRY-RUN: no se generó nada. Repetir con --apply.');
    process.exit(0);
  }

  const resumen: Resumen = { generadas: 0, sinArchivo: 0, noSoportado: 0, errores: 0 };

  for (const media of pendientes as any[]) {
    const company = String(media.companyId ?? '');
    const url = String(media.url ?? '');
    const relative = relativeFromUrl(url, company);
    const absolute = relative ? resolveMediaAbsolutePath(url, company) : null;

    if (!absolute || !relative || !(await fs.pathExists(absolute))) {
      resumen.sinArchivo += 1;
      // Se marca para no reintentarlo en cada corrida (el archivo no está acá).
      await Media.updateOne({ _id: media._id }, { $set: { thumbnailStatus: 'missing' } });
      continue;
    }

    try {
      const result = await generateThumbnailForFile({
        filePath: absolute,
        fileName: String(media.name ?? path.basename(absolute)),
        mimeType: media.mimeType ?? media.mimeTye ?? undefined,
        outputDir: path.dirname(absolute),
      });

      if (result.status === 'ready' && result.thumbnailName) {
        await Media.updateOne(
          { _id: media._id },
          {
            $set: {
              thumbnailUrl: buildPublicThumbUrl(company, relative, result.thumbnailName),
              thumbnailStatus: 'ready',
            },
          }
        );
        resumen.generadas += 1;
      } else {
        await Media.updateOne(
          { _id: media._id },
          { $set: { thumbnailStatus: result.status === 'unsupported' ? 'unsupported' : 'error' } }
        );
        if (result.status === 'unsupported') resumen.noSoportado += 1;
        else resumen.errores += 1;
      }
    } catch (error) {
      resumen.errores += 1;
      console.error('  ✗', media.name, error instanceof Error ? error.message : error);
    }

    const hechas = resumen.generadas + resumen.sinArchivo + resumen.noSoportado + resumen.errores;
    if (hechas % 50 === 0) console.log(`  … ${hechas}/${pendientes.length}`);
  }

  console.log('\nRESUMEN:', JSON.stringify(resumen));
  process.exit(0);
};

void main();
