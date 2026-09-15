import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Inicio, ServicioEditable } from '@/lib/types';
import { oracion } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/Icon';
import { EditorPalabras } from '@/components/EditorPalabras';
import { StatusPill } from '@/components/StatusPill';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAccionesDeBarra } from '@/layout/barra';
import { useGuion } from './GuionProvider';
import { NOMBRE_MODO, conServicio, servicioDe, servicioNuevo, sinServicio } from './guion';
import { TarjetaServicio } from './piezas';
import { resumenDeRespuesta } from './guion';

/**
 * A8 «Servicios» (diseños `A8-servicios` móvil, tablet y escritorio): lo que
 * Dali reconoce y las preguntas que hace. La lista de servicios con su
 * interruptor, la pregunta de cuando el cliente no dice qué necesita, y desde
 * tablet el panel derecho que edita el servicio elegido (nombre, palabras,
 * modo, resumen de preguntas). El guion entero se guarda de una vez
 * (`GuionProvider`); el editor completo de preguntas es A9.
 */
export function ServiciosScreen() {
  const { servicios, guion, cargando, hayCambios, guardando, editar, descartar, guardar, restaurarPack, restaurando } = useGuion();
  const { data: inicio } = useQuery({ queryKey: ['inicio'], queryFn: () => api.get<Inicio>('/inicio'), staleTime: 60_000 });
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [editandoPregunta, setEditandoPregunta] = useState(false);
  const seleccionadoId = params.get('editar') ?? undefined;
  const seleccionado = guion ? servicioDe(guion, seleccionadoId) : undefined;

  useAccionesDeBarra(
    <>
      <Link
        to="/probar"
        className="inline-flex h-11 items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 font-body text-[15px] font-semibold text-stone-800 hover:bg-stone-50"
      >
        <Icon name="play_arrow" className="text-xl" /> Probar en simulador
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

  if (cargando || !guion || !servicios) return <ServiciosEsqueleto />;
  const activos = guion.servicios.filter((s) => s.activo).length;
  const seleccionar = (id?: string) => setParams(id ? { editar: id } : {}, { replace: true });
  const agregar = () => {
    const nuevo = servicioNuevo();
    editar(conServicio(guion, nuevo));
    if (window.matchMedia('(min-width: 1024px)').matches) seleccionar(nuevo.id);
    else navigate(`/servicios/${nuevo.id}`);
  };
  const cambiarServicio = (s: ServicioEditable) => editar(conServicio(guion, s));

  return (
    <div className="md:px-6 md:pb-10 xl:px-10">
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-stone-200 bg-white/95 px-2 py-2 backdrop-blur-md md:hidden">
        <Link to="/inicio" aria-label="Volver al inicio" className="flex size-11 shrink-0 items-center justify-center rounded-full text-stone-700 hover:bg-stone-100">
          <Icon name="arrow_back" className="text-2xl" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-headline text-base font-bold leading-tight tracking-tight text-stone-900">
            <span className="truncate">{inicio?.empresa.nombre ?? '…'}</span>
            <StatusPill tono={inicio?.asistente.encendido ? 'teal' : 'stone'} className="shrink-0 px-1.5 text-[10px]">
              {inicio?.asistente.encendido ? 'WhatsApp activo' : 'En pausa'}
            </StatusPill>
          </p>
          <p className="truncate font-body text-sm text-stone-500">{[inicio?.empresa.rubro, inicio?.empresa.ciudad].filter(Boolean).join(' • ') || 'Asistente de WhatsApp'}</p>
        </div>
        <Link to="/notificaciones" aria-label="Notificaciones" className="flex size-11 shrink-0 items-center justify-center rounded-full text-stone-700 hover:bg-stone-100">
          <Icon name="notifications" className="text-2xl" />
        </Link>
      </header>

      <div className="px-4 pt-4 md:px-0 md:pt-6 xl:pt-8">
        <div className="flex items-center justify-between md:hidden">
          <p className="font-label text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">Configuración de Dali</p>
          <p className="flex items-center gap-1.5 font-body text-[15px] font-semibold text-teal-800">
            <Icon name="published_with_changes" className="text-xl" /> {activos} activos
          </p>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="font-headline text-3xl font-bold tracking-tight text-stone-900 xl:text-4xl">Servicios</h1>
              <StatusPill tono="teal" punto={false} className="hidden text-sm md:inline-flex">
                {activos} activos
              </StatusPill>
            </div>
            <p className="mt-1.5 max-w-xl font-body text-[15px] leading-relaxed text-stone-500 xl:text-lg">
              Lo que Dali reconoce y las preguntas que hace para juntar los datos antes de cotizar.
            </p>
          </div>
          <div className="hidden shrink-0 items-center gap-4 md:flex">
            <button
              type="button"
              onClick={restaurarPack}
              disabled={restaurando || servicios.delPack}
              className="font-body text-[15px] text-stone-600 hover:text-stone-900 disabled:opacity-40"
            >
              {restaurando ? 'Restaurando…' : 'Restaurar el pack de Asfalto'}
            </button>
            <button
              type="button"
              onClick={agregar}
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-teal-700 px-5 font-headline text-[15px] font-bold text-white hover:bg-teal-800"
            >
              <Icon name="add" className="text-xl" /> Agregar servicio
            </button>
          </div>
        </div>
        <div className="mt-4 space-y-3 md:hidden">
          <button
            type="button"
            onClick={agregar}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-teal-700 font-headline text-lg font-bold text-white"
          >
            <Icon name="add" className="text-2xl" /> Agregar servicio
          </button>
          <button
            type="button"
            onClick={restaurarPack}
            disabled={restaurando || servicios.delPack}
            className="flex min-h-11 w-full items-center justify-center gap-2 font-body text-[15px] text-stone-600 disabled:opacity-40"
          >
            <Icon name="restart_alt" className="text-xl" /> {restaurando ? 'Restaurando…' : 'Restaurar el pack de Asfalto predeterminado'}
          </button>
        </div>
      </div>

      <div className={cn('px-4 pb-28 pt-5 md:px-0 md:pb-0 md:pt-6', seleccionado && 'lg:grid lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-6 xl:grid-cols-[minmax(0,1fr)_480px]')}>
        <div className="space-y-4">
          <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 md:p-5">
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <Icon name="lightbulb" className="text-2xl" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-label text-xs font-bold uppercase tracking-[0.08em] text-amber-900 md:text-sm">Cuando el cliente no dice qué necesita</h2>
                  <button
                    type="button"
                    onClick={() => setEditandoPregunta((v) => !v)}
                    className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg px-2 font-body text-[15px] font-semibold text-amber-900 hover:bg-amber-100 md:bg-amber-100 md:px-3"
                  >
                    {editandoPregunta ? (
                      'Listo'
                    ) : (
                      <>
                        <span className="md:hidden">Editar</span>
                        <span className="hidden md:inline">Editar texto</span>
                      </>
                    )}{' '}
                    <Icon name="edit" className="text-base" />
                  </button>
                </div>
                {editandoPregunta ? (
                  <Textarea
                    autoFocus
                    value={guion.preguntaServicio}
                    maxLength={300}
                    onChange={(e) => editar({ ...guion, preguntaServicio: e.target.value })}
                    className="mt-2 min-h-[72px] rounded-xl border-amber-200 bg-white px-4 py-3 font-body text-base leading-relaxed text-stone-900 md:text-base"
                    aria-label="Pregunta cuando el cliente no dice qué necesita"
                  />
                ) : (
                  <p className="mt-2 rounded-xl border border-amber-100 bg-white px-4 py-3 font-body text-[17px] italic leading-relaxed text-stone-800 md:mt-1.5 md:border-0 md:bg-transparent md:px-0 md:py-0 md:not-italic md:font-semibold">
                    «{guion.preguntaServicio}»
                  </p>
                )}
                <p className="mt-2 font-body text-[15px] text-stone-600">
                  Dali lanza esta pregunta si el cliente solo dice «Hola», «Buenas tardes» o «Quiero cotizar» y no nombra un servicio.
                </p>
              </div>
            </div>
          </section>

          <p className="pt-1 font-label text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 md:hidden">
            Catálogo activo en WhatsApp <span className="ml-1 font-body text-sm font-normal normal-case tracking-normal text-stone-400">· Toca para configurar</span>
          </p>
          {[...guion.servicios]
            .sort((a, b) => Number(a.modo === 'derivar') - Number(b.modo === 'derivar'))
            .map((s) => (
              <TarjetaServicio
                key={s.id}
                servicio={s}
                seleccionado={s.id === seleccionadoId}
                onSeleccionar={() => (window.matchMedia('(min-width: 1024px)').matches ? seleccionar(s.id) : navigate(`/servicios/${s.id}`))}
                onActivo={(activo) => cambiarServicio({ ...s, activo })}
              />
            ))}
        </div>

        {seleccionado && (
          <aside className="hidden self-start lg:block">
            <PanelServicio
              servicio={seleccionado}
              onChange={cambiarServicio}
              onQuitar={() => (editar(sinServicio(guion, seleccionado.id)), seleccionar())}
              onCerrar={() => seleccionar()}
              onCancelar={descartar}
              onGuardar={guardar}
              hayCambios={hayCambios}
              guardando={guardando}
            />
          </aside>
        )}
      </div>

      {hayCambios && (
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,16px)+64px)] z-30 mx-auto flex w-full max-w-[390px] gap-3 border-t border-stone-200 bg-white px-4 py-3 md:hidden">
          <button
            type="button"
            onClick={guardar}
            disabled={guardando}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-teal-700 font-headline text-[15px] font-bold text-white disabled:bg-stone-300"
          >
            <Icon name="check" className="text-xl" /> {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
          <button type="button" onClick={descartar} className="h-12 rounded-full border border-stone-300 bg-white px-5 font-body text-[15px] font-semibold text-stone-800">
            Descartar
          </button>
        </div>
      )}
    </div>
  );
}

/** El panel derecho de A8 (tablet y escritorio): el servicio elegido, editable, con el resumen de sus preguntas. */
function PanelServicio({
  servicio,
  onChange,
  onQuitar,
  onCerrar,
  onCancelar,
  onGuardar,
  hayCambios,
  guardando,
}: {
  servicio: ServicioEditable;
  onChange: (s: ServicioEditable) => void;
  onQuitar: () => void;
  onCerrar: () => void;
  onCancelar: () => void;
  onGuardar: () => void;
  hayCambios: boolean;
  guardando: boolean;
}) {
  const esDelPack = ['venta', 'colocacion', 'transporte', 'fabricacion'].includes(servicio.id);
  return (
    <div className="sticky top-6 flex max-h-[calc(100dvh-3rem)] flex-col rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-stone-200 px-5 py-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-label text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
            Configuración de servicio
            <StatusPill tono={servicio.activo ? 'teal' : 'stone'} punto={false} className="text-[10px]">
              {servicio.activo ? 'Activo' : 'Apagado'}
            </StatusPill>
          </p>
          <h2 className="mt-1 truncate font-headline text-xl font-bold tracking-tight text-stone-900">{oracion(servicio.nombre) || 'Nuevo servicio'}</h2>
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
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
        <div>
          <label className="font-label text-xs font-bold uppercase tracking-[0.1em] text-stone-700">Nombre del servicio que ve el cliente</label>
          <Input
            value={servicio.nombre}
            maxLength={80}
            onChange={(e) => onChange({ ...servicio, nombre: e.target.value })}
            className="mt-2 h-12 rounded-xl border-stone-200 px-4 font-body text-base md:text-base"
            placeholder="Ej. sellado de grietas"
            aria-label="Nombre del servicio"
          />
          <p className="mt-1.5 font-body text-sm text-stone-500">Este nombre se usa en resúmenes de cotización y cuando Dali enumera opciones al cliente.</p>
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <p className="font-label text-xs font-bold uppercase tracking-[0.1em] text-stone-700">Palabras con las que se reconoce</p>
            <span className="font-body text-sm text-stone-500">{servicio.palabras.length} palabras</span>
          </div>
          <p className="mt-1 font-body text-sm text-stone-500">
            Si el cliente menciona alguna, Dali inicia este flujo. Cada palabra vale por su raíz: «asfaltar» reconoce «asfaltado».
          </p>
          <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50 p-3">
            <EditorPalabras
              palabras={servicio.palabras}
              onChange={(palabras) => onChange({ ...servicio, palabras })}
              label={`Palabras de ${servicio.nombre || 'el servicio'}`}
              mono
            />
          </div>
        </div>
        <div>
          <p className="font-label text-xs font-bold uppercase tracking-[0.1em] text-stone-700">Modo de atención de Dali</p>
          <div role="radiogroup" aria-label="Modo de atención" className="mt-2 space-y-2">
            {(
              [
                ['preguntas', 'Dali hace las preguntas paso a paso para que tengas el metraje, espesor y ubicación listos.'],
                ['derivar', 'Pide solo nombre y teléfono, detiene a Dali y manda una alerta prioritaria al equipo.'],
              ] as const
            ).map(([modo, detalle]) => {
              const activa = servicio.modo === modo;
              return (
                <button
                  key={modo}
                  type="button"
                  role="radio"
                  aria-checked={activa}
                  onClick={() => onChange({ ...servicio, modo })}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left',
                    activa ? 'border-teal-600 bg-teal-50' : 'border-stone-200 bg-white hover:bg-stone-50'
                  )}
                >
                  <span className={cn('mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2', activa ? 'border-teal-700' : 'border-stone-300')}>
                    {activa && <span className="size-2.5 rounded-full bg-teal-700" />}
                  </span>
                  <span>
                    <span className="block font-body text-[15px] font-semibold text-stone-900">{NOMBRE_MODO[modo]}</span>
                    <span className="block font-body text-sm text-stone-500">{detalle}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        {servicio.modo === 'preguntas' && (
          <div>
            <div className="flex items-baseline justify-between">
              <p className="font-label text-xs font-bold uppercase tracking-[0.1em] text-stone-700">Preguntas configuradas ({servicio.preguntas.length})</p>
              <Link to={`/servicios/${servicio.id}`} className="inline-flex items-center gap-1 font-body text-[15px] font-semibold text-teal-800 hover:underline">
                Editor completo <Icon name="open_in_new" className="text-base" />
              </Link>
            </div>
            <ol className="mt-2 space-y-2">
              {servicio.preguntas.map((p, i) => (
                <li key={`${p.campo}-${i}`}>
                  <Link
                    to={`/servicios/${servicio.id}/preguntas/${i + 1}`}
                    className="flex items-start gap-3 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 hover:border-teal-300"
                  >
                    <span className="mt-0.5 font-mono text-sm text-stone-400">{i + 1}.</span>
                    <span className="min-w-0">
                      <span className="block font-body text-[15px] font-semibold text-stone-900">{p.pregunta || 'Pregunta sin texto'}</span>
                      <span className="block truncate font-body text-sm text-stone-500">{resumenDeRespuesta(p)}</span>
                    </span>
                  </Link>
                </li>
              ))}
              {!servicio.preguntas.length && <li className="font-body text-[15px] italic text-stone-400">Todavía sin preguntas: agrégalas en el editor completo.</li>}
            </ol>
          </div>
        )}
        {!esDelPack && (
          <button type="button" onClick={onQuitar} className="inline-flex min-h-11 items-center gap-2 font-body text-[15px] font-semibold text-red-700 hover:underline">
            <Icon name="delete_outline" className="text-xl" /> Quitar este servicio
          </button>
        )}
      </div>
      <div className="flex items-center justify-end gap-3 border-t border-stone-200 px-5 py-4">
        <button
          type="button"
          onClick={onCancelar}
          disabled={!hayCambios}
          className="h-12 rounded-xl border border-stone-200 px-5 font-body text-[15px] font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-40"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onGuardar}
          disabled={!hayCambios || guardando}
          className="h-12 flex-1 rounded-xl bg-teal-700 font-headline text-[15px] font-bold text-white hover:bg-teal-800 disabled:opacity-50"
        >
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  );
}

function ServiciosEsqueleto() {
  return (
    <div className="md:px-6 xl:px-10" aria-busy="true">
      <div className="h-14 border-b border-stone-200 bg-white md:hidden" />
      <div className="px-4 pt-6 md:px-0 xl:pt-8">
        <div className="h-9 w-48 animate-pulse rounded-lg bg-stone-200" />
        <div className="mt-3 h-4 w-80 animate-pulse rounded bg-stone-200" />
        <div className="mt-6 space-y-4">
          {[140, 220, 220, 220].map((h, i) => (
            <div key={i} className="animate-pulse rounded-2xl border border-stone-200 bg-white" style={{ height: h }} />
          ))}
        </div>
      </div>
    </div>
  );
}
