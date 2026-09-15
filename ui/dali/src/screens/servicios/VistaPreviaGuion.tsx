import { Link } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { StatusPill } from '@/components/StatusPill';
import { iniciales } from '@/lib/format';
import type { PreguntaEditable, ServicioEditable } from '@/lib/types';
import { cn } from '@/lib/utils';
import { variableDe } from './guion';

/**
 * La columna derecha de A9: cómo se vería la conversación con las primeras
 * preguntas del guion (sin inventar respuestas: los datos aparecen vacíos) y
 * qué datos junta.
 */
const CUANTAS = 3;

export function VistaPreviaGuion({ servicio, cierre, empresa, className }: { servicio: ServicioEditable; cierre: PreguntaEditable[]; empresa: string; className?: string }) {
  const preguntas = servicio.modo === 'derivar' ? [] : servicio.preguntas.filter((p) => !p.cuando).slice(0, CUANTAS);
  const datos = [...servicio.preguntas, ...cierre].filter((p) => !p.cuando).slice(0, 6);
  return (
    <section className={cn('rounded-2xl border border-stone-200 bg-white shadow-sm', className)}>
      <div className="flex items-start justify-between gap-3 border-b border-stone-100 px-4 py-4 md:px-5">
        <div>
          <h2 className="flex items-center gap-2 font-headline text-[15px] font-bold uppercase tracking-[0.06em] text-stone-900">
            <span className="size-2.5 rounded-full bg-emerald-500" /> Vista previa de la conversación
          </h2>
          <p className="mt-0.5 font-body text-sm text-stone-500">
            {preguntas.length ? `Así arrancan las preguntas 1 a ${preguntas.length} en WhatsApp` : 'Este servicio pasa al asesor sin preguntas'}
          </p>
        </div>
        <StatusPill tono="teal" punto={false} className="shrink-0">
          En vivo
        </StatusPill>
      </div>
      <div className="overflow-hidden">
        <div className="flex items-center gap-3 bg-teal-900 px-3 py-2.5 text-white">
          <span className="flex size-9 items-center justify-center rounded-full bg-teal-700 font-headline text-xs font-bold ring-2 ring-teal-600">{iniciales(empresa)}</span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate font-headline text-[15px] font-bold">{empresa}</p>
            <p className="font-body text-xs text-teal-100">en línea · Dali Asistente</p>
          </div>
          <Icon name="videocam" className="text-xl text-white/80" />
          <Icon name="call" className="text-xl text-white/80" />
          <Icon name="more_vert" className="text-xl text-white/80" />
        </div>
        <div
          className="space-y-3 px-3 py-4"
          style={{ backgroundColor: 'var(--color-stone-200)', backgroundImage: 'radial-gradient(var(--color-stone-300) 0.8px, transparent 0.8px)', backgroundSize: '14px 14px' }}
        >
          <p className="mx-auto w-fit rounded-lg bg-white/80 px-2.5 py-1 font-mono text-[11px] font-semibold uppercase text-stone-500">
            Hoy · {servicio.nombre || 'nuevo servicio'}
          </p>
          <div className="ml-8 rounded-xl rounded-tr-sm border border-emerald-200 bg-emerald-50 px-3 py-2 shadow-sm">
            <p className="font-body text-sm leading-relaxed text-stone-800">Hola, vi su anuncio. Necesito {servicio.nombre || 'una cotización'}.</p>
          </div>
          {preguntas.map((p, i) => (
            <div key={`${p.campo}-${i}`} className="mr-8 rounded-xl rounded-tl-sm bg-white px-3 py-2 shadow-sm">
              <p className="flex items-center gap-1.5 font-label text-[11px] font-bold uppercase tracking-wider text-teal-800">
                <Icon name="smart_toy" className="text-sm" /> Dali (pregunta {i + 1}/{servicio.preguntas.length})
              </p>
              <p className="mt-1 font-body text-sm leading-relaxed text-stone-800">{p.pregunta || '…'}</p>
            </div>
          ))}
          {preguntas.length > 0 && preguntas.length < servicio.preguntas.length && (
            <p className="text-center font-body text-xs text-stone-500">… y sigue hasta juntar los {servicio.preguntas.length} datos</p>
          )}
        </div>
      </div>
      <div className="border-t border-stone-100 px-4 py-4 md:px-5">
        <div className="flex items-baseline justify-between">
          <p className="font-label text-xs font-bold uppercase tracking-[0.12em] text-stone-700">Datos que junta</p>
          <span className="font-mono text-sm text-stone-500">{servicio.preguntas.length + cierre.length} en total</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {datos.map((p, i) => (
            <div key={`${p.campo}-${i}`} className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
              <p className="truncate font-label text-[11px] font-bold uppercase tracking-wider text-stone-500">{p.etiqueta || variableDe(p)}</p>
              <p className="font-body text-sm text-stone-400">—</p>
            </div>
          ))}
        </div>
        <Link
          to="/probar"
          className="mt-4 flex h-12 items-center justify-center gap-2 rounded-xl border border-teal-200 bg-teal-50 font-body text-[15px] font-semibold text-teal-800 hover:bg-teal-100"
        >
          Abrir simulador <Icon name="arrow_forward" className="text-xl" />
        </Link>
      </div>
    </section>
  );
}
