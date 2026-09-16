import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, api } from '@/lib/api';
import { oracion } from '@/lib/format';
import type { VerticalAdmin, VerticalDetalleAdmin } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/Icon';
import type { IconName } from '@/components/icon-map';
import { StatusPill } from '@/components/StatusPill';
import { CabeceraAdmin, HojaAdmin } from './piezas';

/**
 * S3 «Verticales» (diseños `S3-admin-verticales` móvil, tablet y escritorio):
 * los packs por rubro. Hoy hay uno de verdad, el de asfalto (v1, en el
 * código): la tarjeta cuenta sus servicios, preguntas y cierre, la plantilla
 * y las empresas que lo usan; el detalle (panel a la derecha desde tablet,
 * hoja en móvil) muestra el guion tal cual, la pregunta de apertura y las
 * hojas del Excel, y deja **aplicar el pack a una empresa** (vuelve a su
 * guion de fábrica, como «Restaurar pack» de A8). Los otros cuatro rubros
 * se ven como «próximamente» con el modo del motor que les tocará. Sin
 * «Nuevo vertical» ni edición desde acá: el pack se edita con un deploy
 * hasta que exista `vertical_packs`, y se dice en pantalla.
 */
const ICONO: Record<VerticalAdmin['id'], IconName> = {
  asphalt: 'construction',
  restaurant: 'restaurant',
  grifo: 'local_gas_station',
  lubricentro: 'oil_barrel',
  otro: 'storefront',
};
type Pestana = 'servicios' | 'cierre' | 'excel' | 'textos';

export function VerticalesAdminScreen() {
  const { data, isPending } = useQuery({ queryKey: ['admin', 'verticales'], queryFn: () => api.get<{ verticales: VerticalAdmin[] }>('/admin/verticales'), staleTime: 60_000 });
  const [elegido, setElegido] = useState<VerticalAdmin['id'] | null>(null);
  const [hoja, setHoja] = useState(false);
  const verticales = data?.verticales ?? [];
  const activo = elegido ?? verticales.find((v) => v.disponible)?.id ?? null;
  const conPack = verticales.filter((v) => v.disponible).length;

  return (
    <div className="pb-8">
      <CabeceraAdmin
        miga="Packs por vertical"
        titulo="Verticales"
        chip={<span className="rounded-lg bg-stone-200 px-2 py-0.5 font-body text-sm font-semibold text-stone-700 md:text-base">{verticales.length || 5} rubros</span>}
        subtitulo="Cada rubro trae sus servicios, preguntas y plantilla de Excel de fábrica para arrancar en minutos."
      />
      <div className="mt-4 px-4 md:mt-6 md:px-6 xl:px-10">
        <div className="flex items-center justify-between gap-3 border-b border-stone-200 pb-3">
          <p className="font-label text-[12px] font-semibold uppercase tracking-[0.1em] text-stone-500">Packs preconfigurados</p>
          <p className="font-mono text-sm text-stone-500">
            {conPack} con pack · {verticales.length - conPack} próximamente
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-4 px-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:px-6 xl:grid-cols-[2fr_3fr] xl:px-10">
        <div className="space-y-3">
          {isPending
            ? [0, 1].map((i) => <div key={i} className="h-44 animate-pulse rounded-2xl border border-stone-200 bg-white" />)
            : verticales.map((v) => (
                <TarjetaVertical
                  key={v.id}
                  vertical={v}
                  activa={v.id === activo}
                  onVer={() => {
                    setElegido(v.id);
                    setHoja(true);
                  }}
                />
              ))}
        </div>
        <div className="hidden md:block">{activo && <DetalleVertical id={activo} />}</div>
      </div>
      {hoja && activo && (
        <div className="md:hidden">
          <HojaAdmin
            titulo={verticales.find((v) => v.id === activo)?.nombre ?? 'Pack'}
            subtitulo="Lo que hereda cada empresa nueva del rubro"
            icono={ICONO[activo]}
            onCerrar={() => setHoja(false)}
          >
            <DetalleVertical id={activo} enHoja />
          </HojaAdmin>
        </div>
      )}
    </div>
  );
}

function TarjetaVertical({ vertical: v, activa, onVer }: { vertical: VerticalAdmin; activa: boolean; onVer: () => void }) {
  return (
    <article className={cn('rounded-2xl border bg-white p-4 shadow-sm md:p-5', activa && v.disponible ? 'border-2 border-teal-700' : 'border-stone-200')}>
      <div className="flex items-start gap-3">
        <span className={cn('flex size-12 shrink-0 items-center justify-center rounded-xl', v.disponible ? 'bg-teal-50 text-teal-700' : 'bg-stone-100 text-stone-500')}>
          <Icon name={ICONO[v.id]} className="text-2xl" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-headline text-lg font-bold text-stone-900">{v.nombre}</h2>
            {v.disponible ? (
              <StatusPill tono="teal">Pack oficial Dali · {v.version}</StatusPill>
            ) : (
              <StatusPill tono="stone" punto={false}>
                Próximamente
              </StatusPill>
            )}
          </div>
          <p className="mt-1 font-body text-[15px] text-stone-600">
            Modo: <b className="font-semibold text-stone-800">{v.modoLegible}</b>
          </p>
        </div>
      </div>
      {v.disponible ? (
        <>
          <p className="mt-3 rounded-xl border border-dashed border-stone-300 bg-stone-50 px-3 py-2.5 font-mono text-sm text-stone-700">
            {v.servicios} servicios base · {v.preguntas} preguntas · {v.cierre} de cierre · Plantilla {v.plantilla}
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-3">
            <p className="font-body text-sm text-stone-600">
              {v.empresas.length ? (
                <>
                  <b className="font-semibold text-stone-900">
                    {v.empresas.length} {v.empresas.length === 1 ? 'empresa' : 'empresas'}
                  </b>
                  : {v.empresas.map((e) => e.nombre).join(', ')}
                </>
              ) : (
                'Ninguna empresa todavía'
              )}
            </p>
            <button type="button" onClick={onVer} className="inline-flex min-h-11 items-center gap-1.5 font-body text-[15px] font-semibold text-teal-800 hover:underline">
              Ver pack <Icon name="arrow_forward" className="text-lg" />
            </button>
          </div>
        </>
      ) : (
        <p className="mt-3 font-body text-sm text-stone-500">
          {v.detalle}. Sin pack todavía: el motor en modo «{v.modoLegible.toLowerCase()}» llega en una fase siguiente.
        </p>
      )}
    </article>
  );
}

function DetalleVertical({ id, enHoja = false }: { id: VerticalAdmin['id']; enHoja?: boolean }) {
  const queryClient = useQueryClient();
  const { data: v, isPending } = useQuery({ queryKey: ['admin', 'vertical', id], queryFn: () => api.get<VerticalDetalleAdmin>(`/admin/verticales/${id}`), staleTime: 60_000 });
  const [pestana, setPestana] = useState<Pestana>('servicios');
  const [empresa, setEmpresa] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const aplicar = useMutation({
    mutationFn: (companyId: string) => api.post(`/admin/verticales/${id}/aplicar`, { companyId }),
    onSuccess: (_r, companyId) => {
      toast.success(`${v?.empresas.find((e) => e.companyId === companyId)?.nombre ?? companyId} volvió al pack de ${v?.nombre}`);
      setConfirmando(false);
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e: Error) => toast.error(e instanceof ApiError ? e.message : 'No se pudo aplicar el pack'),
  });
  if (isPending || !v) return <div className="h-64 animate-pulse rounded-2xl border border-stone-200 bg-white" aria-busy="true" />;
  if (!v.disponible || !v.guion) {
    return (
      <Panel v={v} enHoja={enHoja}>
        <p className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-5 text-center font-body text-[15px] text-stone-600">
          Este rubro todavía no tiene pack. Cuando llegue, el motor trabajará en modo «{v.modoLegible.toLowerCase()}».
        </p>
      </Panel>
    );
  }
  const pestanas: Array<{ id: Pestana; label: string }> = [
    { id: 'servicios', label: `Servicios (${v.servicios})` },
    { id: 'cierre', label: `Cierre (${v.cierre})` },
    { id: 'excel', label: 'Plantilla Excel' },
    { id: 'textos', label: 'Textos WhatsApp' },
  ];
  return (
    <Panel v={v} enHoja={enHoja}>
      <div className="-mx-1 flex gap-1 overflow-x-auto border-b border-stone-200 px-1 [scrollbar-width:none]">
        {pestanas.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPestana(p.id)}
            className={cn(
              'shrink-0 border-b-2 px-3 py-2.5 font-body text-[15px] font-semibold',
              pestana === p.id ? 'border-teal-700 text-teal-900' : 'border-transparent text-stone-500 hover:text-stone-800'
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="mt-4">
        {pestana === 'servicios' && (
          <ul className="space-y-3">
            {v.guion.servicios.map((s) => (
              <li key={s.id} className="rounded-xl border border-stone-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-headline text-base font-bold text-stone-900">{oracion(s.nombre)}</p>
                  <span className="font-mono text-xs text-stone-500">{s.modo === 'derivar' ? 'deriva a una persona' : `${s.preguntas.length} preguntas`}</span>
                </div>
                <p className="mt-1 font-body text-sm text-stone-500">Palabras: {s.palabras.join(', ')}</p>
                {s.preguntas.length > 0 && (
                  <ol className="mt-2 space-y-1 border-t border-stone-100 pt-2">
                    {s.preguntas.map((p, i) => (
                      <li key={p.campo} className="flex gap-2 font-body text-sm text-stone-700">
                        <span className="w-5 shrink-0 font-mono text-stone-400">{i + 1}.</span>
                        <span>
                          <b className="font-semibold text-stone-900">{p.etiqueta}:</b> {p.pregunta}
                          {p.tipo === 'opcion' && p.opciones.length > 0 && <span className="text-stone-500"> ({p.opciones.map((o) => o.valor).join(' / ')})</span>}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ul>
        )}
        {pestana === 'cierre' && (
          <ol className="space-y-2">
            {v.guion.cierre.map((p, i) => (
              <li key={p.campo} className="flex gap-2 rounded-xl border border-stone-200 p-3 font-body text-[15px] text-stone-700">
                <span className="font-mono text-stone-400">{i + 1}.</span>
                <span>
                  <b className="font-semibold text-stone-900">{p.etiqueta}:</b> {p.pregunta}
                </span>
              </li>
            ))}
          </ol>
        )}
        {pestana === 'excel' && (
          <div>
            <p className="font-body text-[15px] text-stone-600">
              La plantilla de importación (A13) trae estas hojas; cada empresa la descarga desde su panel, en Importar, ya con sus datos.
            </p>
            <ul className="mt-3 space-y-2">
              {v.hojas.map((h, i) => (
                <li key={h} className="flex items-center gap-3 rounded-xl border border-stone-200 px-3 py-2.5 font-body text-[15px] text-stone-800">
                  <Icon name="table_chart" className="text-xl text-teal-700" /> <span className="font-mono text-xs text-stone-400">{i + 1}</span> {h}
                </li>
              ))}
            </ul>
          </div>
        )}
        {pestana === 'textos' && (
          <div className="space-y-4">
            <p className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 font-body text-sm text-teal-900">
              <Icon name="info" className="mr-1 align-text-bottom text-lg" /> Textos base de fábrica: cada empresa los adapta desde su panel (Asistente). El saludo y la despedida
              los arma Dali con el nombre de la asistente y del negocio.
            </p>
            <div>
              <p className="font-body text-[15px] font-semibold text-stone-800">Pregunta de apertura</p>
              <p className="mt-1 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 font-body text-[15px] text-stone-800">{v.textos.preguntaServicio}</p>
            </div>
          </div>
        )}
      </div>
      <div className="mt-5 rounded-xl border border-stone-200 bg-stone-50 p-4">
        <p className="font-body text-[15px] font-semibold text-stone-900">Aplicar el pack a una empresa</p>
        <p className="mt-0.5 font-body text-sm text-stone-600">La empresa vuelve al guion de fábrica: si tenía servicios o preguntas propios, se pierden.</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <select
            value={empresa}
            onChange={(e) => {
              setEmpresa(e.target.value);
              setConfirmando(false);
            }}
            className="h-11 flex-1 rounded-xl border border-stone-200 bg-white px-3 font-body text-[15px] text-stone-800"
            aria-label="Empresa"
          >
            <option value="">Elige una empresa…</option>
            {v.empresas.map((e) => (
              <option key={e.companyId} value={e.companyId}>
                {e.nombre}
              </option>
            ))}
          </select>
          {confirmando ? (
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirmando(false)} className="h-11 rounded-xl px-3 font-body text-[15px] font-semibold text-stone-600 hover:bg-white">
                Cancelar
              </button>
              <button
                type="button"
                disabled={aplicar.isPending}
                onClick={() => aplicar.mutate(empresa)}
                className="h-11 rounded-xl bg-red-700 px-4 font-body text-[15px] font-semibold text-white hover:bg-red-800 disabled:opacity-60"
              >
                Sí, restaurar
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={!empresa}
              onClick={() => setConfirmando(true)}
              className="h-11 rounded-xl bg-teal-700 px-4 font-body text-[15px] font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
            >
              Aplicar pack
            </button>
          )}
        </div>
      </div>
      <p className="mt-4 font-body text-sm text-stone-500">El pack vive en el código de lila ({v.version}): se edita con un deploy, no desde acá.</p>
    </Panel>
  );
}

function Panel({ v, enHoja, children }: { v: VerticalDetalleAdmin; enHoja: boolean; children: ReactNode }) {
  if (enHoja) return <>{children}</>;
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm md:p-5">
      <div className="flex items-start gap-3 border-b border-stone-200 pb-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
          <Icon name={ICONO[v.id]} className="text-2xl" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="flex flex-wrap items-center gap-2 font-headline text-xl font-bold text-stone-900">
            {v.nombre} {v.version && <span className="rounded-md border border-teal-200 bg-teal-50 px-2 py-0.5 font-mono text-xs text-teal-800">{v.version} (estable)</span>}
          </h2>
          <p className="font-body text-sm text-stone-500">Configuración que hereda cualquier empresa nueva de este rubro.</p>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
