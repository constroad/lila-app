import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, api } from '@/lib/api';
import { haceCuanto, horaDe, iniciales, telefonoLegible } from '@/lib/format';
import { DESCRIPCION_ROL, NOMBRE_ROL } from '@/lib/roles';
import { useSesion } from '@/lib/session';
import type { Equipo, Inicio, MiembroEquipo, RolDali } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/Icon';
import { StatusPill } from '@/components/StatusPill';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAccionesDeBarra } from '@/layout/barra';
import { Tarjeta } from '@/screens/asistente/cards';
import { InvitarMiembro } from './InvitarMiembro';

/**
 * A16 «Equipo» (diseños `A16-equipo` móvil, tablet y escritorio): quién entra
 * al panel y quién recibe los avisos. `GET equipo`; el dueño invita (`POST`),
 * cambia rol y avisos (`PATCH`) y quita (`DELETE`); ventas y solo lectura ven
 * la lista. El «Reenviar» de las invitaciones no existe: no se manda nada
 * hasta F2 (la fila pendiente dice cómo entra la persona).
 */
type Rol = Exclude<RolDali, 'operator'>;
const ROLES: Rol[] = ['owner', 'sales', 'viewer'];
const PUNTO_ROL: Record<Rol, string> = { owner: 'bg-teal-600', sales: 'bg-amber-500', viewer: 'bg-slate-500' };
const AVATAR: Record<Rol, string> = { owner: 'bg-stone-900 text-white', sales: 'bg-amber-100 text-amber-900', viewer: 'bg-teal-100 text-teal-900' };
const LIMA = 'America/Lima';

const diaLima = (ms: number): string => new Date(ms).toLocaleDateString('en-CA', { timeZone: LIMA });
/** «Hoy 09:12», «Ayer 18:40», «Hace 5 días», «12 ago». */
const ultimoIngresoLegible = (iso: string, ahoraMs = Date.now()): string => {
  const ms = Date.parse(iso);
  if (diaLima(ms) === diaLima(ahoraMs)) return `Hoy ${horaDe(ms)}`;
  if (diaLima(ms) === diaLima(ahoraMs - 86_400_000)) return `Ayer ${horaDe(ms)}`;
  const dias = Math.round((ahoraMs - ms) / 86_400_000);
  if (dias < 30) return `Hace ${dias} días`;
  return new Date(ms).toLocaleDateString('es-PE', { timeZone: LIMA, day: 'numeric', month: 'short' }).replace('.', '');
};
const identidadLegible = (identidad: string): string => (identidad.includes('@') ? identidad : telefonoLegible(identidad));
const esCelular = (identidad: string): boolean => !identidad.includes('@');

export function EquipoScreen() {
  const { yo } = useSesion();
  const { data: inicio } = useQuery({ queryKey: ['inicio'], queryFn: () => api.get<Inicio>('/inicio'), staleTime: 60_000 });
  const { data: equipo, isPending } = useQuery({ queryKey: ['equipo'], queryFn: () => api.get<Equipo>('/equipo') });
  const [invitando, setInvitando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const soyDueno = yo?.usuario.rol === 'owner';
  const empresa = inicio?.empresa.nombre ?? '…';
  const lleno = Boolean(equipo && equipo.cupo.usados >= equipo.cupo.limite);

  useAccionesDeBarra(
    <>
      <Link
        to="/probar"
        className="inline-flex h-11 items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 font-body text-[15px] font-semibold text-stone-800 hover:bg-stone-50"
      >
        <Icon name="play_circle" className="text-xl" /> Probar a Dali
      </Link>
      {soyDueno && (
        <button
          type="button"
          onClick={() => setInvitando(true)}
          disabled={lleno}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-teal-700 px-5 font-body text-[15px] font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
        >
          <Icon name="person_add" className="text-xl" /> Invitar miembro
        </button>
      )}
    </>,
    [soyDueno, lleno]
  );

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (equipo?.miembros ?? []).filter((m) => !q || m.nombre.toLowerCase().includes(q) || m.identidad.toLowerCase().includes(q));
  }, [equipo, busqueda]);

  if (isPending || !equipo) return <EquipoEsqueleto />;
  const { cupo } = equipo;
  const porcentaje = Math.min(100, Math.round((cupo.usados / cupo.limite) * 100));
  const libres = Math.max(0, cupo.limite - cupo.usados);

  return (
    <div className="md:px-6 md:pb-10 xl:px-10">
      <header className="sticky top-0 z-30 flex items-center gap-1 border-b border-stone-200 bg-white/95 px-2 py-2 backdrop-blur-md md:hidden">
        <Link to="/inicio" aria-label="Volver al inicio" className="flex size-11 shrink-0 items-center justify-center rounded-full text-stone-700 hover:bg-stone-100">
          <Icon name="arrow_back" className="text-2xl" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2">
            <span className="truncate rounded-md border border-teal-200/70 bg-teal-50 px-2 py-0.5 font-label text-xs font-bold uppercase tracking-wider text-teal-800">
              {empresa}
            </span>
            <span className={cn('size-2 shrink-0 rounded-full', inicio?.asistente.conectado ? 'bg-emerald-500' : 'bg-stone-400')} />
          </p>
          <p className="truncate font-body text-sm text-stone-500">Asistente Dali</p>
        </div>
        <Link to="/probar" aria-label="Probar a Dali" className="flex size-11 shrink-0 items-center justify-center rounded-full text-stone-700 hover:bg-stone-100">
          <Icon name="help_outline" className="text-2xl" />
        </Link>
      </header>

      <div className="px-4 pt-4 md:px-0 md:pt-6 xl:pt-8">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-headline text-3xl font-bold tracking-tight text-stone-900 xl:text-4xl">Equipo</h1>
            <span className="rounded-full border border-teal-200/70 bg-teal-50 px-3 py-1 font-mono text-sm font-semibold text-teal-800 max-md:border-stone-200 max-md:bg-stone-100 max-md:text-stone-600">
              {cupo.usados} {cupo.usados === 1 ? 'integrante' : 'integrantes'}
            </span>
            <span className="hidden font-body text-[15px] text-stone-500 md:inline">
              ({equipo.activos} {equipo.activos === 1 ? 'activo' : 'activos'} · {equipo.pendientes} {equipo.pendientes === 1 ? 'pendiente' : 'pendientes'})
            </span>
          </div>
        </div>
        <p className="mt-1.5 max-w-2xl font-body text-[15px] leading-relaxed text-stone-500 xl:text-lg">
          Quién puede entrar a este panel y quién recibe los avisos de nuevos prospectos en WhatsApp.
        </p>
        {soyDueno && (
          <button
            type="button"
            onClick={() => setInvitando(true)}
            disabled={lleno}
            className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 font-body text-[15px] font-semibold text-white hover:bg-teal-800 disabled:opacity-50 md:hidden"
          >
            <Icon name="person_add" className="text-xl" /> Invitar miembro
          </button>
        )}
      </div>

      <div className="grid gap-4 px-4 pb-32 pt-4 md:px-0 md:pb-0 md:pt-6 lg:gap-6">
        <Tarjeta className="hidden md:flex md:items-center md:gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700">
            <Icon name="badge" className="text-2xl" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-headline text-base font-bold text-stone-900">
              Piloto · {cupo.usados} de {cupo.limite} accesos utilizados
            </p>
            <p className="font-body text-[15px] text-stone-500">
              {libres === 0
                ? 'No queda espacio: quita a alguien para invitar a otra persona.'
                : `Te ${libres === 1 ? 'queda 1 espacio libre' : `quedan ${libres} espacios libres`} para otra persona del equipo.`}
            </p>
          </div>
          <div className="w-40 shrink-0 text-right">
            <p className="font-mono text-sm text-stone-500">{porcentaje}%</p>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-200">
              <div className="h-full rounded-full bg-teal-700" style={{ width: `${porcentaje}%` }} />
            </div>
          </div>
        </Tarjeta>

        <section className="rounded-2xl border border-teal-100 bg-teal-50/50 p-4 md:border-stone-200 md:bg-stone-50 md:p-5">
          <p className="flex items-center gap-2 font-headline text-base font-bold text-teal-900 md:hidden">
            <Icon name="verified_user" className="text-xl" /> Roles y permisos
          </p>
          <p className="hidden items-center gap-2 font-headline text-base font-bold text-stone-900 md:flex">
            <Icon name="verified_user" className="text-xl text-teal-700" /> Roles y permisos
          </p>
          <ul className="mt-3 space-y-2 md:grid md:grid-cols-3 md:gap-4 md:space-y-0">
            {ROLES.map((r) => (
              <li key={r} className="font-body text-[15px] leading-relaxed text-stone-600 md:rounded-xl md:border md:border-stone-200 md:bg-white md:p-4">
                <span className="hidden items-center gap-2 font-semibold text-stone-900 md:flex">
                  <span className={cn('size-2 rounded-full', PUNTO_ROL[r])} /> {NOMBRE_ROL[r]}
                </span>
                <span className="font-semibold text-stone-900 md:hidden">{NOMBRE_ROL[r]}:</span> <span className="md:mt-1 md:block">{DESCRIPCION_ROL[r]}</span>
              </li>
            ))}
          </ul>
        </section>

        <Tarjeta className="p-0 md:p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 px-4 py-4 md:px-6">
            <div className="flex items-baseline gap-2">
              <h2 className="font-label text-xs font-semibold uppercase tracking-[0.12em] text-stone-600 md:font-headline md:text-lg md:font-bold md:normal-case md:tracking-tight md:text-stone-900">
                <span className="md:hidden">Miembros activos</span>
                <span className="hidden md:inline">Miembros del equipo</span>
              </h2>
              <span className="hidden font-mono text-sm text-stone-500 md:inline">
                ({equipo.activos} {equipo.activos === 1 ? 'activo' : 'activos'}, {equipo.pendientes} {equipo.pendientes === 1 ? 'pendiente' : 'pendientes'})
              </span>
            </div>
            <div className="relative hidden xl:block">
              <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xl text-stone-400" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre o correo…"
                className="h-11 w-72 rounded-xl border-stone-200 bg-white pl-10 font-body text-[15px]"
                aria-label="Buscar en el equipo"
              />
            </div>
          </div>
          <div className="hidden grid-cols-[minmax(0,2fr)_150px_170px_130px_120px_56px] gap-4 border-b border-stone-200 bg-stone-50 px-6 py-3 font-label text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-500 xl:grid">
            <span>Colaborador</span>
            <span>Rol en panel</span>
            <span>Avisos WhatsApp</span>
            <span>Último ingreso</span>
            <span>Estado</span>
            <span className="text-right">Acciones</span>
          </div>
          <ul className="divide-y divide-stone-100">
            {filtrados.map((m) => (
              <FilaMiembro key={m.id} miembro={m} esTu={m.identidad === yo?.usuario.identidad} soyDueno={soyDueno} />
            ))}
            {filtrados.length === 0 && <li className="px-4 py-8 text-center font-body text-[15px] text-stone-500">Nadie coincide con «{busqueda}».</li>}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-200 px-4 py-3 font-body text-sm text-stone-500 md:px-6">
            <span>El piloto admite hasta {cupo.limite} personas por empresa.</span>
            <span className="font-mono">
              {cupo.usados} de {cupo.limite} cupos utilizados
            </span>
          </div>
        </Tarjeta>

        <p className="hidden items-start gap-2 rounded-xl border border-stone-200 bg-white px-4 py-3 font-body text-sm text-stone-600 md:flex xl:hidden">
          <Icon name="verified_user" className="mt-0.5 shrink-0 text-lg text-teal-700" />
          <span>
            <b className="font-semibold text-stone-900">Privacidad del negocio:</b> quien tiene rol <b className="font-semibold">Ventas</b> nunca puede cambiar la configuración de
            Dali ni desvincular el número oficial de {empresa}.
          </span>
        </p>

        <Tarjeta className="hidden xl:flex xl:items-center xl:gap-4">
          <Icon name="notifications_active" className="shrink-0 text-[28px] text-teal-700" />
          <div className="min-w-0 flex-1">
            <p className="font-headline text-base font-bold text-stone-900">¿Cómo le avisa Dali a tu equipo?</p>
            <p className="font-body text-[15px] text-stone-600">
              Cuando entra un lead o un cliente pide hablar con alguien, Dali manda el aviso al canal elegido en Asistente → Avisos y a cada miembro con los avisos activos.
            </p>
          </div>
          <Link to="/asistente" className="shrink-0 font-body text-[15px] font-semibold text-teal-800 hover:underline">
            Configurar avisos →
          </Link>
        </Tarjeta>
      </div>

      {invitando && <InvitarMiembro empresa={empresa} onCerrar={() => setInvitando(false)} />}
    </div>
  );
}

function FilaMiembro({ miembro: m, esTu, soyDueno }: { miembro: MiembroEquipo; esTu: boolean; soyDueno: boolean }) {
  const queryClient = useQueryClient();
  const [quitando, setQuitando] = useState(false);
  const rol = (m.rol === 'operator' ? 'owner' : m.rol) as Rol;
  const actualizar = (cambiado: MiembroEquipo | null) => {
    queryClient.setQueryData<Equipo>(['equipo'], (e) => {
      if (!e) return e;
      const miembros = cambiado ? e.miembros.map((x) => (x.id === cambiado.id ? cambiado : x)) : e.miembros.filter((x) => x.id !== m.id);
      const pendientes = miembros.filter((x) => x.pendiente).length;
      return { ...e, miembros, pendientes, activos: miembros.length - pendientes, cupo: { ...e.cupo, usados: miembros.length } };
    });
  };
  const cambiar = useMutation({
    mutationFn: (cambios: { rol?: Rol; recibeAvisos?: boolean }) => api.patch<MiembroEquipo>(`/equipo/${m.id}`, cambios),
    onSuccess: (r) => actualizar(r),
    onError: (e: Error) => toast.error(e instanceof ApiError ? e.message : 'No se pudo cambiar'),
  });
  const quitar = useMutation({
    mutationFn: () => api.delete(`/equipo/${m.id}`),
    onSuccess: () => {
      actualizar(null);
      toast.success(`${m.nombre} ya no está en el equipo`);
    },
    onError: (e: Error) => toast.error(e instanceof ApiError ? e.message : 'No se pudo quitar'),
  });
  const celular = esCelular(m.identidad);
  const avisos = !celular
    ? { icon: 'mail' as const, texto: 'Sin WhatsApp', clase: 'text-stone-400' }
    : m.recibeAvisos
      ? { icon: 'notifications_active' as const, texto: 'Avisos activos', clase: 'text-teal-700' }
      : { icon: 'do_not_disturb_on' as const, texto: 'Sin avisos', clase: 'text-stone-400' };

  return (
    <li className={cn('px-4 py-4 md:px-6', m.pendiente && 'bg-amber-50/40')}>
      <div className="flex items-start gap-3 xl:grid xl:grid-cols-[minmax(0,2fr)_150px_170px_130px_120px_56px] xl:items-center xl:gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span
            className={cn(
              'flex size-11 shrink-0 items-center justify-center rounded-full font-headline text-sm font-bold',
              m.pendiente ? 'border border-dashed border-amber-400 bg-amber-50 text-amber-800' : AVATAR[rol]
            )}
          >
            {iniciales(m.nombre)}
          </span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 font-headline text-[15px] font-bold text-stone-900">
              {m.nombre}
              {esTu && <span className="rounded-md bg-stone-100 px-1.5 py-0.5 font-label text-[11px] font-semibold text-stone-600">Tú</span>}
              {m.pendiente && (
                <StatusPill tono="amber" punto={false} className="text-[11px]">
                  Pendiente
                </StatusPill>
              )}
            </p>
            <p className={cn('truncate font-body text-sm text-stone-500', celular && 'font-mono')}>{identidadLegible(m.identidad)}</p>
          </div>
        </div>

        <div className="hidden xl:block">
          <SelectorRol miembro={m} rol={rol} editable={soyDueno && !esTu} onChange={(r) => cambiar.mutate({ rol: r })} />
        </div>
        <p className={cn('hidden items-center gap-1.5 font-body text-sm xl:flex', avisos.clase)}>
          <Icon name={avisos.icon} className="text-lg" /> {avisos.texto}
        </p>
        <p className="hidden font-mono text-sm text-stone-600 xl:block">
          {m.ultimoIngreso ? ultimoIngresoLegible(m.ultimoIngreso) : m.invitadoEl ? `Invitado ${haceCuanto(Date.parse(m.invitadoEl))}` : '—'}
        </p>
        <p className="hidden xl:block">
          <StatusPill tono={m.pendiente ? 'amber' : 'emerald'} punto={!m.pendiente} className="text-xs">
            {m.pendiente ? 'Sin ingresar' : 'Activo'}
          </StatusPill>
        </p>

        {soyDueno && (
          <div className="flex shrink-0 justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`Acciones sobre ${m.nombre}`}
                  className="flex size-11 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100 hover:text-stone-800"
                >
                  <Icon name="more_vert" className="text-2xl" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 rounded-xl border-stone-200 p-1.5 shadow-lg">
                <DropdownMenuLabel className="px-2 py-1.5 font-label text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-500">Rol en el panel</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={rol} onValueChange={(v) => v !== rol && cambiar.mutate({ rol: v as Rol })}>
                  {ROLES.map((r) => (
                    <DropdownMenuRadioItem key={r} value={r} disabled={esTu && r !== 'owner'} className="min-h-11 rounded-lg px-2 pl-8 font-body text-[15px]">
                      {NOMBRE_ROL[r]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={!celular} onSelect={() => cambiar.mutate({ recibeAvisos: !m.recibeAvisos })} className="min-h-11 rounded-lg px-2 font-body text-[15px]">
                  <Icon name={m.recibeAvisos ? 'do_not_disturb_on' : 'notifications_active'} className="text-xl text-stone-500" />
                  {!celular ? 'Sin WhatsApp: no recibe avisos' : m.recibeAvisos ? 'Apagar sus avisos' : 'Prender sus avisos'}
                </DropdownMenuItem>
                {!esTu && (
                  <DropdownMenuItem variant="destructive" onSelect={() => setQuitando(true)} className="min-h-11 rounded-lg px-2 font-body text-[15px]">
                    <Icon name="delete_outline" className="text-xl" /> Quitar del equipo
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 pl-14 font-body text-sm text-stone-500 xl:hidden">
        <span>
          Rol: <span className="font-semibold text-stone-800">{NOMBRE_ROL[m.rol]}</span>
        </span>
        <span className={cn('inline-flex items-center gap-1', avisos.clase)}>
          <Icon name={avisos.icon} className="text-base" /> {avisos.texto}
        </span>
        <span className="inline-flex items-center gap-1 font-mono">
          <Icon name="schedule" className="text-base" />
          {m.ultimoIngreso ? ultimoIngresoLegible(m.ultimoIngreso) : m.invitadoEl ? `invitado ${haceCuanto(Date.parse(m.invitadoEl))}` : '—'}
        </span>
        {m.pendiente && <span className="basis-full text-amber-800">Todavía no entró: entra en dali con {celular ? 'su celular' : 'su correo'} pidiendo su código.</span>}
      </div>

      {quitando && (
        <div className="mt-3 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-3 md:flex-row md:items-center">
          <p className="flex-1 font-body text-[15px] text-red-900">¿Quitar a {m.nombre} del equipo? Deja de poder entrar al panel y de recibir avisos.</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setQuitando(false)}
              className="h-10 rounded-xl border border-stone-200 bg-white px-3 font-body text-[15px] font-semibold text-stone-800"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => quitar.mutate()}
              disabled={quitar.isPending}
              className="h-10 rounded-xl bg-red-700 px-3 font-body text-[15px] font-semibold text-white hover:bg-red-800 disabled:opacity-60"
            >
              {quitar.isPending ? 'Quitando…' : 'Sí, quitar'}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function SelectorRol({ miembro, rol, editable, onChange }: { miembro: MiembroEquipo; rol: Rol; editable: boolean; onChange: (r: Rol) => void }) {
  if (!editable) {
    return (
      <StatusPill tono={rol === 'owner' ? 'teal' : 'stone'} punto={false} className="text-xs">
        <Icon name={rol === 'owner' ? 'shield_person' : rol === 'sales' ? 'support_agent' : 'visibility'} className="text-sm" /> {NOMBRE_ROL[miembro.rol]}
      </StatusPill>
    );
  }
  return (
    <span className="relative block">
      <select
        value={rol}
        onChange={(e) => onChange(e.target.value as Rol)}
        aria-label={`Rol de ${miembro.nombre}`}
        className="h-10 w-full appearance-none rounded-lg border border-stone-200 bg-white pl-3 pr-8 font-body text-sm text-stone-900"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {NOMBRE_ROL[r]}
          </option>
        ))}
      </select>
      <Icon name="expand_more" className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-lg text-stone-400" />
    </span>
  );
}

function EquipoEsqueleto() {
  return (
    <div className="animate-pulse px-4 pt-4 md:px-6 md:pt-6 xl:px-10" aria-busy="true" aria-label="Cargando el equipo">
      <div className="h-9 w-40 rounded-lg bg-stone-200" />
      <div className="mt-2 h-5 w-80 max-w-full rounded bg-stone-200" />
      <div className="mt-6 h-28 rounded-2xl bg-stone-200" />
      <div className="mt-4 h-72 rounded-2xl bg-stone-200" />
    </div>
  );
}
