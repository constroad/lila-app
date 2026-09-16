import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * La marca como en los diseños: la «D» en un cuadrado teal y «dali.pe».
 * `junto` va a la derecha del nombre (el sello «PERÚ» del registro) y
 * `debajo`, en una segunda línea (la empresa, en móvil).
 */
export function BrandMark({
  className,
  size = 'md',
  wordmark = true,
  junto,
  debajo,
}: {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  wordmark?: boolean;
  junto?: ReactNode;
  debajo?: ReactNode;
}) {
  const box = { sm: 'size-8 text-base rounded-lg', md: 'size-12 text-2xl rounded-xl', lg: 'size-14 text-3xl rounded-xl' }[size];
  const word = { sm: 'text-lg', md: 'text-2xl', lg: 'text-3xl' }[size];
  return (
    <div className={cn('flex min-w-0 items-center gap-3', className)}>
      <div className={cn('flex shrink-0 items-center justify-center bg-teal-800 font-headline font-bold text-white', box)}>D</div>
      {wordmark && (
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className={cn('font-headline font-bold leading-tight tracking-tight text-stone-900', word)}>
              dali<span className="text-teal-700">.pe</span>
            </span>
            {junto}
          </div>
          {debajo}
        </div>
      )}
    </div>
  );
}
