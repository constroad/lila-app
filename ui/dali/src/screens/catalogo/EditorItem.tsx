import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { Interruptor } from '@/components/Interruptor';
import { StatusPill } from '@/components/StatusPill';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { ItemCatalogo } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * «Editar ítem» (A12): panel a la derecha desde tablet, hoja desde abajo en
 * móvil. Trabaja sobre una copia y «Guardar ítem» la pone en la lista (el
 * catálogo entero se guarda en la pantalla).
 */
export const UNIDADES = ['m³', 'm²', 'tonelada', 'galón', 'unidad', 'viaje', 'hora', 'día', 'metro lineal'];

export const itemNuevo = (): ItemCatalogo => ({ id: `item-${Date.now().toString(36)}`, sku: '', nombre: '', categoria: '', unidad: 'm³', disponible: true, descripcion: '' });

export const precioLegible = (precio: number): string => `S/ ${Number.isInteger(precio) ? precio : precio.toFixed(2)}`;

export function EditorItem({
  item: inicial,
  dicePrecios,
  categorias,
  esNuevo,
  onGuardar,
  onEliminar,
  onCerrar,
}: {
  item: ItemCatalogo;
  dicePrecios: boolean;
  categorias: string[];
  esNuevo: boolean;
  onGuardar: (i: ItemCatalogo) => void;
  onEliminar: () => void;
  onCerrar: () => void;
}) {
  const [item, setItem] = useState<ItemCatalogo>(() => structuredClone(inicial));
  const [precio, setPrecio] = useState(inicial.precio !== undefined ? String(inicial.precio) : '');
  const [error, setError] = useState<string | null>(null);
  const guardar = () => {
    if (!item.nombre.trim()) {
      setError('Ponle nombre al ítem');
      return;
    }
    const n = precio.trim() ? Number(precio.replace(',', '.')) : undefined;
    if (precio.trim() && (!Number.isFinite(n) || n! < 0)) {
      setError('El precio tiene que ser un número');
      return;
    }
    onGuardar({ ...item, nombre: item.nombre.trim(), ...(n !== undefined ? { precio: Math.round(n * 100) / 100 } : {}) });
  };
  return (
    <>
      <div className="fixed inset-0 z-40 bg-stone-900/40 lg:hidden" onClick={onCerrar} aria-hidden="true" />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={esNuevo ? 'Nuevo ítem' : `Editar ${inicial.nombre}`}
        className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-[390px] flex-col rounded-t-3xl bg-white shadow-2xl md:inset-y-0 md:right-0 md:left-auto md:mx-0 md:max-h-none md:w-[500px] md:max-w-none md:rounded-none lg:sticky lg:top-6 lg:z-auto lg:mt-6 lg:max-h-[calc(100dvh-3rem)] lg:w-auto lg:self-start lg:rounded-2xl lg:border lg:border-stone-200 lg:shadow-sm"
      >
        <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-stone-300 md:hidden" />
        <div className="flex items-start justify-between gap-3 border-b border-stone-200 px-4 py-4 md:px-6">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 font-headline text-xl font-bold tracking-tight text-stone-900">
              {esNuevo ? 'Nuevo ítem' : 'Editar ítem'}
              {item.sku && <span className="rounded-md bg-stone-100 px-2 py-0.5 font-mono text-xs font-semibold text-stone-600">{item.sku}</span>}
            </h2>
            <p className="mt-0.5 font-body text-sm text-stone-500">Dali usará estos datos para orientar a tus clientes.</p>
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
          <label className="block">
            <span className="font-body text-[15px] font-semibold text-stone-800">
              Nombre del producto o servicio <span className="text-amber-600">*</span>
            </span>
            <Input
              autoFocus
              value={item.nombre}
              maxLength={80}
              aria-invalid={Boolean(error && !item.nombre.trim())}
              onChange={(e) => setItem({ ...item, nombre: e.target.value })}
              placeholder="Mezcla asfáltica en caliente"
              className={CAMPO}
            />
            <span className="mt-1.5 block font-body text-sm text-stone-500">Así lo mencionará Dali en las respuestas y resúmenes de cotización.</span>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="font-body text-[15px] font-semibold text-stone-800">Categoría</span>
              <Input
                list="categorias-catalogo"
                value={item.categoria}
                maxLength={40}
                onChange={(e) => setItem({ ...item, categoria: e.target.value })}
                placeholder="Mezcla asfáltica"
                className={CAMPO}
              />
              <datalist id="categorias-catalogo">
                {categorias.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
            <label className="block">
              <span className="font-body text-[15px] font-semibold text-stone-800">Unidad de medida</span>
              <span className="relative mt-2 block">
                <select
                  value={UNIDADES.includes(item.unidad) ? item.unidad : 'otra'}
                  onChange={(e) => setItem({ ...item, unidad: e.target.value === 'otra' ? '' : e.target.value })}
                  className="h-12 w-full appearance-none rounded-xl border border-stone-200 bg-white px-4 pr-10 font-body text-base text-stone-900"
                >
                  {UNIDADES.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                  <option value="otra">Otra…</option>
                </select>
                <Icon name="expand_more" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xl text-stone-400" />
              </span>
              {!UNIDADES.includes(item.unidad) && (
                <Input
                  value={item.unidad}
                  maxLength={20}
                  onChange={(e) => setItem({ ...item, unidad: e.target.value })}
                  placeholder="Escribe la unidad"
                  className={cn(CAMPO, 'mt-2')}
                  aria-label="Otra unidad"
                />
              )}
            </label>
          </div>
          <label className="block">
            <span className="flex items-center justify-between font-body text-[15px] font-semibold text-stone-800">
              Precio unitario referencial (S/) <span className="font-mono text-xs font-normal text-teal-800">Incluye IGV</span>
            </span>
            <span className="relative mt-2 block">
              <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center font-mono text-sm text-stone-500">S/</span>
              <Input
                inputMode="decimal"
                value={precio}
                onChange={(e) => setPrecio(e.target.value)}
                placeholder="0.00"
                className={cn(CAMPO, 'mt-0 pl-10 font-mono')}
                aria-label="Precio referencial"
              />
            </span>
            <span className={cn('mt-2 flex items-start gap-1.5 rounded-lg px-3 py-2 font-body text-sm', dicePrecios ? 'bg-teal-50 text-teal-900' : 'bg-amber-50 text-amber-900')}>
              <Icon name="info" className="mt-0.5 shrink-0 text-base" />{' '}
              {dicePrecios
                ? 'Visible al cliente: Dali lo dice como referencial cuando pregunten por este ítem.'
                : 'Oculto al cliente por la política de precios; solo lo ve tu equipo.'}
            </span>
          </label>
          <div className="flex items-center justify-between gap-4 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
            <div>
              <p className="font-body text-[15px] font-semibold text-stone-900">Disponible para cotizar</p>
              <p className="font-body text-sm text-stone-500">Si lo desactivas, Dali avisa que está bajo pedido especial.</p>
            </div>
            <Interruptor
              checked={item.disponible}
              onChange={(disponible) => setItem({ ...item, disponible })}
              label={item.disponible ? 'Marcar como no disponible' : 'Marcar como disponible'}
            />
          </div>
          <label className="block">
            <span className="flex items-center justify-between font-body text-[15px] font-semibold text-stone-800">
              Descripción técnica para Dali y el cliente <span className="font-mono text-xs font-normal text-stone-500">{item.descripcion.length} / 300</span>
            </span>
            <Textarea
              value={item.descripcion}
              maxLength={300}
              onChange={(e) => setItem({ ...item, descripcion: e.target.value })}
              placeholder="Mezcla densa en caliente colocada a 140–160 °C. Para tráfico pesado y estacionamientos."
              className="mt-2 min-h-[96px] rounded-xl border-stone-200 px-4 py-3 font-body text-base leading-relaxed md:text-base"
            />
          </label>
          <label className="block">
            <span className="font-body text-[15px] font-semibold text-stone-800">Código (SKU), opcional</span>
            <Input value={item.sku} maxLength={30} onChange={(e) => setItem({ ...item, sku: e.target.value })} placeholder="ASF-MAC-01" className={cn(CAMPO, 'font-mono')} />
          </label>
          <div className="rounded-xl border border-teal-100 bg-teal-50 px-4 py-3">
            <p className="flex items-center gap-2 font-body text-[15px] font-semibold text-teal-900">
              <Icon name="smart_toy" className="text-xl" /> Consejo de Dali
            </p>
            <p className="mt-1 font-body text-sm text-teal-900/90">
              Usaré la descripción para responder dudas cuando los clientes pregunten por este ítem en WhatsApp. Las fotos vendrán más adelante.
            </p>
          </div>
          {error && (
            <p className="font-body text-sm text-red-700" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-stone-200 px-4 py-3 md:px-6 md:py-4">
          {!esNuevo ? (
            <button type="button" onClick={onEliminar} className="inline-flex min-h-11 items-center gap-1.5 font-body text-[15px] font-semibold text-red-700 hover:underline">
              <Icon name="delete_outline" className="text-xl" /> Eliminar ítem
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button type="button" onClick={onCerrar} className="h-11 rounded-xl border border-stone-200 px-4 font-body text-[15px] font-semibold text-stone-800 hover:bg-stone-50">
              Cancelar
            </button>
            <button type="button" onClick={guardar} className="h-11 rounded-xl bg-teal-700 px-5 font-body text-[15px] font-semibold text-white hover:bg-teal-800">
              Guardar ítem
            </button>
          </div>
        </div>
        {!esNuevo && (
          <StatusPill tono="teal" punto={false} className="sr-only">
            Editando
          </StatusPill>
        )}
      </section>
    </>
  );
}

const CAMPO = 'mt-2 h-12 rounded-xl border-stone-200 bg-white px-4 font-body text-base text-stone-900 placeholder:text-stone-400 md:text-base';
