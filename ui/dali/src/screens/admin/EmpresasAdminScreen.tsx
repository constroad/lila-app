import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { ESTADO_ASISTENTE } from '@/lib/estados';
import { haceCuanto, iniciales, telefonoLegible } from '@/lib/format';
import { entrarAEmpresa } from '@/lib/operador';
import type { EmpresaAdmin, EstadoAsistenteAdmin, ResumenEmpresas } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/Icon';
import { Input } from '@/components/ui/input';
import { NuevaEmpresa } from './NuevaEmpresa';
import { BotonPrimario, CabeceraAdmin, PillAsistente, PillLinea, Uso } from './piezas';

/**
 * S1 «Empresas» (diseños `S1-admin-empresas` móvil, tablet y escritorio):
 * todas las empresas de Dali con su línea, lo que hace su asistente, el uso
 * del mes y el último mensaje. Búsqueda por nombre, rubro o número; chips
 * por rubro; en escritorio además el filtro por estado y la tabla; en móvil
 * y tablet, tarjetas. «Abrir panel» entra al panel de esa empresa con una
 * sesión de dueño a nombre del operador. El plan es el piloto para todas
 * (sin precios); «Avisar al dueño» del diseño no está: es un envío por
 * WhatsApp y no sale desde acá.
 */
type FiltroEstado = 'todos' | EstadoAsistenteAdmin | 'sin-conectar';

const cabe = (e: EmpresaAdmin, q: string): boolean => {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  return [e.nombre, e.companyId, e.rubro, e.ciudad, e.linea.numero, telefonoLegible(e.linea.numero)].some((v) => v.toLowerCase().includes(t));
};

export function EmpresasAdminScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isPending, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'empresas'],
    queryFn: () => api.get<{ empresas: EmpresaAdmin[]; resumen: ResumenEmpresas }>('/admin/empresas'),
    staleTime: 30_000,
  });
  const [q, setQ] = useState('');
  const [rubro, setRubro] = useState('todos');
  const [estado, setEstado] = useState<FiltroEstado>('todos');
  const [nueva, setNueva] = useState(false);
  const empresas = useMemo(() => data?.empresas ?? [], [data]);
  const rubros = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const e of empresas) cuenta.set(e.rubro || 'Otro', (cuenta.get(e.rubro || 'Otro') ?? 0) + 1);
    return [...cuenta.entries()];
  }, [empresas]);
  const visibles = empresas.filter(
    (e) =>
      cabe(e, q) &&
      (rubro === 'todos' || (e.rubro || 'Otro') === rubro) &&
      (estado === 'todos' || (estado === 'sin-conectar' ? e.linea.estado !== 'conectado' : e.asistente === estado))
  );
  const abrir = async (e: EmpresaAdmin) => {
    try {
      await entrarAEmpresa(queryClient, e.companyId);
      navigate('/inicio');
    } catch {
      toast.error(`No se pudo entrar al panel de ${e.nombre}`);
    }
  };
  const r = data?.resumen;

  return (
    <div className="pb-8">
      <CabeceraAdmin
        miga="Directorio de empresas"
        titulo="Empresas"
        chip={r && <span className="rounded-lg bg-stone-200 px-2 py-0.5 font-body text-sm font-semibold text-stone-700 md:text-base">{r.total} total</span>}
        subtitulo={
          r && (
            <p className="flex flex-wrap items-center gap-x-1.5">
              <span className="font-semibold text-emerald-700">{r.atendiendo} atendiendo</span> · <span>{r.pausadas} pausadas</span> ·{' '}
              <span className={cn(r.sinConectar > 0 && 'font-semibold text-red-700')}>{r.sinConectar} sin conectar</span>
              {r.suspendidas > 0 && <span className="text-stone-500"> · {r.suspendidas} suspendidas</span>}
            </p>
          )
        }
        acciones={
          <BotonPrimario onClick={() => setNueva(true)} className="h-12 px-5">
            <Icon name="add" className="text-xl" /> <span className="md:hidden">Nueva</span>
            <span className="hidden md:inline">Nueva empresa</span>
          </BotonPrimario>
        }
      />

      <div className="mt-4 px-4 md:mt-6 md:px-6 xl:px-10">
        <div className="flex flex-col gap-3 md:rounded-2xl md:border md:border-stone-200 md:bg-white md:p-4 md:shadow-sm xl:flex-row xl:items-center">
          <label className="relative block flex-1">
            <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl text-stone-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por empresa, rubro o WhatsApp…"
              className="h-12 rounded-full border-stone-200 bg-white pl-12 font-body text-base shadow-none md:text-base xl:rounded-xl"
            />
          </label>
          <div className="hidden items-center gap-2 xl:flex">
            <select
              value={rubro}
              onChange={(e) => setRubro(e.target.value)}
              className="h-12 rounded-xl border border-stone-200 bg-white px-3 font-body text-[15px] text-stone-800"
              aria-label="Rubro"
            >
              <option value="todos">Todos los rubros ({empresas.length})</option>
              {rubros.map(([nombre, n]) => (
                <option key={nombre} value={nombre}>
                  {nombre} ({n})
                </option>
              ))}
            </select>
            <select
              value={estado}
              onChange={(e) => setEstado(e.target.value as FiltroEstado)}
              className="h-12 rounded-xl border border-stone-200 bg-white px-3 font-body text-[15px] text-stone-800"
              aria-label="Estado"
            >
              <option value="todos">Todos los estados</option>
              {(Object.keys(ESTADO_ASISTENTE) as EstadoAsistenteAdmin[]).map((k) => (
                <option key={k} value={k}>
                  {ESTADO_ASISTENTE[k].texto}
                </option>
              ))}
              <option value="sin-conectar">Sin conectar</option>
            </select>
            <button
              type="button"
              onClick={() => void refetch()}
              aria-label="Actualizar"
              className="flex size-12 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
            >
              <Icon name="refresh" className={cn('text-xl', isFetching && 'animate-spin')} />
            </button>
          </div>
        </div>
        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0 xl:hidden [scrollbar-width:none]">
          {[['todos', 'Todos', empresas.length] as const, ...rubros.map(([n, c]) => [n, n, c] as const)].map(([valor, label, n]) => (
            <button
              key={valor}
              type="button"
              onClick={() => setRubro(valor)}
              className={cn(
                'shrink-0 rounded-full border px-4 py-2 font-body text-[15px] font-semibold',
                rubro === valor ? 'border-teal-800 bg-teal-800 text-white' : 'border-stone-200 bg-white text-stone-700'
              )}
            >
              {label} ({n})
            </button>
          ))}
        </div>
      </div>

      {isPending ? (
        <div className="mt-4 space-y-3 px-4 md:px-6 xl:px-10" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl border border-stone-200 bg-white" />
          ))}
        </div>
      ) : visibles.length === 0 ? (
        <div className="mx-4 mt-4 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center md:mx-6 xl:mx-10">
          <Icon name="apartment" className="text-4xl text-stone-300" />
          <p className="font-headline text-lg font-semibold text-stone-800">{empresas.length ? 'Ninguna empresa coincide' : 'Todavía no hay empresas en Dali'}</p>
          <p className="max-w-sm font-body text-sm text-stone-500">
            {empresas.length ? 'Prueba con otro nombre, rubro o número.' : 'Da de alta a la primera con «Nueva empresa».'}
          </p>
        </div>
      ) : (
        <>
          <ul className="mt-4 space-y-3 px-4 md:px-6 xl:hidden">
            {visibles.map((e) => (
              <li key={e.companyId}>
                <TarjetaEmpresa empresa={e} onAbrir={() => void abrir(e)} />
              </li>
            ))}
          </ul>
          <div className="mt-4 hidden px-10 xl:block">
            <TablaEmpresas empresas={visibles} total={empresas.length} onAbrir={(e) => void abrir(e)} />
          </div>
        </>
      )}
      {nueva && <NuevaEmpresa onCerrar={() => setNueva(false)} />}
    </div>
  );
}

function TarjetaEmpresa({ empresa: e, onAbrir }: { empresa: EmpresaAdmin; onAbrir: () => void }) {
  const caida = e.linea.estado !== 'conectado';
  return (
    <article className={cn('rounded-2xl border bg-white p-4 shadow-sm', caida ? 'border-amber-200' : 'border-stone-200')}>
      <div className="flex items-start gap-3">
        <div className="hidden size-12 shrink-0 items-center justify-center rounded-xl bg-teal-800 font-headline text-sm font-bold text-white md:flex">{iniciales(e.nombre)}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/admin/empresas/${e.companyId}`} className="font-headline text-lg font-bold text-stone-900 hover:underline">
              {e.nombre}
            </Link>
            <PillLinea estado={e.linea.estado} />
            <span className="ml-auto font-body text-sm text-stone-500 md:hidden">{e.ultimoMensaje ? haceCuanto(Date.parse(e.ultimoMensaje)) : '—'}</span>
            <PillAsistente estado={e.asistente} className="ml-auto hidden md:inline-flex" />
          </div>
          <p className="mt-1 font-body text-[15px] text-stone-500">
            {e.rubro || 'Sin rubro'} · <span className="font-mono">{e.linea.numero ? telefonoLegible(e.linea.numero) : 'Sin línea vinculada'}</span>
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-stone-50 px-3 py-2.5 md:hidden">
        <PillAsistente estado={e.asistente} />
        <span className="font-mono text-sm text-stone-700">
          {e.uso.mensajesMes.toLocaleString('es-PE')}
          {e.uso.limite > 0 ? ` / ${e.uso.limite.toLocaleString('es-PE')}` : ''} msjs
        </span>
      </div>
      <div className="mt-3 hidden border-t border-stone-200 pt-3 md:grid md:grid-cols-2 md:gap-4">
        <div>
          <p className="font-body text-sm text-stone-500">Plan / consumo</p>
          <p className="font-body text-[15px] text-stone-800">Piloto · {e.uso.mensajesMes.toLocaleString('es-PE')} msjs este mes</p>
          {e.uso.limite > 0 && (
            <div className="mt-1.5 max-w-xs">
              <Uso usados={e.uso.mensajesMes} limite={e.uso.limite} compacto />
            </div>
          )}
        </div>
        <div className="text-right">
          <p className="font-body text-sm text-stone-500">Último msj: {e.ultimoMensaje ? haceCuanto(Date.parse(e.ultimoMensaje)) : '—'}</p>
          <button type="button" onClick={onAbrir} className="mt-1 inline-flex min-h-11 items-center gap-1.5 font-body text-[15px] font-semibold text-teal-800 hover:underline">
            Abrir panel <Icon name="open_in_new" className="text-lg" />
          </button>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between md:hidden">
        <span className="font-body text-sm text-stone-500">
          Piloto · {e.miembros} {e.miembros === 1 ? 'miembro' : 'miembros'}
        </span>
        <button type="button" onClick={onAbrir} className="inline-flex min-h-11 items-center gap-1.5 font-body text-[15px] font-semibold text-teal-800">
          Abrir panel <Icon name="arrow_forward" className="text-lg" />
        </button>
      </div>
    </article>
  );
}

function TablaEmpresas({ empresas, total, onAbrir }: { empresas: EmpresaAdmin[]; total: number; onAbrir: (e: EmpresaAdmin) => void }) {
  const navigate = useNavigate();
  return (
    <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm">
      <table className="w-full min-w-[1040px] border-collapse text-left">
        <thead>
          <tr className="border-b border-stone-200 font-label text-[12px] font-semibold uppercase tracking-[0.1em] text-stone-500">
            {['Empresa', 'Rubro', 'Línea WhatsApp', 'Estado asistente', 'Plan', 'Uso del mes', 'Último mensaje', 'Acciones'].map((h) => (
              <th key={h} className={cn('whitespace-nowrap px-3 py-3', h === 'Acciones' && 'text-right')}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {empresas.map((e) => (
            <tr key={e.companyId} onClick={() => navigate(`/admin/empresas/${e.companyId}`)} className="cursor-pointer border-b border-stone-100 hover:bg-stone-50">
              <td className="px-3 py-3.5">
                <p className="font-headline text-base font-bold text-stone-900">{e.nombre}</p>
                <p className="whitespace-nowrap font-body text-sm text-stone-500">
                  {e.ciudad || 'Sin ciudad'} · {e.miembros} {e.miembros === 1 ? 'miembro' : 'miembros'}
                </p>
              </td>
              <td className="px-3 py-3.5">
                <span className="whitespace-nowrap rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 font-body text-sm text-stone-700">{e.rubro || 'Sin rubro'}</span>
              </td>
              <td className="px-3 py-3.5">
                <p className="whitespace-nowrap font-mono text-sm text-stone-800">{e.linea.numero ? telefonoLegible(e.linea.numero) : '—'}</p>
                <PillLinea estado={e.linea.estado} className="mt-1 whitespace-nowrap" />
              </td>
              <td className="px-3 py-3.5">
                <PillAsistente estado={e.asistente} className="whitespace-nowrap" />
              </td>
              <td className="whitespace-nowrap px-3 py-3.5">
                <p className="font-body text-[15px] text-stone-800">Piloto</p>
                <p className="font-body text-sm text-stone-500">sin costo</p>
              </td>
              <td className="px-3 py-3.5">
                <div className="w-36">
                  <Uso usados={e.uso.mensajesMes} limite={e.uso.limite} compacto />
                </div>
              </td>
              <td className="whitespace-nowrap px-3 py-3.5 font-mono text-sm text-stone-700">{e.ultimoMensaje ? haceCuanto(Date.parse(e.ultimoMensaje)) : '—'}</td>
              <td className="whitespace-nowrap px-3 py-3.5 text-right">
                <button
                  type="button"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onAbrir(e);
                  }}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-3 font-body text-sm font-semibold text-teal-800 hover:bg-teal-100"
                >
                  Abrir panel <Icon name="open_in_new" className="text-base" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-4 py-3 font-body text-sm text-stone-500">
        Mostrando <b className="font-semibold text-stone-800">{empresas.length}</b> de <b className="font-semibold text-stone-800">{total}</b> empresas
      </p>
    </div>
  );
}
