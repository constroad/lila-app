import type { ReactNode } from 'react';
import type { IconName } from './icon-map';
import { Icon } from './Icon';
import { cn } from '@/lib/utils';

export interface OpcionSegmentada<T extends string> {
  valor: T;
  label: ReactNode;
  icon?: IconName;
}

/**
 * El control segmentado de los diseños (Entrar, Leads, Asistente): una fila
 * gris con la opción elegida en blanco y con sombra. Las opciones miden lo
 * mismo (`grid`), o lo que su texto necesita (`ajustado`).
 */
export function Segmentado<T extends string>({
  opciones,
  valor,
  onChange,
  label,
  ajustado = false,
  iconoDesdeMd = false,
  className,
  opcionClassName,
}: {
  opciones: ReadonlyArray<OpcionSegmentada<T>>;
  valor: T;
  onChange: (v: T) => void;
  label: string;
  ajustado?: boolean;
  /** El icono solo desde tablet (en móvil no entra junto al texto). */
  iconoDesdeMd?: boolean;
  className?: string;
  opcionClassName?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn('rounded-xl bg-stone-100 p-1', ajustado ? 'flex' : 'grid', className)}
      style={ajustado ? undefined : { gridTemplateColumns: `repeat(${opciones.length}, minmax(0, 1fr))` }}
    >
      {opciones.map((o) => {
        const activa = o.valor === valor;
        return (
          <button
            key={o.valor}
            type="button"
            role="tab"
            aria-selected={activa}
            onClick={() => onChange(o.valor)}
            className={cn(
              'flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 font-body text-[15px] transition-all',
              activa ? 'bg-white font-semibold text-teal-800 shadow-sm' : 'text-stone-500 hover:text-stone-700',
              opcionClassName
            )}
          >
            {o.icon && <Icon name={o.icon} className={cn('text-xl', activa && 'text-teal-700', iconoDesdeMd && 'hidden md:inline-block')} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
