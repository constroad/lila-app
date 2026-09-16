import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/Icon';
import { Input } from '@/components/ui/input';
import { CAMPO_ADMIN, HojaAdmin } from './piezas';

/**
 * «Nueva empresa» (S1, la hoja del diseño en los tres tamaños): el operador
 * da de alta a un cliente con lo mismo que pide el registro público (P4),
 * sin código: nombre, rubro (solo Asfalto tiene pack), zona, la asistente,
 * el dueño con su celular, y —opcional— el número del negocio, que queda
 * como la línea. El plan es el piloto (sin costo): se dice, no se elige. El
 * dueño entra después pidiendo su código con su celular; «Correo de acceso»
 * e «invitación inmediata» del diseño llegan con constroad-auth (F2).
 */
interface Rubro {
  id: string;
  nombre: string;
  detalle: string;
  disponible: boolean;
}

type Campos = { negocio: string; rubro: string; zona: string; asistente: string; nombre: string; whatsapp: string; numero: string };
const VACIO: Campos = { negocio: '', rubro: 'asphalt', zona: '', asistente: 'Dali', nombre: '', whatsapp: '', numero: '' };

export function NuevaEmpresa({ onCerrar }: { onCerrar: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ['registro-rubros'], queryFn: () => api.get<{ rubros: Rubro[] }>('/registro/rubros'), staleTime: Infinity });
  const [form, setForm] = useState<Campos>(VACIO);
  const [errores, setErrores] = useState<Partial<Record<keyof Campos | 'general', string>>>({});
  const set = (k: keyof Campos, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrores((e) => ({ ...e, [k]: undefined, general: undefined }));
  };
  const crear = useMutation({
    mutationFn: (cuerpo: Record<string, string>) => api.post<{ companyId: string }>('/admin/empresas', cuerpo),
    onSuccess: (r) => {
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
      toast.success(`${form.negocio.trim()} ya está en Dali`);
      onCerrar();
      navigate(`/admin/empresas/${r.companyId}`);
    },
    onError: (e: Error) => setErrores({ general: e instanceof ApiError ? e.message : 'No se pudo crear la empresa' }),
  });

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const nuevos: typeof errores = {};
    if (form.negocio.trim().length < 2) nuevos.negocio = 'Escribe el nombre de la empresa';
    if (form.zona.trim().length < 2) nuevos.zona = 'Escribe la ciudad o zona que atiende';
    if (form.nombre.trim().length < 2) nuevos.nombre = 'Escribe el nombre del dueño';
    if (!/^9\d{8}$/.test(form.whatsapp.replace(/\D/g, ''))) nuevos.whatsapp = 'Escribe el celular del dueño, de 9 cifras';
    if (form.numero.trim() && !/^9\d{8}$/.test(form.numero.replace(/\D/g, ''))) nuevos.numero = 'Escribe un celular de 9 cifras, o déjalo vacío';
    setErrores(nuevos);
    if (Object.keys(nuevos).length) return;
    crear.mutate({
      negocio: form.negocio.trim(),
      rubro: form.rubro,
      zona: form.zona.trim(),
      asistente: form.asistente.trim() || 'Dali',
      nombre: form.nombre.trim(),
      whatsapp: `51${form.whatsapp.replace(/\D/g, '')}`,
      numero: form.numero.trim() ? `51${form.numero.replace(/\D/g, '')}` : '',
    });
  };

  return (
    <HojaAdmin
      titulo="Nueva empresa"
      subtitulo="Dar de alta a un cliente en Dali"
      icono="add_business"
      onCerrar={onCerrar}
      pie={
        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={onCerrar} className="inline-flex h-12 items-center rounded-xl px-4 font-body text-[15px] font-semibold text-stone-600 hover:bg-stone-100">
            Cancelar
          </button>
          <button
            type="submit"
            form="nueva-empresa"
            disabled={crear.isPending}
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-teal-700 px-5 font-body text-[15px] font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
          >
            {crear.isPending ? 'Creando…' : 'Crear empresa'} <Icon name="arrow_forward" className="text-xl" />
          </button>
        </div>
      }
    >
      <form id="nueva-empresa" onSubmit={enviar} noValidate className="space-y-5">
        {errores.general && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-body text-[15px] text-red-800" role="alert">
            {errores.general}
          </p>
        )}
        <Campo label="Nombre de la empresa" error={errores.negocio} ayuda="Aparecerá en el saludo de WhatsApp de la asistente.">
          <Input
            value={form.negocio}
            maxLength={80}
            onChange={(e) => set('negocio', e.target.value)}
            placeholder="Transportes & Mezclas Perú"
            aria-invalid={Boolean(errores.negocio)}
            className={cn(CAMPO_ADMIN, errores.negocio && 'border-red-400')}
          />
        </Campo>
        <Campo label="Rubro de negocio" ayuda={form.rubro === 'asphalt' ? 'Carga automáticamente el guion y las preguntas de asfalto.' : ''}>
          <select value={form.rubro} onChange={(e) => set('rubro', e.target.value)} className={cn(CAMPO_ADMIN, 'w-full appearance-none border')}>
            {(data?.rubros ?? []).map((r) => (
              <option key={r.id} value={r.id} disabled={!r.disponible}>
                {r.nombre} ({r.disponible ? r.detalle : 'próximamente'})
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Ciudad / zona que atiende" error={errores.zona} ayuda="Dali sabe hasta dónde llega el servicio.">
          <Input
            value={form.zona}
            maxLength={80}
            onChange={(e) => set('zona', e.target.value)}
            placeholder="Lima y alrededores"
            aria-invalid={Boolean(errores.zona)}
            className={cn(CAMPO_ADMIN, errores.zona && 'border-red-400')}
          />
        </Campo>
        <div className="rounded-2xl border border-teal-200 bg-teal-50/60 px-4 py-3">
          <p className="font-body text-[15px] font-semibold text-teal-900">Plan: Piloto · sin costo</p>
          <p className="font-body text-sm text-teal-800">Mensajes sin límite mientras dure el piloto. Los planes de pago llegan después.</p>
        </div>
        <p className="flex items-center gap-2 border-t border-stone-200 pt-5 font-label text-[12px] font-semibold uppercase tracking-[0.1em] text-stone-500">
          <Icon name="badge" className="text-lg" /> Datos del dueño / administrador
        </p>
        <Campo label="Nombre completo del titular" error={errores.nombre} ayuda="Con este nombre queda como dueño de la cuenta.">
          <Input
            value={form.nombre}
            maxLength={60}
            onChange={(e) => set('nombre', e.target.value)}
            placeholder="Carlos Mendoza Ramos"
            aria-invalid={Boolean(errores.nombre)}
            className={cn(CAMPO_ADMIN, errores.nombre && 'border-red-400')}
          />
        </Campo>
        <Campo label="WhatsApp personal del dueño (acceso y avisos)" error={errores.whatsapp} ayuda="Con él entra a Dali pidiendo su código y ahí le llegan los avisos.">
          <Telefono valor={form.whatsapp} onChange={(v) => set('whatsapp', v)} error={Boolean(errores.whatsapp)} placeholder="984 321 004" />
        </Campo>
        <Campo label="WhatsApp del negocio (línea de Dali)" error={errores.numero} ayuda="Opcional: el número desde el que Dali responde. Se vincula después con el QR.">
          <Telefono valor={form.numero} onChange={(v) => set('numero', v)} error={Boolean(errores.numero)} placeholder="949 376 824" />
        </Campo>
        <Campo label="Nombre de la asistente" ayuda="Así se presenta a los clientes; se cambia después en Asistente.">
          <Input value={form.asistente} maxLength={30} onChange={(e) => set('asistente', e.target.value)} placeholder="Dali" className={CAMPO_ADMIN} />
        </Campo>
      </form>
    </HojaAdmin>
  );
}

function Campo({ label, error, ayuda, children }: { label: string; error?: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="font-body text-[15px] font-semibold text-stone-800">{label}</span>
      <span className="mt-2 block">{children}</span>
      {(error || ayuda) && (
        <span className={cn('mt-1.5 block font-body text-sm', error ? 'text-red-700' : 'text-stone-500')} role={error ? 'alert' : undefined}>
          {error ?? ayuda}
        </span>
      )}
    </label>
  );
}

function Telefono({ valor, onChange, error, placeholder }: { valor: string; onChange: (v: string) => void; error: boolean; placeholder: string }) {
  return (
    <span className={cn('flex h-12 items-stretch overflow-hidden rounded-xl border bg-white', error ? 'border-red-400' : 'border-stone-200')}>
      <span className="flex shrink-0 items-center gap-1.5 border-r border-stone-200 bg-stone-50 px-3 font-mono text-[15px] text-stone-600">
        <span aria-hidden="true">🇵🇪</span> +51
      </span>
      <Input
        inputMode="tel"
        value={valor}
        maxLength={11}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={error}
        className="h-full flex-1 rounded-none border-0 bg-transparent px-4 font-mono text-base tracking-wide text-stone-900 shadow-none placeholder:text-stone-400 focus-visible:ring-0 md:text-base"
      />
    </span>
  );
}
