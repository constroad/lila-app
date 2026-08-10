/**
 * Dashboard de salud de la Mac mini: `/admin/health`.
 *
 * PARA QUÉ: hasta ahora el estado del sistema solo se veía por alertas de
 * Telegram (que avisan cuando algo se rompe) y el reporte diario. Faltaba poder
 * preguntar "¿cómo está TODO ahora mismo?" sin entrar por SSH.
 *
 * AUTENTICACIÓN — HTTP BASIC, a propósito:
 * Esta ruta se consulta desde un NAVEGADOR, y un navegador no puede mandar
 * headers propios al escribir una URL. Las alternativas eran peores:
 *   - `?key=<secreto>` en la query → el secreto termina en logs e historial.
 *   - Header `x-api-key` → imposible de usar desde la barra de direcciones.
 * Basic Auth lo resuelve nativo: el navegador pide usuario/contraseña y manda
 * la credencial en un header, no en la URL. Va sobre HTTPS (el Funnel), así que
 * viaja cifrada. La contraseña es `API_SECRET_KEY`; sin esa env la ruta se
 * apaga entera (fail-closed), nunca se sirve sin protección.
 *
 * EXPONE INFORMACIÓN SENSIBLE (versiones, rutas, nombres de empresas, estado de
 * sesiones): por eso el guard es obligatorio y no hay modo "solo lectura sin
 * credencial".
 */
import { Router, Request, Response, NextFunction } from 'express';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import logger from '../../utils/logger.js';

const execFileAsync = promisify(execFile);
const router = Router();

const BACKUP_CONFIG_DIR =
  process.env.BACKUP_HEARTBEAT_DIR || path.join(os.homedir(), '.config', 'constroad-backup');
const BACKUP_VOLUME = process.env.BACKUP_VOLUME || '/Volumes/CONSTROAD-BACKUP';

// ---- auth -----------------------------------------------------------------

function basicAuth(req: Request, res: Response, next: NextFunction): void {
  const esperado = process.env.API_SECRET_KEY;
  // Fail-closed: sin secreto configurado la ruta no existe, en vez de quedar
  // abierta. Un dashboard sin auth en un host público es una fuga de info.
  if (!esperado) {
    res.status(404).json({ success: false, error: { message: 'Not found', statusCode: 404 } });
    return;
  }

  const header = req.headers.authorization || '';
  if (header.startsWith('Basic ')) {
    const [, pass] = Buffer.from(header.slice(6), 'base64').toString().split(':');
    if (pass === esperado) return next();
  }
  // También se acepta el header directo, para consumo por script/curl.
  if (req.headers['x-api-key'] === esperado) return next();

  res.setHeader('WWW-Authenticate', 'Basic realm="lila-app health"');
  res.status(401).json({ success: false, error: { message: 'Unauthorized', statusCode: 401 } });
}

// ---- métricas --------------------------------------------------------------

/** Edad en segundos de un heartbeat de backup; -1 si nunca corrió. */
async function edadHeartbeat(archivo: string): Promise<number> {
  try {
    const raw = await fs.readFile(path.join(BACKUP_CONFIG_DIR, archivo), 'utf8');
    const epoch = Number(raw.trim());
    if (!Number.isFinite(epoch) || epoch <= 0) return -1;
    return Math.floor(Date.now() / 1000 - epoch);
  } catch {
    return -1;
  }
}

/**
 * CPU del sistema. `os.loadavg()` es instantáneo y no bloquea; se normaliza por
 * núcleo para que sea comparable con el 85% que vigila `check-resources.sh`.
 * NO se usa `top`, que tarda segundos y colgaría el request (ver §Performance:
 * nada lento en el camino de un request HTTP).
 */
function cpu(): { carga1: number; carga5: number; nucleos: number; pct: number } {
  const [c1, c5] = os.loadavg();
  const nucleos = os.cpus().length;
  return {
    carga1: Number(c1.toFixed(2)),
    carga5: Number(c5.toFixed(2)),
    nucleos,
    pct: Math.min(100, Math.round((c1 / nucleos) * 100)),
  };
}

/**
 * Memoria vía `memory_pressure`, NO vía `os.freemem()`.
 *
 * En macOS `os.freemem()` no cuenta como libre la memoria purgeable/caché, así
 * que reporta ~92% usado en un sistema que está al 38% real. Con eso el panel
 * marcaba 🔴 mientras `check-resources.sh` decía que todo estaba bien: dos
 * componentes del mismo sistema contradiciéndose sobre el mismo hecho, que es
 * exactamente la lección #5 de OBSERVABILITY-ALERTING. Se usa la MISMA fuente
 * que el chequeo que alerta.
 */
async function memoria(): Promise<{ totalGB: number; pct: number }> {
  const totalGB = Number((os.totalmem() / 1024 ** 3).toFixed(1));
  try {
    const { stdout } = await execFileAsync('/usr/bin/memory_pressure', [], { timeout: 4000 });
    const m = stdout.match(/System-wide memory free percentage:\s*(\d+)/);
    if (m) return { totalGB, pct: 100 - Number(m[1]) };
  } catch {
    /* cae al fallback de abajo */
  }
  // Fallback: sobreestima en macOS, pero es mejor que no mostrar nada.
  return { totalGB, pct: Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100) };
}

async function disco(ruta: string): Promise<{ libre: string; total: string; pct: number } | null> {
  try {
    const { stdout } = await execFileAsync('/bin/df', ['-h', ruta], { timeout: 4000 });
    const cols = stdout.trim().split('\n').pop()?.split(/\s+/) || [];
    if (cols.length < 5) return null;
    return { total: cols[1], libre: cols[3], pct: Number(cols[4].replace('%', '')) };
  } catch {
    return null;
  }
}

// ---- payload ---------------------------------------------------------------

async function construirEstado() {
  const [discoSistema, discoBackup, mem, medios, db, verificacion, recursos] = await Promise.all([
    disco('/'),
    disco(BACKUP_VOLUME),
    memoria(),
    edadHeartbeat('last-media-backup'),
    edadHeartbeat('last-db-backup'),
    edadHeartbeat('last-verify'),
    edadHeartbeat('last-resources'),
  ]);

  // Import dinámico: el módulo de sesiones arrastra Baileys y no queremos
  // acoplar el arranque del dashboard a él. Si falla, el resto del panel sigue
  // sirviendo — un panel de salud a medias es mejor que uno que no carga.
  let sesiones: { id: string; lista: boolean }[] = [];
  try {
    const s = await import('../../whatsapp/baileys/sessions.simple.js');
    sesiones = s.listSessions().map((id) => ({ id, lista: s.isWhatsAppSessionActive(id) }));
  } catch (error) {
    logger.warn(`admin/health: no se pudo leer el estado de WhatsApp: ${String(error)}`);
  }

  return {
    ahora: new Date().toISOString(),
    uptimeHoras: Number((os.uptime() / 3600).toFixed(1)),
    cpu: cpu(),
    memoria: mem,
    disco: { sistema: discoSistema, backup: discoBackup },
    // Umbrales IGUALES a los del watchdog y el reporte diario, para que los tres
    // no puedan contradecirse (lección #5 de OBSERVABILITY-ALERTING).
    backups: {
      medios: { segundos: medios, umbral: 25 * 3600 },
      base: { segundos: db, umbral: 2 * 3600 },
      verificacion: { segundos: verificacion, umbral: 8 * 24 * 3600 },
      recursos: { segundos: recursos, umbral: 2 * 3600 },
      offsite: { estado: 'no aplica (sin copia en la nube, por decisión)' },
    },
    whatsapp: sesiones,
  };
}

// ---- rutas -----------------------------------------------------------------

router.get('/health.json', basicAuth, async (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await construirEstado() });
  } catch (error) {
    logger.error('admin/health.json falló:', error);
    res.status(500).json({ success: false, error: { message: 'Error building health' } });
  }
});

router.get('/health', basicAuth, async (_req: Request, res: Response) => {
  try {
    const e = await construirEstado();
    res.type('html').send(renderHtml(e));
  } catch (error) {
    logger.error('admin/health falló:', error);
    res.status(500).type('html').send('<h1>Error construyendo el estado</h1>');
  }
});

// ---- vista -----------------------------------------------------------------

const humano = (s: number) =>
  s < 0 ? 'nunca' : s < 3600 ? `hace ${Math.floor(s / 60)} min` : s < 86400 ? `hace ${Math.floor(s / 3600)} h` : `hace ${Math.floor(s / 86400)} d`;

const ico = (s: number, umbral: number) => (s < 0 || s > umbral ? '🔴' : '✅');
const icoPct = (p: number, umbral: number) => (p >= umbral ? '🔴' : p >= umbral - 15 ? '🟡' : '✅');

function renderHtml(e: Awaited<ReturnType<typeof construirEstado>>): string {
  const b = e.backups;
  const fila = (etiqueta: string, valor: string, estado: string) =>
    `<tr><td>${estado}</td><td>${etiqueta}</td><td class="v">${valor}</td></tr>`;

  const sesiones = e.whatsapp.length
    ? e.whatsapp.map((s) => fila(s.id, s.lista ? 'lista' : 'no lista', s.lista ? '✅' : '🔴')).join('')
    : '<tr><td>—</td><td colspan="2">sin sesiones registradas</td></tr>';

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>lila-app · salud</title>
<style>
:root{color-scheme:dark light}
body{font:15px/1.5 -apple-system,system-ui,sans-serif;margin:0;padding:16px;
  background:#0f1115;color:#e6e6e6}
h1{font-size:19px;margin:0 0 4px} .sub{color:#8b93a1;font-size:13px;margin-bottom:18px}
h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#8b93a1;
  margin:22px 0 8px;font-weight:600}
table{width:100%;border-collapse:collapse;background:#171a21;border-radius:10px;overflow:hidden}
td{padding:11px 12px;border-bottom:1px solid #232733}
tr:last-child td{border-bottom:none}
td:first-child{width:30px;text-align:center}
.v{text-align:right;color:#9aa4b2;font-variant-numeric:tabular-nums}
@media(prefers-color-scheme:light){body{background:#f5f6f8;color:#1a1a1a}
  table{background:#fff}td{border-color:#e6e8ec}.v{color:#5a6472}}
</style></head><body>
<h1>lila-app · salud del sistema</h1>
<div class="sub">${new Date(e.ahora).toLocaleString('es-PE')} · uptime ${e.uptimeHoras} h · se refresca solo cada 30 s</div>

<h2>Recursos</h2>
<table>
${fila('CPU', `${e.cpu.pct}% · carga ${e.cpu.carga1} / ${e.cpu.nucleos} núcleos`, icoPct(e.cpu.pct, 85))}
${fila('Memoria', `${e.memoria.pct}% de ${e.memoria.totalGB} GB`, icoPct(e.memoria.pct, 90))}
${e.disco.sistema ? fila('Disco sistema', `${e.disco.sistema.pct}% · ${e.disco.sistema.libre} libres`, icoPct(e.disco.sistema.pct, 85)) : fila('Disco sistema', 'no disponible', '🔴')}
${e.disco.backup ? fila('Disco backup', `${e.disco.backup.pct}% · ${e.disco.backup.libre} libres`, icoPct(e.disco.backup.pct, 85)) : fila('Disco backup', 'DESCONECTADO', '🔴')}
</table>

<h2>Backups</h2>
<table>
${fila('Medios', humano(b.medios.segundos), ico(b.medios.segundos, b.medios.umbral))}
${fila('Base de datos', humano(b.base.segundos), ico(b.base.segundos, b.base.umbral))}
${fila('Verificación', humano(b.verificacion.segundos), ico(b.verificacion.segundos, b.verificacion.umbral))}
${fila('Copia en la nube', b.offsite.estado, '—')}
</table>

<h2>WhatsApp</h2>
<table>${sesiones}</table>

<script>setTimeout(()=>location.reload(),30000)</script>
</body></html>`;
}

export default router;
