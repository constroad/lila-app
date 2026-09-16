import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, api } from '@/lib/api';
import { iniciales, telefonoLegible } from '@/lib/format';
import { NOMBRE_ROL } from '@/lib/roles';
import { useSesion } from '@/lib/session';
import type { FichaNegocio, Inicio, Yo } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/Icon';
import type { IconName } from '@/components/icon-map';
import { StatusPill } from '@/components/StatusPill';
import { Input } from '@/components/ui/input';
import { useAccionesDeBarra } from '@/layout/barra';
import { CabeceraTarjeta, Tarjeta } from '@/screens/asistente/cards';

/**
 * A20 «Ajustes» (diseños `A20-ajustes` móvil, tablet y escritorio): tu
 * perfil (el nombre; la identidad con la que entras no se cambia desde acá),
 * cómo se entra (sin contraseña), preferencias, la empresa, la exportación de
 * conversaciones y leads a Excel, y cerrar sesión. Lo que el diseño dibuja y
 * no existe se dice tal cual: sesiones abiertas en otros dispositivos (la
 * sesión es una cookie de 14 días, sin registro central), foto, cargo, tema
 * oscuro, borrar la cuenta desde el panel.
 */
export function AjustesScreen() {
  const queryClient = useQueryClient();
  const { yo, salir } = useSesion();
  const { data: inicio } = useQuery({ queryKey: ['inicio'], queryFn: () => api.get<Inicio>('/inicio'), staleTime: 60_000 });
  const { data: ficha } = useQuery({ queryKey: ['negocio'], queryFn: () => api.get<FichaNegocio>('/negocio'), staleTime: 60_000 });
  const [editado, setEditado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nombre = editado ?? yo?.usuario.nombre ?? '';
  const setNombre = (v: string) => setEditado(v);
  const hayCambios = Boolean(yo && nombre.trim() && nombre.trim() !== yo.usuario.nombre);

  const guardar = useMutation({
    mutationFn: (n: string) => api.patch<Yo>('/ajustes/perfil', { nombre: n }),
    onSuccess: (r) => {
      queryClient.setQueryData(['yo'], r);
      void queryClient.invalidateQueries({ queryKey: ['equipo'] });
      setEditado(null);
      setError(null);
      toast.success('Nombre guardado');
    },
    onError: (e: Error) => setError(e instanceof ApiError ? e.message : 'No se pudo guardar tu nombre'),
  });
  const enviar = () => {
    if (!nombre.trim()) {
      setError('Escribe tu nombre');
      return;
    }
    guardar.mutate(nombre.trim());
  };

  useAccionesDeBarra(
    <Link
      to="/probar"
      className="inline-flex h-11 items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 font-body text-[15px] font-semibold text-stone-800 hover:bg-stone-50"
    >
      <Icon name="play_circle" className="text-xl" /> Probar a Dali
    </Link>,
    []
  );

  const identidad = yo?.usuario.identidad ?? '';
  const porWhatsApp = /^\d+$/.test(identidad);
  const empresa = inicio?.empresa.nombre ?? '…';
  const rol = yo ? NOMBRE_ROL[yo.usuario.rol] : '';

  return (
    <div className="md:px-6 md:pb-10 xl:px-10">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-stone-200 bg-white/95 px-4 py-2 backdrop-blur-md md:hidden">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-stone-900 font-headline text-sm font-bold text-white">{iniciales(empresa)}</span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-headline text-base font-bold text-stone-900">
            <span className="truncate">{empresa}</span>
            <span className={cn('size-2 shrink-0 rounded-full', inicio?.asistente.conectado ? 'bg-emerald-500' : 'bg-stone-400')} />
          </p>
          <p className="truncate font-body text-sm text-stone-500">Cuenta · Asistente Dali</p>
        </div>
        <Link to="/probar" aria-label="Probar a Dali" className="flex size-11 shrink-0 items-center justify-center rounded-full text-stone-700 hover:bg-stone-100">
          <Icon name="help_outline" className="text-2xl" />
        </Link>
      </header>

      <div className="px-4 pt-4 md:px-0 md:pt-6 xl:pt-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-headline text-3xl font-bold tracking-tight text-stone-900 xl:text-4xl">Ajustes</h1>
          {rol && (
            <StatusPill tono="teal" className="text-sm">
              {rol}
            </StatusPill>
          )}
        </div>
        <p className="mt-1.5 max-w-2xl font-body text-[15px] leading-relaxed text-stone-500 xl:text-lg">Tu perfil, cómo entras, tus preferencias y los datos de tu cuenta.</p>
      </div>

      <div className="grid gap-4 px-4 pb-32 pt-4 md:px-0 md:pb-0 md:pt-6 lg:grid-cols-2 lg:gap-6">
        <div className="grid content-start gap-4 lg:gap-6">
          <Tarjeta>
            <CabeceraTarjeta
              icon="badge"
              titulo="Tu perfil"
              detalle="Datos personales"
              detalleDesdeLg
              derecha={
                <StatusPill tono="teal" punto={false} className="whitespace-nowrap text-[11px] md:text-xs">
                  <Icon name="verified" className="text-sm" /> {porWhatsApp ? 'Verificado por WhatsApp' : 'Verificado por correo'}
                </StatusPill>
              }
            />
            <div className="mt-5 flex items-center gap-4">
              <span className="flex size-20 shrink-0 items-center justify-center rounded-2xl bg-stone-900 font-headline text-2xl font-bold text-white">
                {iniciales(yo?.usuario.nombre ?? '?')}
              </span>
              <div className="min-w-0">
                <p className="truncate font-headline text-xl font-bold text-stone-900">{yo?.usuario.nombre}</p>
                <p className="font-body text-[15px] text-stone-500">
                  {rol} · {empresa}
                </p>
              </div>
            </div>
            <label className="mt-5 block">
              <span className="font-body text-[15px] font-semibold text-stone-800">Nombre completo</span>
              <span className="relative mt-2 block">
                <Icon name="person" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl text-stone-400" />
                <Input
                  value={nombre}
                  maxLength={60}
                  aria-invalid={Boolean(error)}
                  onChange={(e) => {
                    setNombre(e.target.value);
                    setError(null);
                  }}
                  className={cn('h-12 rounded-xl border-stone-200 bg-stone-50 pl-12 font-body text-base text-stone-900 md:text-base', error && 'border-red-400')}
                />
              </span>
              <span className={cn('mt-1.5 block font-body text-sm', error ? 'text-red-700' : 'text-stone-500')} role={error ? 'alert' : undefined}>
                {error ?? 'Así apareces en el equipo y en los avisos.'}
              </span>
            </label>
            <div className="mt-4">
              <span className="font-body text-[15px] font-semibold text-stone-800">{porWhatsApp ? 'WhatsApp con el que entras' : 'Correo con el que entras'}</span>
              <span className="mt-2 flex h-12 items-center gap-3 rounded-xl border border-stone-200 bg-stone-100 px-4 font-mono text-base text-stone-700">
                <Icon name={porWhatsApp ? 'phone' : 'mail'} className="text-xl text-stone-400" /> {porWhatsApp ? telefonoLegible(identidad) : identidad}
              </span>
              <span className="mt-1.5 block font-body text-sm text-stone-500">
                {porWhatsApp ? 'A este número te llega el código de acceso.' : 'A este correo te llega el código de acceso.'} Es tu identidad en Dali: para cambiarla, quien
                administra el equipo te da un acceso nuevo.
              </span>
            </div>
            <button
              type="button"
              onClick={enviar}
              disabled={!hayCambios || guardar.isPending}
              className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 font-body text-[15px] font-semibold text-white hover:bg-teal-800 disabled:opacity-50 md:w-auto md:px-6"
            >
              <Icon name="check" className="text-xl" /> {guardar.isPending ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </Tarjeta>

          <Tarjeta>
            <CabeceraTarjeta
              icon="lock_open"
              titulo="Acceso"
              detalle="Sin contraseñas"
              detalleDesdeLg
              derecha={
                <StatusPill tono="teal" punto={false} className="text-xs">
                  Sin clave
                </StatusPill>
              }
            />
            <p className="mt-4 flex items-start gap-3 rounded-xl bg-stone-50 px-4 py-3 font-body text-[15px] leading-relaxed text-stone-700">
              <Icon name="key_off" className="mt-0.5 shrink-0 text-2xl text-stone-500" />
              <span>
                Entras con un <b className="font-semibold text-stone-900">código de un solo uso</b> que llega a tu {porWhatsApp ? 'WhatsApp' : 'correo'}. No hay contraseña que
                recordar ni que se filtre.
              </span>
            </p>
            <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50/60 p-4">
              <p className="flex items-center gap-2 font-headline text-base font-bold text-stone-900">
                <Icon name="laptop_mac" className="text-2xl text-teal-700" /> Este dispositivo
                <StatusPill tono="teal" punto={false} className="text-[11px]">
                  Actual
                </StatusPill>
              </p>
              <p className="mt-1 pl-8 font-body text-sm text-stone-600">La sesión dura 14 días en este navegador. Para cerrarla en otro dispositivo, cierra sesión desde ahí.</p>
            </div>
          </Tarjeta>
        </div>

        <div className="grid content-start gap-4 lg:gap-6">
          <Tarjeta>
            <CabeceraTarjeta icon="tune" titulo="Preferencias" detalle="Regional y vista" detalleDesdeLg />
            <ul className="mt-4 divide-y divide-stone-100">
              <Preferencia icon="translate" titulo="Idioma" detalle="Adaptado al mercado peruano (tuteo, S/, m²)" valor="Español · Perú" />
              <Preferencia icon="schedule" titulo="Zona horaria" detalle="Para reportes, horarios y descanso" valor="Lima, GMT-5" />
              <Preferencia icon="palette" titulo="Tema de pantalla" detalle="El oscuro llega cuando esté revisado" valor="Claro" />
            </ul>
          </Tarjeta>

          <Tarjeta>
            <CabeceraTarjeta
              icon="domain"
              titulo="Empresa"
              detalle="Como la ven tus clientes"
              detalleDesdeLg
              derecha={
                <StatusPill tono="stone" punto={false} className="text-xs">
                  Plan Piloto
                </StatusPill>
              }
            />
            <dl className="mt-4 space-y-2 font-body text-[15px]">
              <div className="flex justify-between gap-4">
                <dt className="text-stone-500">Razón social</dt>
                <dd className="text-right font-semibold text-stone-900">{ficha?.nombreComercial ?? empresa}</dd>
              </div>
              {ficha?.ruc && (
                <div className="flex justify-between gap-4">
                  <dt className="text-stone-500">RUC</dt>
                  <dd className="font-mono text-stone-900">{ficha.ruc}</dd>
                </div>
              )}
              {inicio?.empresa.rubro && (
                <div className="flex justify-between gap-4">
                  <dt className="text-stone-500">Rubro</dt>
                  <dd className="text-right text-stone-900">{inicio.empresa.rubro}</dd>
                </div>
              )}
              {inicio?.asistente.numero && (
                <div className="flex justify-between gap-4">
                  <dt className="text-stone-500">Línea de WhatsApp</dt>
                  <dd className="font-mono text-stone-900">{telefonoLegible(inicio.asistente.numero)}</dd>
                </div>
              )}
            </dl>
            <Link to="/negocio" className="mt-4 inline-flex items-center gap-1 font-body text-[15px] font-semibold text-teal-800 hover:underline">
              Ir a Negocio <Icon name="arrow_forward" className="text-lg" />
            </Link>
          </Tarjeta>

          <Tarjeta>
            <CabeceraTarjeta
              icon="cloud_download"
              titulo="Datos y exportación"
              detalle="Excel / copia"
              detalleDesdeLg
              derecha={
                <StatusPill tono="stone" punto={false} className="text-xs">
                  .xlsx
                </StatusPill>
              }
            />
            <p className="mt-4 font-body text-[15px] leading-relaxed text-stone-600">
              Descarga cuando quieras una copia de todas las conversaciones que atendió Dali y de los leads que captó.
            </p>
            <a
              href="/api/dali/ajustes/exportar.xlsx"
              download
              className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white font-body text-[15px] font-semibold text-stone-800 hover:bg-stone-50"
            >
              <Icon name="table_view" className="text-xl text-teal-700" /> Descargar mis conversaciones y leads
            </a>
            <p className="mt-3 flex items-start gap-2 font-body text-sm text-stone-500">
              <Icon name="info" className="mt-0.5 shrink-0 text-base text-teal-700" />
              <span>
                El detalle de los mensajes se guarda <b className="font-semibold text-stone-700">90 días</b>; las conversaciones y los leads,{' '}
                <b className="font-semibold text-stone-700">siempre</b>.
              </span>
            </p>
          </Tarjeta>

          <section className="rounded-2xl border border-red-200 bg-red-50/60 p-4 md:p-5">
            <p className="flex items-center gap-2 font-headline text-base font-bold text-red-800">
              <Icon name="warning" className="text-2xl" /> Zona de peligro
            </p>
            <p className="mt-1.5 font-body text-[15px] leading-relaxed text-stone-700">
              Dar de baja a {empresa} en Dali desconecta el número y detiene las cotizaciones automáticas. No se hace desde el panel: escríbenos y lo coordinamos contigo.
            </p>
            <button
              type="button"
              onClick={() => void salir()}
              className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white font-body text-[15px] font-semibold text-red-700 hover:bg-red-50"
            >
              <Icon name="power_settings_new" className="text-xl" /> Cerrar sesión
            </button>
          </section>
          <p className="text-center font-body text-sm text-stone-400">Dali · Lima, Perú</p>
        </div>
      </div>
    </div>
  );
}

function Preferencia({ icon, titulo, detalle, valor }: { icon: IconName; titulo: string; detalle: string; valor: string }) {
  return (
    <li className="flex items-center gap-3 py-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-600">
        <Icon name={icon} className="text-xl" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-body text-[15px] font-semibold text-stone-900">{titulo}</span>
        <span className="block font-body text-sm text-stone-500">{detalle}</span>
      </span>
      <span className="shrink-0 rounded-lg bg-stone-100 px-3 py-1.5 font-body text-sm font-semibold text-stone-800">{valor}</span>
    </li>
  );
}
