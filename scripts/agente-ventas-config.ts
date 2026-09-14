/**
 * Configura el agente de ventas de una empresa (`bot_configs`), F2 del spec
 * WHATSAPP-AGENT-VERTICALS. Se corre a mano, una vez por empresa:
 *
 *   npx tsx scripts/agente-ventas-config.ts --company constroad --vertical asphalt \
 *     --enable --test 51999888777,51988777666 --notify 120363XXXX@g.us --show
 *
 *   --company   clave de tenant (companyId), obligatoria
 *   --vertical  asphalt | restaurant | appointments | transport (default asphalt)
 *   --enable / --disable
 *   --test      allowlist de números de cliente final (coma); --test all para abrir a todos
 *   --notify    JID (grupo o persona) a donde van los leads y las escaladas
 *   --pause     minutos de pausa cuando el dueño responde (default 30)
 *   --show      imprime la config resultante
 *
 * Además hace falta `WHATSAPP_AGENT_ENABLED=true` en el `.env` de producción y
 * una clave de LLM (`ANTHROPIC_API_KEY`, o `LLM_BASE_URL`+`LLM_API_KEY`+`LLM_MODEL`).
 */
import { getBotConfigModel } from '../src/database/bot.models.js';

const args = process.argv.slice(2);
const valor = (flag: string): string | undefined => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const company = valor('--company');
if (!company) {
  console.error('Falta --company');
  process.exit(1);
}
const set: Record<string, unknown> = { vertical: valor('--vertical') ?? 'asphalt', channelProvider: 'baileys' };
if (args.includes('--enable')) set.enabled = true;
if (args.includes('--disable')) set.enabled = false;
const test = valor('--test');
if (test) set.testNumbers = test === 'all' ? [] : test.split(',').map((t) => t.trim()).filter(Boolean);
const notify = valor('--notify');
if (notify) set.ownerNotifyTarget = notify;
const pause = valor('--pause');
if (pause) set.handoffPauseMinutes = Number(pause);

const Model = await getBotConfigModel();
const setOnInsert: Record<string, unknown> = { companyId: company };
if (set.enabled === undefined) setOnInsert.enabled = false;
await Model.updateOne({ companyId: company }, { $set: set, $setOnInsert: setOnInsert }, { upsert: true });
if (args.includes('--show')) console.log(JSON.stringify(await Model.findOne({ companyId: company }).lean(), null, 2));
console.log(`bot_configs de ${company} actualizado: ${JSON.stringify(set)}`);
process.exit(0);
