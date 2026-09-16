/**
 * Alta (idempotente) de un miembro de Dali, hasta que exista constroad-auth (F2):
 * `npx tsx scripts/dali-miembro.ts <companyId> <identidad> "<nombre>" [owner|sales|viewer|operator]`.
 * El operador de la plataforma (la consola S1–S4) va con companyId `*`:
 * `npx tsx scripts/dali-miembro.ts '*' 51902049935 "José" operator`.
 */
import { getBotMemberModel, normalizarIdentidad, esIdentidadValida } from '../src/agent/dali/miembros.js';

const [companyId, destino, nombre, rol = 'owner'] = process.argv.slice(2);
if (!companyId || !destino || !nombre) {
  console.error('uso: dali-miembro.ts <companyId> <identidad> "<nombre>" [owner|sales|viewer|operator]');
  process.exit(1);
}
const identity = normalizarIdentidad(destino);
if (!esIdentidadValida(identity)) {
  console.error(`identidad inválida: ${destino}`);
  process.exit(1);
}
const Member = await getBotMemberModel();
const r = await Member.updateOne({ companyId, identity }, { $set: { name: nombre, role: rol }, $setOnInsert: { receivesAlerts: true } }, { upsert: true });
console.log(r.upsertedCount ? `alta: ${nombre} (${identity}) en ${companyId} como ${rol}` : `actualizado: ${nombre} (${identity}) en ${companyId} como ${rol}`);
process.exit(0);
