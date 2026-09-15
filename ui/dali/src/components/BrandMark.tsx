import { cn } from '@/lib/utils';

/** La marca como en los diseños: la «D» en un cuadrado teal y «dali.pe». */
export function BrandMark({ className, size = 'md', wordmark = true }: { className?: string; size?: 'sm' | 'md' | 'lg'; wordmark?: boolean }) {
  const box = { sm: 'size-8 text-base rounded-lg', md: 'size-12 text-2xl rounded-xl', lg: 'size-14 text-3xl rounded-xl' }[size];
  const word = { sm: 'text-lg', md: 'text-2xl', lg: 'text-3xl' }[size];
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className={cn('flex items-center justify-center bg-teal-800 font-headline font-bold text-white', box)}>D</div>
      {wordmark && (
        <div className={cn('font-headline font-bold tracking-tight text-stone-900', word)}>
          dali<span className="text-teal-700">.pe</span>
        </div>
      )}
    </div>
  );
}
