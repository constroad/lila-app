import { cn } from '@/lib/utils';

/**
 * El interruptor de los diseños (48×28, pulgar blanco): más grande que el
 * `Switch` de shadcn (32×18), y con 44 px de área táctil.
 */
export function Interruptor({
  checked,
  onChange,
  disabled,
  label,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-7 w-12 shrink-0 rounded-full transition-colors after:absolute after:-inset-x-2 after:-inset-y-2.5 disabled:opacity-60',
        checked ? 'bg-teal-700' : 'bg-stone-300',
        className
      )}
    >
      <span className={cn('absolute top-0.5 size-6 rounded-full bg-white shadow transition-transform', checked ? 'left-[22px]' : 'left-0.5')} />
    </button>
  );
}
