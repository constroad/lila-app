/** Prueba el intérprete de anuncios CON el modelo sobre los mensajes reales: `npx tsx scripts/agente-anuncios.ts`. */
import { interpretarAnuncio } from '../src/agent/llm/anuncios.js';
const lunes = new Date('2026-09-14T10:23:00.000-05:00').getTime();
const martes = new Date('2026-09-15T11:00:00.000-05:00').getTime();
const casos: Array<[string, number]> = [
  ['📣📣📣 Jueves 17 tengo produccion de 137m3, 2 pulgadas', lunes],
  ['Buenos dias tenemos producción en INFRAMAQ 2 dias :\nMARTES 15-09 / H.de producion. 04:30 am / M3: 250.00 APROX.\nMIERCOLES 16-09 / H.de producion. 04:30 am / M3: 274.00 APROX.\nCliente : CONSORCIO LOMAS', lunes],
  ['mañana producción de globofast 200 m3 a las 5', lunes],
  ['la producción de globofast del jueves ya no va, pasa al viernes', martes],
  ['se suspende la producción del jueves por lluvia', martes],
  ['el jueves cambia: 160 m3 en vez de 137', martes],
  ['ayer terminamos a las 3 con 250 m3', martes],
  ['@lila hay producción mañana?', martes],
  ['ok gracias', martes],
  ['Buenos días, confirmamos producción viernes 18 04:30 am 225 m3 consorcio lomas', martes],
];
for (const [texto, ms] of casos) {
  const t0 = Date.now();
  const a = await interpretarAnuncio(texto, ms, { companyId: 'globofas-s8k', empresa: 'Globofast Solkali' });
  console.log(`\n«${texto.replace(/\n/g, ' ')}» (${Date.now() - t0} ms)\n  → ${JSON.stringify(a)}`);
}
process.exit(0);
