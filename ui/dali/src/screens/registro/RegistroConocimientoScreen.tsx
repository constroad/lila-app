import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, api } from '@/lib/api';
import type { Analisis, Catalogo, Faq, Inicio, Servicios } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/Icon';
import { CascaronRegistro, PieRegistro } from './piezas';

/**
 * P6 «Registro · Conocimiento» (diseños `P6-conocimiento` móvil, tablet y
 * escritorio): dos caminos lado a lado desde tablet —subir el Excel (la
 * plantilla de A13, analizar y guardar en modo agregar) o quedarse con el
 * pack de Asfalto, que ya viene puesto y por eso se muestra elegido («Listo»)
 * en vez de con el botón «Usar el pack» del diseño, que no tendría nada que
 * hacer—; abajo, lo que ya queda listo en Dali, contado de verdad (servicios
 * y preguntas del guion, FAQ y catálogo). «Terminar» lleva a probar a Dali.
 */
const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

export function RegistroConocimientoScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: inicio } = useQuery({ queryKey: ['inicio'], queryFn: () => api.get<Inicio>('/inicio'), staleTime: 60_000 });
  const { data: servicios } = useQuery({ queryKey: ['servicios'], queryFn: () => api.get<Servicios>('/servicios') });
  const { data: faq } = useQuery({ queryKey: ['faq'], queryFn: () => api.get<{ faqs: Faq[] }>('/faq') });
  const { data: catalogo } = useQuery({ queryKey: ['catalogo'], queryFn: () => api.get<Catalogo>('/catalogo') });
  const [archivo, setArchivo] = useState<File | null>(null);
  const [analisis, setAnalisis] = useState<Analisis | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const analizar = useMutation({
    mutationFn: async (f: File) => {
      const cuerpo = new FormData();
      cuerpo.append('archivo', f);
      const res = await fetch('/api/dali/importar/analizar', { method: 'POST', body: cuerpo, credentials: 'same-origin' });
      const data = (await res.json().catch(() => null)) as (Analisis & { error?: string }) | null;
      if (!res.ok) throw new ApiError(res.status, data?.error ?? 'No se pudo leer el archivo', data);
      return data as Analisis;
    },
    onSuccess: (a) => setAnalisis(a),
    onError: (e) => {
      toast.error(e instanceof ApiError ? e.message : 'No se pudo leer el archivo');
      setArchivo(null);
    },
  });
  const confirmar = useMutation({
    mutationFn: () => api.post<{ resumen: Analisis['resumen'] }>('/importar/confirmar', { token: analisis!.token, modo: 'agregar' }),
    onSuccess: (r) => {
      toast.success(`Listo: ${r.resumen.total} elementos guardados`);
      setAnalisis(null);
      setArchivo(null);
      for (const clave of ['servicios', 'faq', 'catalogo', 'negocio', 'asistente']) void queryClient.invalidateQueries({ queryKey: [clave] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo guardar'),
  });
  const elegir = (f: File | null) => {
    if (!f) return;
    setArchivo(f);
    setAnalisis(null);
    analizar.mutate(f);
  };

  const empresa = inicio?.empresa.nombre ?? '…';
  const activos = servicios?.guion.servicios.filter((s) => s.activo) ?? [];
  const nPreguntas = activos.reduce((a, s) => a + s.preguntas.length, 0);
  const nFaq = faq?.faqs.length ?? 0;
  const nItems = catalogo?.items.length ?? 0;
  const listo: [string, string, string][] = [
    [
      'Ficha del negocio',
      `nombre, zona${inicio?.empresa.rubro ? ` y rubro ${inicio.empresa.rubro}` : ''}`,
      `Nombre, zona de atención${inicio?.empresa.rubro ? ` y rubro ${inicio.empresa.rubro}` : ''}.`,
    ],
    ['Servicios y preguntas', `${activos.length} servicios, ${nPreguntas} preguntas`, `${activos.length} servicios y ${nPreguntas} preguntas para tomar cada pedido.`],
    [
      'Preguntas frecuentes',
      nFaq ? `${nFaq} cargadas` : '0 — puedes agregarlas luego',
      nFaq ? `${nFaq} cargadas; las editas desde el panel.` : '0 iniciales — puedes agregarlas cuando quieras.',
    ],
    ['Catálogo', nItems ? `${nItems} ítems` : 'opcional, editable en cualquier momento', nItems ? `${nItems} ítems cargados.` : 'Opcional, editable en cualquier momento.'],
  ];

  return (
    <CascaronRegistro paso={3} subtitulo={`${empresa} · Asfalto`} ancho="amplio">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200/80 bg-teal-50 px-3 py-1 font-body text-sm font-semibold text-teal-800">
        <span className="size-1.5 rounded-full bg-teal-600" /> Paso final · Listo en 2 minutos
      </span>
      <h1 className="mt-4 font-headline text-[28px] font-bold leading-tight tracking-tight text-stone-900 md:text-4xl">¿Qué sabe Dali de {empresa}?</h1>
      <p className="mt-2 font-body text-[15px] leading-relaxed text-stone-500 md:text-lg">Con esto atiende: qué ofreces, qué preguntar y qué responder.</p>
      <p className="mt-8 hidden font-label text-[13px] font-semibold uppercase tracking-[0.12em] text-stone-500 md:block">Elige cómo cargar la información</p>

      <div className="mt-6 grid gap-4 md:mt-3 md:grid-cols-2 md:gap-5">
        <section className="rounded-2xl border border-stone-200 bg-white p-4 md:bg-stone-50/60 md:p-5">
          <div className="flex items-start gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <Icon name="table_chart" className="text-2xl" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center justify-between gap-2 font-headline text-lg font-bold text-stone-900">
                Subir un Excel <span className="rounded-full bg-teal-50 px-2 py-0.5 font-label text-[11px] font-bold uppercase tracking-wider text-teal-800">Recomendado</span>
              </p>
              <p className="font-body text-[15px] text-stone-500">Descarga la plantilla, complétala y súbela. Diez minutos.</p>
            </div>
          </div>
          <a
            href="/api/dali/importar/plantilla.xlsx"
            download
            className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white font-body text-[15px] font-semibold text-stone-800 hover:bg-stone-100"
          >
            <Icon name="download" className="text-xl" /> Descargar plantilla .xlsx
          </a>
          <input ref={inputRef} type="file" accept=".xlsx" className="sr-only" onChange={(e) => elegir(e.target.files?.[0] ?? null)} />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              elegir(e.dataTransfer.files?.[0] ?? null);
            }}
            className={cn(
              'mt-3 flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-center',
              archivo ? 'border-teal-300 bg-teal-50/40' : 'border-stone-300 bg-white hover:bg-stone-50'
            )}
          >
            <Icon name="upload_file" className="text-[32px] text-stone-400" />
            {archivo ? (
              <span className="font-body text-[15px] font-semibold text-stone-900">
                {archivo.name} · {kb(archivo.size)}
              </span>
            ) : (
              <>
                <span className="font-body text-[15px] font-semibold text-stone-900">
                  Suelta tu archivo <span className="font-mono">.xlsx</span> aquí
                </span>
                <span className="font-body text-sm text-stone-500">
                  <span className="md:hidden">o toca para examinar desde tu celular</span>
                  <span className="hidden md:inline">o haz clic para examinar tus archivos</span>
                </span>
              </>
            )}
          </button>
          {analizar.isPending && <p className="mt-3 font-body text-sm text-stone-500">Leyendo el archivo…</p>}
          {analisis && (
            <div className="mt-3 rounded-xl border border-teal-200 bg-teal-50 p-4">
              <p className="font-body text-[15px] font-semibold text-stone-900">
                {analisis.resumen.total} elementos para guardar: {analisis.resumen.servicios} servicios, {analisis.resumen.preguntas} preguntas, {analisis.resumen.faqs} preguntas
                frecuentes, {analisis.resumen.catalogo} ítems.
              </p>
              {analisis.avisos.length > 0 && (
                <p className="mt-1 font-body text-sm text-amber-900">{analisis.avisos.length} avisos: se guardan igual; los revisas después en Importar.</p>
              )}
              <button
                type="button"
                onClick={() => confirmar.mutate()}
                disabled={confirmar.isPending}
                className="mt-3 inline-flex h-11 items-center gap-2 rounded-xl bg-teal-700 px-5 font-body text-[15px] font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
              >
                <Icon name="check" className="text-xl" /> {confirmar.isPending ? 'Guardando…' : `Guardar ${analisis.resumen.total} elementos`}
              </button>
            </div>
          )}
        </section>

        <section className="relative flex flex-col rounded-2xl border-2 border-teal-500 bg-teal-50/30 p-4 md:p-5">
          <span className="absolute -top-3.5 right-4 hidden rounded-full bg-teal-700 px-3 py-1 font-label text-[11px] font-bold uppercase tracking-wider text-white md:inline-block">
            Más rápido
          </span>
          <span className="absolute right-5 top-5 hidden size-8 items-center justify-center rounded-full bg-teal-700 text-white md:flex" aria-hidden="true">
            <Icon name="check" className="text-lg" />
          </span>
          <div className="flex items-start gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-800">
              <Icon name="edit_note" className="text-2xl" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center justify-between gap-2 font-headline text-lg font-bold text-stone-900">
                Completarlo aquí
                <span className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 font-body text-xs font-semibold text-teal-800 md:hidden">
                  <Icon name="bolt" className="text-sm" /> Más rápido
                </span>
              </p>
              <p className="font-body text-[15px] text-stone-500">
                Empieza con el pack de tu rubro: Asfalto ya trae los servicios y las preguntas listas. Lo editas después en el panel.
              </p>
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-teal-200 bg-white p-4">
            <p className="flex items-center gap-2 font-body text-[15px] font-semibold text-teal-900">
              <Icon name="verified" className="text-xl text-teal-700" /> Pack de Asfalto predefinido
            </p>
            <p className="mt-1 pl-7 font-body text-sm text-stone-600">
              {activos.length ? `Incluye ${activos.map((s) => s.nombre.toLowerCase()).join(', ')}.` : 'Incluye los servicios y las preguntas del rubro.'}
            </p>
          </div>
          <div className="mt-auto flex items-center justify-between gap-3 border-t border-teal-200/70 pt-3 md:mt-4">
            <p className="flex items-center gap-2 font-body text-sm text-stone-700">
              <span className="size-2 shrink-0 rounded-full bg-teal-600" aria-hidden="true" /> Seleccionado por defecto para {empresa}
            </p>
            <span className="shrink-0 font-body text-sm font-bold text-teal-800">Listo</span>
          </div>
        </section>
      </div>

      <section className="mt-5 rounded-2xl border border-stone-200 bg-stone-50 p-4 md:mt-6 md:p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="flex min-w-0 items-center gap-2 font-label text-[12px] font-semibold uppercase tracking-[0.05em] text-stone-600 md:text-[13px] md:tracking-[0.12em]">
            <Icon name="list_alt" className="hidden text-xl text-stone-500 md:block" /> Lo que quedará listo en Dali
          </p>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-teal-200/80 bg-teal-50 px-2.5 py-1 font-body text-xs font-semibold text-teal-800 md:text-sm">
            <span className="hidden size-1.5 rounded-full bg-teal-600 md:inline-block" aria-hidden="true" />
            <span>
              Configurado<span className="hidden md:inline"> automáticamente</span>
            </span>
          </span>
        </div>
        <ul className="mt-3 space-y-2.5 md:mt-4 md:grid md:grid-cols-2 md:gap-x-6 md:gap-y-4 md:space-y-0 md:border-t md:border-stone-200 md:pt-4">
          {listo.map(([titulo, corto, largo]) => (
            <li key={titulo} className="flex items-start gap-2.5 font-body text-[15px] text-stone-700">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-teal-700 text-white md:size-6">
                <Icon name="check" className="text-sm md:text-base" />
              </span>
              <span className="min-w-0">
                <b className="font-semibold text-stone-900 md:font-headline md:text-base md:font-bold">{titulo}</b> <span className="text-stone-500 md:hidden">({corto})</span>
                <span className="hidden text-stone-500 md:block">{largo}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <button
        type="button"
        onClick={() => navigate('/probar')}
        className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 font-headline text-[17px] font-bold text-white shadow-md shadow-teal-700/20 hover:bg-teal-800 md:mx-auto md:mt-8 md:w-auto md:min-w-80 md:px-12"
      >
        Terminar y probar a Dali <Icon name="arrow_forward" className="text-xl" />
      </button>
      <Link to="/inicio" className="mt-3 flex min-h-11 items-center justify-center font-body text-[15px] font-semibold text-stone-600 hover:text-stone-900">
        Lo hago después
      </Link>
      <PieRegistro texto="Piloto sin costo · Sin tarjeta de crédito" icono="lock" className="md:border-t md:border-stone-200 md:pt-5" />
    </CascaronRegistro>
  );
}
