/**
 * Rescata a disco propio los archivos que todavía viven en Telegram.
 *
 * Hasta mar-2026 los adjuntos (vales, guías, facturas, fotos de despacho) se
 * guardaban en Telegram y en Mongo quedaba su URL. Esas URLs **caducan**: las
 * 13 196 medias de `constroad` daban 404 (verificado 04/08/2026). El archivo NO
 * está perdido — Telegram lo conserva y se recupera con `getFile` desde el
 * `fileId`, que el 100% de esas filas tiene.
 *
 * Qué hace por cada media:
 *   1. `getFile(fileId)` → ruta viva en Telegram
 *   2. descarga el archivo
 *   3. lo guarda en el storage de la company
 *   4. reescribe `media.url` a la URL propia y guarda la de Telegram en
 *      `metadata.legacyTelegramUrl` (por si hay que auditar)
 *
 *   npx tsx scripts/rescatar-telegram-a-lila.ts --company constroad            # DRY-RUN
 *   npx tsx scripts/rescatar-telegram-a-lila.ts --company constroad --apply
 *   npx tsx scripts/rescatar-telegram-a-lila.ts --company constroad --apply --limit 20
 *
 * DRY-RUN por defecto: hay que pasar `--apply` para escribir.
 *
 * Seguro de repetir: saltea lo que ya no apunta a Telegram, y **nunca reescribe
 * la URL sin tener antes el archivo en disco**. Si uno falla, se registra y se
 * sigue con el resto — al final imprime el resumen para reintentar.
 *
 * Ritmo: tandas con pausa, porque Telegram limita a ~30 requests/segundo.
 */

import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';
import { getMediaModel } from '../src/database/models.js';
import { storagePathService } from '../src/services/storage-path.service.js';
import { config } from '../src/config/environment.js';
import {
  buildRescueFileName,
  buildRescuePath,
  chunk,
  isTelegramUrl,
} from '../src/services/telegram-rescue.helpers.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const company = args.includes('--company') ? args[args.indexOf('--company') + 1] : undefined;
const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : 0;
/**
 * Base pública del storage. EXPLÍCITA a propósito: `buildAbsoluteUrl` necesita
 * un request y un script no lo tiene. Adivinarla fue exactamente lo que dejó
 * URLs con `localhost` en la migración de printHtml — acá se declara o no corre.
 */
const baseUrl = (
  (args.includes('--base-url') ? args[args.indexOf('--base-url') + 1] : '') ||
  process.env.LILA_PUBLIC_BASE_URL ||
  ''
).replace(/\/+$/, '');

/** Tandas y pausa: Telegram permite ~30 req/s; se va conservador. */
const BATCH_SIZE = 10;
const BATCH_PAUSE_MS = 1200;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Media = Record<string, any>;

const rescueOne = async (media: Media, token: string): Promise<
  { ok: true; url: string; bytes: number } | { ok: false; reason: string }
> => {
  const fileId = String(media?.metadata?.fileId || '');
  if (!fileId) return { ok: false, reason: 'sin fileId' };

  const companyId = String(media.companyId || '');
  if (!companyId) return { ok: false, reason: 'sin companyId' };

  // 1. Pedirle a Telegram una ruta viva.
  const info = await axios
    .get(`https://api.telegram.org/bot${token}/getFile`, {
      params: { file_id: fileId },
      timeout: 30_000,
    })
    .catch((error) => ({ data: { ok: false, description: error?.message } }) as never);

  const filePath = info?.data?.ok ? String(info.data.result?.file_path || '') : '';
  if (!filePath) {
    return { ok: false, reason: `getFile: ${info?.data?.description || 'sin file_path'}` };
  }

  // 2. Descargar.
  const download = await axios
    .get(`https://api.telegram.org/file/bot${token}/${filePath}`, {
      responseType: 'arraybuffer',
      timeout: 120_000,
    })
    .catch(() => null);

  const buffer = download?.data ? Buffer.from(download.data) : null;
  if (!buffer?.length) return { ok: false, reason: 'descarga vacía' };

  // 3. Guardar en el storage de la company.
  const mediaId = String(media._id);
  const relativeDir = buildRescuePath({ type: media.type, mediaId });
  const fileName = buildRescueFileName({
    name: media.name,
    telegramFilePath: filePath,
    mediaId,
  });
  const relativePath = path.join(relativeDir, fileName);
  const absolutePath = storagePathService.resolvePath(companyId, relativePath);

  await fs.ensureDir(path.dirname(absolutePath));
  await fs.writeFile(absolutePath, buffer);

  const publicUrl = `${baseUrl}/files/companies/${companyId}/${relativePath}`;
  return { ok: true, url: publicUrl, bytes: buffer.length };
};

const main = async () => {
  const token = config.telegram?.botToken || process.env.TELEGRAM_BOT_TOKEN || '';
  if (!token) {
    console.error('Falta TELEGRAM_BOT_TOKEN: sin él no se puede pedir la URL nueva.');
    process.exit(1);
  }
  if (!baseUrl) {
    console.error(
      'Falta la base pública del storage. Pasala explícita:\n' +
        '  --base-url https://<host-publico>   (o LILA_PUBLIC_BASE_URL)\n' +
        'Se pide explícita porque adivinarla dejó URLs con localhost en la ' +
        'migración de printHtml.'
    );
    process.exit(1);
  }
  if (/localhost|127\.0\.0\.1/.test(baseUrl)) {
    console.error(`La base "${baseUrl}" es local: las URLs quedarían rotas para los clientes.`);
    process.exit(1);
  }

  const MediaModel = await getMediaModel();
  const query: Record<string, unknown> = {
    url: { $regex: 'api.telegram.org' },
    'metadata.fileId': { $exists: true, $ne: '' },
  };
  if (company) query.companyId = company;

  // Projection obligatoria: sin ella traer 13 196 documentos COMPLETOS agota la
  // conexión (MongoNetworkTimeoutError al escribir este script).
  const projection = { url: 1, name: 1, type: 1, companyId: 1, 'metadata.fileId': 1 };
  const query2 = MediaModel.find(query, projection).lean();
  const medias = (limit > 0 ? await query2.limit(limit) : await query2) as Media[];

  console.log(`${apply ? 'APLICANDO' : 'DRY-RUN'} — ${medias.length} medias por rescatar` +
    `${company ? ` de ${company}` : ' (todas las companies)'}`);
  console.log(`storage público: ${baseUrl}\n`);

  const totals = { ok: 0, fail: 0, bytes: 0 };
  const fallidos: Array<{ id: string; name: string; reason: string }> = [];

  if (!apply) {
    const porTipo: Record<string, number> = {};
    medias.forEach((m) => {
      porTipo[String(m.type || 'otros')] = (porTipo[String(m.type || 'otros')] || 0) + 1;
    });
    Object.entries(porTipo)
      .sort((a, b) => b[1] - a[1])
      .forEach(([t, n]) => console.log(`  ${String(n).padStart(6)}  ${t}`));
    console.log(`\nDRY-RUN: nada se escribió. Repetir con --apply.`);
    process.exit(0);
  }

  const tandas = chunk(medias, BATCH_SIZE);
  for (const [i, tanda] of tandas.entries()) {
    const results = await Promise.all(
      tanda.map(async (media) => ({ media, result: await rescueOne(media, token) }))
    );

    for (const { media, result } of results) {
      if (!result.ok) {
        totals.fail += 1;
        fallidos.push({
          id: String(media._id),
          name: String(media.name || ''),
          reason: result.reason,
        });
        continue;
      }
      // La URL se reescribe SOLO con el archivo ya en disco.
      await MediaModel.updateOne(
        { _id: media._id },
        {
          $set: {
            url: result.url,
            'metadata.legacyTelegramUrl': String(media.url || ''),
            'metadata.rescuedAt': new Date(),
          },
        }
      );
      totals.ok += 1;
      totals.bytes += result.bytes;
    }

    const hechas = Math.min((i + 1) * BATCH_SIZE, medias.length);
    console.log(
      `  tanda ${i + 1}/${tandas.length} — ${hechas}/${medias.length} · ` +
        `ok=${totals.ok} fallidos=${totals.fail} · ${(totals.bytes / 1048576).toFixed(1)}MB`
    );
    if (i < tandas.length - 1) await sleep(BATCH_PAUSE_MS);
  }

  console.log(
    `\nTOTAL: ${totals.ok} rescatadas · ${totals.fail} fallidas · ` +
      `${(totals.bytes / 1048576).toFixed(1)}MB traídos a disco`
  );
  if (fallidos.length) {
    console.log('\nFallidas (se pueden reintentar corriendo el script de nuevo):');
    fallidos.slice(0, 20).forEach((f) => console.log(`  ${f.id}  ${f.name}  → ${f.reason}`));
    if (fallidos.length > 20) console.log(`  … y ${fallidos.length - 20} más`);
  }
  process.exit(0);
};

void main();
