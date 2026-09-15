import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { EditorPalabras } from '@/components/EditorPalabras';
import { StatusPill } from '@/components/StatusPill';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { GuionEditable, OpcionEditable, PreguntaEditable, ServicioEditable, TipoPregunta } from '@/lib/types';
import { oracion } from '@/lib/format';
import { cn } from '@/lib/utils';
import { NOMBRE_TIPO, condicionantesDe, conPregunta, sinPregunta } from './guion';
import { ICONO_TIPO } from './piezas';

/**
 * A10 «Editor de pregunta» (diseños `A10-pregunta` móvil, tablet y
 * escritorio): lo que Dali pregunta, el nombre del dato, el tipo de respuesta,
 * las opciones con sus palabras, la condición y la ayuda. En escritorio es el
 * panel derecho de A9; en tablet, un cajón; en móvil, una hoja desde abajo.
 * Se trabaja sobre una copia y recién «Guardar cambios de la pregunta» la
 * pone en el guion (el guion entero se guarda en A9).
 */
const PREGUNTA_MAX = 400;
const TIPOS: TipoPregunta[] = ['numero', 'texto', 'sino', 'opcion'];

export function PreguntaScreen({
  guion,
  servicio,
  indice,
  nueva,
  pregunta: inicial,
  onCerrar,
  onGuardar,
}: {
  guion: GuionEditable;
  servicio: ServicioEditable;
  indice: number;
  nueva: boolean;
  pregunta: PreguntaEditable;
  onCerrar: () => void;
  onGuardar: (guion: GuionEditable) => void;
}) {
  const [p, setP] = useState<PreguntaEditable>(() => structuredClone(inicial));
  const [errores, setErrores] = useState<{ pregunta?: string; etiqueta?: string; opciones?: string }>({});
  const total = servicio.preguntas.length + (nueva ? 1 : 0);
  const condicionantes = condicionantesDe(servicio.preguntas, nueva ? servicio.preguntas.length : indice);
  const conOpciones = p.tipo === 'opcion' || p.tipo === 'sino';

  const cambiarTipo = (tipo: TipoPregunta) => {
    if (tipo === 'sino' && !p.opciones.length) setP({ ...p, tipo, opciones: [] });
    else setP({ ...p, tipo });
  };
  const cambiarOpcion = (i: number, o: OpcionEditable) => setP({ ...p, opciones: p.opciones.map((x, j) => (j === i ? o : x)) });
  const guardar = () => {
    const e: typeof errores = {};
    if (!p.pregunta.trim()) e.pregunta = 'Escribe lo que Dali va a preguntar';
    if (!p.etiqueta.trim()) e.etiqueta = 'Ponle nombre al dato';
    if (p.tipo === 'opcion' && p.opciones.filter((o) => o.valor.trim()).length < 2) e.opciones = 'Una pregunta de opciones necesita al menos dos';
    setErrores(e);
    if (Object.keys(e).length) return;
    onGuardar(conPregunta(guion, servicio.id, indice, { ...p, opciones: p.opciones.filter((o) => o.valor.trim()) }));
  };
  const eliminar = () => onGuardar(sinPregunta(guion, servicio.id, indice));

  return (
    <>
      <div className="fixed inset-0 z-40 bg-stone-900/40 xl:hidden" onClick={onCerrar} aria-hidden="true" />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={nueva ? 'Nueva pregunta' : `Editar pregunta ${indice + 1} de ${total}`}
        className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-[390px] flex-col rounded-t-3xl bg-white shadow-2xl md:inset-y-0 md:right-0 md:left-auto md:mx-0 md:max-h-none md:w-[520px] md:max-w-none md:rounded-none xl:sticky xl:top-6 xl:z-auto xl:mt-6 xl:max-h-[calc(100dvh-3rem)] xl:w-auto xl:self-start xl:rounded-2xl xl:border xl:border-stone-200 xl:shadow-sm"
      >
        <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-stone-300 md:hidden" />
        <div className="flex items-start justify-between gap-3 border-b border-stone-200 px-4 py-4 md:px-6">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-body text-sm text-stone-500">
              <StatusPill tono="teal" punto={false} className="whitespace-nowrap">
                Paso {indice + 1} de {total}
              </StatusPill>
              <span className="truncate">Guion: {oracion(servicio.nombre) || 'nuevo servicio'}</span>
            </p>
            <h2 className="mt-1 font-headline text-xl font-bold tracking-tight text-stone-900 md:text-2xl">
              {nueva ? 'Nueva pregunta' : `Editar pregunta ${indice + 1} de ${total}`}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onCerrar}
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-700"
          >
            <Icon name="close" className="text-2xl" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5 md:px-6">
          <div>
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="pregunta-texto" className="font-label text-xs font-bold uppercase tracking-[0.1em] text-stone-700">
                Lo que Dali pregunta <span className="text-amber-600">*</span>
              </label>
              <span className="flex items-center gap-2">
                <StatusPill tono="teal" className="hidden md:inline-flex">
                  Mensaje WhatsApp
                </StatusPill>
                <span className="font-mono text-sm text-stone-500">{p.pregunta.length} car.</span>
              </span>
            </div>
            <Textarea
              id="pregunta-texto"
              value={p.pregunta}
              maxLength={PREGUNTA_MAX}
              aria-invalid={Boolean(errores.pregunta)}
              onChange={(e) => setP({ ...p, pregunta: e.target.value })}
              placeholder="¿Cuántos m² necesitas asfaltar, aproximadamente?"
              className="mt-2 min-h-[110px] rounded-xl border-stone-200 px-4 py-3 font-body text-base leading-relaxed md:text-base"
            />
            {errores.pregunta ? (
              <p className="mt-1.5 font-body text-sm text-red-700">{errores.pregunta}</p>
            ) : (
              <p className="mt-1.5 flex items-center gap-1.5 font-body text-sm text-stone-500">
                <Icon name="info" className="text-base" /> Dali envía este mensaje tal cual por WhatsApp al llegar a este paso.
              </p>
            )}
          </div>

          <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
            <div className="flex items-center justify-between">
              <label htmlFor="pregunta-dato" className="font-label text-xs font-bold uppercase tracking-[0.1em] text-stone-700">
                Nombre del dato <span className="text-amber-600">*</span>
              </label>
              <span className="rounded-md bg-stone-200 px-2 py-0.5 font-mono text-xs text-stone-600">{'{variable}'}</span>
            </div>
            <div className="relative mt-2">
              <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center font-mono text-base text-teal-700">{'{ }'}</span>
              <Input
                id="pregunta-dato"
                value={p.etiqueta}
                maxLength={40}
                aria-invalid={Boolean(errores.etiqueta)}
                onChange={(e) => setP({ ...p, etiqueta: e.target.value })}
                placeholder="Área"
                className="h-12 rounded-xl border-stone-200 bg-white pl-12 pr-4 font-body text-base md:text-base"
              />
            </div>
            {errores.etiqueta ? (
              <p className="mt-1.5 font-body text-sm text-red-700">{errores.etiqueta}</p>
            ) : (
              <p className="mt-1.5 font-body text-sm text-stone-500">Así aparece en el resumen y en el aviso de lead al asesor comercial.</p>
            )}
          </div>

          <div>
            <p className="font-label text-xs font-bold uppercase tracking-[0.1em] text-stone-700">Tipo de respuesta</p>
            <div role="radiogroup" aria-label="Tipo de respuesta" className="mt-2 grid grid-cols-4 gap-1 rounded-2xl bg-stone-100 p-1">
              {TIPOS.map((t) => {
                const activa = p.tipo === t;
                return (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={activa}
                    onClick={() => cambiarTipo(t)}
                    className={cn(
                      'flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 font-body text-sm transition-colors md:flex-row md:gap-2 md:text-[15px]',
                      activa ? 'bg-teal-700 font-semibold text-white shadow-sm' : 'text-stone-600 hover:text-stone-900'
                    )}
                  >
                    <Icon name={ICONO_TIPO[t]} className="text-xl" /> {NOMBRE_TIPO[t]}
                  </button>
                );
              })}
            </div>
          </div>

          {conOpciones && (
            <div>
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-label text-xs font-bold uppercase tracking-[0.1em] text-stone-700">
                  Opciones reconocibles <span className="font-normal normal-case tracking-normal text-stone-500">({p.opciones.length} definidas)</span>
                </p>
                {p.tipo === 'sino' && !p.opciones.length && <span className="font-body text-sm text-teal-800">Sin opciones, Dali entiende sí y no sola</span>}
              </div>
              <div className="mt-2 space-y-3">
                {p.opciones.map((o, i) => (
                  <div key={i} className="rounded-xl border border-stone-200 bg-white p-3">
                    <div className="flex items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-full bg-teal-600" />
                      <Input
                        value={o.valor}
                        maxLength={60}
                        onChange={(e) => cambiarOpcion(i, { ...o, valor: e.target.value })}
                        placeholder="Nombre de la opción (ej. MC-30)"
                        aria-label={`Opción ${i + 1}`}
                        className="h-11 rounded-lg border-stone-200 px-3 font-body text-base font-semibold md:text-base"
                      />
                      <button
                        type="button"
                        aria-label={`Quitar opción ${o.valor || i + 1}`}
                        onClick={() => setP({ ...p, opciones: p.opciones.filter((_, j) => j !== i) })}
                        className="flex size-11 shrink-0 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-red-700"
                      >
                        <Icon name="delete_outline" className="text-xl" />
                      </button>
                    </div>
                    <p className="mt-3 font-body text-sm text-stone-500">Palabras clave que activan esta opción:</p>
                    <EditorPalabras
                      palabras={o.palabras}
                      onChange={(palabras) => cambiarOpcion(i, { ...o, palabras })}
                      label={`Palabras de ${o.valor || `la opción ${i + 1}`}`}
                      className="mt-2"
                      mono
                    />
                    <Input
                      value={o.sugerencia ?? ''}
                      maxLength={300}
                      onChange={(e) => cambiarOpcion(i, { ...o, sugerencia: e.target.value || undefined })}
                      placeholder="Lo que Dali agrega al elegirla (opcional)"
                      aria-label={`Sugerencia de ${o.valor || `la opción ${i + 1}`}`}
                      className="mt-3 h-11 rounded-lg border-stone-200 px-3 font-body text-[15px] md:text-[15px]"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setP({ ...p, opciones: [...p.opciones, { valor: '', palabras: [] }] })}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stone-300 font-body text-[15px] font-semibold text-stone-700 hover:bg-stone-50"
                >
                  <Icon name="add_circle_outline" className="text-xl" /> Agregar opción
                </button>
                {errores.opciones && <p className="font-body text-sm text-red-700">{errores.opciones}</p>}
                <p className="font-body text-sm text-stone-500">Además de estas palabras, Dali entiende «la primera», «la segunda»… según el orden.</p>
              </div>
            </div>
          )}

          <div>
            <p className="font-label text-xs font-bold uppercase tracking-[0.1em] text-stone-700">Condición</p>
            {condicionantes.length ? (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <select
                  aria-label="Solo si la respuesta a"
                  value={p.cuando?.campo ?? ''}
                  onChange={(e) => {
                    const otra = condicionantes.find((q) => q.campo === e.target.value);
                    setP({ ...p, cuando: otra ? { campo: otra.campo, es: otra.opciones[0]?.valor ?? '' } : undefined });
                  }}
                  className="h-12 rounded-xl border border-stone-200 bg-white px-3 font-body text-[15px] text-stone-900"
                >
                  <option value="">Siempre se pregunta</option>
                  {condicionantes.map((q) => (
                    <option key={q.campo} value={q.campo}>
                      Solo si {q.etiqueta || q.campo}…
                    </option>
                  ))}
                </select>
                {p.cuando && (
                  <select
                    aria-label="…vale"
                    value={[p.cuando.es].flat()[0] ?? ''}
                    onChange={(e) => setP({ ...p, cuando: { campo: p.cuando!.campo, es: e.target.value } })}
                    className="h-12 rounded-xl border border-stone-200 bg-white px-3 font-body text-[15px] text-stone-900"
                  >
                    {(condicionantes.find((q) => q.campo === p.cuando!.campo)?.opciones ?? []).map((o) => (
                      <option key={o.valor} value={o.valor}>
                        = {o.valor}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ) : (
              <p className="mt-1.5 font-body text-sm text-stone-500">Se pregunta siempre. Para condicionarla, antes tiene que haber una pregunta de opciones o de sí/no.</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="font-label text-xs font-bold uppercase tracking-[0.1em] text-stone-700">Pista si no entendió</span>
              <Textarea
                value={p.pista ?? ''}
                maxLength={400}
                onChange={(e) => setP({ ...p, pista: e.target.value || undefined })}
                placeholder="Un aproximado en m² me sirve."
                className="mt-2 min-h-[72px] rounded-xl border-stone-200 px-3 py-2 font-body text-[15px] md:text-[15px]"
              />
            </label>
            <label className="block">
              <span className="font-label text-xs font-bold uppercase tracking-[0.1em] text-stone-700">Explicación si preguntan «¿qué es?»</span>
              <Textarea
                value={p.explicacion ?? ''}
                maxLength={400}
                onChange={(e) => setP({ ...p, explicacion: e.target.value || undefined })}
                placeholder="La imprimación es el riego que prepara la superficie…"
                className="mt-2 min-h-[72px] rounded-xl border-stone-200 px-3 py-2 font-body text-[15px] md:text-[15px]"
              />
            </label>
          </div>
        </div>

        <div className="border-t border-stone-200 px-4 py-3 md:px-6 md:py-4">
          <div className="flex items-center justify-between gap-3">
            {!nueva ? (
              <button type="button" onClick={eliminar} className="inline-flex min-h-11 items-center gap-1.5 font-body text-[15px] font-semibold text-red-700 hover:underline">
                <Icon name="delete_outline" className="text-xl" /> Eliminar pregunta
              </button>
            ) : (
              <span />
            )}
            <button type="button" onClick={onCerrar} className="h-11 rounded-full bg-stone-100 px-5 font-body text-[15px] font-semibold text-stone-800 hover:bg-stone-200">
              Cancelar
            </button>
          </div>
          <button
            type="button"
            onClick={guardar}
            className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-teal-700 font-headline text-[15px] font-bold text-white hover:bg-teal-800 md:rounded-xl"
          >
            <Icon name="check" className="text-xl" /> Guardar cambios de la pregunta
          </button>
        </div>
      </section>
    </>
  );
}
