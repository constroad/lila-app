import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Inicio, ServicioEditable } from '@/lib/types';
import { oracion } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/Icon';
import { EditorPalabras } from '@/components/EditorPalabras';
import { StatusPill } from '@/components/StatusPill';
import { Input } from '@/components/ui/input';
import { useAccionesDeBarra } from '@/layout/barra';
import { useGuion } from './GuionProvider';
import { conServicio, preguntaDuplicada, preguntaMovida, preguntaNueva, servicioDe } from './guion';
import { FilaPregunta } from './piezas';
import { PreguntaScreen } from './PreguntaScreen';
import { VistaPreviaGuion } from './VistaPreviaGuion';

/**
 * A9 «Guion de un servicio» (diseños `A9-guion` móvil, tablet y escritorio):
 * con qué palabras se reconoce y la secuencia ordenada de preguntas, con la
 * vista previa a la derecha desde tablet. `/servicios/:id/preguntas/:n` abre
 * A10 sobre esta misma pantalla (panel en escritorio, hoja en móvil y tablet).
 */
export function GuionScreen() {
  const { id = '', n } = useParams();
  const navigate = useNavigate();
  const { guion, cargando, hayCambios, guardando, editar, guardar } = useGuion();
  const { data: inicio } = useQuery({ queryKey: ['inicio'], queryFn: () => api.get<Inicio>('/inicio'), staleTime: 60_000 });
  const servicio = guion ? servicioDe(guion, id) : undefined;

  useAccionesDeBarra(
    <>
      <Link
        to="/probar"
        className="inline-flex h-11 items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 font-body text-[15px] font-semibold text-stone-800 hover:bg-stone-50"
      >
        <Icon name="play_arrow" className="text-xl" /> Probar este guion
      </Link>
      <button
        type="button"
        onClick={guardar}
        disabled={!hayCambios || guardando}
        className="inline-flex h-11 items-center gap-2 rounded-xl bg-teal-700 px-5 font-body text-[15px] font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
      >
        <Icon name="check" className="text-xl" /> {guardando ? 'Guardando…' : 'Guardar cambios'}
      </button>
    </>,
    [hayCambios, guardando, guion]
  );

  if (cargando || !guion) return <div className="min-h-dvh" aria-busy="true" />;
  if (!servicio) {
    return (
      <div className="px-4 py-10 text-center md:px-6">
        <p className="font-body text-[15px] text-stone-500">Ese servicio no está en el guion.</p>
        <Link to="/servicios" className="mt-3 inline-flex min-h-11 items-center font-body text-[15px] font-semibold text-teal-800">
          Volver a Servicios
        </Link>
      </div>
    );
  }
  const cambiar = (s: ServicioEditable) => editar(conServicio(guion, s));
  const indice = n === undefined ? undefined : n === 'nueva' ? servicio.preguntas.length : Number(n) - 1;
  const editandoPregunta = indice !== undefined && Number.isInteger(indice) && indice >= 0 && indice <= servicio.preguntas.length;
  const total = servicio.preguntas.length;

  return (
    <div className={cn('md:px-6 md:pb-10 xl:grid xl:gap-6 xl:px-10', editandoPregunta ? 'xl:grid-cols-[minmax(0,1fr)_480px]' : 'xl:grid-cols-[minmax(0,1fr)_400px]')}>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center gap-1 border-b border-stone-200 bg-white/95 px-2 py-2 backdrop-blur-md md:hidden">
          <Link to="/servicios" aria-label="Volver a Servicios" className="flex size-11 shrink-0 items-center justify-center rounded-full text-stone-700 hover:bg-stone-100">
            <Icon name="arrow_back" className="text-2xl" />
          </Link>
          <p className="min-w-0 flex-1 truncate font-body text-[15px] text-stone-500">
            Servicios <span className="text-stone-300">/</span> <span className="font-semibold text-stone-900">Guion de preguntas</span>
          </p>
          <StatusPill tono={servicio.activo ? 'teal' : 'stone'} className="shrink-0">
            {servicio.activo ? 'Activo' : 'Apagado'}
          </StatusPill>
        </header>

        <div className="px-4 pb-28 pt-4 md:px-0 md:pb-0 md:pt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6 xl:block">
          <div className="space-y-4">
            <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm md:p-6">
              <Link to="/servicios" className="hidden items-center gap-1.5 font-body text-[15px] font-semibold text-teal-800 hover:underline md:inline-flex">
                <Icon name="arrow_back" className="text-xl" /> Volver a Servicios
              </Link>
              <div className="flex flex-wrap items-center gap-2 md:mt-3">
                <span className="font-label text-xs font-bold uppercase tracking-[0.12em] text-teal-800 md:hidden">Flujo de cotización</span>
                <StatusPill tono="stone" punto={false}>
                  {total} pregunta{total === 1 ? '' : 's'}
                </StatusPill>
                <StatusPill tono={servicio.activo ? 'teal' : 'stone'} className="hidden md:inline-flex">
                  {servicio.activo ? 'Flujo activo en WhatsApp' : 'Flujo apagado'}
                </StatusPill>
              </div>
              <h1 className="mt-2 font-headline text-2xl font-bold tracking-tight text-stone-900 md:text-3xl">
                <span className="hidden md:inline">Guion de preguntas — </span>
                {oracion(servicio.nombre) || 'Nuevo servicio'}
              </h1>
              <p className="mt-1.5 font-body text-[15px] leading-relaxed text-stone-500">
                Dali recopila estos datos paso a paso cuando un cliente pide {servicio.nombre || 'este servicio'}, antes de entregarle la cotización formal.
              </p>
              <label className="mt-4 block">
                <span className="font-body text-[15px] font-semibold text-stone-800">Nombre del servicio que ve el cliente</span>
                <Input
                  value={servicio.nombre}
                  maxLength={80}
                  onChange={(e) => cambiar({ ...servicio, nombre: e.target.value })}
                  className="mt-2 h-12 rounded-xl border-stone-200 px-4 font-body text-base md:text-base"
                  placeholder="Ej. sellado de grietas"
                />
              </label>
              <div className="mt-4 flex gap-3 md:hidden">
                <Link
                  to="/probar"
                  className="inline-flex h-12 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-stone-200 bg-white px-2 font-body text-[14px] font-semibold text-stone-800"
                >
                  <Icon name="play_circle" className="text-xl" /> Probar este guion
                </Link>
                <button
                  type="button"
                  onClick={guardar}
                  disabled={!hayCambios || guardando}
                  className="inline-flex h-12 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-teal-700 px-2 font-headline text-[14px] font-bold text-white disabled:opacity-50"
                >
                  <Icon name="check" className="text-xl" /> Guardar cambios
                </button>
              </div>
            </section>

            <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm md:p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700">
                    <Icon name="smart_toy" className="text-2xl" />
                  </span>
                  <h2 className="font-label text-sm font-bold uppercase tracking-[0.08em] text-stone-900">Se reconoce cuando el cliente dice</h2>
                </div>
                <span className="shrink-0 rounded-lg bg-stone-100 px-3 py-1.5 text-right font-mono text-sm leading-tight text-stone-600">
                  {servicio.palabras.length}
                  <br />
                  activadores
                </span>
              </div>
              <p className="mt-2 font-body text-[15px] text-stone-500">
                Si el mensaje entrante contiene cualquiera de estas palabras, Dali inicia este guion. Cada una vale por su raíz: «asfaltar» reconoce «asfaltado».
              </p>
              <EditorPalabras
                palabras={servicio.palabras}
                onChange={(palabras) => cambiar({ ...servicio, palabras })}
                label={`Palabras de ${servicio.nombre || 'el servicio'}`}
                className="mt-4"
              />
            </section>

            {servicio.modo === 'derivar' ? (
              <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 md:p-6">
                <p className="font-body text-[15px] text-amber-900">
                  Este servicio deriva de inmediato a un asesor: Dali no hace preguntas. Cámbialo a «Junta datos para cotizar» desde Servicios si quieres un guion.
                </p>
              </section>
            ) : (
              <section>
                <div className="flex items-end justify-between gap-3 px-1">
                  <div>
                    <h2 className="font-label text-sm font-bold uppercase tracking-[0.08em] text-stone-900">
                      <span className="md:hidden">Preguntas configuradas</span>
                      <span className="hidden md:inline">Secuencia ordenada de preguntas</span>
                    </h2>
                    <p className="mt-0.5 font-body text-[15px] text-stone-500">Con las flechas cambias el orden en que Dali pregunta por WhatsApp.</p>
                  </div>
                  <span className="shrink-0 rounded-lg bg-stone-100 px-3 py-1.5 font-body text-[15px] text-stone-700">{total} pasos</span>
                </div>
                <div className="mt-3 space-y-3">
                  {servicio.preguntas.map((p, i) => (
                    <FilaPregunta
                      key={`${p.campo}-${i}`}
                      pregunta={p}
                      indice={i}
                      total={total}
                      preguntas={servicio.preguntas}
                      editando={editandoPregunta && indice === i}
                      onEditar={() => navigate(`/servicios/${servicio.id}/preguntas/${i + 1}`)}
                      onDuplicar={() => editar(preguntaDuplicada(guion, servicio.id, i))}
                      onMover={(destino) => editar(preguntaMovida(guion, servicio.id, i, destino))}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => navigate(`/servicios/${servicio.id}/preguntas/nueva`)}
                    className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-teal-200 font-body text-[15px] font-semibold text-teal-800 hover:bg-teal-50"
                  >
                    <Icon name="add" className="text-xl" /> Nueva pregunta
                  </button>
                </div>
              </section>
            )}
          </div>

          <aside className="mt-4 self-start lg:mt-0 xl:hidden">
            <VistaPreviaGuion servicio={servicio} cierre={guion.cierre} empresa={inicio?.empresa.nombre ?? 'Tu empresa'} />
          </aside>
        </div>
      </div>

      {editandoPregunta && indice !== undefined && (
        <PreguntaScreen
          guion={guion}
          servicio={servicio}
          indice={indice}
          nueva={indice === servicio.preguntas.length}
          pregunta={servicio.preguntas[indice] ?? preguntaNueva()}
          onCerrar={() => navigate(`/servicios/${servicio.id}`)}
          onGuardar={(g) => {
            editar(g);
            navigate(`/servicios/${servicio.id}`);
          }}
        />
      )}
      {!editandoPregunta && (
        <aside className="hidden self-start pt-6 xl:block">
          <VistaPreviaGuion servicio={servicio} cierre={guion.cierre} empresa={inicio?.empresa.nombre ?? 'Tu empresa'} className="sticky top-6" />
        </aside>
      )}
    </div>
  );
}
