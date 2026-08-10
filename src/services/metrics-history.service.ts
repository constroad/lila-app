/**
 * Historia corta de métricas del host, para los gráficos del dashboard.
 *
 * POR QUÉ EXISTE: el panel mostraba solo valores instantáneos, y el diseño pide
 * gráficos de área — que necesitan una serie temporal. Un número suelto no
 * responde "¿esto viene subiendo?", que es la pregunta que hace útil al gráfico.
 *
 * DELIBERADAMENTE EN MEMORIA Y CORTO: 60 muestras cada 60s = 1 hora de
 * historia, ~1 KB. No es un sistema de series temporales ni pretende serlo; para
 * tendencias de días haría falta almacenamiento aparte (ver as-is §Monitoreo).
 * Se pierde al reiniciar y está bien: el gráfico es para ver la última hora, no
 * para auditar el mes.
 *
 * COSTO: `os.loadavg()` es gratis. `memory_pressure` spawnea un proceso, así que
 * se muestrea 1 vez por minuto y nunca en el camino de un request HTTP — la
 * regla de performance del proyecto es que nada lento cuelgue de un request.
 */
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import logger from '../utils/logger.js';

const execFileAsync = promisify(execFile);

export type Muestra = { t: number; cpu: number; ram: number };

const MAX_MUESTRAS = Number(process.env.METRICS_HISTORY_SIZE) || 60;
const INTERVALO_MS = Number(process.env.METRICS_SAMPLE_MS) || 60_000;

const historia: Muestra[] = [];
let timer: NodeJS.Timeout | null = null;

/** CPU como % de la capacidad total (carga de 1 min normalizada por núcleo). */
export function cpuPct(): number {
  const [c1] = os.loadavg();
  return Math.min(100, Math.round((c1 / os.cpus().length) * 100));
}

/**
 * RAM vía `memory_pressure`: en macOS `os.freemem()` no cuenta la memoria
 * purgeable como libre y sobreestima el uso ~3x. Debe coincidir con lo que
 * reporta `check-resources.sh`, que alerta con la misma fuente.
 */
export async function ramPct(): Promise<number> {
  try {
    const { stdout } = await execFileAsync('/usr/bin/memory_pressure', [], { timeout: 4000 });
    const m = stdout.match(/System-wide memory free percentage:\s*(\d+)/);
    if (m) return 100 - Number(m[1]);
  } catch {
    /* fallback abajo */
  }
  return Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100);
}

async function muestrear(): Promise<void> {
  try {
    const muestra: Muestra = { t: Date.now(), cpu: cpuPct(), ram: await ramPct() };
    historia.push(muestra);
    while (historia.length > MAX_MUESTRAS) historia.shift();
  } catch (error) {
    logger.warn(`metrics-history: muestreo falló: ${String(error)}`);
  }
}

/** Copia de la historia (más vieja → más nueva). */
export function obtenerHistoria(): Muestra[] {
  return [...historia];
}

export function startMetricsHistory(): void {
  if (timer) return;
  void muestrear(); // una muestra inmediata: si no, el gráfico arranca vacío
  timer = setInterval(() => void muestrear(), INTERVALO_MS);
  timer.unref?.();
  logger.info(
    `📈 Historia de métricas activa (${MAX_MUESTRAS} muestras cada ${INTERVALO_MS / 1000}s)`
  );
}

export function stopMetricsHistory(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
