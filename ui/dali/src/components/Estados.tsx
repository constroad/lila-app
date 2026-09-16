import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Icon } from './Icon';
import type { IconName } from './icon-map';

/**
 * LOS ESTADOS DEL SISTEMA (E1, diseño `E1-estados`): el vacío con icono,
 * título, texto y una acción; «no pudimos cargar esto» con reintentar; y
 * «nada con «x»» para una búsqueda sin resultados. Cada pantalla los usa
 * con su texto; la geometría es una sola.
 */
export function EstadoVacio({
  icono,
  titulo,
  texto,
  accion,
  tono = 'stone',
  className,
}: {
  icono: IconName;
  titulo: string;
  texto: ReactNode;
  accion?: ReactNode;
  tono?: 'stone' | 'teal' | 'red';
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-3 rounded-2xl border border-stone-200 bg-white px-6 py-10 text-center shadow-sm', className)}>
      <span
        className={cn(
          'flex size-16 items-center justify-center rounded-full',
          tono === 'teal' ? 'bg-teal-50 text-teal-700' : tono === 'red' ? 'bg-red-50 text-red-600' : 'bg-stone-100 text-stone-500'
        )}
      >
        <Icon name={icono} className="text-3xl" />
      </span>
      <p className="font-headline text-xl font-bold text-stone-900">{titulo}</p>
      <p className="max-w-sm font-body text-[15px] leading-relaxed text-stone-500">{texto}</p>
      {accion && <div className="mt-1">{accion}</div>}
    </div>
  );
}

export function ErrorDeCarga({ onReintentar, className }: { onReintentar: () => void; className?: string }) {
  return (
    <EstadoVacio
      icono="cloud_off"
      tono="red"
      titulo="No pudimos cargar esto"
      texto="Revisa tu internet y vuelve a intentar. Si el problema sigue, avísanos."
      className={className}
      accion={
        <button
          type="button"
          onClick={onReintentar}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-teal-700 px-5 font-body text-[15px] font-semibold text-white hover:bg-teal-800"
        >
          <Icon name="refresh" className="text-xl" /> Reintentar
        </button>
      }
    />
  );
}

export function SinResultados({ termino, onLimpiar, className }: { termino: string; onLimpiar: () => void; className?: string }) {
  return (
    <EstadoVacio
      icono="search"
      titulo={`Nada con «${termino}»`}
      texto="Prueba con otro nombre o número."
      className={className}
      accion={
        <button type="button" onClick={onLimpiar} className="font-body text-[15px] font-semibold text-teal-800 underline underline-offset-4 hover:text-teal-900">
          Limpiar búsqueda
        </button>
      }
    />
  );
}

export function AccionVacio({ to, icono, children, primaria = false }: { to: string; icono: IconName; children: ReactNode; primaria?: boolean }) {
  return (
    <Link
      to={to}
      className={cn(
        'inline-flex h-11 items-center gap-2 rounded-full px-5 font-body text-[15px] font-semibold',
        primaria ? 'bg-teal-700 text-white hover:bg-teal-800' : 'border border-stone-200 bg-white text-stone-800 hover:bg-stone-50'
      )}
    >
      <Icon name={icono} className="text-xl" /> {children}
    </Link>
  );
}
