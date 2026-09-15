import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '@/components/Icon';
import { BrandMark } from '@/components/BrandMark';
import { useSesion } from '@/lib/session';
import { api } from '@/lib/api';
import { iniciales } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Inicio } from '@/lib/types';
import { NAV_MOBILE, NAV_RAIL, NAV_SECTIONS } from './nav';

/**
 * EL CASCARÓN, uno por tamaño, como en los diseños de Stitch (A1 en los tres):
 * - móvil (< 768): la pantalla entera y la barra inferior de cinco pestañas;
 * - tablet (768–1279): rail de 72 px a la izquierda con icono + nombre corto;
 * - escritorio (≥ 1280): sidebar de 256 px con marca, empresa, tres secciones
 *   y la persona abajo.
 * Cada pantalla pone su propio encabezado (en móvil cambia por pantalla).
 */
const ROL: Record<string, string> = { owner: 'Administrador', sales: 'Ventas', viewer: 'Solo lectura', operator: 'Operador' };

export function AppShell() {
  const { yo } = useSesion();
  const { data: inicio } = useQuery({ queryKey: ['inicio'], queryFn: () => api.get<Inicio>('/inicio'), staleTime: 60_000, enabled: Boolean(yo) });
  const contadores = { '/chats': inicio?.atencion.length ?? 0, '/leads': inicio?.metricas.leadsNuevosHoy ?? 0 };
  return (
    <div className="min-h-dvh bg-stone-100 text-stone-900 xl:flex">
      <SidebarEscritorio empresa={inicio?.empresa.nombre} rubro={inicio?.empresa.rubro} contadores={contadores} />
      <RailTablet contadores={contadores} />
      <div className="min-w-0 flex-1 md:pl-[72px] xl:pl-0">
        <main className="mx-auto min-h-dvh w-full max-w-[390px] bg-stone-50 pb-24 shadow-xl md:max-w-none md:bg-stone-100 md:pb-0 md:shadow-none">
          <Outlet />
        </main>
      </div>
      <BarraMovil />
    </div>
  );
}

function SidebarEscritorio({ empresa, rubro, contadores }: { empresa?: string; rubro?: string; contadores: Record<string, number> }) {
  const { yo, salir } = useSesion();
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-stone-200 bg-white xl:flex">
      <div className="flex items-center justify-between px-5 pt-5">
        <div className="flex items-center gap-2.5">
          <BrandMark size="sm" wordmark={false} />
          <span className="font-headline text-xl font-bold tracking-tight">Dali</span>
          <span className="rounded-md border border-teal-200/70 bg-teal-50 px-1.5 py-0.5 font-label text-[10px] font-bold tracking-wider text-teal-800">PERÚ</span>
        </div>
        <Icon name="unfold_more" className="text-lg text-stone-400" />
      </div>
      <div className="mx-5 mt-4 flex items-center gap-3 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5">
        <div className="flex size-10 items-center justify-center rounded-lg bg-stone-900 font-headline text-sm font-bold text-white">{iniciales(empresa || 'D')}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-headline text-sm font-bold">{empresa ?? '…'}</p>
          <p className="truncate font-label text-xs text-stone-500">{rubro || 'Asistente de WhatsApp'}</p>
        </div>
        <span className="size-2.5 rounded-full bg-emerald-500" />
      </div>
      <div className="mt-4 border-t border-stone-200" />
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {NAV_SECTIONS.map((seccion) => (
          <div key={seccion.title} className="mt-5">
            <p className="px-3 pb-2 font-label text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-400">{seccion.title}</p>
            <ul className="space-y-0.5">
              {seccion.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2.5 font-body text-[15px] transition-colors',
                        isActive ? 'bg-teal-50 font-semibold text-teal-900' : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900',
                        item.to === '/probar' && 'text-teal-700'
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon name={item.icon} className={cn('text-[22px]', isActive ? 'text-teal-700' : 'text-stone-500', item.to === '/probar' && 'text-teal-700')} />
                        <span className="flex-1">{item.label}</span>
                        {contadores[item.to] ? (
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 font-mono text-xs font-bold',
                              item.to === '/chats' ? 'bg-amber-100 text-amber-800' : 'bg-teal-100 text-teal-800'
                            )}
                          >
                            {contadores[item.to]}
                          </span>
                        ) : null}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="flex items-center gap-3 border-t border-stone-200 px-5 py-4">
        <div className="flex size-10 items-center justify-center rounded-full bg-stone-900 font-headline text-sm font-bold text-white">{iniciales(yo?.usuario.nombre ?? '?')}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-headline text-sm font-bold">{yo?.usuario.nombre}</p>
          <p className="truncate font-label text-xs text-stone-500">{ROL[yo?.usuario.rol ?? ''] ?? yo?.usuario.rol}</p>
        </div>
        <button
          type="button"
          onClick={() => void salir()}
          aria-label="Salir"
          className="flex size-10 items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-700"
        >
          <Icon name="logout" className="text-xl" />
        </button>
      </div>
    </aside>
  );
}

function RailTablet({ contadores }: { contadores: Record<string, number> }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[72px] flex-col items-center border-r border-stone-200 bg-stone-50 pt-4 md:flex xl:hidden">
      <div className="mb-3 flex size-12 items-center justify-center rounded-full border-2 border-teal-100 bg-teal-800 font-headline text-xl font-bold text-white">D</div>
      <nav className="flex w-full flex-1 flex-col items-stretch gap-1 overflow-y-auto px-1.5 pb-4">
        {NAV_RAIL.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'relative flex flex-col items-center gap-1 rounded-xl px-1 py-2.5 font-label text-[11px] transition-colors',
                isActive ? 'bg-teal-50 font-semibold text-teal-800' : 'text-stone-600 hover:bg-stone-200/60'
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute inset-y-2 -left-1.5 w-1 rounded-full bg-teal-700" />}
                <span className="relative">
                  <Icon name={item.icon} className={cn('text-[24px]', isActive ? 'text-teal-700' : 'text-stone-500')} />
                  {contadores[item.to] ? (
                    <span className="absolute -right-2 -top-1.5 rounded-full bg-amber-600 px-1.5 font-mono text-[10px] font-bold text-white">{contadores[item.to]}</span>
                  ) : null}
                </span>
                <span className="leading-tight">{item.short ?? item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

function BarraMovil() {
  const { pathname } = useLocation();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto flex w-full max-w-[390px] items-stretch border-t border-stone-200 bg-white/95 backdrop-blur-md safe-bottom md:hidden">
      {NAV_MOBILE.map((item) => {
        const activo = item.to === '/mas' ? !NAV_MOBILE.slice(0, 4).some((i) => pathname.startsWith(i.to)) && pathname !== '/inicio' : pathname.startsWith(item.to);
        return (
          <NavLink
            key={item.to}
            to={item.to}
            className={cn('flex flex-1 flex-col items-center gap-0.5 pb-1 pt-2.5 font-label text-[11px] transition-colors', activo ? 'font-bold text-teal-800' : 'text-stone-600')}
          >
            <Icon name={item.icon} className={cn('text-[26px]', activo ? 'text-teal-800' : 'text-stone-600')} />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
