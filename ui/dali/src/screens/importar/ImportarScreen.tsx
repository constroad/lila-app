import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, api } from '@/lib/api';
import { cuando } from '@/lib/format';
import type { Analisis, HojaImportacion, Importacion, Inicio } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/Icon';
import { StatusPill } from '@/components/StatusPill';
import { useAccionesDeBarra } from '@/layout/barra';

/**
 * A13 «Importar desde Excel» (diseños `A13-importar` móvil, tablet y
 * escritorio): tres pasos. 1) descargar la plantilla (sale con lo que la
 * empresa ya tiene); 2) subir el archivo completado (`POST
 * importar/analizar`, multipart, ≤ 2 MB); 3) revisar: conteos por hoja, los
 * avisos de normalización, qué hacer con lo que ya existe, y «Guardar N
 * elementos» (`POST importar/confirmar`). Abajo, la última importación.
 */
const HOJAS: Array<{ nombre: HojaImportacion; titulo: string; detalle: string; tono: string }> = [
  { nombre: 'Negocio', titulo: 'Ficha general', detalle: 'Nombre, RUC, descripción, dirección, zona, cómo llegar y contactos.', tono: 'bg-teal-50 text-teal-800' },
  { nombre: 'Servicios', titulo: 'Estructura comercial', detalle: 'Código, nombre, palabras clave de detección y modo (preguntas o derivar).', tono: 'bg-sky-50 text-sky-800' },
  {
    nombre: 'Preguntas',
    titulo: 'Flujo de calificación de leads',
    detalle: 'Servicio, orden, texto para WhatsApp, tipo de respuesta, opciones, condición y pista.',
    tono: 'bg-amber-50 text-amber-800',
  },
  {
    nombre: 'Preguntas frecuentes',
    titulo: 'Respuestas directas',
    detalle: 'Pregunta habitual, respuesta oficial y variantes con las que la hacen los clientes.',
    tono: 'bg-violet-50 text-violet-800',
  },
  {
    nombre: 'Catálogo',
    titulo: 'Productos y materiales',
    detalle: 'Código, nombre, categoría, unidad, precio referencial en S/ y disponibilidad.',
    tono: 'bg-stone-100 text-stone-700',
  },
];

const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

export function ImportarScreen() {
  const queryClient = useQueryClient();
  const { data: inicio } = useQuery({ queryKey: ['inicio'], queryFn: () => api.get<Inicio>('/inicio'), staleTime: 60_000 });
  const { data: historial } = useQuery({ queryKey: ['importaciones'], queryFn: () => api.get<{ importaciones: Importacion[] }>('/importar/historial') });
  const [archivo, setArchivo] = useState<File | null>(null);
  const [analisis, setAnalisis] = useState<Analisis | null>(null);
  const [modo, setModo] = useState<'reemplazar' | 'agregar'>('agregar');
  const [arrastrando, setArrastrando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const analizar = useMutation({
    mutationFn: async (f: File) => {
      const cuerpo = new FormData();
      cuerpo.append('archivo', f);
      const res = await fetch('/api/dali/importar/analizar', { method: 'POST', body: cuerpo, credentials: 'same-origin' });
      const data = (await res.json().catch(() => null)) as (Analisis & { error?: string }) | null;
      if (!res.ok) throw new ApiError(res.status, data?.error ?? 'No se pudo analizar el archivo', data);
      return data as Analisis;
    },
    onSuccess: (a) => setAnalisis(a),
    onError: (e) => {
      toast.error(e instanceof ApiError ? e.message : 'No se pudo analizar el archivo');
      setArchivo(null);
    },
  });
  const confirmar = useMutation({
    mutationFn: () => api.post<{ resumen: Analisis['resumen'] }>('/importar/confirmar', { token: analisis!.token, modo }),
    onSuccess: (r) => {
      toast.success(`Listo: ${r.resumen.total} elementos guardados. Dali los usa desde el próximo mensaje`);
      setAnalisis(null);
      setArchivo(null);
      for (const clave of ['servicios', 'faq', 'catalogo', 'negocio', 'asistente', 'importaciones']) void queryClient.invalidateQueries({ queryKey: [clave] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo guardar la importación'),
  });
  const elegir = (f: File | null | undefined) => {
    if (!f) return;
    if (!/\.xlsx$/i.test(f.name)) {
      toast.error('Sube un archivo .xlsx (Excel). Si tienes .xls, guárdalo como .xlsx');
      return;
    }
    setArchivo(f);
    setAnalisis(null);
    analizar.mutate(f);
  };
  const cancelar = () => {
    setArchivo(null);
    setAnalisis(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  useAccionesDeBarra(
    <>
      <button
        type="button"
        onClick={cancelar}
        disabled={!archivo}
        className="inline-flex h-11 items-center rounded-xl border border-stone-200 bg-white px-4 font-body text-[15px] font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-40"
      >
        Cancelar
      </button>
      <button
        type="button"
        onClick={() => confirmar.mutate()}
        disabled={!analisis || !analisis.resumen.total || confirmar.isPending}
        className="inline-flex h-11 items-center gap-2 rounded-xl bg-teal-700 px-5 font-body text-[15px] font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
      >
        <Icon name="save" className="text-xl" /> {confirmar.isPending ? 'Guardando…' : analisis ? `Guardar ${analisis.resumen.total} elementos` : 'Guardar'}
      </button>
    </>,
    [archivo, analisis, confirmar.isPending, modo]
  );

  const rubro = inicio?.empresa.rubro ? `${inicio.empresa.rubro} y construcción` : 'tu rubro';
  const ultima = historial?.importaciones[0];
  const conteos = analisis
    ? ([
        ['Negocio', analisis.resumen.negocio, 'ficha', 'Lista para actualizar'],
        ['Servicios', analisis.resumen.servicios, 'servicios', ''],
        ['Preguntas', analisis.resumen.preguntas, 'preguntas', ''],
        ['Preguntas frecuentes', analisis.resumen.faqs, 'FAQs', ''],
        ['Catálogo', analisis.resumen.catalogo, 'ítems', ''],
      ] as Array<[HojaImportacion, number, string, string]>)
    : [];
  const avisosDe = (hoja: HojaImportacion) => analisis?.avisos.filter((a) => a.seccion === hoja).length ?? 0;

  return (
    <div className="md:px-6 md:pb-10 xl:px-10">
      <header className="sticky top-0 z-30 flex items-center gap-1 border-b border-stone-200 bg-white/95 px-2 py-2 backdrop-blur-md md:hidden">
        <Link to="/mas" aria-label="Volver" className="flex size-11 shrink-0 items-center justify-center rounded-full text-stone-700 hover:bg-stone-100">
          <Icon name="arrow_back" className="text-2xl" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="font-label text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-500">
            {inicio?.empresa.nombre ?? '…'} <span className="text-stone-300">·</span> <span className="text-teal-800">Asistente</span>
          </p>
          <h1 className="truncate font-headline text-lg font-bold leading-tight tracking-tight text-stone-900">Importar conocimiento</h1>
        </div>
        <Link to="/faq" aria-label="Ayuda" className="flex size-11 shrink-0 items-center justify-center rounded-full text-stone-700 hover:bg-stone-100">
          <Icon name="help_outline" className="text-2xl" />
        </Link>
      </header>

      <div className="px-4 pt-4 md:px-0 md:pt-6 xl:pt-8">
        <p className="hidden items-center gap-2 font-label text-xs font-bold uppercase tracking-[0.12em] text-teal-800 md:flex">
          <Icon name="table_view" className="text-xl" /> Base de conocimiento
        </p>
        <h1 className="mt-1 font-headline text-3xl font-bold tracking-tight text-stone-900 xl:text-4xl">Importar desde Excel</h1>
        <p className="mt-1.5 max-w-2xl font-body text-[15px] leading-relaxed text-stone-500 xl:text-lg">Descarga la plantilla, complétala y súbela. Revisas antes de guardar.</p>
      </div>

      <div className="space-y-4 px-4 pb-32 pt-5 md:px-0 md:pb-0 md:pt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-6 lg:space-y-0 xl:grid-cols-[minmax(0,1fr)_460px]">
        <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <Paso n={1} />
              <div>
                <h2 className="font-headline text-lg font-bold tracking-tight text-stone-900 md:text-xl">Plantilla de {rubro}</h2>
                <p className="font-body text-[15px] text-stone-500">
                  Sale con lo que {inicio?.empresa.nombre ?? 'tu empresa'} ya tiene en Dali: úsala también para revisar todo de una vez.
                </p>
              </div>
            </div>
            <a
              href="/api/dali/importar/plantilla.xlsx"
              download
              className="inline-flex h-12 shrink-0 items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-4 font-body text-[15px] font-semibold text-stone-800 hover:bg-stone-100"
            >
              <Icon name="download" className="text-xl" /> Descargar plantilla .xlsx
            </a>
          </div>
          <p className="mt-4 font-body text-[15px] text-stone-600">Esta plantilla contiene 5 pestañas listas para que tu asistente sepa cotizar y responder:</p>
          <ul className="mt-3 space-y-2 rounded-xl border border-stone-200 bg-stone-50 p-2">
            {HOJAS.map((h) => (
              <li key={h.nombre} className="flex items-start gap-3 rounded-lg bg-white px-3 py-2.5">
                <span className={cn('mt-0.5 shrink-0 rounded-md px-2 py-0.5 font-mono text-sm font-semibold', h.tono)}>{h.nombre}</span>
                <span className="min-w-0">
                  <span className="block font-body text-[15px] font-semibold text-stone-900">{h.titulo}</span>
                  <span className="block font-body text-sm text-stone-500">{h.detalle}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm md:p-6">
          <div className="flex items-start gap-3">
            <Paso n={2} />
            <div>
              <h2 className="font-headline text-lg font-bold tracking-tight text-stone-900 md:text-xl">Subir archivo completado</h2>
              <p className="font-body text-[15px] text-stone-500">Arrastra tu archivo o selecciónalo desde tu computadora.</p>
            </div>
          </div>
          <input ref={inputRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => elegir(e.target.files?.[0])} />
          {!archivo ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setArrastrando(true);
              }}
              onDragLeave={() => setArrastrando(false)}
              onDrop={(e) => {
                e.preventDefault();
                setArrastrando(false);
                elegir(e.dataTransfer.files?.[0]);
              }}
              className={cn(
                'mt-4 flex flex-col items-center rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors',
                arrastrando ? 'border-teal-500 bg-teal-50' : 'border-teal-200 bg-white'
              )}
            >
              <span className="flex size-14 items-center justify-center rounded-full bg-teal-50 text-teal-700">
                <Icon name="cloud_upload" className="text-3xl" />
              </span>
              <p className="mt-3 font-body text-[15px] font-semibold text-stone-900">Arrastra y suelta tu archivo aquí</p>
              <p className="mt-1 font-body text-sm text-stone-500">
                Soporta <span className="font-mono">.xlsx</span> (máx. 2 MB)
              </p>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="mt-4 h-11 rounded-xl border border-stone-200 bg-white px-5 font-body text-[15px] font-semibold text-stone-800 hover:bg-stone-50"
              >
                Elegir archivo
              </button>
            </div>
          ) : (
            <div className={cn('mt-4 rounded-2xl border p-4', analisis ? 'border-teal-200 bg-teal-50/40' : 'border-stone-200')}>
              <div className="flex items-start gap-3">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-teal-700 font-mono text-xs font-bold text-white">XLS</span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-body text-[15px] font-semibold text-stone-900">
                    <span className="truncate">{archivo.name}</span>
                    {analisis && (
                      <StatusPill tono="emerald" punto={false}>
                        Listo
                      </StatusPill>
                    )}
                  </p>
                  <p className="font-body text-sm text-stone-500">
                    {kb(archivo.size)} ·{' '}
                    {analizar.isPending ? 'Leyendo hojas…' : analisis ? `Analizado correctamente · hojas: ${analisis.hojasEncontradas.join(', ')}` : 'Sin analizar'}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Quitar archivo"
                  onClick={cancelar}
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                >
                  <Icon name="close" className="text-xl" />
                </button>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-200">
                <div className={cn('h-full rounded-full bg-teal-700 transition-all', analisis ? 'w-full' : analizar.isPending ? 'w-1/2 animate-pulse' : 'w-0')} />
              </div>
              <p className="mt-1.5 flex items-center justify-between font-mono text-xs text-stone-500">
                <span>{analisis ? 'Lectura de hojas completada' : 'Leyendo…'}</span>
                <span>{analisis ? '100%' : '…'}</span>
              </p>
              <button type="button" onClick={() => inputRef.current?.click()} className="mt-3 font-body text-[15px] font-semibold text-teal-800 hover:underline">
                Reemplazar archivo
              </button>
            </div>
          )}
        </section>

        {analisis && (
          <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm md:p-6 lg:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <Paso n={3} />
                <div>
                  <h2 className="font-headline text-lg font-bold tracking-tight text-stone-900 md:text-xl">Revisión antes de guardar</h2>
                  <p className="font-body text-[15px] text-stone-500">Verifica los datos extraídos antes de sincronizarlos con Dali.</p>
                </div>
              </div>
              <span className="rounded-lg bg-stone-100 px-3 py-2 font-body text-[15px] text-stone-700">
                Total a procesar: <span className="font-semibold text-stone-900">{analisis.resumen.total} elementos</span>
              </span>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {conteos.map(([hoja, n, unidad, nota]) => {
                const avisos = avisosDe(hoja);
                return (
                  <div
                    key={hoja}
                    className={cn('rounded-xl border p-4', avisos ? 'border-amber-300 bg-amber-50/60' : n ? 'border-emerald-200 bg-emerald-50/40' : 'border-stone-200 bg-stone-50')}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-body text-[15px] font-semibold text-stone-900">{hoja === 'Preguntas frecuentes' ? 'Frecuentes' : hoja}</p>
                      <Icon
                        name={avisos ? 'warning' : n ? 'check_circle' : 'do_not_disturb_on'}
                        className={cn('text-2xl', avisos ? 'text-amber-600' : n ? 'text-emerald-600' : 'text-stone-300')}
                      />
                    </div>
                    <p className="mt-2 font-headline text-3xl font-bold text-stone-900">
                      {n} <span className="font-body text-sm font-normal text-stone-500">{unidad}</span>
                    </p>
                    <p className={cn('mt-1 font-body text-sm', avisos ? 'text-amber-800' : 'text-teal-800')}>
                      {avisos ? `${avisos} ${avisos === 1 ? 'aviso' : 'avisos'}` : n ? nota || 'Sin observaciones' : 'La hoja vino vacía'}
                    </p>
                  </div>
                );
              })}
            </div>

            {analisis.avisos.length > 0 && (
              <div className="mt-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 font-label text-sm font-bold uppercase tracking-[0.08em] text-stone-900">
                    <Icon name="warning" className="text-xl text-amber-600" /> Avisos de normalización automática ({analisis.avisos.length})
                  </h3>
                  <p className="font-body text-sm text-stone-500">Dali ajustó u omitió estas filas; nada de esto bloquea la carga.</p>
                </div>
                <div className="mt-3 overflow-x-auto rounded-xl border border-stone-200">
                  <table className="w-full min-w-[560px]">
                    <thead>
                      <tr className="bg-stone-50 text-left font-label text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">
                        <th className="px-4 py-2.5">Sección · fila</th>
                        <th className="px-4 py-2.5">Detalle del aviso</th>
                        <th className="px-4 py-2.5">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {analisis.avisos.map((a, i) => (
                        <tr key={i}>
                          <td className="whitespace-nowrap px-4 py-3 font-body text-[15px] text-stone-900">
                            <span className={cn('mr-2 inline-block size-2 rounded-full', a.nivel === 'omitido' ? 'bg-red-500' : 'bg-amber-500')} />
                            <span className="font-semibold">{a.seccion}</span> · <span className="font-mono text-sm text-stone-600">Fila {a.fila}</span>
                          </td>
                          <td className="px-4 py-3 font-body text-[15px] text-stone-800">{a.detalle}</td>
                          <td className="px-4 py-3">
                            <StatusPill tono={a.nivel === 'omitido' ? 'red' : 'amber'} punto={false}>
                              {a.nivel === 'omitido' ? 'Omitida' : 'Ajustada'}
                            </StatusPill>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="mt-6 flex flex-col gap-3 rounded-xl border border-stone-200 bg-stone-50 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="flex items-center gap-2 font-body text-[15px] font-semibold text-stone-900">
                  <Icon name="rule" className="text-xl text-teal-700" /> ¿Qué hacer con lo que ya existe?
                </p>
                <p className="font-body text-sm text-stone-500">Elige cómo resolver lo que ya tiene {inicio?.empresa.nombre ?? 'tu empresa'} en Dali.</p>
              </div>
              <div role="radiogroup" aria-label="Modo de importación" className="grid gap-2 sm:grid-cols-2 md:w-[420px]">
                {(
                  [
                    ['agregar', 'Agregar solo lo nuevo', 'Conserva lo existente y suma o actualiza lo del archivo.', true],
                    ['reemplazar', 'Reemplazar todo', 'Cada hoja con datos reemplaza por completo lo anterior.', false],
                  ] as const
                ).map(([valor, titulo, detalle, recomendado]) => {
                  const activo = modo === valor;
                  return (
                    <button
                      key={valor}
                      type="button"
                      role="radio"
                      aria-checked={activo}
                      onClick={() => setModo(valor)}
                      className={cn('flex items-start gap-2 rounded-xl border px-3 py-2.5 text-left', activo ? 'border-teal-600 bg-white' : 'border-stone-200 bg-white/60')}
                    >
                      <span className={cn('mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2', activo ? 'border-teal-700' : 'border-stone-300')}>
                        {activo && <span className="size-2.5 rounded-full bg-teal-700" />}
                      </span>
                      <span>
                        <span className="flex items-center gap-2 font-body text-[15px] font-semibold text-stone-900">
                          {titulo}
                          {recomendado && (
                            <StatusPill tono="teal" punto={false} className="text-[10px]">
                              Recomendado
                            </StatusPill>
                          )}
                        </span>
                        <span className="block font-body text-sm text-stone-500">{detalle}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 md:flex-row md:justify-end">
              <button
                type="button"
                onClick={cancelar}
                className="h-12 rounded-xl border border-stone-200 bg-white px-5 font-body text-[15px] font-semibold text-stone-800 hover:bg-stone-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => confirmar.mutate()}
                disabled={!analisis.resumen.total || confirmar.isPending}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-teal-700 px-6 font-headline text-[15px] font-bold text-white hover:bg-teal-800 disabled:opacity-50"
              >
                <Icon name="cloud_upload" className="text-xl" /> {confirmar.isPending ? 'Guardando…' : `Guardar ${analisis.resumen.total} elementos`}
              </button>
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 lg:col-span-2">
          <p className="flex flex-wrap items-center gap-x-2 font-body text-[15px] text-stone-600">
            <Icon name="history" className="text-xl text-stone-400" />
            {ultima ? (
              <>
                Última importación: <span className="font-semibold text-stone-900">{cuando(Date.parse(ultima.fecha))}</span> ·{' '}
                <span className="font-mono">{ultima.resumen.total} elementos</span> · por <span className="font-semibold text-stone-900">{ultima.quien}</span> ·{' '}
                {ultima.modo === 'reemplazar' ? 'reemplazó todo' : 'agregó lo nuevo'} · {ultima.archivo}
              </>
            ) : (
              'Todavía no se importó ningún archivo.'
            )}
          </p>
        </section>
      </div>
    </div>
  );
}

function Paso({ n }: { n: number }) {
  return <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-teal-800 font-headline text-sm font-bold text-white">{n}</span>;
}
