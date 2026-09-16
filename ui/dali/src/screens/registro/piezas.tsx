import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BrandMark } from '@/components/BrandMark';
import { Icon } from '@/components/Icon';
import { cn } from '@/lib/utils';

/**
 * El cascarón de los tres pasos del registro (P4–P6, diseños móvil, tablet y
 * escritorio): la marca con «PERÚ» (y la empresa, debajo en móvil y al lado
 * desde tablet), a la derecha «¿Ya tienes cuenta? Entrar» en el paso 1 y
 * «Conexión segura» cuando ya hay sesión, el paso a paso 1·2·3, y el
 * contenido que en móvil va directo sobre la página y desde tablet dentro de
 * una tarjeta blanca (`ancho="amplio"` para el paso 3, que va a dos columnas).
 * El «¿Ayuda?» de los diseños no tiene destino todavía (no hay número de
 * soporte definido), así que no se pone.
 */
const PASOS = ['Tu negocio', 'WhatsApp', 'Conocimiento'] as const;

export function CascaronRegistro({ paso, subtitulo, ancho = 'normal', children }: { paso: 1 | 2 | 3; subtitulo?: string; ancho?: 'normal' | 'amplio'; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-white md:bg-stone-100">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4 md:h-20 md:px-6">
          <BrandMark
            size="sm"
            junto={
              <>
                <span className="shrink-0 rounded-md border border-teal-200/70 bg-teal-50 px-1.5 py-0.5 font-label text-[10px] font-bold tracking-wider text-teal-800">PERÚ</span>
                {subtitulo && (
                  <span className="hidden min-w-0 items-center gap-2 md:flex">
                    <span className="text-stone-300" aria-hidden="true">
                      |
                    </span>
                    <span className="truncate font-body text-sm text-stone-500">{subtitulo}</span>
                  </span>
                )}
              </>
            }
            debajo={subtitulo && <p className="truncate font-body text-xs leading-tight text-stone-500 md:hidden">{subtitulo}</p>}
          />
          {paso === 1 ? (
            <div className="flex shrink-0 items-center gap-3">
              <span className="hidden font-body text-[15px] text-stone-500 md:inline">¿Ya tienes cuenta en Dali?</span>
              <Link
                to="/entrar"
                className="inline-flex h-10 items-center rounded-lg border border-teal-200 bg-teal-50 px-3 font-body text-[15px] font-semibold text-teal-800 hover:bg-teal-100"
              >
                Entrar
              </Link>
            </div>
          ) : (
            <span
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-teal-200/80 bg-teal-50 px-2.5 font-body text-sm font-semibold text-teal-800 sm:px-3"
              title="Conexión segura"
            >
              <Icon name="lock" className="text-base" /> <span className="sr-only sm:not-sr-only">Conexión segura</span>
            </span>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-10 pt-5 md:px-6 md:pt-8">
        <Pasos actual={paso} />
        <div className={cn('mx-auto mt-6 md:mt-10 md:rounded-2xl md:bg-white md:p-8 md:shadow-sm md:ring-1 md:ring-stone-200/80', ancho === 'amplio' ? 'max-w-4xl' : 'max-w-2xl')}>
          {children}
        </div>
      </main>
      <footer className="mx-auto w-full max-w-5xl px-4 pb-8 text-center font-body text-xs text-stone-400 md:px-6 md:text-left md:text-sm">
        Dali Perú · Asistente para WhatsApp de negocios
      </footer>
    </div>
  );
}

function Pasos({ actual }: { actual: 1 | 2 | 3 }) {
  return (
    <ol className="mx-auto grid max-w-2xl grid-cols-3 border-b border-stone-200 pb-5 md:border-0 md:pb-0" aria-label="Pasos del registro">
      {PASOS.map((nombre, i) => {
        const n = (i + 1) as 1 | 2 | 3;
        const hecho = n < actual;
        const activo = n === actual;
        return (
          <li key={nombre} className="relative flex flex-col items-center">
            {i < PASOS.length - 1 && <span className={cn('absolute left-1/2 top-5 h-0.5 w-full', hecho ? 'bg-teal-700' : 'bg-stone-200')} aria-hidden="true" />}
            <span
              className={cn(
                'relative z-10 flex size-10 items-center justify-center rounded-full border-2 font-mono text-base font-semibold',
                hecho && 'border-teal-700 bg-teal-700 text-white',
                activo && 'border-teal-700 bg-teal-700 text-white ring-4 ring-teal-100',
                !hecho && !activo && 'border-stone-300 bg-white text-stone-400'
              )}
            >
              {hecho ? <Icon name="check" className="text-xl" /> : n}
            </span>
            <span className={cn('mt-2 text-center font-body text-sm md:text-[15px]', activo ? 'font-semibold text-teal-800' : hecho ? 'text-stone-700' : 'text-stone-400')}>
              <span className="hidden font-label text-[11px] font-semibold uppercase tracking-[0.12em] md:block">Paso {n}</span>
              <span className="md:hidden">{n}. </span>
              {nombre}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function PieRegistro({ texto, icono = 'verified', className }: { texto: string; icono?: 'verified' | 'lock'; className?: string }) {
  return (
    <p className={cn('mt-5 flex items-center justify-center gap-1.5 text-center font-body text-sm text-stone-500', className)}>
      <Icon name={icono} className="shrink-0 text-lg text-teal-700" /> {texto}
    </p>
  );
}
