/**
 * Backfill: acota las imágenes YA almacenadas que superan el techo de ingest.
 *
 * La normalización server-side (`media-ingest.service`) solo aplica a subidas
 * NUEVAS; las fotos históricas (subidas antes de la optimización client-side o
 * por flujos que la saltaron) siguen pesando varios MB y castigan el fullscreen
 * en gama media. Este script las lleva al mismo techo (default 2560px, q82).
 *
 * Los thumbnails con hash viejo quedan stale a propósito: el resolver sirve el
 * hermano vigente y la materialización lazy regenera el resto solo (self-healing).
 * Nota: el contador de storage NO se ajusta (queda por encima del uso real, la
 * dirección segura); se reconcilia con el endpoint de uso pendiente (as-is §rol).
 *
 * Uso (desde lila-app/):
 *   npx tsx scripts/normalize-stored-images.ts                # dry-run global
 *   npx tsx scripts/normalize-stored-images.ts --company test # dry-run una company
 *   npx tsx scripts/normalize-stored-images.ts --apply        # ejecutar
 *   npx tsx scripts/normalize-stored-images.ts --apply --max-px 2048
 */
import path from 'path';
import fs from 'fs-extra';
import sharp from 'sharp';
import { normalizeImageInPlace } from '../src/services/media-ingest.service.js';
import { mapWithConcurrency } from '../src/utils/concurrency.js';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const SKIP_DIR_NAMES = new Set(['.thumbs', 'temp', 'node_modules']);

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const companyFilter = args[args.indexOf('--company') + 1] && args.includes('--company')
  ? args[args.indexOf('--company') + 1]
  : undefined;
const maxPx = args.includes('--max-px')
  ? Number(args[args.indexOf('--max-px') + 1])
  : Number(process.env.MEDIA_INGEST_MAX_PX ?? 2560);

const storageRoot = process.env.FILE_STORAGE_ROOT || '/mnt/constroad-storage';
const companiesRoot = path.join(storageRoot, 'companies');

type Oversized = { filePath: string; companyId: string; bytes: number; longestSide: number };

async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.name.startsWith('.') || SKIP_DIR_NAMES.has(entry.name)) continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(absolute);
    } else if (entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      yield absolute;
    }
  }
}

async function main() {
  if (!Number.isFinite(maxPx) || maxPx <= 0) {
    console.error(`max-px inválido: ${maxPx}`);
    process.exit(1);
  }
  console.log(
    `${apply ? '🔧 APLICANDO' : '🔍 DRY-RUN'} — techo ${maxPx}px — root ${companiesRoot}` +
      (companyFilter ? ` — company ${companyFilter}` : '')
  );

  const companies = companyFilter
    ? [companyFilter]
    : (await fs.readdir(companiesRoot).catch(() => [])).filter((name) => !name.startsWith('.'));

  const oversized: Oversized[] = [];
  let scanned = 0;

  for (const companyId of companies) {
    const companyDir = path.join(companiesRoot, companyId);
    if (!(await fs.pathExists(companyDir))) {
      console.warn(`  ⚠️ company sin carpeta: ${companyId}`);
      continue;
    }
    for await (const filePath of walk(companyDir)) {
      scanned += 1;
      try {
        const metadata = await sharp(filePath).metadata();
        const longestSide = Math.max(metadata.width ?? 0, metadata.height ?? 0);
        if (longestSide > maxPx) {
          const { size } = await fs.stat(filePath);
          oversized.push({ filePath, companyId, bytes: size, longestSide });
        }
      } catch {
        // no-imagen o corrupta: se ignora (el ingest nuevo tampoco la tocaría)
      }
    }
  }

  const totalMB = (oversized.reduce((acc, item) => acc + item.bytes, 0) / 1024 / 1024).toFixed(1);
  console.log(`\nEscaneadas: ${scanned} imágenes. Sobre el techo: ${oversized.length} (${totalMB}MB).`);

  const byCompany = new Map<string, number>();
  for (const item of oversized) {
    byCompany.set(item.companyId, (byCompany.get(item.companyId) ?? 0) + 1);
  }
  for (const [companyId, count] of byCompany) {
    console.log(`  - ${companyId}: ${count} imágenes`);
  }

  if (!apply) {
    console.log('\nDry-run: nada modificado. Ejecuta con --apply para normalizar.');
    return;
  }

  let savedBytes = 0;
  let normalizedCount = 0;
  await mapWithConcurrency(oversized, 4, async (item) => {
    const result = await normalizeImageInPlace({
      filePath: item.filePath,
      fileName: path.basename(item.filePath),
      maxPx,
    });
    if (result.normalized) {
      normalizedCount += 1;
      savedBytes += Math.max(0, -result.sizeDeltaBytes);
    }
  });

  console.log(
    `\n✅ Normalizadas ${normalizedCount}/${oversized.length} — liberados ${(savedBytes / 1024 / 1024).toFixed(1)}MB.`
  );
  console.log('Los thumbnails stale se regeneran solos al primer view (materialización lazy).');
}

void main();
