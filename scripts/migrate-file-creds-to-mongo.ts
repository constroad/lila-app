/**
 * Migración ONE-SHOT: credenciales Baileys de archivos → MongoDB (`whatsapp_auth`).
 *
 * Por qué: antes las creds vivían en `data/sessions/{sender}/*.json` (useMultiFileAuthState).
 * Ahora la fuente de verdad es Mongo (portable entre máquinas). En PRODUCCIÓN las creds
 * existentes están en archivos de ESA máquina; si deployas el código nuevo sin migrar,
 * `restoreAllSessions` lee de Mongo (vacío) y te obliga a re-escanear QR. Este script
 * copia los archivos a Mongo para que la sesión restaure SIN re-emparejar.
 *
 * Idempotente (upsert). Seguro de re-correr. NO borra los archivos.
 *
 * Uso (en la máquina que tiene los archivos, p.ej. el server de prod):
 *   npx tsx scripts/migrate-file-creds-to-mongo.ts
 *   npx tsx scripts/migrate-file-creds-to-mongo.ts --dir ./data/sessions   # dir custom
 *
 * El formato del archivo (JSON.stringify(value, BufferJSON.replacer)) es EXACTAMENTE lo
 * que guarda el adapter de Mongo en `value`, así que basta JSON.parse + upsert.
 */
import fs from 'fs-extra';
import path from 'path';
import { getSharedConnection } from '../src/database/sharedConnection.js';
import { config } from '../src/config/environment.js';

const COLLECTION = 'whatsapp_auth';
const SESSION_ID_RE = /^\d{9,15}$/;
// El store de chats (no es credencial) NO se migra; vive como cache local liviano.
const SKIP_FILES = new Set(['baileys_store.json']);

const docId = (sessionId: string, key: string) => `${sessionId}:${key}`;

async function migrateSession(
  col: import('mongodb').Collection,
  sessionsDir: string,
  sessionId: string
): Promise<number> {
  const dir = path.join(sessionsDir, sessionId);
  const files = (await fs.readdir(dir)).filter(
    (file) => file.endsWith('.json') && !SKIP_FILES.has(file)
  );

  let migrated = 0;
  for (const file of files) {
    const key = file.replace(/\.json$/, '');
    const raw = await fs.readFile(path.join(dir, file), 'utf8');
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      console.warn(`  ⚠️  ${sessionId}/${file}: JSON inválido, se omite`);
      continue;
    }

    await col.updateOne(
      { _id: docId(sessionId, key) } as never,
      { $set: { sessionId, value } },
      { upsert: true }
    );
    migrated += 1;
  }
  return migrated;
}

async function main() {
  const dirArgIndex = process.argv.indexOf('--dir');
  const sessionsDir =
    dirArgIndex !== -1 && process.argv[dirArgIndex + 1]
      ? process.argv[dirArgIndex + 1]
      : config.whatsapp.sessionDir;

  if (!(await fs.pathExists(sessionsDir))) {
    console.error(`❌ No existe el directorio de sesiones: ${sessionsDir}`);
    process.exit(1);
  }

  const entries = await fs.readdir(sessionsDir, { withFileTypes: true });
  const sessionIds = entries
    .filter((entry) => entry.isDirectory() && SESSION_ID_RE.test(entry.name))
    .map((entry) => entry.name);

  if (sessionIds.length === 0) {
    console.log(`ℹ️  Sin sesiones por migrar en ${sessionsDir}`);
    process.exit(0);
  }

  console.log(`🔌 Conectando a Mongo (${config.mongodb.sharedDb})...`);
  const conn = await getSharedConnection();
  const col = conn.collection(COLLECTION);
  await col.createIndex({ sessionId: 1 }, { name: 'sessionId_1' });

  let total = 0;
  for (const sessionId of sessionIds) {
    const count = await migrateSession(col, sessionsDir, sessionId);
    total += count;
    console.log(`✅ ${sessionId}: ${count} documentos migrados`);
  }

  console.log(`\n🎉 Migración completa: ${total} documentos (${sessionIds.length} sesiones).`);
  console.log('   Los archivos NO se borraron. Verifica que las sesiones restauren y luego elimínalos si quieres.');
  await conn.close();
  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Migración falló:', error);
  process.exit(1);
});
