import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { telefonoLegible } from '@/lib/format';
import type { FichaNegocio, Inicio, Servicios } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/Icon';
import type { IconName } from '@/components/icon-map';
import { EditorPalabras } from '@/components/EditorPalabras';
import { StatusPill } from '@/components/StatusPill';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAccionesDeBarra } from '@/layout/barra';
import { Campo, Tarjeta } from '@/screens/asistente/cards';

/**
 * A7 «Negocio» — la ficha (diseños `A7-negocio` móvil y tablet; el de
 * escritorio salió superpuesto de Stitch y se sigue la composición de los
 * otros dos): datos del negocio, dónde está, contacto oficial, lo que ofrece
 * y lo que NO ofrece. Lo que se guarda lo usa Dali: se presenta con la
 * descripción, contesta dónde está y cómo llegar, y no promete lo que no se
 * ofrece. Datos: `GET/PUT /negocio`; los servicios del guion se listan desde
 * `/servicios` (ahí se editan).
 */
const RUBRO_LEGIBLE = 'Asfalto y construcción';

export function NegocioScreen() {
  const queryClient = useQueryClient();
  const { data: ficha, isPending } = useQuery({ queryKey: ['negocio'], queryFn: () => api.get<FichaNegocio>('/negocio') });
  const { data: servicios } = useQuery({ queryKey: ['servicios'], queryFn: () => api.get<Servicios>('/servicios'), staleTime: 60_000 });
  const { data: inicio } = useQuery({ queryKey: ['inicio'], queryFn: () => api.get<Inicio>('/inicio'), staleTime: 60_000 });
  const [editada, setEditada] = useState<FichaNegocio | null>(null);
  const delServidor = useMemo(() => (ficha ? structuredClone(ficha) : null), [ficha]);
  const form = editada ?? delServidor;
  const hayCambios = Boolean(delServidor && editada && JSON.stringify(editada) !== JSON.stringify(delServidor));
  const guardar = useMutation({
    mutationFn: (f: FichaNegocio) => api.put<FichaNegocio>('/negocio', f),
    onSuccess: (f) => {
      queryClient.setQueryData(['negocio'], f);
      setEditada(null);
      void queryClient.invalidateQueries({ queryKey: ['asistente'] });
      toast.success('Ficha guardada: Dali la usa desde el próximo mensaje');
    },
    onError: () => toast.error('No se pudo guardar la ficha'),
  });
  const enviar = () => form && guardar.mutate(form);
  const descartar = () => setEditada(null);

  useAccionesDeBarra(
    <>
      <Link
        to="/probar"
        className="inline-flex h-11 items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 font-body text-[15px] font-semibold text-stone-800 hover:bg-stone-50"
      >
        <Icon name="play_arrow" className="text-xl" /> Probar en simulador
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
    [hayCambios, guardar.isPending, form]
  );

  if (isPending || !form) return <NegocioEsqueleto />;
  const set = (parte: Partial<FichaNegocio>) => setEditada({ ...form, ...parte });
  const activos = servicios?.guion.servicios.filter((s) => s.activo) ?? [];

  return (
    <div className="md:px-6 md:pb-10 xl:px-10">
      <header className="sticky top-0 z-30 flex items-center gap-1 border-b border-stone-200 bg-white/95 px-2 py-2 backdrop-blur-md md:hidden">
        <Link to="/inicio" aria-label="Volver al inicio" className="flex size-11 shrink-0 items-center justify-center rounded-full text-stone-700 hover:bg-stone-100">
          <Icon name="arrow_back" className="text-2xl" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-headline text-lg font-bold leading-tight tracking-tight text-stone-900">Negocio</h1>
          <p className="truncate font-body text-sm text-stone-500">
            Ficha de {inicio?.empresa.nombre ?? '…'} <span className="text-stone-300">•</span>{' '}
            <span className={cn('font-semibold', hayCambios ? 'text-amber-700' : 'text-teal-800')}>{hayCambios ? 'Sin guardar' : 'Sincronizado'}</span>
          </p>
        </div>
        <Link to="/probar" aria-label="Probar a Dali" className="flex size-11 shrink-0 items-center justify-center rounded-full text-stone-700 hover:bg-stone-100">
          <Icon name="help_outline" className="text-2xl" />
        </Link>
      </header>

      {hayCambios && (
        <div className="hidden items-center justify-between gap-4 border-b border-amber-200 bg-amber-50 px-6 py-3 md:-mx-6 md:flex xl:-mx-10 xl:px-10">
          <p className="flex items-center gap-2 font-body text-[15px] text-amber-900">
            <Icon name="edit_note" className="text-2xl" /> Tienes cambios sin guardar en la ficha de tu negocio.
          </p>
          <button type="button" onClick={descartar} className="font-body text-[15px] font-semibold text-amber-900 underline underline-offset-4">
            Descartar
          </button>
        </div>
      )}

      <div className="px-4 pt-4 md:px-0 md:pt-6 xl:pt-8">
        <div className="flex items-center justify-between md:hidden">
          <p className="font-label text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">Configuración de marca</p>
          <StatusPill tono="teal" punto={false} className="text-[11px]">
            <Icon name="smart_toy" className="text-sm" /> Dali aprende aquí
          </StatusPill>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-headline text-3xl font-bold tracking-tight text-stone-900 xl:text-4xl">Ficha del Negocio</h1>
          <StatusPill tono="teal" punto={false} className="hidden text-sm md:inline-flex">
            <Icon name="smart_toy" className="text-base" /> Dali aprende aquí
          </StatusPill>
        </div>
        <p className="mt-1.5 max-w-2xl font-body text-[15px] leading-relaxed text-stone-500 xl:text-lg">
          Dali usa estos datos para presentarse, cotizar con precisión y responder dudas sobre tu empresa en WhatsApp. Mantén la información al día para evitar confusiones con tus
          clientes.
        </p>
      </div>

      <div className="grid gap-4 px-4 pb-36 pt-5 md:grid-cols-2 md:px-0 md:pb-0 md:pt-6 lg:gap-6">
        <Tarjeta>
          <Cabecera icon="storefront" titulo="Datos del negocio" detalle="Identidad principal y razón social para cotizaciones" />
          <div className="mt-5 space-y-5">
            <Campo label="Nombre comercial">
              <Input value={form.nombreComercial} maxLength={80} onChange={(e) => set({ nombreComercial: e.target.value })} className={CAMPO} aria-label="Nombre comercial" />
            </Campo>
            <Campo label="Rubro de la empresa" ayuda="El rubro define el pack de Dali (guion, reglas); por ahora no se cambia desde acá.">
              <div className={cn(CAMPO, 'flex items-center justify-between text-stone-700')}>
                {inicio?.empresa.rubro ? `${inicio.empresa.rubro} y construcción` : RUBRO_LEGIBLE} <Icon name="expand_more" className="text-xl text-stone-400" />
              </div>
            </Campo>
            <Campo
              label="Descripción breve para Dali"
              derecha={<span className="font-mono text-sm text-stone-500">{form.descripcion.length} / 240</span>}
              ayuda="Dali usará esto para presentarse formalmente ante clientes nuevos y para explicar a qué se dedica tu empresa."
            >
              <Textarea
                value={form.descripcion}
                maxLength={240}
                onChange={(e) => set({ descripcion: e.target.value })}
                placeholder="Empresa peruana de asfalto con más de 15 años: venta de mezcla asfáltica, colocación (asfaltado), imprimación y transporte."
                className={AREA}
                aria-label="Descripción breve"
              />
            </Campo>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo label="RUC oficial" ayuda="11 dígitos, como en SUNAT.">
                <Input
                  inputMode="numeric"
                  value={form.ruc}
                  maxLength={11}
                  onChange={(e) => set({ ruc: e.target.value.replace(/\D/g, '') })}
                  className={cn(CAMPO, 'font-mono')}
                  aria-label="RUC"
                />
              </Campo>
              <Campo label="Sitio web oficial">
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center font-mono text-sm text-stone-400">https://</span>
                  <Input
                    value={form.web}
                    maxLength={120}
                    onChange={(e) => set({ web: e.target.value.replace(/^https?:\/\//, '') })}
                    placeholder="constroad.com"
                    className={cn(CAMPO, 'pl-[74px]')}
                    aria-label="Sitio web"
                  />
                </div>
              </Campo>
            </div>
          </div>
        </Tarjeta>

        <Tarjeta>
          <Cabecera icon="location_on" titulo="Dónde estás (Ubicación)" detalle="Puntos de despacho y alcance geográfico" />
          <div className="mt-5 space-y-5">
            <Campo label="Dirección de planta u oficina">
              <Input
                value={form.direccion}
                maxLength={200}
                onChange={(e) => set({ direccion: e.target.value })}
                placeholder="Planta en Cajamarquilla, Lurigancho"
                className={CAMPO}
                aria-label="Dirección"
              />
            </Campo>
            <Campo label="Zona que atiende" ayuda="Es la misma zona de «Asistente»: Dali la usa para decir hasta dónde llega.">
              <Input
                value={form.zona}
                maxLength={120}
                onChange={(e) => set({ zona: e.target.value })}
                placeholder="Lima Metropolitana y alrededores"
                className={CAMPO}
                aria-label="Zona que atiende"
              />
            </Campo>
            {form.direccion && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(form.direccion)}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 font-body text-[15px] text-stone-700 hover:bg-stone-100"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Icon name="my_location" className="shrink-0 text-xl text-teal-700" /> <span className="truncate">{form.direccion}</span>
                </span>
                <span className="shrink-0 font-semibold text-teal-800">Ver en el mapa</span>
              </a>
            )}
            <Campo label="Cómo llegar (texto que Dali envía al cliente)" ayuda="Dali lo manda tal cual cuando un cliente o transportista pregunta dónde están o cómo llegar.">
              <Textarea
                value={form.comoLlegar}
                maxLength={400}
                onChange={(e) => set({ comoLlegar: e.target.value })}
                placeholder="Planta Lurigancho - Chosica, km 11.5 Autopista Ramiro Prialé, entrada por Av. Las Torres. Despacho de mezcla caliente desde las 7:00 a.m."
                className={AREA}
                aria-label="Cómo llegar"
              />
            </Campo>
          </div>
        </Tarjeta>

        <Tarjeta>
          <Cabecera icon="contact_page" titulo="Contacto oficial" detalle="Canales autorizados para cotizaciones y atención humana" />
          <div className="mt-5 space-y-5">
            <Campo
              label="WhatsApp del negocio (Dali)"
              derecha={<StatusPill tono={inicio?.asistente.conectado ? 'teal' : 'stone'}>{inicio?.asistente.conectado ? 'Conectado' : 'Sin conectar'}</StatusPill>}
              ayuda="Para cambiar este número, gestiona la línea desde «WhatsApp»."
            >
              <div className={cn(CAMPO, 'flex items-center gap-3 bg-stone-50 font-mono text-stone-700')}>
                <Icon name="chat" className="text-xl text-stone-400" /> {form.contacto.whatsapp ? telefonoLegible(form.contacto.whatsapp) : 'Sin número conectado'}
              </div>
            </Campo>
            <Campo label="Teléfono fijo de planta">
              <ConIcono icon="call">
                <Input
                  inputMode="tel"
                  value={form.contacto.telefono}
                  maxLength={80}
                  onChange={(e) => set({ contacto: { ...form.contacto, telefono: e.target.value } })}
                  placeholder="(01) 480-1928"
                  className={cn(CAMPO, 'pl-12 font-mono')}
                  aria-label="Teléfono fijo"
                />
              </ConIcono>
            </Campo>
            <Campo label="Correo de cotizaciones">
              <ConIcono icon="mail">
                <Input
                  inputMode="email"
                  value={form.contacto.correo}
                  maxLength={80}
                  onChange={(e) => set({ contacto: { ...form.contacto, correo: e.target.value } })}
                  placeholder="ventas@tuempresa.com"
                  className={cn(CAMPO, 'pl-12')}
                  aria-label="Correo de cotizaciones"
                />
              </ConIcono>
            </Campo>
            <Campo label="Instagram o red social">
              <ConIcono icon="tag">
                <Input
                  value={form.contacto.redSocial}
                  maxLength={80}
                  onChange={(e) => set({ contacto: { ...form.contacto, redSocial: e.target.value } })}
                  placeholder="@tuempresa"
                  className={cn(CAMPO, 'pl-12')}
                  aria-label="Red social"
                />
              </ConIcono>
            </Campo>
          </div>
        </Tarjeta>

        <div className="space-y-4 lg:space-y-6">
          <Tarjeta>
            <Cabecera
              icon="check_circle"
              titulo="Lo que ofrece tu empresa"
              derecha={<span className="rounded-lg bg-teal-50 px-2.5 py-1 font-mono text-sm text-teal-800">{activos.length} activos</span>}
            />
            <p className="mt-4 font-body text-[15px] text-stone-600">Dali reconoce estos rubros para cotizar y derivar al cliente de forma precisa:</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {activos.map((s) => (
                <Link
                  key={s.id}
                  to={`/servicios/${s.id}`}
                  className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3 font-body text-[15px] text-stone-800 hover:border-teal-300"
                >
                  {s.nombre.charAt(0).toUpperCase() + s.nombre.slice(1)} <Icon name="arrow_forward" className="text-base text-stone-400" />
                </Link>
              ))}
            </div>
            <p className="mt-4 font-body text-sm font-semibold text-stone-700">Otros productos o servicios que Dali puede mencionar</p>
            <EditorPalabras
              palabras={form.ofrece}
              onChange={(ofrece) => set({ ofrece })}
              label="Otros productos o servicios"
              placeholder="Ej. emulsiones asfálticas"
              className="mt-2"
            />
            <div className="mt-4 rounded-xl border border-teal-100 bg-teal-50 px-4 py-3 font-body text-[15px] text-teal-900">
              <p className="flex items-start gap-2">
                <Icon name="info" className="mt-0.5 shrink-0 text-xl" />
                <span>
                  Estos son los servicios que Dali reconoce. Las palabras y preguntas de cada uno se detallan en la sección <span className="font-semibold">Servicios</span>.
                </span>
              </p>
              <Link to="/servicios" className="mt-2 inline-flex items-center gap-1 pl-7 font-semibold text-teal-800 hover:underline">
                Ir a Servicios <Icon name="arrow_forward" className="text-base" />
              </Link>
            </div>
          </Tarjeta>

          <Tarjeta>
            <Cabecera
              icon="block"
              tonoIcono="amber"
              titulo="Lo que NO ofrece"
              derecha={
                <StatusPill tono="amber" punto={false}>
                  Exclusiones
                </StatusPill>
              }
            />
            <p className="mt-4 font-body text-[15px] text-stone-600">Dali aclarará amablemente al cliente que no prestas estos servicios, sin crear falsas expectativas:</p>
            <ul className="mt-3 space-y-2">
              {form.noOfrece.map((x) => (
                <li key={x} className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5">
                  <span className="flex min-w-0 items-center gap-2 font-body text-[15px] text-stone-800">
                    <span className="size-2 shrink-0 rounded-full bg-amber-500" /> <span className="truncate">{x}</span>
                  </span>
                  <button
                    type="button"
                    aria-label={`Quitar ${x}`}
                    onClick={() => set({ noOfrece: form.noOfrece.filter((y) => y !== x) })}
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-200 hover:text-stone-700"
                  >
                    <Icon name="close" className="text-lg" />
                  </button>
                </li>
              ))}
            </ul>
            <AgregarExclusion onAgregar={(x) => !form.noOfrece.some((y) => y.toLowerCase() === x.toLowerCase()) && set({ noOfrece: [...form.noOfrece, x] })} />
            <p className="mt-3 font-body text-sm italic text-stone-500">
              Evita llamadas perdidas y clientes molestos indicando claramente qué trabajos no realiza {form.nombreComercial || 'tu empresa'}.
            </p>
          </Tarjeta>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,16px)+64px)] z-30 mx-auto w-full max-w-[390px] border-t border-stone-200 bg-white px-4 py-3 md:hidden">
        <button
          type="button"
          onClick={enviar}
          disabled={!hayCambios || guardar.isPending}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-teal-700 font-headline text-[15px] font-bold text-white disabled:bg-stone-300"
        >
          <Icon name="check" className="text-xl" /> {guardar.isPending ? 'Guardando…' : 'Guardar cambios'}
        </button>
        <button
          type="button"
          onClick={descartar}
          disabled={!hayCambios}
          className="mt-1 flex min-h-9 w-full items-center justify-center font-body text-[15px] text-stone-600 disabled:opacity-40"
        >
          Descartar modificaciones
        </button>
      </div>
    </div>
  );
}

const CAMPO = 'h-12 rounded-xl border-stone-200 bg-white px-4 font-body text-base text-stone-900 placeholder:text-stone-400 md:text-base';
const AREA = 'min-h-[104px] rounded-xl border-stone-200 bg-white px-4 py-3 font-body text-base leading-relaxed text-stone-900 placeholder:text-stone-400 md:text-base';

function Cabecera({
  icon,
  titulo,
  detalle,
  derecha,
  tonoIcono = 'teal',
}: {
  icon: IconName;
  titulo: string;
  detalle?: string;
  derecha?: React.ReactNode;
  tonoIcono?: 'teal' | 'amber';
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-stone-100 pb-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-full', tonoIcono === 'amber' ? 'bg-amber-50 text-amber-600' : 'bg-teal-50 text-teal-700')}>
          <Icon name={icon} className="text-2xl" />
        </span>
        <div className="min-w-0">
          <h2 className="font-headline text-lg font-bold tracking-tight text-stone-900 xl:text-xl">{titulo}</h2>
          {detalle && <p className="mt-0.5 font-body text-[15px] text-stone-500">{detalle}</p>}
        </div>
      </div>
      {derecha && <div className="shrink-0">{derecha}</div>}
    </div>
  );
}

function ConIcono({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <div className="relative">
      <Icon name={icon} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl text-stone-400" />
      {children}
    </div>
  );
}

function AgregarExclusion({ onAgregar }: { onAgregar: (x: string) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const agregar = () => {
    const t = texto.trim();
    if (t) onAgregar(t.slice(0, 80));
    setTexto('');
    setAbierto(false);
  };
  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stone-300 font-body text-[15px] font-semibold text-stone-700 hover:bg-stone-50"
      >
        <Icon name="add" className="text-xl" /> Agregar otra exclusión
      </button>
    );
  }
  return (
    <form
      className="mt-3 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        agregar();
      }}
    >
      <Input
        autoFocus
        value={texto}
        maxLength={80}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Ej. alquiler de maquinaria pesada"
        className={CAMPO}
        aria-label="Nueva exclusión"
      />
      <button type="submit" className="h-12 shrink-0 rounded-xl bg-teal-700 px-4 font-body text-[15px] font-semibold text-white hover:bg-teal-800">
        Agregar
      </button>
      <button
        type="button"
        onClick={() => setAbierto(false)}
        className="h-12 shrink-0 rounded-xl border border-stone-200 px-3 font-body text-[15px] text-stone-600 hover:bg-stone-50"
      >
        Cancelar
      </button>
    </form>
  );
}

function NegocioEsqueleto() {
  return (
    <div className="md:px-6 xl:px-10" aria-busy="true">
      <div className="h-14 border-b border-stone-200 bg-white md:hidden" />
      <div className="px-4 pt-6 md:px-0 xl:pt-8">
        <div className="h-9 w-64 animate-pulse rounded-lg bg-stone-200" />
        <div className="mt-3 h-4 w-96 max-w-full animate-pulse rounded bg-stone-200" />
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {[420, 420, 380, 380].map((h, i) => (
            <div key={i} className="animate-pulse rounded-2xl border border-stone-200 bg-white" style={{ height: h }} />
          ))}
        </div>
      </div>
    </div>
  );
}
