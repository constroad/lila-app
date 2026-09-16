import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/Icon';
import type { IconName } from '@/components/icon-map';
import { Input } from '@/components/ui/input';
import { CascaronRegistro, PieRegistro } from './piezas';

/**
 * P4 «Registro · Tu negocio» (diseños `P4-registro` móvil, tablet y
 * escritorio): nombre del negocio, rubro (solo Asfalto tiene pack hoy; los
 * demás se ven y no se eligen), zona, tu nombre, tu WhatsApp y el nombre de
 * la asistente. `POST registro` deja un borrador y manda el código al
 * WhatsApp (hoy queda en el log de lila); la empresa se crea recién con el
 * código correcto (P3 en modo registro) y se sigue con el paso 2.
 */
interface Rubro {
  id: string;
  nombre: string;
  detalle: string;
  disponible: boolean;
}
const ICONO_RUBRO: Record<string, IconName> = { asphalt: 'construction', restaurant: 'restaurant', grifo: 'local_gas_station', lubricentro: 'oil_barrel', otro: 'more_horiz' };

export function RegistroScreen() {
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: ['registro-rubros'], queryFn: () => api.get<{ rubros: Rubro[] }>('/registro/rubros'), staleTime: Infinity });
  const rubros = data?.rubros ?? [];
  const [form, setForm] = useState({ negocio: '', rubro: 'asphalt', zona: '', nombre: '', whatsapp: '', asistente: 'Dali' });
  const [errores, setErrores] = useState<Partial<Record<keyof typeof form | 'general', string>>>({});
  const [enviando, setEnviando] = useState(false);
  const set = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrores((e) => ({ ...e, [k]: undefined, general: undefined }));
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const nuevos: typeof errores = {};
    if (form.negocio.trim().length < 2) nuevos.negocio = 'Escribe el nombre de tu negocio';
    if (form.zona.trim().length < 2) nuevos.zona = 'Escribe la ciudad o zona que atiendes';
    if (form.nombre.trim().length < 2) nuevos.nombre = 'Escribe tu nombre';
    if (!/^9\d{8}$/.test(form.whatsapp.replace(/\D/g, ''))) nuevos.whatsapp = 'Escribe tu celular de 9 cifras';
    setErrores(nuevos);
    if (Object.keys(nuevos).length) return;
    setEnviando(true);
    try {
      const destino = `51${form.whatsapp.replace(/\D/g, '')}`;
      const r = await api.post<{ token: string }>('/registro', { ...form, whatsapp: destino });
      navigate(`/registro/codigo?token=${encodeURIComponent(r.token)}&destino=${destino}&metodo=whatsapp`);
    } catch (err) {
      setErrores({ general: err instanceof ApiError ? err.message : 'No se pudo empezar el registro. Intenta de nuevo.' });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <CascaronRegistro paso={1}>
      <form onSubmit={enviar} noValidate>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200/80 bg-teal-50 px-3 py-1 font-body text-sm font-semibold text-teal-800">
          <span className="size-1.5 rounded-full bg-teal-600" /> Piloto sin costo · Sin tarjeta
        </span>
        <h1 className="mt-4 font-headline text-[28px] font-bold leading-tight tracking-tight text-stone-900 md:text-4xl">Cuéntale a Dali de tu negocio</h1>
        <p className="mt-2 font-body text-[15px] leading-relaxed text-stone-500 md:text-lg">
          Cómo se presentará tu asistente por WhatsApp a tus clientes y a dónde mandarte los avisos de cotización.
        </p>

        {errores.general && (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-body text-[15px] text-red-800" role="alert">
            {errores.general}
          </p>
        )}

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <Campo label="Nombre de tu negocio" error={errores.negocio} ayuda="Con este nombre saludará Dali a cada cliente en WhatsApp.">
            <span className="relative block">
              <Icon name="storefront" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl text-stone-400" />
              <Input
                value={form.negocio}
                maxLength={80}
                onChange={(e) => set('negocio', e.target.value)}
                placeholder="CONSTROAD"
                aria-invalid={Boolean(errores.negocio)}
                className={cn(CAMPO, 'pl-12', errores.negocio && 'border-red-400')}
              />
            </span>
          </Campo>
          <Campo label="Ciudad / zona que atiendes" error={errores.zona} ayuda="Dali sabe hasta dónde llega tu servicio.">
            <span className="relative block">
              <Icon name="location_on" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl text-stone-400" />
              <Input
                value={form.zona}
                maxLength={80}
                onChange={(e) => set('zona', e.target.value)}
                placeholder="Lima y alrededores"
                aria-invalid={Boolean(errores.zona)}
                className={cn(CAMPO, 'pl-12', errores.zona && 'border-red-400')}
              />
            </span>
          </Campo>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between gap-3">
            <p className="font-body text-[15px] font-semibold text-stone-800">
              Rubro del negocio <span className="text-amber-600">*</span>
            </p>
            <span className="rounded-full bg-teal-50 px-2.5 py-1 font-body text-xs font-semibold text-teal-800">Carga el guion listo</span>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {rubros.map((r) => {
              const elegido = form.rubro === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  disabled={!r.disponible}
                  onClick={() => set('rubro', r.id)}
                  aria-pressed={elegido}
                  className={cn(
                    'relative flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition-colors',
                    elegido ? 'border-teal-700 bg-teal-50/40' : 'border-stone-200 bg-white',
                    !r.disponible && 'cursor-not-allowed opacity-60',
                    r.id === 'otro' && 'sm:col-span-2'
                  )}
                >
                  <span className={cn('flex size-12 shrink-0 items-center justify-center rounded-xl', elegido ? 'bg-teal-700 text-white' : 'bg-stone-100 text-stone-700')}>
                    <Icon name={ICONO_RUBRO[r.id] ?? 'storefront'} className="text-2xl" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-headline text-base font-bold text-stone-900">{r.nombre}</span>
                    <span className={cn('block font-body text-sm', elegido ? 'text-teal-800' : 'text-stone-500')}>{r.disponible ? r.detalle : 'Próximamente'}</span>
                  </span>
                  <span
                    className={cn(
                      'flex size-6 shrink-0 items-center justify-center rounded-full border-2',
                      elegido ? 'border-teal-700 bg-teal-700 text-white' : 'border-stone-300'
                    )}
                    aria-hidden="true"
                  >
                    {elegido && <Icon name="check" className="text-base" />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <Campo label="Tu nombre" error={errores.nombre} ayuda="Dueño o administrador principal de la cuenta.">
            <span className="relative block">
              <Icon name="person" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl text-stone-400" />
              <Input
                value={form.nombre}
                maxLength={60}
                onChange={(e) => set('nombre', e.target.value)}
                placeholder="José Zena"
                aria-invalid={Boolean(errores.nombre)}
                className={cn(CAMPO, 'pl-12', errores.nombre && 'border-red-400')}
              />
            </span>
          </Campo>
          <Campo label="Tu WhatsApp personal (para avisos)" error={errores.whatsapp} ayuda="Con él entras a Dali y ahí te avisa cuando entre un cliente.">
            <span className={cn('flex h-12 items-stretch overflow-hidden rounded-xl border bg-white', errores.whatsapp ? 'border-red-400' : 'border-stone-200')}>
              <span className="flex shrink-0 items-center gap-1.5 border-r border-stone-200 bg-stone-50 px-3 font-mono text-[15px] text-stone-600">
                <span aria-hidden="true">🇵🇪</span> +51
              </span>
              <Input
                inputMode="tel"
                autoComplete="tel-national"
                value={form.whatsapp}
                maxLength={11}
                onChange={(e) => set('whatsapp', e.target.value)}
                placeholder="902 049 935"
                aria-invalid={Boolean(errores.whatsapp)}
                className="h-full flex-1 rounded-none border-0 bg-transparent px-4 font-mono text-base tracking-wide text-stone-900 shadow-none placeholder:text-stone-400 focus-visible:ring-0 md:text-base"
              />
            </span>
          </Campo>
        </div>

        <div className="mt-6 rounded-2xl border border-stone-200 bg-stone-50 p-4">
          <label className="block">
            <span className="flex items-center gap-2 font-body text-[15px] font-semibold text-stone-800">
              <Icon name="smart_toy" className="text-xl text-teal-700" /> ¿Cómo se llama tu asistente?
              <span className="rounded-full bg-teal-50 px-2 py-0.5 font-body text-xs font-semibold text-teal-800">Sugerido</span>
            </span>
            <Input value={form.asistente} maxLength={30} onChange={(e) => set('asistente', e.target.value)} placeholder="Dali" className={cn(CAMPO, 'bg-white')} />
            <span className="mt-1.5 block font-body text-sm text-stone-500">Así se presenta a tus clientes. Lo cambias después en Asistente.</span>
          </label>
        </div>

        <button
          type="submit"
          disabled={enviando}
          className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 font-headline text-[17px] font-bold text-white shadow-md shadow-teal-700/20 hover:bg-teal-800 disabled:opacity-60"
        >
          {enviando ? 'Enviando…' : 'Continuar'} <Icon name="arrow_forward" className="text-xl" />
        </button>
        <PieRegistro texto="Te mandamos un código de 6 cifras a tu WhatsApp para confirmar que eres tú." />
        <p className="mt-4 text-center font-body text-sm text-stone-500 md:hidden">
          ¿Ya tienes cuenta?{' '}
          <Link to="/entrar" className="font-semibold text-teal-800 hover:underline">
            Entra
          </Link>
        </p>
      </form>
    </CascaronRegistro>
  );
}

function Campo({ label, error, ayuda, children }: { label: string; error?: string; ayuda: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="font-body text-[15px] font-semibold text-stone-800">
        {label} <span className="text-amber-600">*</span>
      </span>
      <span className="mt-2 block">{children}</span>
      <span className={cn('mt-1.5 block font-body text-sm', error ? 'text-red-700' : 'text-stone-500')} role={error ? 'alert' : undefined}>
        {error ?? ayuda}
      </span>
    </label>
  );
}

const CAMPO = 'h-12 rounded-xl border-stone-200 bg-white px-4 font-body text-base text-stone-900 placeholder:text-stone-400 md:text-base';
