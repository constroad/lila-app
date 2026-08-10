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
 * Estado como {icono, etiqueta, tono}. NUNCA solo color: un panel que distingue
 * "ok" de "mal" únicamente por el tono es ilegible para daltónicos y en
 * impresión. El diseño de Stitch ya usa ícono + texto, así que ambas cosas
 * coinciden.
 */
type Estado = { ico: string; txt: string; tono: 'ok' | 'warn' | 'bad' };
const OK: Estado = { ico: 'check_circle', txt: 'Nominal', tono: 'ok' };
const ATENCION: Estado = { ico: 'warning', txt: 'Atención', tono: 'warn' };
const CRITICO: Estado = { ico: 'error', txt: 'Crítico', tono: 'bad' };

const porEdad = (s: number, umbral: number): Estado =>
  s < 0 || s > umbral ? CRITICO : s > umbral * 0.75 ? ATENCION : OK;
const porPct = (p: number, umbral: number): Estado =>
  p >= umbral ? CRITICO : p >= umbral - 15 ? ATENCION : OK;

const esc = (v: string) => v.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c] || c);

/**
 * Lenguaje visual tomado del proyecto de Stitch "Unified System Monitor"
 * (pantalla "Panel de Monitoreo - Mobile"): superficies azul marino
 * (#0b1326 / #171f33), acento cian (#4cd6ff), verde esmeralda para "online",
 * tipografía Inter e iconografía Material Symbols. Los datos son reales; solo
 * el lenguaje visual viene del diseño.
 */
function renderHtml(e: Awaited<ReturnType<typeof construirEstado>>): string {
  const b = e.backups;

  const stCpu = porPct(e.cpu.pct, 85);
  const stMem = porPct(e.memoria.pct, 90);
  const stDs = e.disco.sistema ? porPct(e.disco.sistema.pct, 85) : CRITICO;
  const stDb = e.disco.backup ? porPct(e.disco.backup.pct, 85) : CRITICO;
  const stM = porEdad(b.medios.segundos, b.medios.umbral);
  const stB = porEdad(b.base.segundos, b.base.umbral);
  const stV = porEdad(b.verificacion.segundos, b.verificacion.umbral);

  const todos = [stCpu, stMem, stDs, stDb, stM, stB, stV];
  const malos = todos.filter((x) => x.tono === 'bad').length;
  const avisos = todos.filter((x) => x.tono === 'warn').length;
  const global = malos ? CRITICO : avisos ? ATENCION : OK;
  const globalTxt = malos
    ? `${malos} ${malos === 1 ? 'problema' : 'problemas'}`
    : avisos
      ? `${avisos} ${avisos === 1 ? 'aviso' : 'avisos'}`
      : 'System Nominal';

  const uptime = e.uptimeHoras >= 24
    ? `${Math.floor(e.uptimeHoras / 24)}D ${Math.round(e.uptimeHoras % 24)}H`
    : `${e.uptimeHoras.toFixed(1)}H`;

  // Tarjeta de métrica: ícono, etiqueta en mayúsculas, número grande y barra fina.
  const metrica = (ico: string, etiqueta: string, pct: number, detalle: string, st: Estado) => `
    <div class="mc">
      <div class="mc-h"><span class="ms">${ico}</span><span>${esc(etiqueta)}</span></div>
      <div class="mc-v t-${st.tono}">${pct}%</div>
      <div class="bar"><i class="t-${st.tono}" style="width:${Math.max(2, Math.min(100, pct))}%"></i></div>
      <div class="mc-d">${esc(detalle)}</div>
    </div>`;

  const filaBackup = (ico: string, titulo: string, sub: string, st: Estado) => `
    <div class="row">
      <div class="row-ico t-${st.tono}"><span class="ms">${ico}</span></div>
      <div class="row-txt"><div class="row-t">${esc(titulo)}<span class="dot t-${st.tono}"></span></div>
        <div class="row-s">${esc(sub)}</div></div>
      <div class="row-tag t-${st.tono}">${st.txt}</div>
    </div>`;

  const sesiones = e.whatsapp.length
    ? e.whatsapp
        .map((s) => `
    <div class="row">
      <div class="row-ico ${s.lista ? 't-ok' : 't-bad'}"><span class="ms">smartphone</span></div>
      <div class="row-txt"><div class="row-t">+${esc(s.id)}</div>
        <div class="row-s"><span class="dot ${s.lista ? 't-ok' : 't-bad'}"></span>${s.lista ? 'conectada' : 'caída'}</div></div>
      <div class="row-tag ${s.lista ? 't-ok' : 't-bad'}">${s.lista ? 'ONLINE' : 'OFFLINE'}</div>
    </div>`)
        .join('')
    : '<div class="empty">Sin sesiones registradas</div>';

  const online = e.whatsapp.filter((s) => s.lista).length;

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>lila-app · monitor</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20,400,0,0&display=swap" rel="stylesheet">
<style>
/* Tokens del proyecto Stitch "Unified System Monitor". Es un tema oscuro
   deliberado (no un invertido del claro), así que se fija color-scheme. */
:root{
  --bg:#0b1326; --card:#171f33; --card2:#131b2e; --line:#2d3449; --bright:#31394d;
  --ink:#dae2fd; --ink2:#bbc9cf; --ink3:#8e9bb3;
  --accent:#4cd6ff; --accent2:#00d1ff;
  --ok:#10b981; --warn:#feb127; --bad:#ff6b6b;
  color-scheme:dark;
}
*{box-sizing:border-box}
body{margin:0;padding:0;background:var(--bg);color:var(--ink);
  font-family:Inter,-apple-system,system-ui,sans-serif;font-size:14px;
  -webkit-font-smoothing:antialiased}
.ms{font-family:'Material Symbols Outlined';font-size:16px;line-height:1;
  font-variation-settings:'FILL' 0,'wght' 400}
.wrap{max-width:760px;margin:0 auto;padding:0 16px 40px}
.t-ok{--c:var(--ok)} .t-warn{--c:var(--warn)} .t-bad{--c:var(--bad)}

/* Barra superior: marca + chips de estado, como en el diseño. */
.top{display:flex;align-items:center;gap:12px;padding:16px 0 14px;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:9px}
.logo{width:30px;height:30px;border-radius:8px;background:var(--accent);
  color:#003543;display:grid;place-items:center}
.logo .ms{font-size:19px;font-variation-settings:'FILL' 1}
.bname{font-weight:700;letter-spacing:.06em;font-size:14px}
.bsub{font-size:9px;letter-spacing:.14em;color:var(--ink3);text-transform:uppercase}
.chips{display:flex;gap:7px;margin-left:auto;flex-wrap:wrap}
.chip{display:flex;align-items:center;gap:6px;background:var(--card);
  border:1px solid var(--line);padding:5px 10px;border-radius:7px;font-size:11px}
.chip b{color:var(--accent);font-weight:600;font-variant-numeric:tabular-nums}
.chip .k{color:var(--ink3);text-transform:uppercase;letter-spacing:.07em;font-size:9px}

/* Estado global: la primera pregunta al abrir es "¿tengo que hacer algo?". */
.hero{display:flex;align-items:center;gap:11px;background:var(--card2);
  border:1px solid var(--line);border-radius:13px;padding:15px 17px;margin-bottom:20px}
.hero .ms{font-size:26px;color:var(--c)}
.hero .h1{font-size:20px;font-weight:650;letter-spacing:-.01em}
.hero .h2{font-size:11.5px;color:var(--ink3);margin-top:2px}

h2{font-size:11px;font-weight:600;letter-spacing:.11em;text-transform:uppercase;
  color:var(--ink3);margin:0 0 11px;display:flex;align-items:center;gap:8px}
h2 .n{margin-left:auto;color:var(--ink3);font-weight:500;letter-spacing:.04em}
section{margin-bottom:24px}

/* Métricas en grilla, como las tarjetas CPU/RAM/DISK del diseño. */
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.mc{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:13px 14px}
.mc-h{display:flex;align-items:center;gap:7px;color:var(--ink3);font-size:10px;
  text-transform:uppercase;letter-spacing:.09em}
.mc-h .ms{font-size:14px}
.mc-v{font-size:25px;font-weight:700;margin:7px 0 9px;color:var(--c);
  font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.bar{height:4px;background:var(--bright);border-radius:2px;overflow:hidden}
.bar i{display:block;height:100%;border-radius:2px;background:var(--c)}
.mc-d{font-size:10.5px;color:var(--ink3);margin-top:8px;font-variant-numeric:tabular-nums}

/* Filas de lista: ícono, título, subtítulo y etiqueta de estado. */
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.row{display:flex;align-items:center;gap:12px;padding:13px 14px;border-bottom:1px solid var(--line)}
.row:last-child{border-bottom:none}
.row-ico{width:34px;height:34px;border-radius:9px;background:var(--card2);
  display:grid;place-items:center;color:var(--c);flex:none}
.row-txt{flex:1;min-width:0}
.row-t{font-size:13.5px;font-weight:550;display:flex;align-items:center;gap:7px}
.row-s{font-size:11px;color:var(--ink3);margin-top:2px;display:flex;align-items:center;gap:6px;
  font-variant-numeric:tabular-nums}
.dot{width:6px;height:6px;border-radius:50%;background:var(--c);flex:none}
/* Etiqueta de texto además del color: el estado nunca se lee solo por el tono. */
.row-tag{font-size:9.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;
  color:var(--c);border:1px solid var(--c);border-radius:5px;padding:3px 7px;flex:none;opacity:.9}
.empty{padding:15px;color:var(--ink3);font-size:12.5px}
footer{text-align:center;color:var(--ink3);font-size:10.5px;margin-top:26px;
  letter-spacing:.05em;text-transform:uppercase}
</style></head><body><div class="wrap">

<div class="top">
  <div class="brand">
    <div class="logo"><span class="ms">monitoring</span></div>
    <div><div class="bname">LILA-APP</div><div class="bsub">Mac mini · node 01</div></div>
  </div>
  <div class="chips">
    <div class="chip"><span class="k">Uptime</span><b>${uptime}</b></div>
    <div class="chip"><span class="k">CPU</span><b>${e.cpu.pct}%</b></div>
    <div class="chip"><span class="k">RAM</span><b>${e.memoria.pct}%</b></div>
  </div>
</div>

<div class="hero t-${global.tono}">
  <span class="ms">${global.ico}</span>
  <div><div class="h1">${globalTxt}</div>
    <div class="h2">${new Date(e.ahora).toLocaleString('es-PE')}</div></div>
</div>

<section>
  <h2>Recursos</h2>
  <div class="grid">
    ${metrica('memory', 'CPU', e.cpu.pct, `carga ${e.cpu.carga1} · ${e.cpu.nucleos} núcleos`, stCpu)}
    ${metrica('developer_board', 'RAM', e.memoria.pct, `${e.memoria.totalGB} GB totales`, stMem)}
    ${e.disco.sistema ? metrica('hard_drive', 'Disco sistema', e.disco.sistema.pct, `${e.disco.sistema.libre} libres`, stDs) : ''}
    ${e.disco.backup ? metrica('backup', 'Disco backup', e.disco.backup.pct, `${e.disco.backup.libre} libres`, stDb) : '<div class="mc"><div class="mc-h"><span class="ms">backup</span><span>Disco backup</span></div><div class="mc-v t-bad">—</div><div class="mc-d">DESCONECTADO</div></div>'}
  </div>
</section>

<section>
  <h2>Backups <span class="n">${b.offsite.estado.includes('decisión') ? 'sin copia en la nube' : ''}</span></h2>
  <div class="card">
    ${filaBackup('perm_media', 'Medios', humano(b.medios.segundos), stM)}
    ${filaBackup('database', 'Base de datos', humano(b.base.segundos), stB)}
    ${filaBackup('verified', 'Verificación', humano(b.verificacion.segundos), stV)}
  </div>
</section>

<section>
  <h2>Sesiones WhatsApp <span class="n">${online} online</span></h2>
  <div class="card">${sesiones}</div>
</section>

<footer>se actualiza cada 30 s</footer>
</div>
<script>setTimeout(()=>location.reload(),30000)</script>
</body></html>`;
}

export default router;
