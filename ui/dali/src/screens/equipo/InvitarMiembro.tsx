import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, api } from '@/lib/api';
import { DESCRIPCION_ROL, OPCIONES_ROL } from '@/lib/roles';
import type { Equipo, MiembroEquipo, RolDali } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/Icon';
import { Segmentado } from '@/components/Segmentado';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';

/**
 * «Invitar miembro» (A16): hoja desde abajo en móvil, panel a la derecha
 * desde tablet. Dar acceso es crear el miembro (`POST equipo`): la persona
 * entra a Dali con su celular o correo pidiendo su código. El diseño promete
 * «le llega un enlace que vence en 24 h»; hasta constroad-auth (F2) no se
 * manda nada: el código lo recibe quien opera lila y se lo pasa, y acá se
 * dice tal cual.
 */
type Metodo = 'whatsapp' | 'correo';
type Rol = Exclude<RolDali, 'operator'>;

export function InvitarMiembro({ empresa, onCerrar }: { empresa: string; onCerrar: () => void }) {
  const queryClient = useQueryClient();
  const [metodo, setMetodo] = useState<Metodo>('whatsapp');
  const [destino, setDestino] = useState('');
  const [nombre, setNombre] = useState('');
  const [rol, setRol] = useState<Rol>('sales');
  const [recibeAvisos, setRecibeAvisos] = useState(true);
  const [errores, setErrores] = useState<{ destino?: string; nombre?: string; general?: string }>({});

  const invitar = useMutation({
    mutationFn: (cuerpo: { destino: string; nombre: string; rol: Rol; recibeAvisos: boolean }) => api.post<MiembroEquipo>('/equipo', cuerpo),
    onSuccess: (miembro) => {
      queryClient.setQueryData<Equipo>(['equipo'], (e) =>
        e ? { ...e, miembros: [...e.miembros, miembro], pendientes: e.pendientes + 1, cupo: { ...e.cupo, usados: e.cupo.usados + 1 } } : e
      );
      void queryClient.invalidateQueries({ queryKey: ['equipo'] });
      toast.success(`${miembro.nombre} ya puede entrar a Dali con ${metodo === 'whatsapp' ? 'su celular' : 'su correo'}`);
      onCerrar();
    },
    onError: (e: Error) => setErrores({ general: e instanceof ApiError ? e.message : 'No se pudo dar el acceso' }),
  });

  const enviar = () => {
    const nuevos: typeof errores = {};
    const limpio = destino.trim();
    if (metodo === 'whatsapp' && limpio.replace(/\D/g, '').length !== 9) nuevos.destino = 'Escribe los 9 dígitos del celular';
    if (metodo === 'correo' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio)) nuevos.destino = 'Escribe un correo válido';
    if (!nombre.trim()) nuevos.nombre = 'Ponle nombre a la persona';
    setErrores(nuevos);
    if (Object.keys(nuevos).length) return;
    invitar.mutate({
      destino: metodo === 'whatsapp' ? `51${limpio.replace(/\D/g, '')}` : limpio.toLowerCase(),
      nombre: nombre.trim(),
      rol,
      recibeAvisos: metodo === 'whatsapp' && recibeAvisos,
    });
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-stone-900/40" onClick={onCerrar} aria-hidden="true" />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Invitar miembro"
        className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-[390px] flex-col rounded-t-3xl bg-white shadow-2xl md:inset-y-0 md:right-0 md:left-auto md:mx-0 md:max-h-none md:w-[520px] md:max-w-none md:rounded-none"
      >
        <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-stone-300 md:hidden" />
        <div className="flex items-start justify-between gap-3 border-b border-stone-200 px-4 py-4 md:px-6 md:py-5">
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-center gap-2 font-headline text-2xl font-bold tracking-tight text-stone-900">
              <span className="md:hidden">Invitar miembro</span>
              <span className="hidden md:inline">Invitar colaborador</span>
              <span className="hidden rounded-md border border-teal-200 bg-teal-50 px-2 py-0.5 font-mono text-xs font-semibold text-teal-800 md:inline">Paso 1 de 1</span>
            </h2>
            <p className="mt-0.5 font-body text-[15px] text-stone-500">
              <span className="md:hidden">Agrega a un colaborador a {empresa}</span>
              <span className="hidden md:inline">Agrega a alguien de tu equipo a {empresa} para atender chats o consultar leads.</span>
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onCerrar}
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-500 hover:bg-stone-200 hover:text-stone-800"
          >
            <Icon name="close" className="text-2xl" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5 md:px-6">
          {errores.general && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-body text-[15px] text-red-800" role="alert">
              {errores.general}
            </p>
          )}
          <div>
            <p className="font-label text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-600">Método de invitación</p>
            <Segmentado
              className="mt-2"
              label="Método de invitación"
              valor={metodo}
              onChange={(m) => {
                setMetodo(m);
                setDestino('');
                setErrores({});
              }}
              opciones={[
                { valor: 'whatsapp', label: 'Por WhatsApp', icon: 'chat' },
                { valor: 'correo', label: 'Por correo', icon: 'mail' },
              ]}
            />
          </div>

          <label className="block">
            <span className="font-body text-[15px] font-semibold text-stone-800">
              {metodo === 'whatsapp' ? 'Número de WhatsApp del colaborador' : 'Correo del colaborador'} <span className="text-amber-600">*</span>
            </span>
            {metodo === 'whatsapp' ? (
              <span className={cn('mt-2 flex h-12 items-stretch overflow-hidden rounded-xl border bg-white', errores.destino ? 'border-red-400' : 'border-stone-200')}>
                <span className="flex shrink-0 items-center gap-1.5 border-r border-stone-200 bg-stone-50 px-3 font-mono text-[15px] text-stone-600">
                  <span aria-hidden="true">🇵🇪</span> +51
                </span>
                <Input
                  inputMode="tel"
                  autoFocus
                  value={destino}
                  maxLength={11}
                  aria-invalid={Boolean(errores.destino)}
                  onChange={(e) => {
                    setDestino(e.target.value);
                    setErrores((er) => ({ ...er, destino: undefined }));
                  }}
                  placeholder="987 111 222"
                  className="h-full flex-1 rounded-none border-0 bg-transparent px-4 font-mono text-base tracking-wide text-stone-900 shadow-none placeholder:text-stone-400 focus-visible:ring-0 md:text-base"
                />
              </span>
            ) : (
              <Input
                type="email"
                inputMode="email"
                autoComplete="off"
                autoFocus
                value={destino}
                maxLength={80}
                aria-invalid={Boolean(errores.destino)}
                onChange={(e) => {
                  setDestino(e.target.value);
                  setErrores((er) => ({ ...er, destino: undefined }));
                }}
                placeholder="carla@tuempresa.com"
                className={cn(CAMPO, errores.destino && 'border-red-400')}
              />
            )}
            <span className={cn('mt-1.5 block font-body text-sm', errores.destino ? 'text-red-700' : 'text-stone-500')} role={errores.destino ? 'alert' : undefined}>
              {errores.destino ??
                (metodo === 'whatsapp' ? 'Ingresa los 9 dígitos sin el código de país. Debe tener WhatsApp activo.' : 'Con ese correo pedirá su código para entrar.')}
            </span>
          </label>

          <label className="block">
            <span className="font-body text-[15px] font-semibold text-stone-800">
              Nombre <span className="text-amber-600">*</span>
            </span>
            <Input
              value={nombre}
              maxLength={60}
              aria-invalid={Boolean(errores.nombre)}
              onChange={(e) => {
                setNombre(e.target.value);
                setErrores((er) => ({ ...er, nombre: undefined }));
              }}
              placeholder="Carla Ríos"
              className={cn(CAMPO, errores.nombre && 'border-red-400')}
            />
            <span className={cn('mt-1.5 block font-body text-sm', errores.nombre ? 'text-red-700' : 'text-stone-500')} role={errores.nombre ? 'alert' : undefined}>
              {errores.nombre ?? 'Así aparece en el equipo y en los avisos.'}
            </span>
          </label>

          <label className="block">
            <span className="font-body text-[15px] font-semibold text-stone-800">
              Rol asignado <span className="text-amber-600">*</span>
            </span>
            <span className="relative mt-2 block">
              <select
                value={rol}
                onChange={(e) => setRol(e.target.value as Rol)}
                className="h-12 w-full appearance-none rounded-xl border border-stone-200 bg-white px-4 pr-10 font-body text-base text-stone-900"
              >
                {OPCIONES_ROL.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.label}
                  </option>
                ))}
              </select>
              <Icon name="expand_more" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xl text-stone-400" />
            </span>
          </label>

          <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
            <p className="flex items-center gap-2 font-body text-[15px] font-semibold text-stone-900">
              <Icon name="check_circle" className="text-xl text-teal-700" /> Permisos incluidos para {OPCIONES_ROL.find((o) => o.valor === rol)?.label.split(' (')[0]}:
            </p>
            <p className="mt-1 font-body text-[15px] leading-relaxed text-stone-600">{DESCRIPCION_ROL[rol]}</p>
          </div>

          <label
            className={cn(
              'flex items-start gap-3 rounded-xl border px-4 py-3',
              metodo === 'whatsapp' ? 'border-teal-200 bg-teal-50/60' : 'border-stone-200 bg-stone-50 opacity-70'
            )}
          >
            <Checkbox
              checked={metodo === 'whatsapp' && recibeAvisos}
              disabled={metodo !== 'whatsapp'}
              onCheckedChange={(v) => setRecibeAvisos(v === true)}
              className="mt-0.5 size-6 rounded-md border-stone-300 data-checked:border-teal-700 data-checked:bg-teal-700"
              aria-label="Recibe los avisos de leads"
            />
            <span>
              <span className="block font-body text-[15px] font-semibold text-stone-900">Recibe los avisos de leads</span>
              <span className="block font-body text-sm text-stone-600">
                {metodo === 'whatsapp'
                  ? 'Dali le manda por WhatsApp los mismos avisos que configuras en Asistente → Avisos: leads, clientes que piden a alguien y fallos.'
                  : 'Los avisos van por WhatsApp: con correo no llegan. Puedes cambiarlo después con su celular.'}
              </span>
            </span>
          </label>

          <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 font-body text-sm leading-relaxed text-amber-900">
            <Icon name="timer" className="mt-0.5 shrink-0 text-lg text-amber-600" />
            <span>
              Entra en <span className="font-mono">dali</span> con {metodo === 'whatsapp' ? 'ese celular' : 'ese correo'} pidiendo su código de acceso.{' '}
              <b className="font-semibold">Por ahora el código no se manda solo</b>: le llega a quien opera Dali, que se lo pasa.
            </span>
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-stone-200 px-4 py-3 md:px-6 md:py-4">
          <button type="button" onClick={onCerrar} className="h-11 rounded-xl border border-stone-200 px-4 font-body text-[15px] font-semibold text-stone-800 hover:bg-stone-50">
            Cancelar
          </button>
          <button
            type="button"
            onClick={enviar}
            disabled={invitar.isPending}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 font-body text-[15px] font-semibold text-white hover:bg-teal-800 disabled:opacity-60 md:flex-none"
          >
            <Icon name="send" className="text-xl" /> {invitar.isPending ? 'Dando acceso…' : 'Dar acceso'}
          </button>
        </div>
      </section>
    </>
  );
}

const CAMPO = 'mt-2 h-12 rounded-xl border-stone-200 bg-white px-4 font-body text-base text-stone-900 placeholder:text-stone-400 md:text-base';
