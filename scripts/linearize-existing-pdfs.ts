/**
 * Backfill: lineariza los PDFs que ya están subidos.
 *
 * Los PDFs guardados antes de F2 tienen el índice al final del archivo, así que
 * un visor debe bajarlos enteros para pintar la primera página. Este script los
 * reescribe con `qpdf --linearize` sin tocar la base de datos: cambia el
 * CONTENIDO del archivo, no su ruta ni su URL.
 *
 *   npx tsx scripts/linearize-existing-pdfs.ts --company constroad          # dry-run
 *   npx tsx scripts/linearize-existing-pdfs.ts --company constroad --apply
 *
 * Sin `--company` recorre todas. `--apply` es obligatorio para escribir.
 */

import 'dotenv/config';
import fs from 'fs-extra';
import { getMediaModel } from '../src/database/models.js';
import { resolveMediaAbsolutePath } from '../src/services/order-export.service.js';
import { isQpdfAvailable, linearizePdfInPlace } from '../src/services/pdf-linearize.service.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const companyArg = args[args.indexOf('--company') + 1];
const companyId = args.includes('--company') ? companyArg : undefined;

/** Un PDF linearizado lleva el marcador en su primer objeto. */
const isAlreadyLinearized = async (filePath: string): Promise<boolean> => {
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(2048);
    const { bytesRead } = await fs.read(handle, buffer, 0, 2048, 0);
    return buffer.subarray(0, bytesRead).includes('/Linearized');
  } finally {
    await fs.close(handle);
  }
};

const main = async () => {
  if (!(await isQpdfAvailable())) {
    console.error('qpdf no está instalado. Instalar con: brew install qpdf');
    process.exit(1);
  }

  const MediaModel = await getMediaModel();

  const filter: Record<string, unknown> = { status: 'ACTIVE' };
  if (companyId) filter.companyId = companyId;

  const medias = (await MediaModel.find(filter).lean()) as Record<string, unknown>[];
  const pdfs = medias.filter((media) =>
    String(media.name ?? '').toLowerCase().endsWith('.pdf')
  );

  console.log(`${apply ? 'APLICANDO' : 'DRY-RUN'} — ${pdfs.length} PDFs${companyId ? ` de ${companyId}` : ''}`);

  const totals = { linearizados: 0, yaEstaban: 0, sinArchivo: 0, fallaron: 0 };

  for (const media of pdfs) {
    const mediaCompany = String(media.companyId ?? '');
    const absolutePath = resolveMediaAbsolutePath(String(media.url ?? ''), mediaCompany);
    if (!absolutePath || !(await fs.pathExists(absolutePath))) {
      totals.sinArchivo += 1;
      continue;
    }

    if (await isAlreadyLinearized(absolutePath)) {
      totals.yaEstaban += 1;
      continue;
    }

    if (!apply) {
      totals.linearizados += 1;
      console.log(`  [dry-run] ${media.name}`);
      continue;
    }

    const done = await linearizePdfInPlace(absolutePath, { fileName: String(media.name ?? '') });
    if (done) {
      totals.linearizados += 1;
      console.log(`  ✔ ${media.name}`);
    } else {
      totals.fallaron += 1;
    }
  }

  console.log(
    `\nlinearizados=${totals.linearizados} yaEstaban=${totals.yaEstaban} ` +
      `sinArchivoLocal=${totals.sinArchivo} fallaron=${totals.fallaron}`
  );
  process.exit(0);
};

void main();
