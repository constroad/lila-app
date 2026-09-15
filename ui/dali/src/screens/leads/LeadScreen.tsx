import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { cuando, iniciales, oracion, telefonoLegible } from '@/lib/format';
import { Icon } from '@/components/Icon';
import { NOMBRE_ESTADO_LEAD, StatusPill } from '@/components/StatusPill';
import type { EstadoLead, LeadDetalle } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * A5 «Lead» (diseños `A5-lead`): la cabecera con el título del lead, el estado
 * (desplegable), el ID y cuándo entró, «Escribir por WhatsApp»; el contacto
 * (avatar, empresa, teléfono, «Ver conversación»); «Lo que Dali juntó» con la
 * confirmación y los datos en filas; las notas que el cliente agregó después;
 * la cotización (monto, fechas, PDF); el historial; y las notas internas. En
 * escritorio vive como panel a la derecha del tablero (A4).
 */
const ESTADOS: EstadoLead[] = ['nuevo', 'contactado', 'cotizado', 'ganado', 'perdido'];

export function LeadScreen({ embebido = false }: { embebido?: boolean }) {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: lead, isPending } = useQuery({ queryKey: ['lead', id], queryFn: () => api.get<LeadDetalle>(`/leads/${id}`), enabled: Boolean(id) });
  const [nota, setNota] = useState('');
  const [monto, setMonto] = useState('');
  const [enviadaEl, setEnviadaEl] = useState('');
  const [validaHasta, setValidaHasta] = useState('');
  const invalidar = () => {
    void queryClient.invalidateQueries({ queryKey: ['lead', id] });
    void queryClient.invalidateQueries({ queryKey: ['leads'] });
    void queryClient.invalidateQueries({ queryKey: ['inicio'] });
  };
  const cambiar = useMutation({
    mutationFn: (cambio: { estado?: EstadoLead; cotizacion?: { monto?: number; enviadaEl?: string; validaHasta?: string } }) => api.patch(`/leads/${id}`, cambio),
    onSuccess: () => {
      toast.success('Lead actualizado');
      invalidar();
    },
    onError: () => toast.error('No se pudo guardar'),
  });
  const guardarNota = useMutation({
    mutationFn: (texto: string) => api.post(`/leads/${id}/notas`, { texto }),
    onSuccess: () => {
      setNota('');
      toast.success('Nota guardada');
      invalidar();
    },
    onError: () => toast.error('No se pudo guardar la nota'),
  });

  if (isPending || !lead) return <div className={cn('animate-pulse bg-stone-100', embebido ? 'h-full' : 'min-h-dvh')} aria-busy="true" />;
  const ahoraMs = Date.now();

  const guardarCotizacion = (e: FormEvent) => {
    e.preventDefault();
    const m = Number(monto.replace(/[^\d.]/g, ''));
    cambiar.mutate({
      estado: lead.estado === 'nuevo' || lead.estado === 'contactado' ? 'cotizado' : undefined,
      cotizacion: { monto: Number.isFinite(m) && m > 0 ? m : undefined, enviadaEl: enviadaEl || undefined, validaHasta: validaHasta || undefined },
    });
  };

  return (
    <div className={cn('bg-stone-100', embebido ? 'min-h-full' : 'min-h-dvh')}>
      <header className={cn('border-b border-stone-200 bg-white px-4 pb-4 pt-3', embebido && 'sticky top-0 z-10')}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {!embebido && (
              <button
                type="button"
                onClick={() => navigate('/leads')}
                aria-label="Volver"
                className="flex size-11 items-center justify-center rounded-full text-stone-700 hover:bg-stone-100"
              >
                <Icon name="arrow_back" className="text-2xl" />
              </button>
            )}
            <p className="font-body text-[15px] text-stone-500">
              <span className="font-semibold text-teal-800">{lead.empresa ? 'Leads' : 'Leads'}</span>
              {!embebido && <span> · Detalle</span>}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <StatusPill tono="teal">Dali IA</StatusPill>
            {embebido ? (
              <button
                type="button"
                onClick={() => navigate('/leads')}
                aria-label="Cerrar"
                className="flex size-11 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100"
              >
                <Icon name="close" className="text-2xl" />
              </button>
            ) : (
              <button type="button" aria-label="Más" className="flex size-11 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100">
                <Icon name="more_vert" className="text-2xl" />
              </button>
            )}
          </div>
        </div>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-headline text-[22px] font-bold leading-tight tracking-tight text-stone-900">{lead.titulo}</h1>
            <p className="mt-1 font-body text-sm text-stone-500">
              ID: {lead.id.slice(-8).toUpperCase()} · Ingresó {cuando(lead.creadoMs, ahoraMs)}
            </p>
          </div>
          <label className={cn('relative shrink-0 rounded-lg border px-3 py-2', lead.estado === 'nuevo' ? 'border-amber-300 bg-amber-50' : 'border-stone-200 bg-white')}>
            <span className="sr-only">Estado</span>
            <span className={cn('flex items-center gap-2 font-body text-[15px] font-semibold', lead.estado === 'nuevo' ? 'text-amber-800' : 'text-stone-800')}>
              <span
                className={cn(
                  'size-2 rounded-full',
                  { nuevo: 'bg-amber-500', contactado: 'bg-blue-500', cotizado: 'bg-teal-600', ganado: 'bg-emerald-500', perdido: 'bg-stone-400' }[lead.estado]
                )}
              />
              {NOMBRE_ESTADO_LEAD[lead.estado]}
              <Icon name="expand_more" className="text-xl" />
            </span>
            <select
              value={lead.estado}
              onChange={(e) => cambiar.mutate({ estado: e.target.value as EstadoLead })}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label="Cambiar estado"
            >
              {ESTADOS.map((e) => (
                <option key={e} value={e}>
                  {NOMBRE_ESTADO_LEAD[e]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <a
          href={`https://wa.me/${lead.telefono}`}
          target="_blank"
          rel="noreferrer"
          className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-teal-800 font-headline text-[17px] font-bold text-white shadow-sm hover:bg-teal-900"
        >
          <Icon name="chat" className="text-2xl" /> Escribir por WhatsApp
        </a>
      </header>

      <div className="space-y-4 px-4 py-4">
        <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-full border border-teal-200 bg-teal-50 font-headline text-[15px] font-bold text-teal-800">
                {iniciales(lead.nombre)}
              </div>
              <div>
                <p className="flex items-center gap-2 font-headline text-[17px] font-bold text-stone-900">
                  {lead.nombre} <span className="size-2.5 rounded-full bg-emerald-500" />
                </p>
                {lead.empresa && <p className="font-body text-[15px] text-stone-500">{lead.empresa}</p>}
              </div>
            </div>
            <a href={`tel:+${lead.telefono}`} aria-label="Llamar" className="flex size-11 items-center justify-center rounded-full bg-stone-100 text-stone-700 hover:bg-stone-200">
              <Icon name="call" className="text-xl" />
            </a>
          </div>
          <div className="mt-3 space-y-2 rounded-lg border border-stone-200 bg-stone-50 p-3 font-body text-[15px]">
            <p className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-stone-800">
                <Icon name="smartphone" className="text-lg text-stone-400" /> <span className="font-mono">{telefonoLegible(lead.telefono)}</span>
              </span>
              <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-label text-xs font-semibold text-emerald-700">Verificado</span>
            </p>
            <p className="flex items-center gap-2 text-stone-500">
              <Icon name="campaign" className="text-lg text-stone-400" /> Cliente {lead.estado === 'nuevo' ? 'nuevo' : 'en seguimiento'} (llegó por WhatsApp)
            </p>
          </div>
          <Link
            to={`/chats/${lead.conversationId}`}
            className="mt-3 flex h-12 items-center justify-center gap-2 rounded-lg bg-stone-100 font-body text-[15px] font-semibold text-stone-800 hover:bg-stone-200"
          >
            <Icon name="forum" className="text-xl" /> Ver conversación
          </Link>
        </section>

        <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-headline text-[17px] font-bold text-stone-900">
              <span className="flex size-8 items-center justify-center rounded-md bg-teal-50 text-teal-700">
                <Icon name="smart_toy" className="text-xl" />
              </span>
              Lo que Dali juntó
            </h2>
            <span className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 font-label text-xs font-semibold text-teal-800">
              {lead.campos.length + [lead.cantidad, lead.distrito, lead.fecha].filter(Boolean).length + 1} datos
            </span>
          </div>
          <p
            className={cn(
              'mt-3 flex items-center gap-2 rounded-lg border px-3 py-2.5 font-body text-[15px] font-semibold',
              lead.confirmado ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'
            )}
          >
            <Icon name={lead.confirmado ? 'check_circle' : 'hourglass_top'} className="text-xl" />
            {lead.confirmado ? 'Confirmado por el cliente' : 'Todavía sin confirmar'}
            {lead.cerradoEn && <span className="font-normal text-emerald-700"> · {lead.cerradoEn}</span>}
          </p>
          <dl className="mt-2 divide-y divide-stone-100 font-body text-[15px]">
            <Fila k="Servicio" v={oracion(lead.servicio)} />
            {lead.cantidad && (
              <Fila
                k={lead.cantidad.includes('m³') ? 'Cantidad' : 'Área'}
                v={<span className="rounded-md bg-stone-100 px-2 py-0.5 font-mono font-semibold">{lead.cantidad}</span>}
              />
            )}
            {lead.distrito && <Fila k="Lugar" v={lead.distrito} />}
            {lead.campos.map(([k, v]) => (
              <Fila key={k} k={k} v={v} />
            ))}
            {lead.fecha && <Fila k="Para" v={<span className="rounded-md bg-teal-50 px-2 py-0.5 font-semibold text-teal-800">{lead.fecha}</span>} />}
            <Fila
              k="A nombre de"
              v={
                <span>
                  {lead.nombre}
                  {lead.empresa && <span className="block font-normal text-stone-500">({lead.empresa})</span>}
                </span>
              }
            />
          </dl>
        </section>

        {lead.notasDelCliente.length > 0 && (
          <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-headline text-[17px] font-bold text-stone-900">
                <Icon name="comment" className="text-xl text-amber-600" /> Notas que agregó después
              </h2>
              <span className="rounded-md bg-amber-100 px-2 py-0.5 font-mono text-xs text-amber-800">{cuando(lead.actualizadoMs, ahoraMs)}</span>
            </div>
            <div className="mt-3 space-y-2">
              {lead.notasDelCliente.map((n, i) => (
                <blockquote key={i} className="rounded-lg border border-amber-200 bg-white px-4 py-3">
                  <p className="font-body text-[15px] italic text-stone-800">“{n}”</p>
                  <p className="mt-2 flex items-center gap-2 font-label text-xs">
                    <span className="font-bold uppercase tracking-[0.15em] text-teal-800">WhatsApp</span>
                    <span className="text-stone-500">Mensaje posterior enviado en el mismo chat</span>
                  </p>
                </blockquote>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-headline text-[17px] font-bold text-stone-900">
              <span className="flex size-8 items-center justify-center rounded-md bg-teal-50 text-teal-700">
                <Icon name="request_quote" className="text-xl" />
              </span>
              Cotización
            </h2>
            <span className="rounded-full bg-stone-100 px-3 py-1 font-label text-xs font-semibold text-stone-600">{lead.cotizacion?.monto ? 'Enviada' : 'Por enviar'}</span>
          </div>
          <form onSubmit={guardarCotizacion} className="mt-3 space-y-3">
            <label className="block">
              <span className="font-body text-[15px] font-semibold text-stone-800">Monto (S/)</span>
              <span className="mt-1.5 flex h-12 items-center rounded-lg border border-stone-200 bg-stone-50 px-3 focus-within:ring-2 focus-within:ring-teal-600/50">
                <span className="mr-2 font-mono text-stone-500">S/</span>
                <input
                  value={monto || (lead.cotizacion?.monto ? String(lead.cotizacion.monto) : '')}
                  onChange={(e) => setMonto(e.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="min-w-0 flex-1 bg-transparent font-mono text-[15px] text-stone-900 placeholder:text-stone-400 focus:outline-none"
                />
              </span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="font-body text-[15px] font-semibold text-stone-800">Enviada el</span>
                <input
                  type="date"
                  value={enviadaEl || (lead.cotizacion?.enviadaEl ?? '').slice(0, 10)}
                  onChange={(e) => setEnviadaEl(e.target.value)}
                  className="mt-1.5 h-12 w-full rounded-lg border border-stone-200 bg-stone-50 px-3 font-body text-[15px] text-stone-900"
                />
              </label>
              <label className="block">
                <span className="font-body text-[15px] font-semibold text-stone-800">Válida hasta</span>
                <input
                  type="date"
                  value={validaHasta || (lead.cotizacion?.validaHasta ?? '').slice(0, 10)}
                  onChange={(e) => setValidaHasta(e.target.value)}
                  className="mt-1.5 h-12 w-full rounded-lg border border-stone-200 bg-stone-50 px-3 font-body text-[15px] text-stone-900"
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                className="flex h-12 items-center justify-center gap-2 rounded-lg border border-stone-200 font-body text-[15px] font-semibold text-stone-700 hover:bg-stone-50"
              >
                <Icon name="attach_file" className="text-xl" /> Adjuntar PDF
              </button>
              <button
                type="submit"
                disabled={cambiar.isPending}
                className="flex h-12 items-center justify-center gap-2 rounded-lg bg-teal-800 font-headline text-[15px] font-bold text-white hover:bg-teal-900 disabled:opacity-60"
              >
                <Icon name="save" className="text-xl" /> Guardar
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="flex items-center gap-2 font-headline text-[17px] font-bold text-stone-900">
            <span className="flex size-8 items-center justify-center rounded-md bg-stone-100 text-stone-600">
              <Icon name="history" className="text-xl" />
            </span>
            Historial
          </h2>
          <ol className="mt-4 space-y-4 border-l-2 border-stone-100 pl-4">
            {[...lead.historial].reverse().map((h, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[23px] top-1 size-3 rounded-full bg-teal-600 ring-2 ring-white" />
                <p className="flex items-center justify-between gap-2 font-body text-[15px] font-semibold text-stone-900">
                  {h.autor} pasó el lead a {NOMBRE_ESTADO_LEAD[h.estado].toLowerCase()}{' '}
                  <span className="font-mono text-xs font-normal text-stone-400">{cuando(new Date(h.fecha).getTime(), ahoraMs)}</span>
                </p>
              </li>
            ))}
            {lead.confirmado && (
              <li className="relative">
                <span className="absolute -left-[23px] top-1 size-3 rounded-full border-2 border-emerald-500 bg-white" />
                <p className="flex items-center justify-between gap-2 font-body text-[15px] font-semibold text-stone-900">
                  Dali cerró el lead confirmado <span className="font-mono text-xs font-normal text-stone-400">{cuando(lead.actualizadoMs, ahoraMs)}</span>
                </p>
                <p className="font-body text-sm text-stone-500">Se recopilaron los datos del guion y el cliente confirmó el resumen.</p>
              </li>
            )}
            <li className="relative">
              <span className="absolute -left-[23px] top-1 size-3 rounded-full bg-stone-300 ring-2 ring-white" />
              <p className="flex items-center justify-between gap-2 font-body text-[15px] font-semibold text-stone-900">
                Primer mensaje <span className="font-mono text-xs font-normal text-stone-400">{cuando(lead.creadoMs, ahoraMs)}</span>
              </p>
              <p className="font-body text-sm text-stone-500">El cliente escribió al número del negocio y Dali empezó a atender.</p>
            </li>
          </ol>
        </section>

        <section id="notas" className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="flex items-center gap-2 font-headline text-[17px] font-bold text-stone-900">
            <span className="flex size-8 items-center justify-center rounded-md bg-stone-100 text-stone-600">
              <Icon name="edit_note" className="text-xl" />
            </span>
            Notas internas
          </h2>
          {lead.notas.length > 0 && (
            <ul className="mt-3 space-y-2">
              {lead.notas.map((n, i) => (
                <li key={i} className="rounded-lg bg-stone-50 px-3 py-2.5 font-body text-[15px] text-stone-800">
                  {n.texto}
                  <span className="mt-1 block font-label text-xs text-stone-400">
                    {n.autor} · {cuando(new Date(n.fecha).getTime(), ahoraMs)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (nota.trim()) guardarNota.mutate(nota.trim());
            }}
            className="mt-3"
          >
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={3}
              placeholder="Agregar nota interna…"
              className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 font-body text-[15px] text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-teal-600/50"
            />
            <button
              type="submit"
              disabled={!nota.trim() || guardarNota.isPending}
              className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-teal-800 font-headline text-[15px] font-bold text-white hover:bg-teal-900 disabled:opacity-50"
            >
              <Icon name="save" className="text-xl" /> Guardar nota
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

function Fila({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-stone-500">{k}</dt>
      <dd className="text-right font-semibold text-stone-900">{v}</dd>
    </div>
  );
}
