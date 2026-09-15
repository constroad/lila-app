/**
 * El examen de Lila CON modelo: `npm run agente:examen`.
 *
 * Corre cada caso del corpus por `decidirRuta` y, cuando la decisión es
 * `modelo`, le pregunta al modelo (carga 1,1 GB: por eso no va en `npm test`).
 * Informa herramienta %, argumentos %, y la lista de fallos. Se corre a mano
 * antes de un deploy que toque entendimiento y el resultado se anota en el
 * spec (§13.5.5): si baja un porcentaje respecto del último anotado, no se
 * despliega.
 */
import { readFileSync } from 'node:fs';
import { preguntaLimpia } from '../src/agent/consultas/catalogo.js';
import { decidirRuta } from '../src/agent/consultas/decision.js';
import { elegirHerramienta } from '../src/agent/llm/seleccion.js';
import { ahoraDe, contiene, examinar, formatear, type Caso } from '../src/agent/evaluacion/examen.js';

const corpus = JSON.parse(readFileSync(new URL('../src/agent/evaluacion/corpus.json', import.meta.url), 'utf8')) as Caso[];

const sinModelo = examinar(corpus);
console.log(`SIN modelo · ruta ${sinModelo.ruta} % · argumentos ${sinModelo.argumentos} % · ${sinModelo.ok}/${sinModelo.total}`);
for (const v of sinModelo.fallidos) console.log(formatear(v));

const conModelo = corpus.filter((c) => c.esperadoConModelo);
let ok = 0;
const fallos: string[] = [];
for (const c of conModelo) {
  const pregunta = preguntaLimpia(c.pregunta);
  const decision = decidirRuta(pregunta, { ahoraMs: ahoraDe(c.hoy) });
  if (decision.tipo !== 'modelo') {
    fallos.push(`  ✗ ${c.id}: no llegó al modelo (decisión ${decision.tipo})`);
    continue;
  }
  const inicio = Date.now();
  const eleccion = await elegirHerramienta(pregunta, undefined, ahoraDe(c.hoy));
  const ms = Date.now() - inicio;
  const bien = eleccion?.herramienta === c.esperadoConModelo!.herramienta && contiene(eleccion?.argumentos as Record<string, unknown>, c.esperadoConModelo!.argumentos);
  if (bien) ok += 1;
  else fallos.push(`  ✗ ${c.id} «${pregunta}» (${ms} ms)\n      esperado: ${JSON.stringify(c.esperadoConModelo)}\n      obtenido: ${eleccion ? JSON.stringify(eleccion) : 'ninguna'}`);
}
console.log(`CON modelo · ${ok}/${conModelo.length} herramienta+argumentos`);
for (const f of fallos) console.log(f);
process.exit(sinModelo.fallidos.length || fallos.length ? 1 : 0);
