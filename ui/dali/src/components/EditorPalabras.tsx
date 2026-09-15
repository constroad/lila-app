import { useState } from 'react';
import { Icon } from './Icon';
import { cn } from '@/lib/utils';

/**
 * Chips de palabras con «Agregar palabra» (diseños A8/A9/A10): la lista con
 * la que Dali reconoce un servicio o elige una opción. Enter o coma agregan;
 * la × quita.
 */
export function EditorPalabras({
  palabras,
  onChange,
  label,
  placeholder = 'Escribe otra palabra (ej. bacheo)',
  mono = false,
  className,
}: {
  palabras: string[];
  onChange: (palabras: string[]) => void;
  label: string;
  placeholder?: string;
  mono?: boolean;
  className?: string;
}) {
  const [nueva, setNueva] = useState('');
  const [agregando, setAgregando] = useState(false);
  const agregar = () => {
    const p = nueva.trim().replace(/,+$/, '').trim();
    if (p && !palabras.some((x) => x.toLowerCase() === p.toLowerCase())) onChange([...palabras, p]);
    setNueva('');
  };
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)} role="group" aria-label={label}>
      {palabras.map((p) => (
        <span
          key={p}
          className={cn(
            'inline-flex h-11 items-center gap-1 rounded-xl border border-stone-200 bg-stone-50 pl-3 pr-1 text-[15px] text-stone-800',
            mono ? 'font-mono' : 'font-body'
          )}
        >
          {p}
          <button
            type="button"
            aria-label={`Quitar ${p}`}
            onClick={() => onChange(palabras.filter((x) => x !== p))}
            className="flex size-9 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-200 hover:text-stone-700"
          >
            <Icon name="close" className="text-lg" />
          </button>
        </span>
      ))}
      {agregando ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            agregar();
          }}
        >
          <input
            autoFocus
            value={nueva}
            onChange={(e) => (e.target.value.endsWith(',') ? (setNueva(e.target.value), agregar()) : setNueva(e.target.value))}
            onBlur={() => {
              agregar();
              setAgregando(false);
            }}
            onKeyDown={(e) => e.key === 'Escape' && setAgregando(false)}
            placeholder={placeholder}
            aria-label={`Nueva palabra para ${label}`}
            className={cn(
              'h-11 w-56 rounded-xl border border-stone-200 bg-white px-3 text-[15px] text-stone-900 outline-none placeholder:text-stone-400 focus:border-teal-500',
              mono ? 'font-mono' : 'font-body'
            )}
          />
          <button type="submit" className="h-11 rounded-xl bg-stone-900 px-3 font-body text-[15px] font-semibold text-white">
            Agregar
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAgregando(true)}
          className="inline-flex h-11 items-center gap-1.5 rounded-xl border-2 border-dashed border-teal-200 px-3 font-body text-[15px] font-semibold text-teal-800 hover:bg-teal-50"
        >
          <Icon name="add" className="text-xl" /> Agregar palabra
        </button>
      )}
    </div>
  );
}
