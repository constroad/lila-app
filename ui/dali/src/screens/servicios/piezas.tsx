import { Link } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import type { IconName } from '@/components/icon-map';
import { Interruptor } from '@/components/Interruptor';
import { StatusPill } from '@/components/StatusPill';
import type { PreguntaEditable, ServicioEditable, TipoPregunta } from '@/lib/types';
import { oracion } from '@/lib/format';
import { cn } from '@/lib/utils';
import { NOMBRE_MODO, NOMBRE_TIPO, condicionLegible, variableDe } from './guion';

/** Piezas compartidas por A8, A9 y A10, en el lenguaje de las capturas. */

export const ICONO_TIPO: Record<TipoPregunta, IconName> = { numero: 'numbers', texto: 'text_fields', sino: 'check_circle', opcion: 'format_list_bulleted' };
const TONO_TIPO: Record<TipoPregunta, string> = {
  numero: 'border-sky-200 bg-sky-50 text-sky-800',
  texto: 'border-violet-200 bg-violet-50 text-violet-800',
  sino: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  opcion: 'border-teal-200 bg-teal-50 text-teal-800',
};

export function ChipTipo({ tipo, className }: { tipo: TipoPregunta; className?: string }) {
  return (
    <span className={cn('inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 font-body text-sm font-semibold', TONO_TIPO[tipo], className)}>
      <Icon name={ICONO_TIPO[tipo]} className="text-base" /> {tipo === 'texto' ? 'Texto libre' : NOMBRE_TIPO[tipo]}
    </span>
  );
}

export function PillModo({ servicio, className }: { servicio: ServicioEditable; className?: string }) {
  return (
    <StatusPill tono={servicio.modo === 'derivar' ? 'amber' : 'teal'} className={className}>
      {NOMBRE_MODO[servicio.modo]}
    </StatusPill>
  );
}

/** Chips de palabras solo para leer (la lista del servicio en A8). */
export function PalabrasResumidas({ palabras, maximo = 5, mono = false }: { palabras: string[]; maximo?: number; mono?: boolean }) {
  const visibles = palabras.slice(0, maximo);
  const resto = palabras.length - visibles.length;
  return (
    <div className="flex flex-wrap gap-2">
      {visibles.map((p) => (
        <span key={p} className={cn('inline-flex h-9 items-center rounded-lg bg-stone-100 px-3 text-[15px] text-stone-700', mono ? 'font-mono text-sm' : 'font-body')}>
          {p}
        </span>
      ))}
      {resto > 0 && <span className="inline-flex h-9 items-center rounded-lg bg-stone-100 px-3 font-body text-[15px] text-stone-500">+{resto} más</span>}
      {!palabras.length && <span className="font-body text-[15px] italic text-stone-400">Sin palabras: Dali no lo reconoce sola</span>}
    </div>
  );
}

/** Una tarjeta de servicio en A8: nombre, modo, interruptor, palabras y el acceso al guion. */
export function TarjetaServicio({
  servicio,
  seleccionado,
  onSeleccionar,
  onActivo,
}: {
  servicio: ServicioEditable;
  seleccionado: boolean;
  onSeleccionar?: () => void;
  onActivo: (v: boolean) => void;
}) {
  const n = servicio.preguntas.length;
  return (
    <section
      className={cn(
        'relative rounded-2xl border bg-white p-4 shadow-sm transition-colors md:p-5',
        seleccionado ? 'border-teal-600 ring-1 ring-teal-600' : 'border-stone-200',
        !servicio.activo && 'opacity-70'
      )}
    >
      {seleccionado && (
        <span className="absolute -top-3 left-5 rounded-full bg-teal-800 px-3 py-1 font-label text-[11px] font-bold uppercase tracking-wider text-white">Editando ahora</span>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {onSeleccionar ? (
            <button
              type="button"
              onClick={onSeleccionar}
              className="block min-h-11 text-left font-headline text-lg font-bold tracking-tight text-stone-900 hover:text-teal-800 md:text-xl"
            >
              {oracion(servicio.nombre) || 'Servicio sin nombre'}
            </button>
          ) : (
            <h3 className="font-headline text-lg font-bold tracking-tight text-stone-900">{oracion(servicio.nombre) || 'Servicio sin nombre'}</h3>
          )}
          <PillModo servicio={servicio} className="mt-1.5" />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden font-body text-[15px] text-stone-500 md:inline">Habilitado</span>
          <Interruptor checked={servicio.activo} onChange={onActivo} label={servicio.activo ? `Apagar ${servicio.nombre}` : `Encender ${servicio.nombre}`} />
        </div>
      </div>
      <p className="mt-4 font-label text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 md:font-body md:text-[15px] md:normal-case md:tracking-normal">
        <span className="md:hidden">Palabras clave que lo activan:</span>
        <span className="hidden md:inline">Palabras con las que Dali reconoce este servicio:</span>
      </p>
      <div className="mt-2">
        <PalabrasResumidas palabras={servicio.palabras} maximo={6} />
      </div>
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-stone-100 pt-4">
        <p className="flex min-w-0 items-center gap-1.5 whitespace-nowrap font-body text-[14px] text-stone-600 md:gap-2 md:text-[15px]">
          <Icon name="list_alt" className="shrink-0 text-xl text-teal-700" />
          {servicio.modo === 'derivar' ? (
            'Sin preguntas: pasa al asesor'
          ) : (
            <>
              <span className="font-mono font-semibold text-stone-900">
                {n} pregunta{n === 1 ? '' : 's'}
              </span>
              <span className="hidden md:inline">en el guion de cotización</span>
            </>
          )}
        </p>
        <Link
          to={`/servicios/${servicio.id}`}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-2.5 font-body text-[14px] font-semibold text-stone-800 hover:bg-stone-50 md:border-0 md:px-2 md:text-[15px] md:text-teal-800"
        >
          <Icon name="tune" className="text-lg md:hidden" /> Editar preguntas <Icon name="arrow_forward" className="hidden text-xl md:inline" />
        </Link>
      </div>
    </section>
  );
}

/** Una fila de pregunta como la lista A9: número, la pregunta, el tipo con sus opciones y qué guarda. */
export function FilaPregunta({
  pregunta,
  indice,
  total,
  preguntas,
  editando,
  onEditar,
  onDuplicar,
  onMover,
  compacta = false,
}: {
  pregunta: PreguntaEditable;
  indice: number;
  total: number;
  preguntas: PreguntaEditable[];
  editando?: boolean;
  onEditar: () => void;
  onDuplicar?: () => void;
  onMover?: (destino: number) => void;
  compacta?: boolean;
}) {
  const condicion = condicionLegible(pregunta, preguntas);
  return (
    <article className={cn('rounded-2xl border bg-white p-4 shadow-sm transition-colors', editando ? 'border-teal-600 ring-1 ring-teal-600' : 'border-stone-200')}>
      <div className="flex items-start gap-2 md:gap-3">
        <div className="flex shrink-0 flex-col items-center gap-1">
          {onMover && (
            <button
              type="button"
              aria-label="Subir"
              disabled={indice === 0}
              onClick={() => onMover(indice - 1)}
              className="flex size-8 items-center justify-center rounded-md text-stone-400 hover:bg-stone-100 disabled:opacity-30"
            >
              <Icon name="arrow_upward" className="text-lg" />
            </button>
          )}
          <span
            className={cn(
              'flex size-9 items-center justify-center rounded-full font-mono text-sm font-semibold',
              editando ? 'bg-teal-700 text-white' : 'bg-stone-100 text-stone-700'
            )}
          >
            {indice + 1}
          </span>
          {onMover && (
            <button
              type="button"
              aria-label="Bajar"
              disabled={indice === total - 1}
              onClick={() => onMover(indice + 1)}
              className="flex size-8 items-center justify-center rounded-md text-stone-400 hover:bg-stone-100 disabled:opacity-30"
            >
              <Icon name="arrow_downward" className="text-lg" />
            </button>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <button type="button" onClick={onEditar} className="block w-full text-left font-body text-[17px] font-semibold leading-snug text-stone-900 hover:text-teal-800">
            «{pregunta.pregunta || 'Pregunta sin texto'}»
            {editando && (
              <StatusPill tono="teal" punto={false} className="ml-2 align-middle">
                Editando
              </StatusPill>
            )}
          </button>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ChipTipo tipo={pregunta.tipo} />
            {(pregunta.tipo === 'opcion' || pregunta.tipo === 'sino') &&
              pregunta.opciones.slice(0, compacta ? 3 : 6).map((o) => (
                <span key={o.valor} className="inline-flex h-8 items-center rounded-lg border border-stone-200 bg-stone-50 px-2.5 font-body text-sm text-stone-700">
                  {o.valor}
                </span>
              ))}
            <span className="font-mono text-sm text-stone-500">
              guarda como <span className="rounded-md bg-stone-100 px-1.5 py-0.5 font-semibold text-stone-800">{variableDe(pregunta)}</span>
            </span>
            {condicion && (
              <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 font-body text-sm text-amber-900">
                <Icon name="call_split" className="text-base" /> Condición: <span className="font-semibold">{condicion}</span>
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-center gap-1 sm:flex-row">
          <button
            type="button"
            aria-label="Editar pregunta"
            onClick={onEditar}
            className="flex size-10 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-teal-800 md:size-11"
          >
            <Icon name="edit" className="text-xl" />
          </button>
          {onDuplicar && (
            <button
              type="button"
              aria-label="Duplicar pregunta"
              onClick={onDuplicar}
              className="flex size-10 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-700 md:size-11"
            >
              <Icon name="content_copy" className="text-xl" />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
