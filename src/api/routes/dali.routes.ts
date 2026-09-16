import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import logger from '../../utils/logger.js';
import { config } from '../../config/environment.js';
import { pedirCodigo, verificarCodigo } from '../../agent/dali/acceso.js';
import { cabeceraCookie, cabeceraCookieBorrada, firmarSesion, requireDaliSession } from '../../agent/dali/sesion.js';
import { cargarInicio } from '../../agent/dali/inicio.js';
import { cerrarConversacion, detalleDeConversacion, devolverConversacion, escribirAlCliente, listarConversaciones, tomarConversacion } from '../../agent/dali/conversaciones.js';
import { ESTADOS_LEAD, agregarNotaALead, cambiarEstadoDeLead, detalleDeLead, listarLeads, type EstadoLead } from '../../agent/dali/leads.js';
import { guardarAsistente, leerAsistente, minutosHastaManana, pausarAsistente, type CambiosAsistente } from '../../agent/dali/asistente.js';
import { clearAgentSessionCache } from '../../agent/runtime/agent-wiring.js';
import { GuionInvalido, guardarServicios, leerServicios, restaurarPack, type GuionEditable } from '../../agent/dali/servicios.js';
import { simularTurno } from '../../agent/dali/probar.js';
import { guardarNegocio, leerNegocio, type CambiosFicha } from '../../agent/dali/negocio.js';
import { guardarFaq, listarFaq, probarFaq, sugeridasFaq } from '../../agent/dali/faq.js';
import { guardarCatalogo, leerCatalogo } from '../../agent/dali/catalogo.js';
import { ArchivoInvalido, TAMANO_MAXIMO_BYTES, TAMANO_MAXIMO_MB, analizarArchivo, confirmarImportacion, historialDeImportaciones, plantillaDe } from '../../agent/dali/importar.js';
import {
  DestinoNoPermitido,
  LineaCompartida,
  LineaNoConectada,
  LineaNoDisponible,
  LineaSinNumero,
  desconectarLinea,
  enviarPrueba,
  leerWhatsApp,
  reconectarLinea,
  vinculacionPorCodigo,
  vinculacionPorQr,
  empresaDe,
  type OperacionesDeLinea,
} from '../../agent/dali/whatsapp.js';
import { EquipoInvalido, cambiarMiembro, invitarMiembro, listarEquipo, quitarMiembro } from '../../agent/dali/equipo.js';
import { motivoSinPermiso } from '../../agent/dali/permisos.js';
import { leerPlan } from '../../agent/dali/plan.js';
import { PERIODOS, leerReporte, type Periodo } from '../../agent/dali/reportes.js';
import { EVENTOS_DE_AVISO, NotificacionesInvalidas, guardarNotificaciones, leerNotificaciones, textoDePruebaDeAviso, type GrupoDelStore } from '../../agent/dali/notificaciones.js';

/**
 * `/api/dali/*` (spec DALI §4): la API del panel. `auth/*` es pública con
 * rate limit; todo lo demás exige la sesión (cookie o Bearer) y trabaja con
 * el `companyId` del token — nunca del cliente (`lila-security` §0).
 */
const router = Router();

const limiteAuth = rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Demasiados intentos, espera un minuto' } });

const esSegura = (req: Request): boolean => req.secure || req.headers['x-forwarded-proto'] === 'https';

router.post('/auth/codigo', limiteAuth, async (req: Request, res: Response) => {
  const destino = String(req.body?.destino ?? '');
  const r = await pedirCodigo(destino);
  if (!r.ok) {
    res.status(r.motivo === 'muy-seguido' ? 429 : 400).json({ error: r.motivo === 'muy-seguido' ? 'Espera 30 segundos para pedir otro código' : 'Escribe un celular o un correo válido' });
    return;
  }
  res.json({ ok: true, canal: r.canal, reintentoEnMs: r.reintentoEnMs });
});

router.post('/auth/verificar', limiteAuth, async (req: Request, res: Response) => {
  const r = await verificarCodigo(String(req.body?.destino ?? ''), String(req.body?.codigo ?? ''));
  if (!r.ok) {
    const mensajes = { 'sin-codigo': 'Pide un código primero', vencido: 'El código venció, pide otro', incorrecto: 'Código incorrecto', bloqueado: 'Demasiados intentos: pide un código nuevo' };
    res.status(401).json({ error: mensajes[r.motivo], motivo: r.motivo });
    return;
  }
  res.setHeader('Set-Cookie', cabeceraCookie(firmarSesion(r.miembro), esSegura(req)));
  res.json({ ok: true, usuario: { nombre: r.miembro.name, rol: r.miembro.role, companyId: r.miembro.companyId } });
});

router.post('/auth/salir', (_req: Request, res: Response) => {
  res.setHeader('Set-Cookie', cabeceraCookieBorrada());
  res.json({ ok: true });
});

router.use(requireDaliSession);

// A16: el rol decide qué se puede cambiar (`dali/permisos.ts`); leer puede cualquiera con sesión.
router.use((req: Request, res: Response, next: () => void) => {
  const motivo = motivoSinPermiso(req.method, req.path, req.dali!.role);
  if (motivo) {
    res.status(403).json({ error: motivo });
    return;
  }
  next();
});

router.get('/auth/yo', async (req: Request, res: Response) => {
  const s = req.dali!;
  res.json({ usuario: { nombre: s.name, rol: s.role, identidad: s.identity }, empresa: { companyId: s.companyId } });
});

router.get('/inicio', async (req: Request, res: Response) => {
  const s = req.dali!;
  res.json(await cargarInicio(s.companyId, { nombre: s.name, rol: s.role }, Date.now(), async (numero) => (await lineaReal()).lista(numero)));
});

/** A6 «Asistente»: perfil, reglas, avisos, silencio al intervenir, números de prueba. */
router.get('/asistente', async (req: Request, res: Response) => {
  res.json(await leerAsistente(req.dali!.companyId));
});

const cambiosDelCuerpo = (cuerpo: unknown): CambiosAsistente => {
  const b = (cuerpo ?? {}) as Record<string, unknown>;
  return {
    enabled: typeof b.enabled === 'boolean' ? b.enabled : undefined,
    perfil: b.perfil && typeof b.perfil === 'object' ? (b.perfil as CambiosAsistente['perfil']) : undefined,
    avisos: b.avisos && typeof b.avisos === 'object' ? (b.avisos as CambiosAsistente['avisos']) : undefined,
    handoffPauseMinutes: typeof b.handoffPauseMinutes === 'number' ? b.handoffPauseMinutes : undefined,
    testNumbers: Array.isArray(b.testNumbers) ? b.testNumbers.map(String) : undefined,
  };
};

router.put('/asistente', async (req: Request, res: Response) => {
  const asistente = await guardarAsistente(req.dali!.companyId, cambiosDelCuerpo(req.body), req.dali!.name);
  // El runtime cachea la config 60 s: lo guardado vale en el siguiente mensaje.
  clearAgentSessionCache();
  res.json(asistente);
});

router.put('/asistente/estado', async (req: Request, res: Response) => {
  const enabled = Boolean(req.body?.enabled);
  const asistente = await guardarAsistente(req.dali!.companyId, { enabled }, req.dali!.name);
  clearAgentSessionCache();
  logger.info(`[dali] ${req.dali!.name} ${enabled ? 'encendió' : 'apagó'} el asistente de ${req.dali!.companyId}`);
  res.json({ ok: true, enabled: asistente.enabled });
});

/** {minutos}: 30, 120, o 'manana' (hasta las 08:00 de Lima); 0 reanuda. */
router.post('/asistente/pausa', async (req: Request, res: Response) => {
  const pedido = req.body?.minutos;
  const minutos = pedido === 'manana' ? minutosHastaManana() : Number(pedido);
  if (!Number.isFinite(minutos) || minutos < 0) {
    res.status(400).json({ error: 'Indica cuántos minutos, o «manana»' });
    return;
  }
  const asistente = await pausarAsistente(req.dali!.companyId, minutos, req.dali!.name);
  clearAgentSessionCache();
  res.json(asistente);
});

/** A8/A9/A10: el guion entero como lo edita el panel (spec §4 `servicios`; se guarda de una vez, no por servicio). */
router.get('/servicios', async (req: Request, res: Response) => {
  res.json(await leerServicios(req.dali!.companyId));
});

router.put('/servicios', async (req: Request, res: Response) => {
  try {
    const servicios = await guardarServicios(req.dali!.companyId, (req.body ?? {}) as GuionEditable, req.dali!.name);
    clearAgentSessionCache();
    res.json(servicios);
  } catch (error) {
    if (error instanceof GuionInvalido) {
      res.status(400).json({ error: error.message });
      return;
    }
    logger.error(`[dali] no se pudo guardar el guion de ${req.dali!.companyId}: ${String(error)}`);
    res.status(500).json({ error: 'No se pudo guardar el guion' });
  }
});

router.post('/servicios/restaurar-pack', async (req: Request, res: Response) => {
  const servicios = await restaurarPack(req.dali!.companyId, req.dali!.name);
  clearAgentSessionCache();
  res.json(servicios);
});

/** A7: la ficha del negocio. */
router.get('/negocio', async (req: Request, res: Response) => {
  res.json(await leerNegocio(req.dali!.companyId));
});

router.put('/negocio', async (req: Request, res: Response) => {
  const ficha = await guardarNegocio(req.dali!.companyId, (req.body ?? {}) as CambiosFicha, req.dali!.name);
  clearAgentSessionCache();
  res.json(ficha);
});

/** A11: las preguntas frecuentes (la lista entera se guarda de una vez), probar una y las sugeridas. */
router.get('/faq', async (req: Request, res: Response) => {
  res.json({ faqs: await listarFaq(req.dali!.companyId) });
});

router.put('/faq', async (req: Request, res: Response) => {
  const faqs = await guardarFaq(req.dali!.companyId, req.body?.faqs, req.dali!.name);
  clearAgentSessionCache();
  res.json({ faqs });
});

router.post('/faq/probar', async (req: Request, res: Response) => {
  const pregunta = String(req.body?.pregunta ?? '').trim();
  if (!pregunta) {
    res.status(400).json({ error: 'Escribe una pregunta' });
    return;
  }
  res.json(await probarFaq(req.dali!.companyId, pregunta));
});

router.get('/faq/sugeridas', async (req: Request, res: Response) => {
  res.json({ sugeridas: await sugeridasFaq(req.dali!.companyId) });
});

/** A12: el catálogo (la lista entera) y «Dali puede decir precios». */
router.get('/catalogo', async (req: Request, res: Response) => {
  res.json(await leerCatalogo(req.dali!.companyId));
});

router.put('/catalogo', async (req: Request, res: Response) => {
  const catalogo = await guardarCatalogo(req.dali!.companyId, { items: req.body?.items, dicePrecios: req.body?.dicePrecios }, req.dali!.name);
  clearAgentSessionCache();
  res.json(catalogo);
});

/** A13: importar desde Excel — la plantilla con lo actual, analizar (en memoria, ≤ 2 MB), confirmar, historial. */
const subida = multer({ storage: multer.memoryStorage(), limits: { fileSize: TAMANO_MAXIMO_BYTES, files: 1 } });

router.get('/importar/plantilla.xlsx', async (req: Request, res: Response) => {
  const buffer = await plantillaDe(req.dali!.companyId);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="dali-${req.dali!.companyId}.xlsx"`);
  res.send(buffer);
});

const recibirArchivo = subida.single('archivo');
router.post(
  '/importar/analizar',
  (req: Request, res: Response, next) => {
    // Con tipos: multer trae su propio Request de express-serve-static-core.
    (recibirArchivo as unknown as (rq: Request, rs: Response, cb: (error?: unknown) => void) => void)(req, res, (error?: unknown) => {
      if (error) {
        res.status(400).json({ error: error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE' ? `El archivo pesa más de ${TAMANO_MAXIMO_MB} MB` : 'No se pudo recibir el archivo' });
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    const archivo = (req as Request & { file?: { originalname: string; buffer: Buffer } }).file;
    if (!archivo) {
      res.status(400).json({ error: 'Adjunta el archivo .xlsx' });
      return;
    }
    try {
      res.json(await analizarArchivo(req.dali!.companyId, { nombre: archivo.originalname, buffer: archivo.buffer }));
    } catch (error) {
      if (error instanceof ArchivoInvalido) {
        res.status(400).json({ error: error.message });
        return;
      }
      logger.error(`[dali] no se pudo analizar el archivo de ${req.dali!.companyId}: ${String(error)}`);
      res.status(500).json({ error: 'No se pudo analizar el archivo' });
    }
  }
);

router.post('/importar/confirmar', async (req: Request, res: Response) => {
  const modo = req.body?.modo === 'reemplazar' ? 'reemplazar' : 'agregar';
  try {
    const r = await confirmarImportacion(req.dali!.companyId, String(req.body?.token ?? ''), modo, req.dali!.name);
    clearAgentSessionCache();
    res.json(r);
  } catch (error) {
    if (error instanceof ArchivoInvalido) {
      res.status(400).json({ error: error.message });
      return;
    }
    logger.error(`[dali] no se pudo importar en ${req.dali!.companyId}: ${String(error)}`);
    res.status(500).json({ error: 'No se pudo guardar la importación' });
  }
});

router.get('/importar/historial', async (req: Request, res: Response) => {
  res.json({ importaciones: await historialDeImportaciones(req.dali!.companyId) });
});

/** A16: el equipo. Verlo puede cualquier miembro; invitar, cambiar y quitar, solo el dueño (el gate de roles de arriba). */
const responderErrorDeEquipo = (res: Response, error: unknown, accion: string, companyId: string): void => {
  if (error instanceof EquipoInvalido) {
    res.status(400).json({ error: error.message });
    return;
  }
  logger.error(`[dali] equipo/${accion} falló para ${companyId}: ${String(error)}`);
  res.status(500).json({ error: `No se pudo ${accion}` });
};

router.get('/equipo', async (req: Request, res: Response) => {
  res.json(await listarEquipo(req.dali!.companyId));
});

router.post('/equipo', async (req: Request, res: Response) => {
  try {
    const miembro = await invitarMiembro(req.dali!.companyId, {
      destino: String(req.body?.destino ?? ''),
      nombre: String(req.body?.nombre ?? ''),
      rol: String(req.body?.rol ?? ''),
      recibeAvisos: req.body?.recibeAvisos !== false,
    });
    clearAgentSessionCache();
    logger.info(`[dali] ${req.dali!.name} invitó a ${miembro.identidad} (${miembro.rol}) al equipo de ${req.dali!.companyId}`);
    res.status(201).json(miembro);
  } catch (error) {
    responderErrorDeEquipo(res, error, 'invitar', req.dali!.companyId);
  }
});

router.patch('/equipo/:id', async (req: Request, res: Response) => {
  try {
    const miembro = await cambiarMiembro(req.dali!.companyId, String(req.params.id), {
      ...(req.body?.rol !== undefined ? { rol: String(req.body.rol) } : {}),
      ...(req.body?.recibeAvisos !== undefined ? { recibeAvisos: Boolean(req.body.recibeAvisos) } : {}),
    });
    if (!miembro) {
      res.status(404).json({ error: 'Esa persona ya no está en el equipo' });
      return;
    }
    clearAgentSessionCache();
    res.json(miembro);
  } catch (error) {
    responderErrorDeEquipo(res, error, 'cambiar al miembro', req.dali!.companyId);
  }
});

router.delete('/equipo/:id', async (req: Request, res: Response) => {
  try {
    const ok = await quitarMiembro(req.dali!.companyId, String(req.params.id));
    if (!ok) {
      res.status(404).json({ error: 'Esa persona ya no está en el equipo' });
      return;
    }
    clearAgentSessionCache();
    res.json({ ok: true });
  } catch (error) {
    responderErrorDeEquipo(res, error, 'quitar al miembro', req.dali!.companyId);
  }
});

/** A19: reportes por período (esta semana, la pasada, 30 días). */
router.get('/reportes', async (req: Request, res: Response) => {
  const periodo = String(req.query.periodo ?? 'semana') as Periodo;
  if (!PERIODOS.includes(periodo)) {
    res.status(400).json({ error: 'Período desconocido' });
    return;
  }
  res.json(await leerReporte(req.dali!.companyId, periodo));
});

/** A17: plan y uso (solo lectura; el piloto no tiene pagos). */
router.get('/plan', async (req: Request, res: Response) => {
  res.json(await leerPlan(req.dali!.companyId));
});

/** A18: notificaciones. Los grupos salen del store de la sesión de la línea (vacío si no está conectada en este proceso). */
const gruposDeLaLinea = async (numero: string): Promise<GrupoDelStore[]> => {
  if (!numero) return [];
  try {
    const { WhatsAppDirectService } = await import('../../services/whatsapp-direct.service.js');
    if (!WhatsAppDirectService.isSessionActive(numero)) return [];
    return WhatsAppDirectService.listGroups(numero) as GrupoDelStore[];
  } catch {
    return [];
  }
};

router.get('/notificaciones', async (req: Request, res: Response) => {
  const { numero } = await empresaDe(req.dali!.companyId);
  res.json({ ...(await leerNotificaciones(req.dali!.companyId, await gruposDeLaLinea(numero), numero)), eventos: EVENTOS_DE_AVISO });
});

router.put('/notificaciones', async (req: Request, res: Response) => {
  try {
    const { numero } = await empresaDe(req.dali!.companyId);
    const guardado = await guardarNotificaciones(req.dali!.companyId, req.body ?? {}, await gruposDeLaLinea(numero), numero);
    clearAgentSessionCache();
    res.json({ ...guardado, eventos: EVENTOS_DE_AVISO });
  } catch (error) {
    if (error instanceof NotificacionesInvalidas) {
      res.status(400).json({ error: error.message });
      return;
    }
    logger.error(`[dali] no se pudieron guardar las notificaciones de ${req.dali!.companyId}: ${String(error)}`);
    res.status(500).json({ error: 'No se pudieron guardar las notificaciones' });
  }
});

const limitePruebaDeAviso = rateLimit({ windowMs: 10 * 60_000, max: 5, standardHeaders: true, legacyHeaders: false, message: { error: 'Ya mandaste varias pruebas seguidas: espera unos minutos' } });
router.post('/notificaciones/prueba', limitePruebaDeAviso, async (req: Request, res: Response) => {
  try {
    const { nombre, numero } = await empresaDe(req.dali!.companyId);
    const n = await leerNotificaciones(req.dali!.companyId, await gruposDeLaLinea(numero), numero);
    const destino = n.canal === 'dueno' && n.numeroDueno ? `${n.numeroDueno}@s.whatsapp.net` : n.grupo?.jid;
    if (!numero || !destino) {
      res.status(409).json({ error: 'Todavía no hay a dónde avisar: elige el grupo o un número y guarda' });
      return;
    }
    const linea = await lineaReal();
    if (!linea.lista(numero)) {
      res.status(409).json({ error: 'La línea no está conectada: no se puede mandar la prueba' });
      return;
    }
    await linea.enviar(numero, destino, textoDePruebaDeAviso(nombre, req.dali!.name), req.dali!.companyId);
    res.json({ ok: true, destino });
  } catch (error) {
    logger.error(`[dali] no se pudo mandar la prueba de avisos de ${req.dali!.companyId}: ${String(error)}`);
    res.status(500).json({ error: 'No se pudo mandar la prueba' });
  }
});

/**
 * A14: la línea de WhatsApp. El manager de sesiones (Baileys) se carga tarde
 * y por import dinámico, como el envío al cliente: las rutas no lo atan al
 * módulo de Dali, y `whatsapp.ts` recibe las operaciones ya armadas.
 */
let operacionesDeLinea: Promise<OperacionesDeLinea> | null = null;
const lineaReal = (): Promise<OperacionesDeLinea> =>
  (operacionesDeLinea ??= (async () => {
    const [sesiones, auth, controlador, directo] = await Promise.all([
      import('../../whatsapp/baileys/sessions.simple.js'),
      import('../../whatsapp/baileys/mongo-auth-state.js'),
      import('../controllers/session.controller.simple.js'),
      import('../../services/whatsapp-direct.service.js'),
    ]);
    return {
      existe: (numero) => Boolean(sesiones.getSession(numero)),
      lista: (numero) => sesiones.isSessionReady(numero),
      vinculando: (numero) => sesiones.isPairingLoginInProgress(numero),
      aparcada: (numero) => sesiones.isSessionParked(numero),
      conQr: (numero) => Boolean(sesiones.getQRCode(numero)),
      cuenta: (numero) => auth.readAuthAccountInfo(numero),
      reiniciar: async (numero) => {
        await sesiones.restartSession(numero);
      },
      cerrar: (numero) => sesiones.disconnectSession(numero),
      qr: (numero) => controlador.resolveQrState(numero),
      codigo: (numero) => sesiones.requestPairingCodeForSession(numero),
      enviar: async (numero, destino, texto, companyId) => {
        await directo.WhatsAppDirectService.sendMessage(numero, destino, texto, { queueOnFail: false, companyId, trackUsage: true });
      },
    };
  })());

const responderErrorDeLinea = (res: Response, error: unknown, accion: string, companyId: string): void => {
  if (error instanceof LineaSinNumero || error instanceof LineaCompartida || error instanceof LineaNoConectada) {
    res.status(409).json({ error: error.message });
    return;
  }
  if (error instanceof DestinoNoPermitido) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (error instanceof LineaNoDisponible) {
    res.status(503).json({ error: error.message });
    return;
  }
  logger.error(`[dali] whatsapp/${accion} falló para ${companyId}: ${String(error)}`);
  res.status(500).json({ error: `No se pudo ${accion}: ${error instanceof Error ? error.message : String(error)}` });
};

router.get('/whatsapp', async (req: Request, res: Response) => {
  try {
    res.json(await leerWhatsApp(req.dali!.companyId, await lineaReal()));
  } catch (error) {
    responderErrorDeLinea(res, error, 'leer el estado de la línea', req.dali!.companyId);
  }
});

router.post('/whatsapp/reconectar', async (req: Request, res: Response) => {
  try {
    await reconectarLinea(req.dali!.companyId, await lineaReal(), req.dali!.name);
    res.json({ ok: true });
  } catch (error) {
    responderErrorDeLinea(res, error, 'reconectar', req.dali!.companyId);
  }
});

router.post('/whatsapp/desconectar', async (req: Request, res: Response) => {
  try {
    await desconectarLinea(req.dali!.companyId, await lineaReal(), req.dali!.name);
    res.json({ ok: true });
  } catch (error) {
    responderErrorDeLinea(res, error, 'desconectar', req.dali!.companyId);
  }
});

router.post('/whatsapp/vincular', async (req: Request, res: Response) => {
  try {
    const linea = await lineaReal();
    res.json(req.body?.metodo === 'codigo' ? await vinculacionPorCodigo(req.dali!.companyId, linea) : await vinculacionPorQr(req.dali!.companyId, linea));
  } catch (error) {
    responderErrorDeLinea(res, error, 'preparar la vinculación', req.dali!.companyId);
  }
});

const limitePrueba = rateLimit({ windowMs: 10 * 60_000, max: 5, standardHeaders: true, legacyHeaders: false, message: { error: 'Ya mandaste varias pruebas seguidas: espera unos minutos' } });
router.post('/whatsapp/prueba', limitePrueba, async (req: Request, res: Response) => {
  try {
    res.json(await enviarPrueba(req.dali!.companyId, await lineaReal(), String(req.body?.numero ?? ''), req.dali!.name));
  } catch (error) {
    responderErrorDeLinea(res, error, 'enviar la prueba', req.dali!.companyId);
  }
});

/** A15: un turno del simulador. Nada se guarda ni se avisa; el estado va y viene con el navegador. */
const limiteSimulador = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Muchos mensajes seguidos en el simulador, espera un minuto' } });
router.post('/probar', limiteSimulador, async (req: Request, res: Response) => {
  const texto = String(req.body?.texto ?? '').trim();
  if (!texto) {
    res.status(400).json({ error: 'Escribe un mensaje' });
    return;
  }
  res.json(
    await simularTurno(
      req.dali!.companyId,
      { estado: req.body?.estado ?? null, texto, ultimaPreguntaBot: req.body?.ultimaPreguntaBot ? String(req.body.ultimaPreguntaBot) : undefined, clienteConocido: Boolean(req.body?.clienteConocido) },
      { nombre: req.dali!.name }
    )
  );
});

router.get('/conversaciones', async (req: Request, res: Response) => {
  const estado = String(req.query.estado ?? '') as 'bot' | 'human' | 'closed' | 'atencion' | '';
  res.json(await listarConversaciones(req.dali!.companyId, { estado: estado || undefined, q: String(req.query.q ?? '') || undefined }));
});

router.get('/conversaciones/:id', async (req: Request, res: Response) => {
  const d = await detalleDeConversacion(req.dali!.companyId, String(req.params.id));
  if (!d) {
    res.status(404).json({ error: 'No existe esa conversación' });
    return;
  }
  res.json(d);
});

const accionDeConversacion = (accion: (companyId: string, id: string) => Promise<boolean>) => async (req: Request, res: Response) => {
  const ok = await accion(req.dali!.companyId, String(req.params.id));
  if (!ok) {
    res.status(404).json({ error: 'No existe esa conversación' });
    return;
  }
  res.json({ ok: true });
};
router.post('/conversaciones/:id/tomar', accionDeConversacion(tomarConversacion));
router.post('/conversaciones/:id/devolver', accionDeConversacion(devolverConversacion));
router.post('/conversaciones/:id/cerrar', accionDeConversacion(cerrarConversacion));

router.post('/conversaciones/:id/mensaje', async (req: Request, res: Response) => {
  const textoMensaje = String(req.body?.texto ?? '').trim();
  if (!textoMensaje) {
    res.status(400).json({ error: 'Escribe un mensaje' });
    return;
  }
  const { WhatsAppDirectService } = await import('../../services/whatsapp-direct.service.js');
  const ok = await escribirAlCliente(req.dali!.companyId, String(req.params.id), textoMensaje, async (sessionPhone, customerJid, text) => {
    await WhatsAppDirectService.sendMessage(sessionPhone, customerJid, text);
  });
  if (!ok) {
    res.status(404).json({ error: 'No existe esa conversación' });
    return;
  }
  await tomarConversacion(req.dali!.companyId, String(req.params.id));
  res.json({ ok: true });
});

router.get('/leads', async (req: Request, res: Response) => {
  const estado = String(req.query.estado ?? '');
  res.json(await listarLeads(req.dali!.companyId, { estado: (ESTADOS_LEAD as readonly string[]).includes(estado) ? (estado as EstadoLead) : undefined, q: String(req.query.q ?? '') || undefined }));
});

router.get('/leads/:id', async (req: Request, res: Response) => {
  const d = await detalleDeLead(req.dali!.companyId, String(req.params.id));
  if (!d) {
    res.status(404).json({ error: 'No existe ese lead' });
    return;
  }
  res.json(d);
});

router.patch('/leads/:id', async (req: Request, res: Response) => {
  const estado = req.body?.estado ? String(req.body.estado) : undefined;
  if (estado && !(ESTADOS_LEAD as readonly string[]).includes(estado)) {
    res.status(400).json({ error: 'Estado desconocido' });
    return;
  }
  await cambiarEstadoDeLead(req.dali!.companyId, String(req.params.id), { estado: estado as EstadoLead | undefined, cotizacion: req.body?.cotizacion, motivoPerdido: req.body?.motivoPerdido }, req.dali!.name);
  res.json(await detalleDeLead(req.dali!.companyId, String(req.params.id)));
});

router.post('/leads/:id/notas', async (req: Request, res: Response) => {
  const nota = String(req.body?.texto ?? '').trim();
  if (!nota) {
    res.status(400).json({ error: 'Escribe la nota' });
    return;
  }
  await agregarNotaALead(req.dali!.companyId, String(req.params.id), nota, req.dali!.name);
  res.json(await detalleDeLead(req.dali!.companyId, String(req.params.id)));
});

// El resto de la API (§4) llega con sus pantallas. Ni una ruta sin guard.
router.use((_req: Request, res: Response) => res.status(404).json({ error: 'Ruta no encontrada' }));

export default router;
export const daliConfigured = Boolean(config.security.jwtSecret);
