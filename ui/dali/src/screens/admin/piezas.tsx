import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import type { IconName } from '@/components/icon-map';
import { StatusPill } from '@/components/StatusPill';
import { ESTADO_ASISTENTE, ESTADO_LINEA } from '@/lib/estados';
import { numero as fmt } from '@/lib/format';
import type { EstadoAsistenteAdmin, EstadoLinea } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * Las piezas que comparten las cuatro pantallas de la consola (S1–S4): la
 * cabecera con las migas «Administración / …» (tablet y escritorio), la hoja
 * lateral (abajo en móvil, a la derecha desde tablet, como la de A16), las
 * píldoras de línea y de asistente, la barra de uso y la tarjeta de cifra.
 */
export function CabeceraAdmin({ miga, titulo, chip, subtitulo, acciones }: { miga: string; titulo: ReactNode; chip?: ReactNode; subtitulo?: ReactNode; acciones?: ReactNode }) {
  return (
    <>
      <div className="hidden h-14 items-center gap-2 border-b border-stone-200 bg-white px-6 font-body text-[15px] text-stone-500 md:flex xl:px-10">
        <span>Administración</span>
        <Icon name="chevron_right" className="text-lg text-stone-400" />
        <span className="font-semibold text-stone-900">{miga}</span>
      </div>
      <div className="flex items-start justify-between gap-3 px-4 pt-5 md:px-6 md:pt-8 xl:px-10">
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-3 font-headline text-[28px] font-bold tracking-tight text-stone-900 md:text-4xl">
            {titulo}
            {chip}
          </h1>
          {subtitulo && <div className="mt-1 font-body text-[15px] text-stone-500 md:text-base">{subtitulo}</div>}
        </div>
        {acciones && <div className="flex shrink-0 items-center gap-2">{acciones}</div>}
      </div>
    </>
  );
}

export function HojaAdmin({
  titulo,
  subtitulo,
  icono,
  onCerrar,
  children,
  pie,
}: {
  titulo: string;
  subtitulo?: string;
  icono: IconName;
  onCerrar: () => void;
  children: ReactNode;
  pie?: ReactNode;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-stone-950/45 backdrop-blur-[2px]" onClick={onCerrar} aria-hidden="true" />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-[390px] flex-col rounded-t-3xl bg-white shadow-2xl md:inset-y-0 md:left-auto md:right-0 md:mx-0 md:max-h-none md:w-[560px] md:max-w-none md:rounded-none"
      >
        <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-stone-300 md:hidden" />
        <div className="flex items-start gap-3 border-b border-stone-200 px-4 py-4 md:px-6 md:py-5">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
            <Icon name={icono} className="text-2xl" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-headline text-2xl font-bold tracking-tight text-stone-900">{titulo}</h2>
            {subtitulo && <p className="mt-0.5 font-body text-[15px] text-stone-500">{subtitulo}</p>}
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="flex size-11 shrink-0 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100">
            <Icon name="close" className="text-2xl" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-5">{children}</div>
        {pie && <div className="border-t border-stone-200 px-4 py-3 pb-[calc(env(safe-area-inset-bottom,12px)+12px)] md:px-6 md:py-4">{pie}</div>}
      </section>
    </>
  );
}

export function PillLinea({ estado, className }: { estado: EstadoLinea; className?: string }) {
  return (
    <StatusPill tono={ESTADO_LINEA[estado].tono} className={className}>
      {ESTADO_LINEA[estado].texto}
    </StatusPill>
  );
}

export function PillAsistente({ estado, className }: { estado: EstadoAsistenteAdmin; className?: string }) {
  return (
    <StatusPill tono={ESTADO_ASISTENTE[estado].tono} className={className}>
      {ESTADO_ASISTENTE[estado].texto}
    </StatusPill>
  );
}

/** «612 / 1 000 · 61 %» con su barra; sin límite (piloto), solo la cifra. */
export function Uso({ usados, limite, compacto = false }: { usados: number; limite: number; compacto?: boolean }) {
  const conLimite = limite > 0;
  const pct = conLimite ? Math.min(100, Math.round((usados / limite) * 100)) : 0;
  return (
    <div className={cn('min-w-0', !compacto && 'w-full')}>
      <p className="flex items-baseline justify-between gap-2 font-mono text-sm text-stone-800">
        <span>
          {fmt(usados)}
          {conLimite ? ` / ${fmt(limite)}` : ' msjs'}
        </span>
        {conLimite ? <span className="text-xs text-stone-500">{pct}%</span> : <span className="text-xs text-stone-500">sin límite</span>}
      </p>
      {conLimite && (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-stone-200">
          <div className={cn('h-full rounded-full', pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-teal-600')} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

export function Kpi({
  etiqueta,
  icono,
  cifra,
  sufijo,
  chip,
  nota,
  className,
}: {
  etiqueta: string;
  icono: IconName;
  cifra: ReactNode;
  sufijo?: ReactNode;
  chip?: ReactNode;
  nota?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-2xl border border-stone-200 bg-white p-4 shadow-sm md:p-5', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-label text-[11px] font-semibold uppercase tracking-[0.1em] text-stone-500 md:text-[12px]">{etiqueta}</p>
        <Icon name={icono} className="text-xl text-stone-400" />
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-x-2 gap-y-2">
        <span className="font-headline text-3xl font-bold leading-none tracking-tight text-stone-900 md:text-4xl">{cifra}</span>
        {sufijo && <span className="pb-1 font-body text-sm text-stone-500">{sufijo}</span>}
        {chip}
      </div>
      {nota && <div className="mt-3 font-body text-sm text-stone-500">{nota}</div>}
    </div>
  );
}

export function BotonPrimario({ to, onClick, children, className, disabled }: { to?: string; onClick?: () => void; children: ReactNode; className?: string; disabled?: boolean }) {
  const clases = cn(
    'inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 font-body text-[15px] font-semibold text-white hover:bg-teal-800 disabled:opacity-60',
    className
  );
  if (to) {
    return (
      <Link to={to} className={clases}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={clases}>
      {children}
    </button>
  );
}

export function BotonSecundario({
  onClick,
  children,
  className,
  disabled,
  to,
}: {
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  to?: string;
}) {
  const clases = cn(
    'inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-4 font-body text-[15px] font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-60',
    className
  );
  if (to) {
    return (
      <Link to={to} className={clases}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={clases}>
      {children}
    </button>
  );
}

export const CAMPO_ADMIN = 'h-12 rounded-xl border-stone-200 bg-white px-4 font-body text-base text-stone-900 placeholder:text-stone-400 md:text-base';
