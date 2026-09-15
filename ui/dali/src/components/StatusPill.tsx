import { cn } from '@/lib/utils';

export type TonoPill = 'teal' | 'amber' | 'emerald' | 'stone' | 'red';

const TONOS: Record<TonoPill, string> = {
  teal: 'bg-teal-50 text-teal-800 border-teal-200/70',
  amber: 'bg-amber-50 text-amber-800 border-amber-200/80',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200/70',
  stone: 'bg-stone-100 text-stone-600 border-stone-200',
  red: 'bg-red-50 text-red-700 border-red-200/70',
};
const PUNTO: Record<TonoPill, string> = { teal: 'bg-teal-600', amber: 'bg-amber-500', emerald: 'bg-emerald-500', stone: 'bg-stone-400', red: 'bg-red-500' };

/** La píldora de estado de los diseños: punto + texto, con borde fino. */
export function StatusPill({ tono, children, punto = true, className }: { tono: TonoPill; children: React.ReactNode; punto?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-label text-xs font-semibold', TONOS[tono], className)}>
      {punto && <span className={cn('size-1.5 rounded-full', PUNTO[tono])} />}
      {children}
    </span>
  );
}

export const TONO_LEAD: Record<string, TonoPill> = { nuevo: 'amber', contactado: 'teal', cotizado: 'stone', ganado: 'emerald', perdido: 'red' };
export const NOMBRE_ESTADO_LEAD: Record<string, string> = { nuevo: 'Nuevo', contactado: 'Contactado', cotizado: 'Cotizado', ganado: 'Ganado', perdido: 'Perdido' };
