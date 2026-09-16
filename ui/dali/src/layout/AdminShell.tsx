import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MarcaDali } from '@/components/BrandMark';
import { Icon } from '@/components/Icon';
import type { IconName } from '@/components/icon-map';
import { api } from '@/lib/api';
import { iniciales } from '@/lib/format';
import { irAMiEmpresa } from '@/lib/operador';
import { useSesion } from '@/lib/session';
import type { EmpresaAdmin, ResumenEmpresas, SaludAdmin } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * EL CASCARÓN DE LA CONSOLA (S1–S4, diseños `S1-admin-empresas` en los tres
 * tamaños): oscuro, para que nadie confunda la consola con el panel de una
 * empresa. En escritorio, el sidebar con la marca «ADMIN», la máquina
 * (Mac mini · Lima) y las tres entradas —Empresas (con el conteo), Verticales,
 * Salud (con el estado)—, y abajo el operador con «Salir»; en tablet, el
 * rail oscuro; en móvil, la cabecera con «Consola de Dali» y el botón para
 * volver a mi empresa (⇄), más la barra de cuatro pestañas (Empresas,
 * Verticales, Salud, Más). «Cuentas y accesos» del diseño no existe (los
 * accesos son de cada empresa, en su Equipo) y no se dibuja.
 */
interface EntradaAdmin {
  to: string;
  label: string;
  icon: IconName;
}

export const NAV_ADMIN: EntradaAdmin[] = [
  { to: '/admin/empresas', label: 'Empresas', icon: 'apartment' },
  { to: '/admin/verticales', label: 'Verticales', icon: 'account_tree' },
  { to: '/admin/salud', label: 'Salud', icon: 'monitoring' },
];

const TONO_GENERAL: Record<SaludAdmin['general'], string> = { operativo: 'text-emerald-400', atencion: 'text-amber-400', caido: 'text-red-400' };
const TEXTO_GENERAL: Record<SaludAdmin['general'], string> = { operativo: 'Operativo', atencion: 'Atención', caido: 'Caído' };

export function useResumenAdmin() {
  const empresas = useQuery({
    queryKey: ['admin', 'empresas'],
    queryFn: () => api.get<{ empresas: EmpresaAdmin[]; resumen: ResumenEmpresas }>('/admin/empresas'),
    staleTime: 30_000,
  });
  const salud = useQuery({ queryKey: ['admin', 'salud'], queryFn: () => api.get<SaludAdmin>('/admin/salud'), staleTime: 30_000, refetchInterval: 60_000 });
  return { total: empresas.data?.resumen.total, general: salud.data?.general };
}

export function AdminShell() {
  return (
    <div className="min-h-dvh bg-stone-100 text-stone-900 xl:flex">
      <SidebarAdmin />
      <RailAdmin />
      <div className="min-w-0 flex-1 md:pl-[72px] xl:pl-0">
        <CabeceraMovil />
        <main className="mx-auto min-h-dvh w-full max-w-[390px] bg-stone-50 pb-24 md:max-w-none md:bg-stone-100 md:pb-10">
          <Outlet />
        </main>
      </div>
      <BarraMovilAdmin />
    </div>
  );
}

function VolverAMiEmpresa({ className, conTexto = false }: { className?: string; conTexto?: boolean }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const volver = async () => {
    try {
      await irAMiEmpresa(queryClient);
      navigate('/inicio');
    } catch {
      toast.error('No se pudo volver a tu empresa');
    }
  };
  return (
    <button type="button" onClick={() => void volver()} className={className} aria-label={conTexto ? undefined : 'Volver a mi empresa'} title="Volver a mi empresa">
      <Icon name="swap_horiz" className="text-2xl" />
      {conTexto && <span>Volver a mi empresa</span>}
    </button>
  );
}

function SidebarAdmin() {
  const { yo, salir } = useSesion();
  const { total, general } = useResumenAdmin();
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-stone-950 text-stone-200 xl:flex">
      <div className="flex items-center gap-3 px-5 pt-5">
        <MarcaDali className="size-10 text-teal-200" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-headline text-lg font-bold text-white">
            Dali <span className="rounded-md border border-stone-700 px-1.5 py-0.5 font-label text-[10px] font-bold tracking-wider text-stone-300">ADMIN</span>
          </p>
          <p className="truncate font-body text-xs text-stone-400">Consola del operador</p>
        </div>
      </div>
      <div className="mx-5 mt-4 flex items-center justify-between rounded-lg border border-stone-800 bg-stone-900 px-3 py-2 font-mono text-xs">
        <span className="flex items-center gap-2 text-stone-300">
          <span className={cn('size-2 rounded-full', general === 'operativo' ? 'bg-emerald-400' : general === 'caido' ? 'bg-red-400' : 'bg-amber-400')} /> Mac mini (Lima)
        </span>
        <span className={cn('font-semibold', general ? TONO_GENERAL[general] : 'text-stone-500')}>{general ? TEXTO_GENERAL[general] : '…'}</span>
      </div>
      <div className="mt-4 border-t border-stone-800" />
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <p className="mt-5 px-3 pb-2 font-label text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-500">Administración</p>
        <ul className="space-y-0.5">
          {NAV_ADMIN.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 font-body text-[15px] transition-colors',
                    isActive ? 'bg-teal-800 font-semibold text-white' : 'text-stone-300 hover:bg-stone-900 hover:text-white'
                  )
                }
              >
                <Icon name={item.icon} className="text-[22px]" />
                <span className="flex-1">{item.label}</span>
                {item.to === '/admin/empresas' && total !== undefined && (
                  <span className="rounded-full bg-stone-800 px-2 py-0.5 font-mono text-xs font-bold text-stone-200">{total}</span>
                )}
                {item.to === '/admin/salud' && general && <span className={cn('font-mono text-xs font-bold', TONO_GENERAL[general])}>{TEXTO_GENERAL[general]}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <VolverAMiEmpresa conTexto className="mx-3 mb-2 flex items-center gap-3 rounded-lg px-3 py-2.5 font-body text-[15px] text-stone-300 hover:bg-stone-900 hover:text-white" />
      <div className="flex items-center gap-3 border-t border-stone-800 px-5 py-4">
        <div className="flex size-10 items-center justify-center rounded-full bg-stone-800 font-headline text-sm font-bold text-white">{iniciales(yo?.usuario.nombre ?? '?')}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-headline text-sm font-bold text-white">{yo?.usuario.nombre}</p>
          <p className="truncate font-label text-xs text-stone-400">Operador de Dali</p>
        </div>
        <button
          type="button"
          onClick={() => void salir()}
          aria-label="Salir"
          className="flex size-10 items-center justify-center rounded-full text-stone-400 hover:bg-stone-900 hover:text-white"
        >
          <Icon name="logout" className="text-xl" />
        </button>
      </div>
    </aside>
  );
}

function RailAdmin() {
  const { general } = useResumenAdmin();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[72px] flex-col items-center bg-stone-950 pt-4 text-stone-300 md:flex xl:hidden">
      <MarcaDali className="size-12 text-teal-200" />
      <p className="mt-1 font-label text-[10px] font-bold tracking-wider text-teal-300">ADMIN</p>
      <nav className="mt-4 flex w-full flex-1 flex-col items-stretch gap-1 border-t border-stone-800 px-1.5 pb-4 pt-3">
        {NAV_ADMIN.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'relative flex flex-col items-center gap-1 rounded-xl px-1 py-2.5 font-label text-[11px] transition-colors',
                isActive ? 'bg-teal-800 font-bold text-white' : 'text-stone-400 hover:text-white'
              )
            }
          >
            <Icon name={item.icon} className="text-2xl" />
            <span>{item.label}</span>
            {item.to === '/admin/salud' && general && general !== 'operativo' && (
              <span className={cn('absolute right-2 top-2 size-2 rounded-full', general === 'caido' ? 'bg-red-400' : 'bg-amber-400')} />
            )}
          </NavLink>
        ))}
      </nav>
      <VolverAMiEmpresa className="mb-4 flex size-11 items-center justify-center rounded-full text-stone-400 hover:bg-stone-900 hover:text-white" />
    </aside>
  );
}

function CabeceraMovil() {
  const { yo } = useSesion();
  return (
    <header className="sticky top-0 z-30 mx-auto flex h-16 w-full max-w-[390px] items-center justify-between border-b border-stone-200 bg-white px-4 md:hidden">
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative flex size-11 shrink-0 items-center justify-center rounded-full bg-teal-800 font-headline text-sm font-bold text-white">
          {iniciales(yo?.usuario.nombre ?? 'D')}
          <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-white bg-emerald-500" />
        </div>
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate font-headline text-lg font-bold text-stone-900">
            Consola de Dali <span className="rounded-md border border-teal-200/70 bg-teal-50 px-1.5 py-0.5 font-label text-[10px] font-bold tracking-wider text-teal-800">PE</span>
          </p>
          <p className="flex items-center gap-1.5 truncate font-body text-sm text-stone-500">
            <span className="size-1.5 rounded-full bg-emerald-500" /> Lima GMT-5 · Operador
          </p>
        </div>
      </div>
      <VolverAMiEmpresa className="flex size-11 shrink-0 items-center justify-center rounded-full text-stone-700 hover:bg-stone-100" />
    </header>
  );
}

function BarraMovilAdmin() {
  const { pathname } = useLocation();
  const items = [...NAV_ADMIN, { to: '/admin/mas', label: 'Más', icon: 'more_horiz' as IconName }];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto flex w-full max-w-[390px] items-stretch border-t border-stone-200 bg-white/95 backdrop-blur-md safe-bottom md:hidden">
      {items.map((item) => {
        const activo = pathname.startsWith(item.to);
        return (
          <NavLink
            key={item.to}
            to={item.to}
            className={cn('flex flex-1 flex-col items-center gap-0.5 pb-1 pt-2.5 font-label text-[11px] transition-colors', activo ? 'font-bold text-teal-800' : 'text-stone-600')}
          >
            <Icon name={item.icon} className="text-2xl" />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
