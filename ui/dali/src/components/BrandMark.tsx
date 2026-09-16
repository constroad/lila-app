import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * EL ISOTIPO DE DALI (hoja de marca generada en Stitch, 16/09/2026): un
 * monograma «D» geométrico de trazo único —la columna, el arco de diálogo y
 * el punto focal—, en teal sobre papel y en teal claro sobre oscuro
 * (`tono="oscuro"`). Es SVG puro: el mismo trazo va en el favicon, el icono
 * de la app y la tarjeta al compartir (`scripts/og-image.mjs`). Respecto a la
 * hoja de Stitch, el arco cierra al ras de la columna (allí la columna
 * sobresalía 4 unidades por abajo) y el punto va centrado en el ojo.
 */
export const TRAZO_MARCA = {
  columna: { x: 10, y: 10, width: 7, height: 44, rx: 2 },
  arco: 'M17 10H34C46.15 10 56 19.85 56 32C56 44.15 46.15 54 34 54H17V47H34C42.28 47 49 40.28 49 32C49 23.72 42.28 17 34 17H17V10Z',
  punto: { cx: 32, cy: 32, r: 4.5 },
} as const;

export function MarcaDali({ className, title = 'Dali' }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label={title} className={className}>
      <rect {...TRAZO_MARCA.columna} fill="currentColor" />
      <path d={TRAZO_MARCA.arco} fill="currentColor" />
      <circle {...TRAZO_MARCA.punto} fill="currentColor" />
    </svg>
  );
}

/**
 * La marca como en los diseños: el isotipo y «dali.pe». `junto` va a la
 * derecha del nombre (el sello «PERÚ» del registro) y `debajo`, en una
 * segunda línea (la empresa, en móvil).
 */
export function BrandMark({
  className,
  size = 'md',
  wordmark = true,
  tono = 'claro',
  junto,
  debajo,
}: {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  wordmark?: boolean;
  tono?: 'claro' | 'oscuro';
  junto?: ReactNode;
  debajo?: ReactNode;
}) {
  const icono = { sm: 'size-8', md: 'size-12', lg: 'size-14' }[size];
  const word = { sm: 'text-lg', md: 'text-2xl', lg: 'text-3xl' }[size];
  const oscuro = tono === 'oscuro';
  return (
    <div className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <MarcaDali className={cn('shrink-0', icono, oscuro ? 'text-teal-200' : 'text-teal-800')} />
      {wordmark && (
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className={cn('font-headline font-bold leading-tight tracking-tight', word, oscuro ? 'text-white' : 'text-stone-900')}>
              dali<span className={oscuro ? 'text-teal-300' : 'text-teal-700'}>.pe</span>
            </span>
            {junto}
          </div>
          {debajo}
        </div>
      )}
    </div>
  );
}
