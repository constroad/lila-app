/**
 * Dead man's switch de los backups.
 *
 * EL PROBLEMA QUE RESUELVE: un backup que NO corre no genera ningún error —
 * simplemente no ocurre. Los agentes launchd alertan cuando FALLAN, pero nadie
 * avisa si dejan de dispararse: plist desinstalado, disco desconectado por
 * semanas, o —el caso que motivó esto— migrar el servicio a otra máquina y
 * olvidar correr `scripts/install-backup-agent.sh`, porque el plist vive en
 * ~/Library/LaunchAgents y NO viaja con el repo git.
 *
 * POR QUÉ ACÁ Y NO EN UN AGENTE launchd: un vigilante que comparte mecanismo
 * con lo vigilado no sirve — si se pierde el agendado, se pierden ambos. Este
 * corre dentro de lila, que es un mecanismo independiente. Y a la inversa, el
 * backup NO corre dentro de lila (ver install-backup-agent.sh): si lila está
 * caída los backups siguen, que es justo cuando más falta hacen. Cada uno cuida
 * al otro.
 *
 * POR QUÉ NO ES UN CRONJOB DE MONGO: el JobExecutor solo soporta `message` y
 * `api`; agregar un tipo "ejecutar comando" convertiría un write a la colección
 * `cronjobs` en ejecución remota de código. Esto es código, no configuración.
 */
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { sendTelegramAlert } from './telegram-alert.service.js';
import logger from '../utils/logger.js';

const HEARTBEAT_DIR =
  process.env.BACKUP_HEARTBEAT_DIR || path.join(os.homedir(), '.config', 'constroad-backup');

// Umbral = frecuencia + 1h de gracia. Un job "cada 24h" nunca corre exactamente
// cada 24h; sin la gracia, el jitter normal dispararía falsas alarmas y la
// alerta se volvería ruido que se ignora.
type Vigilado = { nombre: string; archivo: string; maxHoras: number };

const VIGILADOS: Vigilado[] = [
  { nombre: 'medios', archivo: 'last-media-backup', maxHoras: 25 },
  { nombre: 'base de datos', archivo: 'last-db-backup', maxHoras: 2 },
  // La verificación semanal también se vigila: un backup que corre pero nunca
  // se prueba es exactamente el escenario que 3-2-1-1-0 quiere evitar. 7 días
  // + 1 de gracia.
  { nombre: 'verificación', archivo: 'last-verify', maxHoras: 8 * 24 },
];

const CHECK_INTERVAL_MS = Number(process.env.BACKUP_WATCHDOG_INTERVAL_MS) || 60 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;

/** Antigüedad del heartbeat en horas; `null` si nunca hubo un backup exitoso. */
async function horasDesdeUltimoBackup(archivo: string): Promise<number | null> {
  try {
    const raw = await fs.readFile(path.join(HEARTBEAT_DIR, archivo), 'utf8');
    const epoch = Number(raw.trim());
    if (!Number.isFinite(epoch) || epoch <= 0) return null;
    return (Date.now() - epoch * 1000) / 3_600_000;
  } catch {
    return null; // no existe el archivo: nunca corrió, o se perdió el agendado
  }
}

/** Una pasada de verificación. Exportada para poder testearla sin timers. */
export async function checkBackupHeartbeats(): Promise<
  { nombre: string; horas: number | null; vencido: boolean }[]
> {
  const resultados = await Promise.all(
    VIGILADOS.map(async (v) => {
      const horas = await horasDesdeUltimoBackup(v.archivo);
      return { nombre: v.nombre, horas, vencido: horas === null || horas > v.maxHoras };
    })
  );

  for (const [i, r] of resultados.entries()) {
    if (!r.vencido) continue;
    const { maxHoras } = VIGILADOS[i];
    const detalle =
      r.horas === null
        ? 'NUNCA se registró un backup exitoso'
        : `último backup hace ${r.horas.toFixed(1)}h (máximo tolerado: ${maxHoras}h)`;

    logger.error(`🚨 Backup de ${r.nombre} vencido — ${detalle}`);
    // dedupeKey por vigilado: mientras siga vencido, 1 alerta cada 5 min como
    // máximo (dedupe de sendTelegramAlert), no una por chequeo.
    void sendTelegramAlert({
      dedupeKey: `backup-stale-${r.nombre}`,
      message:
        `🚨 BACKUP DE ${r.nombre.toUpperCase()} DETENIDO\n\n` +
        `${detalle}.\n\n` +
        `No es que el backup haya fallado: es que dejó de ejecutarse. Causas ` +
        `típicas: el SSD no está conectado, o el agente launchd no está instalado ` +
        `(pasa al migrar de máquina — el plist no viaja con el repo).\n\n` +
        `Verificar:\n` +
        `  launchctl list | grep constroad.backup\n` +
        `  ls /Volumes/CONSTROAD-BACKUP\n\n` +
        `Reinstalar agendado: scripts/install-backup-agent.sh`,
    }).catch(() => {});
  }

  return resultados;
}

/** Arranca la vigilancia periódica (idempotente). */
export function startBackupWatchdog(): void {
  if (timer) return;
  // Primera pasada al arrancar: si el agendado se perdió, se detecta en el
  // próximo restart de lila en vez de esperar el intervalo completo.
  void checkBackupHeartbeats().catch((error) =>
    logger.warn(`Backup watchdog: primera pasada falló: ${String(error)}`)
  );
  timer = setInterval(() => {
    void checkBackupHeartbeats().catch((error) =>
      logger.warn(`Backup watchdog falló: ${String(error)}`)
    );
  }, CHECK_INTERVAL_MS);
  timer.unref?.();
  logger.info(
    `🛡️ Backup watchdog activo (cada ${CHECK_INTERVAL_MS / 60000} min; medios ≤25h, base ≤2h)`
  );
}

export function stopBackupWatchdog(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
