import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
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

router.get('/auth/yo', async (req: Request, res: Response) => {
  const s = req.dali!;
  res.json({ usuario: { nombre: s.name, rol: s.role, identidad: s.identity }, empresa: { companyId: s.companyId } });
});

router.get('/inicio', async (req: Request, res: Response) => {
  const s = req.dali!;
  res.json(await cargarInicio(s.companyId, { nombre: s.name, rol: s.role }));
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
