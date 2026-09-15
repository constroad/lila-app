import { Icon } from '@/components/Icon';
import { EditorPalabras } from '@/components/EditorPalabras';
import { Interruptor } from '@/components/Interruptor';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { Faq } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Una pregunta frecuente (A11): para leer, con su respuesta y variantes; al editar, el formulario en el lugar. */
export const faqNueva = (semilla: Partial<Faq> = {}): Faq => ({
  id: `faq-${Date.now().toString(36)}`,
  pregunta: '',
  respuesta: '',
  variantes: [],
  categoria: '',
  activa: true,
  usos: 0,
  ...semilla,
});

export function TarjetaFaq({
  faq,
  editando,
  onEditar,
  onCerrar,
  onChange,
  onEliminar,
}: {
  faq: Faq;
  editando: boolean;
  onEditar: () => void;
  onCerrar: () => void;
  onChange: (f: Faq) => void;
  onEliminar: () => void;
}) {
  return (
    <article
      className={cn(
        'rounded-2xl border bg-white p-4 shadow-sm md:p-5',
        editando ? 'border-teal-600 ring-1 ring-teal-600' : 'border-stone-200',
        !faq.activa && !editando && 'opacity-70'
      )}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-teal-200 bg-teal-50 text-teal-700">
          <Icon name="help_outline" className="text-lg" />
        </span>
        <div className="min-w-0 flex-1">
          {editando ? (
            <Input
              autoFocus
              value={faq.pregunta}
              maxLength={200}
              onChange={(e) => onChange({ ...faq, pregunta: e.target.value })}
              placeholder="¿Qué te preguntan? Ej. ¿Trabajan los sábados?"
              aria-label="Pregunta"
              className="h-12 rounded-xl border-stone-200 px-4 font-headline text-lg font-bold md:text-lg"
            />
          ) : (
            <button type="button" onClick={onEditar} className="block w-full text-left font-headline text-lg font-bold tracking-tight text-stone-900 hover:text-teal-800">
              {faq.pregunta || 'Pregunta sin texto'}
            </button>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden font-body text-[15px] text-stone-500 md:inline">Activa</span>
          <Interruptor checked={faq.activa} onChange={(activa) => onChange({ ...faq, activa })} label={faq.activa ? 'Apagar esta pregunta' : 'Encender esta pregunta'} />
          {!editando && (
            <button
              type="button"
              aria-label="Editar"
              onClick={onEditar}
              className="flex size-11 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-teal-800"
            >
              <Icon name="edit" className="text-xl" />
            </button>
          )}
        </div>
      </div>

      {editando ? (
        <div className="mt-4 space-y-4">
          <label className="block">
            <span className="font-body text-[15px] font-semibold text-stone-800">Respuesta de Dali (tal cual la manda)</span>
            <Textarea
              value={faq.respuesta}
              maxLength={600}
              onChange={(e) => onChange({ ...faq, respuesta: e.target.value })}
              placeholder="Sí, atendemos y despachamos en planta de lunes a sábado desde las 7:00 a.m."
              className="mt-2 min-h-[96px] rounded-xl border-stone-200 px-4 py-3 font-body text-base leading-relaxed md:text-base"
              aria-label="Respuesta"
            />
          </label>
          <div>
            <p className="font-body text-[15px] font-semibold text-stone-800">También se pregunta así</p>
            <p className="mt-0.5 font-body text-sm text-stone-500">Otras formas de preguntar lo mismo: ayudan a Dali a reconocerla.</p>
            <EditorPalabras
              palabras={faq.variantes}
              onChange={(variantes) => onChange({ ...faq, variantes })}
              label={`Variantes de ${faq.pregunta || 'la pregunta'}`}
              placeholder="Ej. atienden sábados"
              className="mt-2"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="font-body text-[15px] font-semibold text-stone-800">Categoría</span>
              <Input
                value={faq.categoria}
                maxLength={30}
                onChange={(e) => onChange({ ...faq, categoria: e.target.value })}
                placeholder="Servicio, Planta, Pagos…"
                className="mt-2 h-11 rounded-xl border-stone-200 px-4 font-body text-base md:text-base"
                aria-label="Categoría"
              />
            </label>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-stone-100 pt-4">
            <button type="button" onClick={onEliminar} className="inline-flex min-h-11 items-center gap-1.5 font-body text-[15px] font-semibold text-red-700 hover:underline">
              <Icon name="delete_outline" className="text-xl" /> Eliminar
            </button>
            <button type="button" onClick={onCerrar} className="h-11 rounded-xl bg-stone-100 px-5 font-body text-[15px] font-semibold text-stone-800 hover:bg-stone-200">
              Listo
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-3 rounded-xl border border-stone-100 bg-stone-50 px-4 py-3 font-body text-[15px] leading-relaxed text-stone-800">«{faq.respuesta}»</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 font-body text-sm text-stone-500">
              <Icon name="alt_route" className="text-lg" /> También se pregunta así:
            </span>
            {faq.variantes.map((v) => (
              <span key={v} className="inline-flex h-8 items-center rounded-full border border-teal-200 bg-teal-50 px-3 font-body text-sm text-teal-800">
                {v}
              </span>
            ))}
            <button type="button" onClick={onEditar} className="inline-flex h-8 items-center font-body text-sm font-semibold text-teal-800 hover:underline">
              + agregar variante
            </button>
          </div>
          <p className="mt-3 flex items-center justify-between font-body text-sm text-stone-500">
            <span className="flex items-center gap-1.5">
              <span className={cn('size-2 rounded-full', faq.activa ? 'bg-teal-600' : 'bg-stone-400')} /> {faq.activa ? 'Respuesta automática' : 'Apagada'}
              {faq.categoria && <span className="text-stone-400"> · {faq.categoria}</span>}
            </span>
            <span className="font-mono">
              Usada {faq.usos} {faq.usos === 1 ? 'vez' : 'veces'}
            </span>
          </p>
        </>
      )}
    </article>
  );
}
