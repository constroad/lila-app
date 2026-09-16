import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Catalogo, Inicio, ItemCatalogo } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/Icon';
import { Interruptor } from '@/components/Interruptor';
import { StatusPill } from '@/components/StatusPill';
import { useAccionesDeBarra } from '@/layout/barra';
import { EditorItem, itemNuevo, precioLegible } from './EditorItem';

/**
 * A12 «Catálogo» (diseños `A12-catalogo` móvil, tablet y escritorio): lo que
 * vendes, para que Dali lo conozca. La política de precios («Dali puede decir
 * precios») manda sobre si Dali dice los referenciales o deja el precio al
 * asesor. Tabla desde tablet, tarjetas en móvil; el ítem elegido se edita en
 * el panel derecho (hoja en móvil). La lista entera se guarda de una vez
 * (`PUT catalogo`). Sin fotos todavía (el diseño las dibuja; no hay almacén
 * de imágenes para Dali).
 */
export function CatalogoScreen() {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({ queryKey: ['catalogo'], queryFn: () => api.get<Catalogo>('/catalogo') });
  const { data: inicio } = useQuery({ queryKey: ['inicio'], queryFn: () => api.get<Inicio>('/inicio'), staleTime: 60_000 });
  const [editado, setEditado] = useState<Catalogo | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState('');
  const [editando, setEditando] = useState<ItemCatalogo | null>(null);
  const delServidor = useMemo(() => (data ? structuredClone(data) : null), [data]);
  const catalogo = editado ?? delServidor;
  const hayCambios = Boolean(delServidor && editado && JSON.stringify(editado) !== JSON.stringify(delServidor));

  const guardar = useMutation({
    mutationFn: (c: Catalogo) => api.put<Catalogo>('/catalogo', c),
    onSuccess: (c) => {
      queryClient.setQueryData(['catalogo'], c);
      setEditado(null);
      toast.success('Catálogo guardado: Dali lo usa desde el próximo mensaje');
    },
    onError: () => toast.error('No se pudo guardar el catálogo'),
  });
  const enviar = () => catalogo && guardar.mutate(catalogo);
  const descartar = () => {
    setEditado(null);
    setEditando(null);
  };

  useAccionesDeBarra(
    <>
      <Link
        to="/importar"
        className="inline-flex h-11 items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 font-body text-[15px] font-semibold text-stone-800 hover:bg-stone-50"
      >
        <Icon name="upload_file" className="text-xl" /> Importar desde Excel
      </Link>
      <button
        type="button"
        onClick={enviar}
        disabled={!hayCambios || guardar.isPending}
        className="inline-flex h-11 items-center gap-2 rounded-xl bg-teal-700 px-5 font-body text-[15px] font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
      >
        <Icon name="check" className="text-xl" /> {guardar.isPending ? 'Guardando…' : 'Guardar cambios'}
      </button>
    </>,
    [hayCambios, guardar.isPending, catalogo]
  );

  if (isPending || !catalogo) return <CatalogoEsqueleto />;
  const set = (c: Catalogo) => setEditado(c);
  const items = catalogo.items;
  const categorias = [...new Set(items.map((i) => i.categoria).filter(Boolean))];
  const q = busqueda.trim().toLowerCase();
  const visibles = items.filter((i) => (!categoria || i.categoria === categoria) && (!q || [i.nombre, i.sku, i.descripcion, i.categoria].some((t) => t.toLowerCase().includes(q))));
  const aplicarItem = (item: ItemCatalogo) => {
    set({ ...catalogo, items: items.some((i) => i.id === item.id) ? items.map((i) => (i.id === item.id ? item : i)) : [...items, item] });
    setEditando(null);
  };
  const quitarItem = (id: string) => {
    set({ ...catalogo, items: items.filter((i) => i.id !== id) });
    setEditando(null);
  };
  const cambiarDisponible = (item: ItemCatalogo, disponible: boolean) => set({ ...catalogo, items: items.map((i) => (i.id === item.id ? { ...i, disponible } : i)) });

  return (
    <div className={cn('md:px-6 md:pb-10 xl:px-10', editando && 'lg:grid lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-6 xl:grid-cols-[minmax(0,1fr)_500px]')}>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-stone-200 bg-white/95 px-3 py-2 backdrop-blur-md md:hidden">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-teal-800 font-headline text-xs font-bold text-white">
            {(inicio?.empresa.nombre ?? 'D').slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-headline text-lg font-bold leading-tight tracking-tight text-stone-900">{inicio?.empresa.nombre ?? '…'}</h1>
            <p className="truncate font-body text-sm text-stone-500">{[inicio?.empresa.rubro, inicio?.empresa.ciudad].filter(Boolean).join(' · ') || 'Catálogo'}</p>
          </div>
          <Link to="/notificaciones" aria-label="Notificaciones" className="flex size-11 shrink-0 items-center justify-center rounded-full text-stone-700 hover:bg-stone-100">
            <Icon name="notifications" className="text-2xl" />
          </Link>
        </header>

        <div className="px-4 pt-4 md:px-0 md:pt-6 xl:pt-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-headline text-3xl font-bold tracking-tight text-stone-900 xl:text-4xl">Catálogo</h1>
                <StatusPill tono={items.length ? 'teal' : 'stone'} punto={false} className="text-sm">
                  {items.length} {items.length === 1 ? 'ítem registrado' : 'ítems registrados'}
                </StatusPill>
                <span className={cn('hidden items-center gap-1.5 font-body text-sm md:inline-flex', hayCambios ? 'text-amber-700' : 'text-teal-800')}>
                  <span className={cn('size-2 rounded-full', hayCambios ? 'bg-amber-500' : 'bg-teal-600')} /> {hayCambios ? 'Sin guardar' : 'Sincronizado'}
                </span>
              </div>
              <p className="mt-1.5 max-w-xl font-body text-[15px] leading-relaxed text-stone-500 xl:text-lg">
                Lo que vendes, para que Dali lo conozca. Los precios solo se muestran si lo permites.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditando(itemNuevo())}
              className="hidden h-12 items-center gap-2 rounded-xl bg-teal-700 px-5 font-headline text-[15px] font-bold text-white hover:bg-teal-800 md:inline-flex"
            >
              <Icon name="add" className="text-xl" /> Agregar ítem
            </button>
          </div>
          <div className="mt-4 space-y-3 md:hidden">
            <button
              type="button"
              onClick={() => setEditando(itemNuevo())}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 font-headline text-[15px] font-bold text-white"
            >
              <Icon name="add" className="text-xl" /> Agregar ítem nuevo
            </button>
            <Link
              to="/importar"
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white font-body text-[15px] font-semibold text-stone-800"
            >
              <Icon name="upload_file" className="text-xl" /> Importar catálogo desde Excel
            </Link>
          </div>
        </div>

        <div className="space-y-4 px-4 pb-32 pt-5 md:px-0 md:pb-0 md:pt-6">
          <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm md:p-5">
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-700">
                <Icon name="attach_money" className="text-2xl" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-headline text-lg font-bold tracking-tight text-stone-900">
                    <span className="md:hidden">¿Dali puede dar precios?</span>
                    <span className="hidden md:inline">Política de precios en WhatsApp</span>
                  </h2>
                  <StatusPill tono={catalogo.dicePrecios ? 'teal' : 'stone'} punto={false} className="hidden md:inline-flex">
                    {catalogo.dicePrecios ? 'Precios referenciales visibles' : 'Modo cotizador privado activo'}
                  </StatusPill>
                </div>
                <p className="mt-1.5 font-body text-[15px] leading-relaxed text-stone-600">
                  <span className="font-semibold text-stone-800">{catalogo.dicePrecios ? 'Encendido:' : 'Apagado:'}</span>{' '}
                  {catalogo.dicePrecios
                    ? 'Dali dice el precio referencial del ítem que le pregunten, aclarando que el asesor lo confirma con la cotización.'
                    : 'Dali responde a los clientes que un asesor comercial enviará la cotización formal según volumen y ubicación. Enciéndelo solo si tus tarifas son fijas e invariables.'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="hidden font-body text-[15px] text-stone-700 md:inline">Dali puede decir precios</span>
                <Interruptor
                  checked={catalogo.dicePrecios}
                  onChange={(dicePrecios) => set({ ...catalogo, dicePrecios })}
                  label={catalogo.dicePrecios ? 'Ocultar los precios' : 'Permitir que Dali diga precios'}
                />
              </div>
            </div>
          </section>

          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <label className="relative md:w-72">
              <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl text-stone-400" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por ítem, código o especificación…"
                aria-label="Buscar"
                className="h-12 w-full rounded-xl border border-stone-200 bg-white pl-12 pr-4 font-body text-[15px] text-stone-900 outline-none placeholder:text-stone-400 focus:border-teal-500"
              />
            </label>
            <div role="tablist" aria-label="Categoría" className="flex gap-2 overflow-x-auto">
              {[['', `Todas (${items.length})`], ...categorias.map((c) => [c, `${c} (${items.filter((i) => i.categoria === c).length})`])].map(([valor, label]) => (
                <button
                  key={valor}
                  type="button"
                  role="tab"
                  aria-selected={categoria === valor}
                  onClick={() => setCategoria(valor)}
                  className={cn(
                    'h-11 shrink-0 whitespace-nowrap rounded-xl border px-4 font-body text-[15px]',
                    categoria === valor ? 'border-teal-600 bg-teal-50 font-semibold text-teal-800' : 'border-stone-200 bg-white text-stone-600'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {visibles.length ? (
            <>
              <section className="hidden overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm md:block">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-stone-200 bg-stone-50 text-left font-label text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">
                      <th className="px-4 py-3">#</th>
                      <th className="px-4 py-3">Ítem / producto</th>
                      <th className="px-4 py-3">Categoría</th>
                      <th className="px-4 py-3">Unidad</th>
                      <th className="px-4 py-3 text-right">Referencia</th>
                      <th className="px-4 py-3 text-center">Disponible</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {visibles.map((i, n) => (
                      <tr key={i.id} className={cn('transition-colors', editando?.id === i.id ? 'bg-teal-50/60' : 'hover:bg-stone-50')}>
                        <td className="px-4 py-3 font-mono text-sm text-stone-400">{String(n + 1).padStart(2, '0')}</td>
                        <td className="px-4 py-3">
                          <button type="button" onClick={() => setEditando(i)} className="text-left">
                            <span className="block font-body text-[15px] font-semibold text-stone-900 hover:text-teal-800">
                              {i.nombre}{' '}
                              {editando?.id === i.id && (
                                <StatusPill tono="teal" punto={false} className="ml-1 align-middle">
                                  Editando
                                </StatusPill>
                              )}
                            </span>
                            {i.sku && <span className="font-mono text-xs text-stone-500">SKU: {i.sku}</span>}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          {i.categoria && <span className="inline-flex rounded-lg bg-stone-100 px-2.5 py-1 font-body text-sm text-stone-700">{i.categoria}</span>}
                        </td>
                        <td className="px-4 py-3 font-mono text-sm text-stone-700">{i.unidad}</td>
                        <td className="px-4 py-3 text-right font-mono text-sm text-stone-900">
                          {i.precio !== undefined ? precioLegible(i.precio) : <span className="text-stone-400">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Interruptor
                            checked={i.disponible}
                            onChange={(v) => cambiarDisponible(i, v)}
                            label={i.disponible ? `Marcar ${i.nombre} como no disponible` : `Marcar ${i.nombre} como disponible`}
                            className="mx-auto"
                          />
                        </td>
                        <td className="px-2 py-3">
                          <button
                            type="button"
                            aria-label={`Editar ${i.nombre}`}
                            onClick={() => setEditando(i)}
                            className="flex size-10 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-teal-800"
                          >
                            <Icon name="edit" className="text-xl" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
              <div className="space-y-3 md:hidden">
                {visibles.map((i) => (
                  <article key={i.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-headline text-[15px] font-bold text-stone-900">{i.nombre}</h3>
                        <p className="mt-1 font-body text-sm text-stone-500">
                          {i.categoria && <span className="rounded-md bg-stone-100 px-2 py-0.5">{i.categoria}</span>} {i.unidad && <span>Por {i.unidad}</span>}
                        </p>
                        <p className="mt-1.5 font-mono text-sm text-stone-700">Ref. {i.precio !== undefined ? precioLegible(i.precio) : '—'}</p>
                      </div>
                      <button type="button" onClick={() => setEditando(i)} className="shrink-0 font-body text-[15px] font-semibold text-teal-800">
                        Editar
                      </button>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-stone-100 pt-3">
                      <span className={cn('flex items-center gap-1.5 font-body text-sm', i.disponible ? 'text-stone-600' : 'text-amber-800')}>
                        <span className={cn('size-2 rounded-full', i.disponible ? 'bg-teal-600' : 'bg-amber-500')} />{' '}
                        {i.disponible ? 'Disponible para cotizar' : 'Bajo pedido especial'}
                      </span>
                      <Interruptor
                        checked={i.disponible}
                        onChange={(v) => cambiarDisponible(i, v)}
                        label={i.disponible ? `Marcar ${i.nombre} como no disponible` : `Marcar ${i.nombre} como disponible`}
                      />
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-8 text-center">
              <Icon name="menu_book" className="text-4xl text-stone-300" />
              <p className="mt-2 font-body text-[15px] text-stone-600">
                {items.length
                  ? 'Ningún ítem coincide con la búsqueda.'
                  : 'Todavía no hay ítems. Agrega lo que vendes para que Dali lo nombre bien; los precios solo si quieres que los diga.'}
              </p>
              {!items.length && (
                <button
                  type="button"
                  onClick={() => setEditando(itemNuevo())}
                  className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-teal-700 px-4 font-body text-[15px] font-semibold text-white"
                >
                  <Icon name="add" className="text-xl" /> Agregar ítem
                </button>
              )}
            </div>
          )}
        </div>

        {hayCambios && (
          <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,16px)+64px)] z-30 mx-auto flex w-full max-w-[390px] gap-3 border-t border-stone-200 bg-white px-4 py-3 md:hidden">
            <button
              type="button"
              onClick={enviar}
              disabled={guardar.isPending}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-teal-700 font-headline text-[15px] font-bold text-white disabled:bg-stone-300"
            >
              <Icon name="check" className="text-xl" /> {guardar.isPending ? 'Guardando…' : 'Guardar cambios'}
            </button>
            <button type="button" onClick={descartar} className="h-12 rounded-full border border-stone-300 bg-white px-5 font-body text-[15px] font-semibold text-stone-800">
              Descartar
            </button>
          </div>
        )}
      </div>

      {editando && (
        <EditorItem
          item={editando}
          dicePrecios={catalogo.dicePrecios}
          categorias={categorias}
          esNuevo={!items.some((i) => i.id === editando.id)}
          onGuardar={aplicarItem}
          onEliminar={() => quitarItem(editando.id)}
          onCerrar={() => setEditando(null)}
        />
      )}
    </div>
  );
}

function CatalogoEsqueleto() {
  return (
    <div className="md:px-6 xl:px-10" aria-busy="true">
      <div className="h-14 border-b border-stone-200 bg-white md:hidden" />
      <div className="px-4 pt-6 md:px-0 xl:pt-8">
        <div className="h-9 w-48 animate-pulse rounded-lg bg-stone-200" />
        <div className="mt-3 h-4 w-80 max-w-full animate-pulse rounded bg-stone-200" />
        <div className="mt-6 space-y-4">
          {[140, 420].map((h, i) => (
            <div key={i} className="animate-pulse rounded-2xl border border-stone-200 bg-white" style={{ height: h }} />
          ))}
        </div>
      </div>
    </div>
  );
}
