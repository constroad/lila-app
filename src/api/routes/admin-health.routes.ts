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

/**
 * Estado como {icono, etiqueta, tono}. NUNCA solo color: la paleta de estado
 * documenta que en superficie clara los tonos warning/serious quedan por debajo
 * de 3:1 de contraste, y que la mitigación es el par ÍCONO + ETIQUETA. Además,
 * un panel que distingue "ok" de "mal" solo por color es ilegible para daltónicos
 * y en impresión.
 */
type Estado = { ico: string; txt: string; tono: 'good' | 'warning' | 'critical' };
const OK: Estado = { ico: '●', txt: 'OK', tono: 'good' };
const ATENCION: Estado = { ico: '▲', txt: 'Atención', tono: 'warning' };
const CRITICO: Estado = { ico: '■', txt: 'Crítico', tono: 'critical' };

const porEdad = (s: number, umbral: number): Estado =>
  s < 0 || s > umbral ? CRITICO : s > umbral * 0.75 ? ATENCION : OK;
const porPct = (p: number, umbral: number): Estado =>
  p >= umbral ? CRITICO : p >= umbral - 15 ? ATENCION : OK;

const esc = (v: string) => v.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c] || c);

function renderHtml(e: Awaited<ReturnType<typeof construirEstado>>): string {
  const b = e.backups;

  // Medidor: barra fina anclada a la línea base, con extremo redondeado. El
  // número va afuera en tinta de texto — el color de la barra no debe ser el
  // único portador del dato.
  const medidor = (etiqueta: string, pct: number, detalle: string, st: Estado) => `
    <div class="m">
      <div class="mh"><span class="lbl">${esc(etiqueta)}</span>
        <span class="num">${pct}%</span></div>
      <div class="bar"><i class="t-${st.tono}" style="width:${Math.max(2, Math.min(100, pct))}%"></i></div>
      <div class="det">${esc(detalle)}</div>
    </div>`;

  const fila = (etiqueta: string, valor: string, st: Estado) => `
    <li><span class="ico t-${st.tono}" aria-hidden="true">${st.ico}</span>
      <span class="k">${esc(etiqueta)}</span>
      <span class="v">${esc(valor)}</span>
      <span class="tag t-${st.tono}">${st.txt}</span></li>`;

  const stCpu = porPct(e.cpu.pct, 85);
  const stMem = porPct(e.memoria.pct, 90);
  const stDs = e.disco.sistema ? porPct(e.disco.sistema.pct, 85) : CRITICO;
  const stDb = e.disco.backup ? porPct(e.disco.backup.pct, 85) : CRITICO;
  const stM = porEdad(b.medios.segundos, b.medios.umbral);
  const stB = porEdad(b.base.segundos, b.base.umbral);
  const stV = porEdad(b.verificacion.segundos, b.verificacion.umbral);

  const todos = [stCpu, stMem, stDs, stDb, stM, stB, stV];
  const criticos = todos.filter((x) => x.tono === 'critical').length;
  const avisos = todos.filter((x) => x.tono === 'warning').length;
  // Titular único: la pregunta real es "¿tengo que hacer algo?".
  const hero = criticos
    ? { tono: 'critical', ico: '■', txt: `${criticos} ${criticos === 1 ? 'problema' : 'problemas'}` }
    : avisos
      ? { tono: 'warning', ico: '▲', txt: `${avisos} ${avisos === 1 ? 'aviso' : 'avisos'}` }
      : { tono: 'good', ico: '●', txt: 'Todo en orden' };

  const sesiones = e.whatsapp.length
    ? e.whatsapp.map((s) => fila(s.id, s.lista ? 'conectada' : 'caída', s.lista ? OK : CRITICO)).join('')
    : '<li><span class="ico" aria-hidden="true">–</span><span class="k">sin sesiones registradas</span></li>';

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>lila-app · salud</title>
<style>
/* Superficies y tinta de la paleta validada. El modo oscuro se declara
   explícitamente (no es un invertido automático del claro). */
:root{
  --sf:#fcfcfb; --sf2:#ffffff; --ink:#0b0b0b; --ink2:#52514e; --line:#e7e6e2;
  --good:#0ca30c; --warn:#fab219; --crit:#d03b3b;
  color-scheme:light;
}
@media (prefers-color-scheme:dark){
  :root:where(:not([data-theme="light"])){
    --sf:#131312; --sf2:#1a1a19; --ink:#ffffff; --ink2:#c3c2b7; --line:#2b2b28;
    color-scheme:dark;
  }
}
:root[data-theme="dark"]{
  --sf:#131312; --sf2:#1a1a19; --ink:#ffffff; --ink2:#c3c2b7; --line:#2b2b28;
  color-scheme:dark;
}
*{box-sizing:border-box}
body{margin:0;padding:20px 16px 40px;background:var(--sf);color:var(--ink);
  font:15px/1.5 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;
  -webkit-font-smoothing:antialiased;max-width:640px;margin-inline:auto}
.t-good{--c:var(--good)} .t-warning{--c:var(--warn)} .t-critical{--c:var(--crit)}

header{margin-bottom:22px}
h1{font-size:14px;font-weight:600;letter-spacing:.02em;color:var(--ink2);margin:0 0 14px}
.hero{display:flex;align-items:center;gap:12px}
.hero .dot{font-size:26px;line-height:1;color:var(--c)}
.hero .txt{font-size:27px;font-weight:650;letter-spacing:-.02em}
.meta{color:var(--ink2);font-size:13px;margin-top:6px}

h2{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.09em;
  color:var(--ink2);margin:26px 0 10px}

.card{background:var(--sf2);border:1px solid var(--line);border-radius:14px;padding:4px 14px}
.m{padding:12px 0;border-bottom:1px solid var(--line)}
.m:last-child{border-bottom:none}
.mh{display:flex;justify-content:space-between;align-items:baseline}
.lbl{font-size:14px}
.num{font-size:14px;font-weight:600;font-variant-numeric:tabular-nums}
/* Barra fina, extremo redondeado, anclada a la base. */
.bar{height:6px;background:var(--line);border-radius:3px;margin:7px 0 5px;overflow:hidden}
.bar i{display:block;height:100%;border-radius:3px;background:var(--c);transition:width .3s}
.det{font-size:12px;color:var(--ink2);font-variant-numeric:tabular-nums}

ul{list-style:none;margin:0;padding:0}
li{display:flex;align-items:center;gap:10px;padding:13px 0;border-bottom:1px solid var(--line)}
li:last-child{border-bottom:none}
.ico{color:var(--c);font-size:11px;width:12px;text-align:center;flex:none}
.k{flex:1;font-size:14px}
.v{color:var(--ink2);font-size:13px;font-variant-numeric:tabular-nums}
/* Etiqueta de texto junto al color: el estado nunca se lee solo por el tono. */
.tag{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;
  color:var(--c);border:1px solid var(--c);border-radius:5px;padding:2px 6px;flex:none}
.na{color:var(--ink2);font-size:13px;padding:13px 0}
footer{margin-top:24px;color:var(--ink2);font-size:12px;text-align:center}
</style></head><body>

<header>
  <h1>lila-app · salud del sistema</h1>
  <div class="hero t-${hero.tono}">
    <span class="dot" aria-hidden="true">${hero.ico}</span>
    <span class="txt">${hero.txt}</span>
  </div>
  <div class="meta">${new Date(e.ahora).toLocaleString('es-PE')} · uptime ${e.uptimeHoras} h</div>
</header>

<h2>Recursos</h2>
<div class="card">
  ${medidor('CPU', e.cpu.pct, `carga ${e.cpu.carga1} · ${e.cpu.nucleos} núcleos`, stCpu)}
  ${medidor('Memoria', e.memoria.pct, `${e.memoria.totalGB} GB totales`, stMem)}
  ${e.disco.sistema ? medidor('Disco del sistema', e.disco.sistema.pct, `${e.disco.sistema.libre} libres de ${e.disco.sistema.total}`, stDs) : '<div class="na">Disco del sistema no disponible</div>'}
  ${e.disco.backup ? medidor('Disco de backup', e.disco.backup.pct, `${e.disco.backup.libre} libres de ${e.disco.backup.total}`, stDb) : '<div class="na">■ Disco de backup DESCONECTADO</div>'}
</div>

<h2>Backups</h2>
<div class="card"><ul>
  ${fila('Medios', humano(b.medios.segundos), stM)}
  ${fila('Base de datos', humano(b.base.segundos), stB)}
  ${fila('Verificación', humano(b.verificacion.segundos), stV)}
  <li><span class="ico" aria-hidden="true">–</span><span class="k">Copia en la nube</span>
    <span class="v">${esc(b.offsite.estado)}</span></li>
</ul></div>

<h2>WhatsApp</h2>
<div class="card"><ul>${sesiones}</ul></div>

<footer>se actualiza solo cada 30 s</footer>
<script>setTimeout(()=>location.reload(),30000)</script>
</body></html>`;
}

export default router;
