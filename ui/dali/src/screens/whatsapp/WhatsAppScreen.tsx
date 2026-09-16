import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, api } from '@/lib/api';
import { fechaLarga, telefonoLegible } from '@/lib/format';
import { useSesion } from '@/lib/session';
import type { EstadoLinea, EventoLinea, Inicio, LineaWhatsApp, SaludLinea } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/Icon';
import type { IconName } from '@/components/icon-map';
import { StatusPill, type TonoPill } from '@/components/StatusPill';
import { Input } from '@/components/ui/input';
import { useAccionesDeBarra } from '@/layout/barra';
import { CabeceraTarjeta, Tarjeta } from '@/screens/asistente/cards';
import { Vincular } from './Vincular';

/**
 * A14 «WhatsApp» (diseños `A14-whatsapp` móvil, tablet y escritorio): la
 * línea desde la que Dali atiende. Estado real de la sesión de WhatsApp Web
 * (`GET whatsapp`, cada 15 s), la salud de hoy, el mensaje de prueba (solo a
 * un celular del equipo), el historial de la línea y el panel para vincular.
 * «Reconectar» reinicia el socket conservando la sesión; «Desconectar»
 * cierra la sesión en WhatsApp (obliga a vincular de nuevo) y no cabe en un
 * número compartido con otras empresas.
 */
const ESTADO: Record<EstadoLinea, { texto: string; tono: TonoPill }> = {
  conectado: { texto: 'Conectado', tono: 'emerald' },
  vinculando: { texto: 'Vinculando…', tono: 'amber' },
  conectando: { texto: 'Conectando…', tono: 'amber' },
  'requiere-vincular': { texto: 'Requiere vincular', tono: 'red' },
  desconectado: { texto: 'Desconectado', tono: 'red' },
  'sin-numero': { texto: 'Sin número', tono: 'stone' },
};
const SALUD: Record<SaludLinea['nivel'], { texto: string; tono: TonoPill }> = {
  optima: { texto: 'Óptima', tono: 'emerald' },
  'con-fallos': { texto: 'Con fallos', tono: 'amber' },
  'sin-conexion': { texto: 'Sin conexión', tono: 'red' },
};
const ICONO_EVENTO: Record<EventoLinea['tono'], { icon: IconName; clase: string; punto: string }> = {
  ok: { icon: 'check', clase: 'bg-emerald-50 text-emerald-700', punto: 'bg-emerald-500' },
  aviso: { icon: 'wifi_off', clase: 'bg-amber-50 text-amber-700', punto: 'bg-amber-500' },
  error: { icon: 'error', clase: 'bg-red-50 text-red-600', punto: 'bg-red-500' },
  info: { icon: 'info', clase: 'bg-stone-100 text-stone-600', punto: 'bg-teal-600' },
};
const LIMA = 'America/Lima';
const CLAVE_ALERTA_VISTA = 'dali.whatsapp.alerta-respaldo';

/** «hace 3 min», «hace 2 h», «hace 3 días». */
const desdeHace = (iso: string, ahoraMs = Date.now()): string => {
  const min = Math.max(0, Math.round((ahoraMs - Date.parse(iso)) / 60_000));
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'desde ayer' : `hace ${d} días`;
};
/** «sáb 12 sep 08:14», como en los diseños. */
const fechaHora = (iso: string): string => {
  const ms = Date.parse(iso);
  const dia = new Date(ms).toLocaleDateString('es-PE', { timeZone: LIMA, weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '').replace(',', '');
  const hora = new Date(ms).toLocaleTimeString('es-PE', { timeZone: LIMA, hour: '2-digit', minute: '2-digit', hour12: false });
  return `${dia} ${hora}`;
};
const celularDe = (identidad: string): string => (/^\d{11}$/.test(identidad) && identidad.startsWith('51') ? identidad.slice(2) : '');

export function WhatsAppScreen() {
  const queryClient = useQueryClient();
  const { yo } = useSesion();
  const { data: inicio } = useQuery({ queryKey: ['inicio'], queryFn: () => api.get<Inicio>('/inicio'), staleTime: 60_000 });
  const { data: linea, isPending } = useQuery({ queryKey: ['whatsapp'], queryFn: () => api.get<LineaWhatsApp>('/whatsapp'), refetchInterval: 15_000 });
  const refrescar = () => void queryClient.invalidateQueries({ queryKey: ['whatsapp'] });
  const encendido = inicio?.asistente.encendido ?? true;

  useAccionesDeBarra(
    <>
      <StatusPill tono={encendido ? 'emerald' : 'stone'} className="h-10 px-3 text-sm">
        Estado: {encendido ? 'Atendiendo' : 'En pausa'}
      </StatusPill>
      <Link
        to="/probar"
        className="inline-flex h-11 items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 font-body text-[15px] font-semibold text-stone-800 hover:bg-stone-50"
      >
        <Icon name="play_circle" className="text-xl" /> Probar a Dali
      </Link>
    </>,
    [encendido]
  );

  if (isPending || !linea) return <WhatsAppEsqueleto />;
  const caida = linea.estado === 'desconectado' || linea.estado === 'requiere-vincular';
  const ultimaCaida = linea.historial.find((e) => e.tipo === 'disconnected' || e.tipo === 'unlinked' || e.tipo === 'parked');

  return (
    <div className="md:px-6 md:pb-10 xl:px-10">
      <header className="sticky top-0 z-30 flex items-center gap-1 border-b border-stone-200 bg-white/95 px-2 py-2 backdrop-blur-md md:hidden">
        <Link to="/inicio" aria-label="Volver al inicio" className="flex size-11 shrink-0 items-center justify-center rounded-full text-stone-700 hover:bg-stone-100">
          <Icon name="arrow_back" className="text-2xl" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 font-headline text-lg font-bold leading-tight tracking-tight text-stone-900">
            WhatsApp{' '}
            <span className="truncate rounded-md border border-stone-200 bg-stone-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold uppercase text-stone-600">
              {linea.empresa}
            </span>
          </h1>
          <p className="truncate font-body text-sm text-stone-500">El número desde el que Dali atiende</p>
        </div>
        <Link to="/probar" aria-label="Probar a Dali" className="flex size-11 shrink-0 items-center justify-center rounded-full text-stone-700 hover:bg-stone-100">
          <Icon name="help_outline" className="text-2xl" />
        </Link>
      </header>

      <div className="hidden pt-6 md:block xl:pt-8">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-headline text-3xl font-bold tracking-tight text-stone-900 xl:text-4xl">WhatsApp</h1>
              <StatusPill tono="teal" punto={false} className="text-sm xl:hidden">
                Canal oficial
              </StatusPill>
            </div>
            <p className="mt-1.5 max-w-2xl font-body text-[15px] leading-relaxed text-stone-500 xl:text-lg">
              El número desde el que Dali atiende a tus clientes y registra cotizaciones.
            </p>
          </div>
          <p className="hidden font-body text-sm text-stone-500 xl:block">
            <span className="font-mono">Conexión:</span> WhatsApp Web (multi-dispositivo) <span className="text-stone-300">•</span> Servidor en Lima
          </p>
        </div>
      </div>

      <div className="grid gap-4 px-4 pb-32 pt-4 md:px-0 md:pb-0 md:pt-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
        <TarjetaLinea linea={linea} onCambio={refrescar} className="lg:col-span-2" />

        <div className="grid gap-4 lg:gap-6">
          <TarjetaSalud linea={linea} />
          <TarjetaPrueba celularPropio={celularDe(yo?.usuario.identidad ?? '')} onEnviado={refrescar} />
          <TarjetaHistorial eventos={linea.historial} />
        </div>

        <div className="grid content-start gap-4 lg:gap-6">
          <Vincular estado={linea.estado} empresa={linea.empresa} compartida={linea.compartidaCon.length > 0} />
          <Tarjeta className="hidden lg:block">
            <p className="flex items-center gap-2 font-headline text-base font-bold text-stone-900">
              <Icon name="lightbulb" className="text-xl text-teal-700" /> Recomendación para {linea.empresa}
            </p>
            <p className="mt-2 font-body text-[15px] leading-relaxed text-stone-600">
              Mantén el teléfono de {linea.empresa} con batería y conexión Wi-Fi estable para que las cotizaciones urgentes no sufran retrasos.
            </p>
          </Tarjeta>
        </div>

        <div className="lg:col-span-2">
          {caida ? (
            <div className="flex flex-col gap-4 rounded-2xl border border-red-200 bg-red-50 p-4 md:flex-row md:items-center md:p-5">
              <div className="flex min-w-0 flex-1 items-start gap-4">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
                  <Icon name="error" className="text-[28px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-headline text-base font-bold text-red-800">
                    Desconectado{ultimaCaida ? ` ${desdeHace(ultimaCaida.fecha)}` : ''}{' '}
                    <StatusPill tono="red" punto={false} className="ml-1 align-middle">
                      Sin atención
                    </StatusPill>
                  </p>
                  <p className="mt-1 font-body text-[15px] leading-relaxed text-red-800/90">
                    Dali no está respondiendo mensajes nuevos en este momento. Vuelve a vincular el número para restaurar la atención automática.
                  </p>
                </div>
              </div>
              <a
                href="#vincular"
                className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-red-700 px-5 font-body text-[15px] font-semibold text-white hover:bg-red-800"
              >
                <Icon name="qr_code_scanner" className="text-xl" /> Vincular ahora
              </a>
            </div>
          ) : (
            <AlertaRespaldo empresa={linea.empresa} />
          )}
        </div>

        <p className="hidden border-t border-stone-200 pt-6 text-center font-body text-sm text-stone-400 lg:col-span-2 lg:block">
          Dali · Conexión por WhatsApp Web (multi-dispositivo), cifrada de extremo a extremo por WhatsApp
        </p>
      </div>
    </div>
  );
}

function TarjetaLinea({ linea, onCambio, className }: { linea: LineaWhatsApp; onCambio: () => void; className?: string }) {
  const [confirmando, setConfirmando] = useState(false);
  const estado = ESTADO[linea.estado];
  const compartida = linea.compartidaCon.length > 0;
  const reconectar = useMutation({
    mutationFn: () => api.post('/whatsapp/reconectar'),
    onSuccess: () => {
      toast.success('Reconectando: en unos segundos la línea vuelve a estar en línea');
      setTimeout(onCambio, 4_000);
    },
    onError: (e: Error) => toast.error(e.message || 'No se pudo reconectar'),
  });
  const desconectar = useMutation({
    mutationFn: () => api.post('/whatsapp/desconectar'),
    onSuccess: () => {
      setConfirmando(false);
      toast.success('Línea desconectada: Dali deja de atender hasta que vuelvas a vincular');
      onCambio();
    },
    onError: (e: Error) => toast.error(e.message || 'No se pudo desconectar'),
  });
  const cuenta = [linea.cuenta?.nombre, linea.cuenta?.plataforma].filter(Boolean).join(' · ');
  const sinNumero = linea.estado === 'sin-numero';

  return (
    <Tarjeta className={cn('relative overflow-hidden', className)}>
      <span className="absolute inset-y-0 left-0 w-1.5 bg-teal-700 md:hidden" aria-hidden="true" />
      <StatusPill tono={estado.tono} className="absolute right-4 top-4 whitespace-nowrap text-xs lg:hidden">
        {estado.texto}
      </StatusPill>
      <div className="flex flex-wrap items-center gap-4 lg:flex-nowrap">
        <div className="flex min-w-0 flex-1 items-center gap-3 md:gap-4">
          <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-600 md:size-[72px]">
            <LogoWhatsApp className="size-9 md:size-10" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-label text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 lg:hidden">Línea oficial</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="whitespace-nowrap font-mono text-[22px] font-bold tracking-tight text-stone-900 md:text-3xl">
                {linea.numero ? telefonoLegible(linea.numero) : 'Sin número'}
              </p>
              <span className="hidden truncate font-body text-[15px] text-stone-500 xl:inline">
                <span className="text-stone-300">·</span> {linea.empresa}
              </span>
              <StatusPill tono={estado.tono} className="hidden text-sm lg:inline-flex">
                {estado.texto}
              </StatusPill>
            </div>
            <p className="mt-1 hidden flex-wrap items-center gap-x-2 gap-y-1 font-body text-[15px] text-stone-500 lg:flex">
              {linea.conectadoDesde && <span>Conectado {desdeHace(linea.conectadoDesde)}</span>}
              {linea.conectadoDesde && linea.ultimoMensaje && <span className="text-stone-300">•</span>}
              {linea.ultimoMensaje && <span className="font-medium text-stone-700">Último mensaje atendido {desdeHace(linea.ultimoMensaje)}</span>}
              {cuenta && (
                <>
                  <span className="text-stone-300">•</span>
                  <span className="inline-flex items-center gap-1">
                    <Icon name="smartphone" className="text-lg" /> {cuenta}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="hidden shrink-0 items-center gap-3 lg:flex">
          <BotonReconectar onClick={() => reconectar.mutate()} pendiente={reconectar.isPending} disabled={sinNumero} />
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            disabled={sinNumero || compartida || confirmando}
            title={compartida ? `Este número también atiende a ${linea.compartidaCon.join(', ')}` : undefined}
            className="inline-flex h-11 items-center gap-1.5 px-3 font-body text-[15px] font-semibold text-red-700 hover:underline disabled:cursor-not-allowed disabled:text-stone-400 disabled:no-underline"
          >
            Desconectar
          </button>
        </div>
      </div>

      <ul className="mt-4 space-y-2 border-t border-stone-100 pt-4 font-body text-[15px] text-stone-600 lg:hidden">
        {(linea.conectadoDesde || linea.ultimoMensaje) && (
          <li className="flex items-start gap-2">
            <Icon name="schedule" className="mt-0.5 shrink-0 text-xl text-stone-400" />
            <span>
              {linea.conectadoDesde && `Conectado ${desdeHace(linea.conectadoDesde)}`}
              {linea.conectadoDesde && linea.ultimoMensaje && <span className="text-stone-300"> · </span>}
              {linea.ultimoMensaje && (
                <span className="font-mono text-sm">
                  {linea.conectadoDesde ? 'último' : 'Último'} mensaje {desdeHace(linea.ultimoMensaje)}
                </span>
              )}
            </span>
          </li>
        )}
        {cuenta && (
          <li className="flex items-start gap-2">
            <Icon name="smartphone" className="mt-0.5 shrink-0 text-xl text-stone-400" />
            <span>
              Cuenta: <span className="font-semibold text-stone-900">{cuenta}</span>
            </span>
          </li>
        )}
      </ul>
      {compartida && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 font-body text-sm text-amber-900">
          <Icon name="info" className="mt-0.5 shrink-0 text-base" />
          <span>
            Este número también atiende a <span className="font-semibold">{linea.compartidaCon.join(', ')}</span>: reconectar vale para todas; desconectarlo las dejaría sin Dali,
            así que desde acá no se puede.
          </span>
        </p>
      )}
      {linea.salud.tiempoRespuestaS !== null && (
        <p className="mt-3 hidden items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 font-body text-[15px] text-stone-600 lg:flex">
          <Icon name="shield" className="text-xl text-teal-700" /> Dali responde las consultas automáticamente.
          <span className="ml-auto font-mono text-sm text-stone-500">Responde en ~{linea.salud.tiempoRespuestaS} s</span>
        </p>
      )}

      {confirmando ? (
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 md:flex-row md:items-center">
          <p className="flex-1 font-body text-[15px] text-red-900">¿Desconectar el número? Dali dejará de atender hasta que vuelvas a vincularlo escaneando el QR.</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              className="h-11 rounded-xl border border-stone-200 bg-white px-4 font-body text-[15px] font-semibold text-stone-800"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => desconectar.mutate()}
              disabled={desconectar.isPending}
              className="h-11 rounded-xl bg-red-700 px-4 font-body text-[15px] font-semibold text-white hover:bg-red-800 disabled:opacity-60"
            >
              {desconectar.isPending ? 'Desconectando…' : 'Sí, desconectar'}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-2 border-t border-stone-100 pt-4 lg:hidden">
          <BotonReconectar onClick={() => reconectar.mutate()} pendiente={reconectar.isPending} disabled={sinNumero} className="flex-1" />
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            disabled={sinNumero || compartida}
            className="inline-flex h-12 items-center justify-center gap-1.5 px-4 font-body text-[15px] font-semibold text-stone-700 disabled:text-stone-400"
          >
            <Icon name="power_settings_new" className="text-xl" /> Desconectar
          </button>
        </div>
      )}
    </Tarjeta>
  );
}

function BotonReconectar({ onClick, pendiente, disabled, className }: { onClick: () => void; pendiente: boolean; disabled: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || pendiente}
      className={cn(
        'inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-5 font-body text-[15px] font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-50 lg:h-11 lg:border-teal-200 lg:bg-teal-50 lg:text-teal-800 lg:hover:bg-teal-100',
        className
      )}
    >
      <Icon name="sync" className={cn('text-xl', pendiente && 'animate-spin')} /> {pendiente ? 'Reconectando…' : 'Reconectar'}
    </button>
  );
}

function TarjetaSalud({ linea }: { linea: LineaWhatsApp }) {
  const { salud } = linea;
  const nivel = SALUD[salud.nivel];
  const tiles: Array<{ etiqueta: string; valor: number; detalle: string; tono?: string }> = [
    { etiqueta: 'Mensajes hoy', valor: salud.mensajesHoy, detalle: salud.conversacionesHoy === 1 ? 'En 1 conversación' : `En ${salud.conversacionesHoy} conversaciones` },
    { etiqueta: 'Enviados', valor: salud.enviados, detalle: `${salud.recibidos} del cliente`, tono: 'text-teal-800' },
    {
      etiqueta: 'Fallidos',
      valor: salud.fallidos,
      detalle: salud.fallidos ? 'Respuestas que no salieron' : 'Sin fallos de envío',
      tono: salud.fallidos ? 'text-red-700' : undefined,
    },
  ];
  return (
    <Tarjeta>
      <CabeceraTarjeta
        icon="verified"
        titulo={
          <>
            <span className="lg:hidden">Salud y entregabilidad</span>
            <span className="hidden lg:inline">Calidad del número y envíos</span>
          </>
        }
        detalle={`Actividad de hoy, ${fechaLarga().toLowerCase()}`}
        detalleDesdeLg
        derecha={
          <StatusPill tono={nivel.tono} punto={false} className="whitespace-nowrap text-xs lg:text-sm">
            <span className="hidden lg:inline">Salud:&nbsp;</span>
            {nivel.texto}
          </StatusPill>
        }
      />
      <div className="mt-4 grid grid-cols-3 divide-x divide-stone-200 rounded-xl border border-stone-200 bg-stone-50 lg:gap-3 lg:divide-x-0 lg:border-0 lg:bg-transparent">
        {tiles.map((t) => (
          <div key={t.etiqueta} className="px-2 py-4 text-center lg:rounded-xl lg:border lg:border-stone-200 lg:bg-stone-50 lg:px-4 lg:py-5 lg:text-left">
            <p className="hidden font-label text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-500 lg:block">{t.etiqueta}</p>
            <p className={cn('font-headline text-3xl font-bold tracking-tight text-stone-900 lg:mt-2 lg:text-4xl', t.tono)}>{t.valor}</p>
            <p className="mt-1 font-body text-[13px] text-stone-500 lg:hidden">{t.etiqueta}</p>
            <p className="mt-2 hidden font-body text-sm text-stone-500 lg:block">{t.detalle}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 flex items-start gap-2 rounded-xl border border-teal-100 bg-teal-50 px-4 py-3 font-body text-[15px] leading-relaxed text-teal-900 lg:border-amber-200 lg:bg-amber-50 lg:text-amber-900">
        <Icon name="shield" className="mt-0.5 shrink-0 text-xl" />
        <span>
          WhatsApp puede limitar números que envían mensajes no solicitados. <b className="font-semibold">Dali solo responde a quien te escribe primero</b> y cuida la reputación de
          tu línea.
        </span>
      </p>
    </Tarjeta>
  );
}

function TarjetaPrueba({ celularPropio, onEnviado }: { celularPropio: string; onEnviado: () => void }) {
  const [numero, setNumero] = useState(celularPropio);
  const [error, setError] = useState<string | null>(null);
  const enviar = useMutation({
    mutationFn: (n: string) => api.post<{ destino: string }>('/whatsapp/prueba', { numero: n }),
    onSuccess: (r) => {
      setError(null);
      toast.success(`Enviado a ${telefonoLegible(r.destino)}: revisa tu WhatsApp`);
      onEnviado();
    },
    onError: (e: Error) => setError(e instanceof ApiError ? e.message : 'No se pudo enviar el mensaje de prueba'),
  });
  const mandar = () => {
    if (numero.replace(/\D/g, '').length < 9) {
      setError('Escribe los 9 dígitos del celular');
      return;
    }
    enviar.mutate(numero);
  };
  return (
    <Tarjeta>
      <CabeceraTarjeta
        icon="send"
        titulo={
          <>
            <span className="lg:hidden">Mensaje de prueba</span>
            <span className="hidden lg:inline">Mensajes de prueba</span>
          </>
        }
        divisor={false}
      />
      <p className="mt-2 font-body text-[15px] leading-relaxed text-stone-500">Envíate un mensaje directo a tu celular para comprobar que Dali responde con normalidad.</p>
      <label className="mt-4 block font-body text-[15px] font-semibold text-stone-800 lg:sr-only" htmlFor="numero-prueba">
        Número de destino
      </label>
      <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className={cn('flex h-12 items-stretch overflow-hidden rounded-xl border bg-white', error ? 'border-red-400' : 'border-stone-200')}>
            <span className="flex shrink-0 items-center gap-1.5 border-r border-stone-200 bg-stone-50 px-3 font-mono text-[15px] text-stone-600">
              <span aria-hidden="true">🇵🇪</span> +51
            </span>
            <Input
              id="numero-prueba"
              inputMode="tel"
              autoComplete="tel-national"
              value={numero}
              maxLength={15}
              aria-invalid={Boolean(error)}
              onChange={(e) => {
                setNumero(e.target.value);
                setError(null);
              }}
              placeholder="902 049 935"
              className="h-full flex-1 rounded-none border-0 bg-transparent px-4 font-mono text-base tracking-wide text-stone-900 shadow-none placeholder:text-stone-400 focus-visible:ring-0 md:text-base"
            />
          </div>
          {error && (
            <p className="mt-1.5 font-body text-sm text-red-700" role="alert">
              {error}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={mandar}
          disabled={enviar.isPending}
          className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 font-body text-[15px] font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
        >
          <Icon name="send" className="text-xl" />
          <span className="lg:hidden">{enviar.isPending ? 'Enviando…' : 'Enviar mensaje de prueba'}</span>
          <span className="hidden lg:inline">{enviar.isPending ? 'Enviando…' : 'Enviar prueba'}</span>
        </button>
      </div>
      <p className="mt-3 flex items-start gap-1.5 font-body text-sm text-stone-500">
        <Icon name="info" className="mt-0.5 shrink-0 text-base text-teal-700" />
        Dali te manda un saludo de prueba que dice quién lo pidió y no espera respuesta. Solo a tu celular o al de alguien del equipo.
      </p>
    </Tarjeta>
  );
}

function TarjetaHistorial({ eventos }: { eventos: EventoLinea[] }) {
  return (
    <Tarjeta>
      <CabeceraTarjeta
        icon="history"
        titulo={
          <>
            <span className="lg:hidden">Historial de sesiones</span>
            <span className="hidden lg:inline">Historial de conexión</span>
          </>
        }
        detalle="Eventos recientes de la sesión de WhatsApp Web"
        detalleDesdeLg
        derecha={
          <span className="whitespace-nowrap font-mono text-xs text-stone-500 lg:text-sm">
            <span className="lg:hidden">7 días</span>
            <span className="hidden lg:inline">Últimos 7 días</span>
          </span>
        }
      />
      {eventos.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-center">
          <Icon name="history" className="text-[32px] text-stone-400" />
          <p className="font-headline text-base font-bold text-stone-900">Todavía no hay eventos registrados</p>
          <p className="max-w-xs font-body text-sm text-stone-500">Aquí verás cada conexión, caída y vinculación de la línea, con su hora y su motivo.</p>
        </div>
      ) : (
        <ol className="mt-2 divide-y divide-stone-100 lg:divide-y-0">
          {eventos.map((e, i) => {
            const icono = ICONO_EVENTO[e.tono];
            return (
              <li key={`${e.fecha}-${i}`} className="relative flex items-start gap-3 py-3 lg:py-2.5">
                <span className={cn('mt-2 size-2 shrink-0 rounded-full lg:hidden', icono.punto)} />
                <span className={cn('relative hidden size-8 shrink-0 items-center justify-center rounded-full lg:flex', icono.clase)}>
                  <Icon name={e.tipo === 'linked' ? 'qr_code_2' : icono.icon} className="text-lg" />
                  {i < eventos.length - 1 && <span className="absolute left-1/2 top-8 h-[calc(100%-0.5rem)] w-px -translate-x-1/2 bg-stone-200" aria-hidden="true" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className={cn('font-body text-[15px] font-semibold', e.tono === 'error' ? 'text-red-700' : e.tono === 'aviso' ? 'text-amber-800' : 'text-stone-900')}>
                      {e.titulo}
                    </p>
                    <span className="shrink-0 font-mono text-sm text-stone-500">{fechaHora(e.fecha)}</span>
                  </div>
                  <p className="font-body text-sm text-stone-500">{e.detalle}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Tarjeta>
  );
}

function AlertaRespaldo({ empresa }: { empresa: string }) {
  const [vista, setVista] = useState(() => {
    try {
      return localStorage.getItem(CLAVE_ALERTA_VISTA) === '1';
    } catch {
      return false;
    }
  });
  if (vista) return null;
  const entendido = () => {
    setVista(true);
    try {
      localStorage.setItem(CLAVE_ALERTA_VISTA, '1');
    } catch {
      // sin almacenamiento, se vuelve a mostrar la próxima vez
    }
  };
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 md:p-5">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
        <Icon name="warning" className="text-[26px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-headline text-base font-bold text-stone-900">Alerta de respaldo</p>
        <p className="mt-1 font-body text-[15px] leading-relaxed text-stone-700">
          Si el celular de {empresa} se apaga o se queda sin internet, Dali deja de atender hasta que vuelva la conexión. Por ahora no hay un aviso automático: esta pantalla es el
          lugar para revisarlo.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Link to="/asistente" className="inline-flex h-11 items-center rounded-xl bg-stone-900 px-4 font-body text-[15px] font-semibold text-white hover:bg-stone-800">
            Ver avisos del asistente
          </Link>
          <button type="button" onClick={entendido} className="inline-flex h-11 items-center px-2 font-body text-[15px] font-semibold text-stone-700 hover:underline">
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}

/** El logo de WhatsApp (Simple Icons, CC0): Material Symbols no trae marcas. */
function LogoWhatsApp({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

function WhatsAppEsqueleto() {
  return (
    <div className="animate-pulse px-4 pt-4 md:px-6 md:pt-6 xl:px-10" aria-busy="true" aria-label="Cargando la línea de WhatsApp">
      <div className="hidden h-9 w-48 rounded-lg bg-stone-200 md:block" />
      <div className="mt-4 h-40 rounded-2xl bg-stone-200 md:mt-6" />
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-6">
        <div className="grid gap-4">
          <div className="h-56 rounded-2xl bg-stone-200" />
          <div className="h-40 rounded-2xl bg-stone-200" />
        </div>
        <div className="h-96 rounded-2xl bg-stone-200" />
      </div>
    </div>
  );
}
