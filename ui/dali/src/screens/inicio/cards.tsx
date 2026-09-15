import { Link } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { Interruptor } from '@/components/Interruptor';
import type { IconName } from '@/components/icon-map';
import { NOMBRE_ESTADO_LEAD, StatusPill, TONO_LEAD } from '@/components/StatusPill';
import { cuando, diaCorto, numero, telefonoLegible } from '@/lib/format';
import type { AtencionPendiente, Inicio, LeadResumen } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Las piezas de «Inicio» (A1), en el lenguaje visual de las tres capturas. */

/** «hace 3 min», «hace 2 h», «hace 3 días»: los minutos como los lee la gente. */
const haceLegible = (min: number): string =>
  min < 60 ? `hace ${min} min` : min < 24 * 60 ? `hace ${Math.round(min / 60)} h` : `hace ${Math.round(min / 1440)} día${Math.round(min / 1440) === 1 ? '' : 's'}`;

export function TarjetaEstado({ inicio, onCambiar, cambiando }: { inicio: Inicio; onCambiar: (encendido: boolean) => void; cambiando: boolean }) {
  const a = inicio.asistente;
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-3.5 shadow-sm md:p-5 xl:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="relative flex size-3 md:hidden">
            {a.encendido && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />}
            <span className={cn('relative inline-flex size-3 rounded-full', a.encendido ? 'bg-emerald-600' : 'bg-stone-400')} />
          </span>
          <div className="relative hidden size-12 items-center justify-center rounded-xl border border-teal-100 bg-teal-50 text-teal-800 md:flex">
            <Icon name="smart_toy" className="text-2xl" />
            <span className={cn('absolute -right-1 -top-1 size-3.5 rounded-full border-2 border-white', a.encendido ? 'bg-emerald-500' : 'bg-stone-400')} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-headline text-sm font-semibold tracking-tight text-stone-900 md:text-lg">{a.encendido ? 'Dali está atendiendo' : 'Dali está en pausa'}</h2>
              <StatusPill tono={a.encendido ? 'teal' : 'stone'} className="hidden md:inline-flex">
                {a.encendido ? 'En servicio continuo' : 'Sin atender'}
              </StatusPill>
            </div>
            <p className="mt-1 hidden font-body text-sm text-stone-500 md:block">
              {a.conectado ? 'WhatsApp Business conectado' : 'WhatsApp sin conectar'} · <span className="font-mono">{telefonoLegible(a.numero)}</span>
              {a.ultimoMensajeHaceMin !== null && ` · Último mensaje recibido ${haceLegible(a.ultimoMensajeHaceMin)}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden shrink-0 items-center gap-3 whitespace-nowrap rounded-full bg-stone-100 py-2 pl-4 pr-2 xl:flex">
            <span className="font-body text-sm text-stone-700">Recepción activa</span>
            <Interruptor checked={a.encendido} onChange={onCambiar} disabled={cambiando} label={a.encendido ? 'Apagar a Dali' : 'Encender a Dali'} />
          </div>
          <button
            type="button"
            className="hidden h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-stone-200 bg-white px-4 font-body text-sm text-stone-700 hover:bg-stone-50 md:inline-flex"
          >
            <Icon name="pause_circle" className="text-xl text-stone-500" /> Pausar 30 min
          </button>
          <div className="xl:hidden">
            <Interruptor checked={a.encendido} onChange={onCambiar} disabled={cambiando} label={a.encendido ? 'Apagar a Dali' : 'Encender a Dali'} />
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-stone-100 pt-3 md:hidden">
        <p className="flex min-w-0 items-center gap-1.5 whitespace-nowrap font-mono text-[13px] text-stone-700">
          <Icon name="chat" className="shrink-0 text-lg text-teal-700" /> <span className="shrink-0">{telefonoLegible(a.numero)}</span>
          {a.ultimoMensajeHaceMin !== null && <span className="truncate text-stone-500"> · {haceLegible(a.ultimoMensajeHaceMin)}</span>}
        </p>
        <button type="button" className="min-h-9 shrink-0 whitespace-nowrap font-body text-sm font-semibold text-stone-600 underline underline-offset-4">
          Pausar 30 min
        </button>
      </div>
    </section>
  );
}

export function TarjetaMetrica({
  titulo,
  valor,
  unidad,
  icon,
  delta,
  detalle,
  tono = 'normal',
}: {
  titulo: string;
  valor: string;
  unidad?: string;
  icon: IconName;
  delta?: { texto: string; tono: 'up' | 'flat' } | null;
  detalle?: string;
  tono?: 'normal' | 'alerta';
}) {
  const alerta = tono === 'alerta';
  return (
    <div className={cn('rounded-xl border p-3.5 shadow-sm md:p-5', alerta ? 'border-amber-200/90 bg-amber-50/50' : 'border-stone-200 bg-white')}>
      <div className="flex items-start justify-between">
        <p
          className={cn(
            'font-body text-sm md:font-label md:text-xs md:font-semibold md:uppercase md:tracking-[0.1em]',
            alerta ? 'text-amber-800 md:text-amber-800' : 'text-stone-600 md:text-stone-500'
          )}
        >
          {titulo}
        </p>
        <Icon name={icon} className={cn('text-2xl', alerta ? 'text-amber-600' : 'text-stone-300')} />
      </div>
      <div className="mt-3 flex items-end justify-between gap-2 md:mt-5">
        <p className={cn('num-tabular font-headline text-[26px] font-bold leading-none tracking-tight md:text-4xl', alerta ? 'text-amber-800' : 'text-stone-900')}>
          {valor}
          {unidad && <span className="ml-1 font-body text-sm font-normal text-stone-600">{unidad}</span>}
        </p>
        {delta && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-label text-xs font-semibold',
              delta.tono === 'up' ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-500'
            )}
          >
            {delta.tono === 'up' && <Icon name="arrow_upward" className="text-sm" />}
            {delta.texto}
          </span>
        )}
        {alerta && !delta && <span className="rounded-full bg-amber-100/80 px-2.5 py-1 font-label text-xs font-semibold text-amber-800">Pide ayuda</span>}
      </div>
      {detalle && <p className={cn('mt-2 hidden font-body text-sm md:block', alerta ? 'text-amber-800' : 'text-stone-500')}>{detalle}</p>}
    </div>
  );
}

export function FilaAtencion({ a, onTomar, tomando }: { a: AtencionPendiente; onTomar: (id: string) => void; tomando: boolean }) {
  const pidePersona = a.motivo === 'pidio-persona';
  return (
    <div
      className={cn(
        'rounded-xl border p-3.5 shadow-sm md:p-5 xl:rounded-none xl:border-0 xl:p-0 xl:shadow-none',
        pidePersona ? 'border-amber-200/90 bg-white' : 'border-stone-200 bg-white'
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-headline text-[15px] font-bold text-stone-900 md:text-lg xl:text-xl">
            {pidePersona ? (
              <Icon name="front_hand" className="shrink-0 text-xl text-amber-600 xl:hidden" />
            ) : (
              <Icon name="help_outline" className="shrink-0 text-xl text-stone-400" />
            )}
            <span className="truncate">{a.nombre}</span>
            {a.empresa && <span className="hidden truncate font-body text-base font-normal text-stone-500 xl:inline"> · {a.empresa}</span>}
          </p>
          <p className={cn('mt-1 font-body text-sm', pidePersona ? 'text-stone-700 md:text-amber-800' : 'text-stone-600')}>
            <span className={cn('mr-1.5 hidden size-2 rounded-full align-middle xl:inline-block', pidePersona ? 'bg-amber-500' : 'bg-stone-400')} />
            {a.texto} · <span className="font-mono text-stone-400 xl:font-body xl:text-amber-800">hace {a.haceMin} min</span>
          </p>
        </div>
        {a.accion === 'tomar' ? (
          <button
            type="button"
            disabled={tomando}
            onClick={() => onTomar(a.conversationId)}
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-amber-600 px-5 font-headline text-[15px] font-bold text-white shadow-sm transition-colors hover:bg-amber-700 disabled:opacity-60 md:bg-teal-700 md:hover:bg-teal-800 xl:hidden"
          >
            <Icon name="support_agent" className="hidden text-xl md:inline" /> Tomar
          </button>
        ) : (
          <Link
            to={`/chats/${a.conversationId}`}
            className="inline-flex h-11 shrink-0 items-center rounded-full border border-stone-200 bg-stone-50 px-5 font-body text-[15px] font-semibold text-stone-700 hover:bg-stone-100 xl:hidden"
          >
            Ver
          </Link>
        )}
      </div>
      {/* En escritorio (diseño A1): el último mensaje entre comillas, los chips de lo que Dali ya sabe, y las dos acciones. */}
      <div className="hidden xl:block">
        {a.ultimoMensaje && (
          <blockquote className="mt-4 rounded-lg border border-stone-200 bg-stone-50 px-5 py-4">
            <p className="font-label text-xs text-stone-400">Mensaje del cliente</p>
            <p className="mt-1 font-body text-[15px] italic leading-relaxed text-stone-700">“{a.ultimoMensaje}”</p>
          </blockquote>
        )}
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {a.chips.map((chip, i) => (
              <span key={chip} className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1.5 font-body text-sm text-stone-700">
                <Icon name={i === 0 ? 'location_on' : 'inventory_2'} className="text-base text-stone-500" /> {chip}
              </span>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Link
              to={`/chats/${a.conversationId}`}
              className="inline-flex h-12 items-center rounded-full border border-stone-200 bg-white px-5 font-body text-[15px] text-stone-800 hover:bg-stone-50"
            >
              Ver historial
            </Link>
            {a.accion === 'tomar' && (
              <button
                type="button"
                disabled={tomando}
                onClick={() => onTomar(a.conversationId)}
                className="inline-flex h-12 items-center gap-2 rounded-full bg-teal-800 px-5 font-headline text-[15px] font-bold text-white hover:bg-teal-900 disabled:opacity-60"
              >
                <Icon name="support_agent" className="text-xl" /> Tomar conversación
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** En escritorio los últimos leads son una tabla (diseño A1): requerimiento, contacto/obra, hora, estado y acción. */
export function TablaLeads({ leads, ahoraMs }: { leads: LeadResumen[]; ahoraMs: number }) {
  return (
    <table className="w-full text-left">
      <thead>
        <tr className="border-b border-stone-200 bg-stone-50 font-label text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
          <th className="px-6 py-3.5">Requerimiento</th>
          <th className="px-4 py-3.5">Contacto / obra</th>
          <th className="px-4 py-3.5">Hora</th>
          <th className="px-4 py-3.5">Estado</th>
          <th className="px-6 py-3.5 text-right">Acción</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-stone-100">
        {leads.map((l) => (
          <tr key={l.id} className="align-top hover:bg-stone-50">
            <td className="px-6 py-4">
              <p className="font-headline text-[15px] font-bold text-stone-900">{l.titulo.split(' · ')[0]}</p>
              {l.campos[0] && (
                <p className="mt-0.5 font-body text-sm text-stone-500">
                  {l.campos[0][0]} {l.campos[0][1]}
                </p>
              )}
            </td>
            <td className="px-4 py-4">
              <p className="font-headline text-[15px] font-bold text-stone-900">{l.nombre}</p>
              <p className="mt-0.5 font-body text-sm text-stone-500">{[l.distrito, l.empresa].filter(Boolean).join(' · ') || '—'}</p>
            </td>
            <td className="whitespace-nowrap px-4 py-4 font-mono text-sm text-stone-500">{cuando(l.actualizadoMs, ahoraMs)}</td>
            <td className="px-4 py-4">
              <StatusPill tono={TONO_LEAD[l.estado]}>{NOMBRE_ESTADO_LEAD[l.estado]}</StatusPill>
            </td>
            <td className="px-6 py-4 text-right">
              <Link to={`/leads/${l.id}`} className="font-body text-[15px] font-semibold text-teal-800 hover:underline">
                {l.estado === 'nuevo' ? 'Cotizar' : 'Ver'}
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function FilaLead({ lead, ahoraMs }: { lead: LeadResumen; ahoraMs: number }) {
  return (
    <Link to={`/leads/${lead.id}`} className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-stone-50 md:px-5">
      <div className="min-w-0">
        <p className="truncate font-headline text-[15px] font-bold tracking-tight text-stone-900">{lead.titulo}</p>
        <p className="mt-0.5 truncate font-body text-sm text-stone-500">
          {lead.nombre}
          {lead.empresa && ` (${lead.empresa})`} · <span className="font-mono text-[13px]">{cuando(lead.actualizadoMs, ahoraMs)}</span>
        </p>
      </div>
      <StatusPill tono={TONO_LEAD[lead.estado]}>{NOMBRE_ESTADO_LEAD[lead.estado]}</StatusPill>
    </Link>
  );
}

export function TarjetaPlan({ plan }: { plan: Inicio['plan'] }) {
  const ilimitado = plan.limite < 0;
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm md:p-5 xl:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-headline text-[15px] font-bold text-stone-900 xl:text-lg">
            <span className="xl:hidden">Plan {plan.nombre}</span>
            <span className="hidden xl:inline">Uso de tu plan</span>
          </h2>
          <p className="mt-0.5 font-body text-sm text-stone-500">
            <span className="hidden xl:inline">Plan {plan.nombre} · </span>Se renueva el {diaCorto(plan.renuevaEl)}
          </p>
        </div>
        <span
          className={cn(
            'num-tabular shrink-0 font-mono text-sm font-semibold',
            ilimitado ? 'text-stone-500' : 'text-teal-800',
            'xl:rounded-full xl:bg-stone-100 xl:px-3 xl:py-1.5 xl:font-body xl:text-stone-700'
          )}
        >
          {ilimitado ? 'sin límite' : `${plan.porcentaje}% consumido`}
        </span>
      </div>
      <p className="mt-4 hidden items-center justify-between font-body text-sm xl:flex">
        <span className="text-stone-600">Mensajes del asistente</span>
        <span className="num-tabular font-mono">
          <span className="font-semibold text-teal-800">{numero(plan.usados)}</span> <span className="text-stone-400">/ {ilimitado ? '∞' : numero(plan.limite)}</span>
        </span>
      </p>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-stone-100 xl:mt-2">
        <div className="h-full rounded-full bg-teal-700 transition-[width]" style={{ width: `${ilimitado ? 8 : plan.porcentaje}%` }} />
      </div>
      <div className="mt-2 flex justify-between font-mono text-[13px] text-stone-500 xl:hidden">
        <span className="num-tabular">{numero(plan.usados)} mensajes usados</span>
        <span className="num-tabular">{ilimitado ? 'sin límite mensual' : `${numero(plan.limite)} límite mensual`}</span>
      </div>
      <div className="mt-5 hidden grid-cols-2 gap-3 xl:grid">
        <div className="rounded-lg border border-stone-200 p-4">
          <p className="font-body text-sm text-stone-500">Contactos únicos</p>
          <p className="num-tabular mt-1 font-headline text-2xl font-bold text-stone-900">
            {numero(plan.contactosUnicos)} <span className="font-mono text-base font-normal text-stone-400">/ ilimitados</span>
          </p>
        </div>
        <div className="rounded-lg border border-stone-200 p-4">
          <p className="font-body text-sm text-stone-500">Miembros del equipo</p>
          <p className="num-tabular mt-1 font-headline text-2xl font-bold text-stone-900">
            {plan.miembros} <span className="font-mono text-base font-normal text-stone-400">/ 5 cuentas</span>
          </p>
        </div>
      </div>
      <Link to="/plan" className="mt-4 hidden h-12 items-center justify-center rounded-full border border-stone-200 font-body text-[15px] text-stone-800 hover:bg-stone-50 xl:flex">
        Gestionar suscripción y facturación
      </Link>
    </section>
  );
}

export function TarjetaCanal({ asistente }: { asistente: Inicio['asistente'] }) {
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-3 font-headline text-lg font-bold text-stone-900">
          <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <Icon name="call" className="text-xl" />
          </span>
          Canal WhatsApp
        </h2>
        <StatusPill tono={asistente.conectado ? 'emerald' : 'red'}>{asistente.conectado ? 'Conectado' : 'Sin conexión'}</StatusPill>
      </div>
      <dl className="mt-5 space-y-3 rounded-lg border border-stone-200 bg-stone-50/60 p-5 font-body text-[15px]">
        <div className="flex justify-between gap-3">
          <dt className="text-stone-600">Número oficial:</dt>
          <dd className="font-mono font-semibold text-stone-900">{telefonoLegible(asistente.numero) || '—'}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-stone-600">Recepción:</dt>
          <dd className={cn('font-semibold', asistente.encendido ? 'text-teal-800' : 'text-stone-500')}>{asistente.encendido ? 'Activa' : 'En pausa'}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-stone-600">Último mensaje:</dt>
          <dd className="text-stone-700">{asistente.ultimoMensajeHaceMin === null ? 'sin mensajes aún' : haceLegible(asistente.ultimoMensajeHaceMin)}</dd>
        </div>
      </dl>
      <p className="mt-6 font-label text-xs font-semibold uppercase tracking-[0.12em] text-stone-400">Ajustes directos</p>
      <div className="mt-3 space-y-2.5">
        {(
          [
            ['/catalogo', 'price_change', 'Actualizar precios del catálogo'],
            ['/faq', 'edit_note', 'Respuestas rápidas y preguntas frecuentes'],
            ['/probar', 'science', 'Simulador de cliente de prueba'],
          ] as const
        ).map(([to, icon, label]) => (
          <Link
            key={to}
            to={to}
            className="flex h-14 items-center gap-3 rounded-lg border border-stone-200 px-4 font-body text-[15px] text-stone-800 transition-colors hover:bg-stone-50"
          >
            <Icon name={icon} className="text-xl text-teal-700" />
            <span className="flex-1">{label}</span>
            <Icon name={to === '/probar' ? 'open_in_new' : 'chevron_right'} className="text-xl text-stone-400" />
          </Link>
        ))}
      </div>
    </section>
  );
}
