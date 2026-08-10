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
import { obtenerHistoria, cpuPct, ramPct } from '../../services/metrics-history.service.js';

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

function cpu(): { carga1: number; nucleos: number; pct: number } {
  const [c1] = os.loadavg();
  return { carga1: Number(c1.toFixed(2)), nucleos: os.cpus().length, pct: cpuPct() };
}

async function memoria(): Promise<{ totalGB: number; pct: number }> {
  return { totalGB: Number((os.totalmem() / 1024 ** 3).toFixed(1)), pct: await ramPct() };
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
    historia: obtenerHistoria(),
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
 * Gráfico de área en SVG puro — sin librerías: son ~15 puntos y una curva; traer
 * una dependencia de charting para esto sería desproporcionado, y el CSP de la
 * app no permite scripts externos.
 *
 * Eje Y FIJO 0-100: es un porcentaje. Autoescalar haría que una variación de 2%
 * se viera como una montaña, que es el error clásico de los sparklines.
 */
function areaChart(valores: number[], id: string, color: string): string {
  const W = 300, H = 64;
  if (valores.length < 2) {
    return `<div class="chart-empty">acumulando datos…</div>`;
  }
  const paso = W / (valores.length - 1);
  const y = (v: number) => H - (Math.max(0, Math.min(100, v)) / 100) * (H - 6) - 3;
  const pts = valores.map((v, i) => `${(i * paso).toFixed(1)},${y(v).toFixed(1)}`);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="g-${id}" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity=".38"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="M0,${H} L${pts.join(' L')} L${W},${H} Z" fill="url(#g-${id})"/>
    <polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="2"
      stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
  </svg>`;
}

/**
 * Lenguaje visual del proyecto Stitch "Unified System Monitor" — las tres
 * pantallas (mobile / tablet / desktop) resueltas en UN documento responsive con
 * breakpoints, en vez de tres HTML distintos: los datos y la lógica de estado
 * son los mismos, solo cambia la disposición.
 *
 * La sidebar del diseño navega entre PANTALLAS (Overview, System Performance,
 * Backups, WhatsApp Sessions). Acá hay una sola página, así que sus ítems son
 * anclas a las secciones — la adaptación honesta de esa navegación.
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

  const hCpu = e.historia.map((m) => m.cpu);
  const hRam = e.historia.map((m) => m.ram);
  const span = e.historia.length > 1
    ? `últimos ${Math.round((e.historia[e.historia.length - 1].t - e.historia[0].t) / 60000)} min`
    : 'sin historia aún';

  const nav = (ico: string, txt: string, href: string, activo = false) =>
    `<a class="nav${activo ? ' on' : ''}" href="${href}"><span class="ms">${ico}</span>${txt}</a>`;

  const filaBackup = (ico: string, titulo: string, sub: string, st: Estado) => `
    <div class="row">
      <div class="row-ico t-${st.tono}"><span class="ms">${ico}</span></div>
      <div class="row-txt"><div class="row-t">${esc(titulo)}</div><div class="row-s">${esc(sub)}</div></div>
      <div class="row-tag t-${st.tono}">${st.txt}</div>
    </div>`;

  const sesiones = e.whatsapp.length
    ? e.whatsapp.map((s) => `
    <div class="row">
      <div class="row-ico ${s.lista ? 't-ok' : 't-bad'}"><span class="ms">smartphone</span></div>
      <div class="row-txt"><div class="row-t">+${esc(s.id)}</div>
        <div class="row-s"><span class="dot ${s.lista ? 't-ok' : 't-bad'}"></span>${s.lista ? 'activa' : 'caída'}</div></div>
      <div class="row-tag ${s.lista ? 't-ok' : 't-bad'}">${s.lista ? 'ONLINE' : 'OFFLINE'}</div>
    </div>`).join('')
    : '<div class="empty">Sin sesiones registradas</div>';

  const online = e.whatsapp.filter((s) => s.lista).length;

  const mini = (etiqueta: string, valor: string, st: Estado) => `
    <div class="mini">
      <div class="mini-k">${esc(etiqueta)}</div>
      <div class="mini-v t-${st.tono}">${esc(valor)}</div>
    </div>`;

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>lila-app · monitor</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20,400,0,0&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#0b1326; --card:#171f33; --card2:#131b2e; --line:#2d3449; --bright:#31394d;
  --ink:#dae2fd; --ink2:#bbc9cf; --ink3:#8e9bb3;
  --accent:#4cd6ff; --ok:#10b981; --warn:#feb127; --bad:#ff6b6b;
  --sw:212px;              /* ancho de la sidebar */
  color-scheme:dark;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:var(--bg);color:var(--ink);
  font-family:Inter,-apple-system,system-ui,sans-serif;font-size:14px;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
.ms{font-family:'Material Symbols Outlined';font-size:18px;line-height:1;font-variation-settings:'FILL' 0,'wght' 400}
.t-ok{--c:var(--ok)} .t-warn{--c:var(--warn)} .t-bad{--c:var(--bad)}

/* ---------- SIDEBAR: fija desde 900px, oculta en mobile ---------- */
.side{position:fixed;inset:0 auto 0 0;width:var(--sw);background:var(--card2);
  border-right:1px solid var(--line);padding:16px 12px;display:none;flex-direction:column;z-index:10}
.brand{display:flex;align-items:center;gap:9px;padding:4px 6px 18px}
.logo{width:32px;height:32px;border-radius:9px;background:var(--accent);color:#003543;
  display:grid;place-items:center;flex:none}
.logo .ms{font-size:20px;font-variation-settings:'FILL' 1}
.bname{font-weight:700;letter-spacing:.05em;font-size:13.5px}
.bsub{font-size:8.5px;letter-spacing:.13em;color:var(--ink3);text-transform:uppercase;margin-top:1px}
.nav{display:flex;align-items:center;gap:11px;padding:9px 11px;border-radius:9px;
  font-size:13px;color:var(--ink2);margin-bottom:2px}
.nav:hover{background:var(--card)}
.nav.on{background:var(--accent);color:#003543;font-weight:600}
.sec{font-size:8.5px;letter-spacing:.15em;color:var(--ink3);text-transform:uppercase;
  padding:16px 11px 7px}
.side-foot{margin-top:auto;display:flex;align-items:center;gap:9px;padding:11px 8px 2px;
  border-top:1px solid var(--line)}
.avatar{width:28px;height:28px;border-radius:50%;background:var(--accent);color:#003543;
  display:grid;place-items:center;flex:none}
.avatar .ms{font-size:17px;font-variation-settings:'FILL' 1}

/* ---------- MAIN ---------- */
.main{padding:14px 16px 40px;max-width:1500px}
.top{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px}
.top-brand{display:flex;align-items:center;gap:9px}
.chips{display:flex;gap:7px;margin-left:auto;flex-wrap:wrap}
.chip{display:flex;align-items:center;gap:6px;background:var(--card);border:1px solid var(--line);
  padding:5px 10px;border-radius:7px;font-size:11px;white-space:nowrap}
.chip b{color:var(--accent);font-weight:600;font-variant-numeric:tabular-nums}
.chip .k{color:var(--ink3);text-transform:uppercase;letter-spacing:.07em;font-size:9px}

h1{font-size:19px;font-weight:650;letter-spacing:-.01em;margin:0 0 14px;
  display:flex;align-items:center;gap:11px;flex-wrap:wrap}
.badge{font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);
  border:1px solid var(--accent);border-radius:5px;padding:3px 7px;opacity:.85}
h2{font-size:11px;font-weight:600;letter-spacing:.11em;text-transform:uppercase;color:var(--ink3);
  margin:0 0 11px;display:flex;align-items:center;gap:8px}
h2 .n{margin-left:auto;font-weight:500;letter-spacing:.04em}
section{margin-bottom:22px;scroll-margin-top:14px}

/* Estado global */
.hero{display:flex;align-items:center;gap:12px;background:var(--card2);border:1px solid var(--line);
  border-radius:13px;padding:15px 17px;margin-bottom:18px}
.hero .ms{font-size:27px;color:var(--c)}
.hero .h1t{font-size:19px;font-weight:650}
.hero .h2t{font-size:11.5px;color:var(--ink3);margin-top:2px}

/* Tarjetas grandes con gráfico */
.charts{display:grid;grid-template-columns:1fr;gap:12px}
.bigcard{background:var(--card);border:1px solid var(--line);border-radius:13px;padding:15px 16px 10px}
.bc-h{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.bc-k{font-size:13px;font-weight:600}
.bc-s{font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink3);margin-top:2px}
.bc-v{font-size:31px;font-weight:700;letter-spacing:-.02em;color:var(--c);
  font-variant-numeric:tabular-nums;line-height:1}
.bc-u{font-size:13px;font-weight:600;color:var(--ink3)}
.bar{height:4px;background:var(--bright);border-radius:2px;overflow:hidden;margin:12px 0 4px}
.bar i{display:block;height:100%;border-radius:2px;background:var(--c)}
.chart{width:100%;height:64px;display:block;margin-top:2px}
.chart-empty{height:64px;display:grid;place-items:center;color:var(--ink3);font-size:11px}

/* Mini-stats */
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}
.mini{background:var(--card);border:1px solid var(--line);border-radius:11px;padding:12px 13px}
.mini-k{font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink3)}
.mini-v{font-size:19px;font-weight:700;margin-top:5px;color:var(--c);font-variant-numeric:tabular-nums}

/* Listas */
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.row{display:flex;align-items:center;gap:12px;padding:13px 14px;border-bottom:1px solid var(--line)}
.row:last-child{border-bottom:none}
.row-ico{width:34px;height:34px;border-radius:9px;background:var(--card2);display:grid;
  place-items:center;color:var(--c);flex:none}
.row-txt{flex:1;min-width:0}
.row-t{font-size:13.5px;font-weight:550}
.row-s{font-size:11px;color:var(--ink3);margin-top:2px;display:flex;align-items:center;gap:6px;
  font-variant-numeric:tabular-nums}
.dot{width:6px;height:6px;border-radius:50%;background:var(--c);flex:none}
.row-tag{font-size:9.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--c);
  border:1px solid var(--c);border-radius:5px;padding:3px 7px;flex:none;opacity:.9}
.empty{padding:15px;color:var(--ink3);font-size:12.5px}
footer{text-align:center;color:var(--ink3);font-size:10px;margin-top:24px;
  letter-spacing:.08em;text-transform:uppercase}

/* ---------- TABLET: aparece la sidebar, 2 columnas de gráficos ---------- */
@media(min-width:900px){
  .side{display:flex}
  .main{margin-left:var(--sw);padding:18px 22px 44px}
  .top-brand{display:none}          /* la marca ya está en la sidebar */
  .charts{grid-template-columns:1fr 1fr}
}
/* ---------- DESKTOP: columna derecha, como en el diseño ---------- */
@media(min-width:1240px){
  .cols{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:18px;align-items:start}
  .aside section:first-child{margin-top:0}
}
</style></head><body>

<aside class="side">
  <div class="brand">
    <div class="logo"><span class="ms">monitoring</span></div>
    <div><div class="bname">LILA-APP</div><div class="bsub">Mac mini · node 01</div></div>
  </div>
  ${nav('dashboard', 'Overview', '#overview', true)}
  ${nav('speed', 'Rendimiento', '#rendimiento')}
  ${nav('backup', 'Backups', '#backups')}
  ${nav('chat', 'Sesiones WhatsApp', '#whatsapp')}
  <div class="sec">Sistema</div>
  ${nav('storage', 'Almacenamiento', '#almacenamiento')}
  <div class="side-foot">
    <div class="avatar"><span class="ms">person</span></div>
    <div><div style="font-size:12px;font-weight:600">Admin</div>
      <div style="font-size:9.5px;color:var(--ink3)">Acceso root</div></div>
  </div>
</aside>

<main class="main">
  <div class="top">
    <div class="top-brand">
      <div class="logo"><span class="ms">monitoring</span></div>
      <div><div class="bname">LILA-APP</div><div class="bsub">Mac mini · node 01</div></div>
    </div>
    <div class="chips">
      <div class="chip"><span class="k">Uptime</span><b>${uptime}</b></div>
      <div class="chip"><span class="k">CPU</span><b>${e.cpu.pct}%</b></div>
      <div class="chip"><span class="k">RAM</span><b>${e.memoria.pct}%</b></div>
    </div>
  </div>

  <h1 id="overview">Estado del sistema <span class="badge">telemetría en vivo</span></h1>

  <div class="hero t-${global.tono}">
    <span class="ms">${global.ico}</span>
    <div><div class="h1t">${globalTxt}</div>
      <div class="h2t">${new Date(e.ahora).toLocaleString('es-PE')}</div></div>
  </div>

  <div class="cols">
    <div>
      <section id="rendimiento">
        <h2>Rendimiento <span class="n">${span}</span></h2>
        <div class="charts">
          <div class="bigcard t-${stCpu.tono}">
            <div class="bc-h"><div><div class="bc-k">Uso de CPU</div>
              <div class="bc-s">${e.cpu.nucleos} núcleos · carga ${e.cpu.carga1}</div></div>
              <div class="bc-v">${e.cpu.pct}<span class="bc-u">%</span></div></div>
            <div class="bar"><i style="width:${Math.max(2, e.cpu.pct)}%"></i></div>
            ${areaChart(hCpu, 'cpu', '#4cd6ff')}
          </div>
          <div class="bigcard t-${stMem.tono}">
            <div class="bc-h"><div><div class="bc-k">Uso de memoria</div>
              <div class="bc-s">${e.memoria.totalGB} GB totales</div></div>
              <div class="bc-v">${e.memoria.pct}<span class="bc-u">%</span></div></div>
            <div class="bar"><i style="width:${Math.max(2, e.memoria.pct)}%"></i></div>
            ${areaChart(hRam, 'ram', '#feb127')}
          </div>
        </div>
      </section>

      <section id="almacenamiento">
        <h2>Almacenamiento</h2>
        <div class="grid">
          ${e.disco.sistema ? mini('Disco sistema', `${e.disco.sistema.pct}%`, stDs) : mini('Disco sistema', 'n/d', CRITICO)}
          ${e.disco.sistema ? mini('Libre sistema', e.disco.sistema.libre, OK) : ''}
          ${e.disco.backup ? mini('Disco backup', `${e.disco.backup.pct}%`, stDb) : mini('Disco backup', 'OFF', CRITICO)}
          ${e.disco.backup ? mini('Libre backup', e.disco.backup.libre, OK) : ''}
        </div>
      </section>

      <section id="whatsapp">
        <h2>Sesiones WhatsApp <span class="n">${online} online</span></h2>
        <div class="card">${sesiones}</div>
      </section>
    </div>

    <div class="aside">
      <section id="backups">
        <h2>Backups</h2>
        <div class="card">
          ${filaBackup('perm_media', 'Medios', humano(b.medios.segundos), stM)}
          ${filaBackup('database', 'Base de datos', humano(b.base.segundos), stB)}
          ${filaBackup('verified', 'Verificación', humano(b.verificacion.segundos), stV)}
          <div class="row">
            <div class="row-ico" style="color:var(--ink3)"><span class="ms">cloud_off</span></div>
            <div class="row-txt"><div class="row-t">Copia en la nube</div>
              <div class="row-s">sin copia offsite, por decisión</div></div>
          </div>
        </div>
      </section>
    </div>
  </div>

  <footer>se actualiza cada 30 s</footer>
</main>
<script>setTimeout(()=>location.reload(),30000)</script>
</body></html>`;
}

export default router;
