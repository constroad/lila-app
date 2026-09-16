import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '@/lib/api';
import { telefonoLegible } from '@/lib/format';
import type { Inicio, LineaWhatsApp } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/Icon';
import { Input } from '@/components/ui/input';
import { Vincular } from '@/screens/whatsapp/Vincular';
import { CascaronRegistro, PieRegistro } from './piezas';

/**
 * P5 «Registro · Conecta tu WhatsApp» (diseños `P5-conectar-whatsapp` móvil,
 * tablet y escritorio): el número del negocio pasa a ser la línea de la
 * empresa (`PUT registro/numero`) y se vincula con el mismo panel de A14 (QR o
 * código). Cuando la línea queda conectada, se sigue al paso 3: en móvil con
 * el botón ancho de abajo y desde tablet con el «Continuar →» dentro del aviso
 * verde; «Lo hago después» va al inicio.
 */
export function RegistroWhatsAppScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: inicio } = useQuery({ queryKey: ['inicio'], queryFn: () => api.get<Inicio>('/inicio'), staleTime: 60_000 });
  const { data: linea } = useQuery({ queryKey: ['whatsapp'], queryFn: () => api.get<LineaWhatsApp>('/whatsapp'), refetchInterval: 5_000 });
  const [numero, setNumero] = useState('');
  const [error, setError] = useState<string | null>(null);
  const asignar = useMutation({
    mutationFn: (n: string) => api.put<{ numero: string }>('/registro/numero', { numero: n }),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['whatsapp'] });
      void queryClient.invalidateQueries({ queryKey: ['inicio'] });
    },
    onError: (e: Error) => setError(e instanceof ApiError ? e.message : 'No se pudo guardar el número'),
  });
  const guardarNumero = (e: FormEvent) => {
    e.preventDefault();
    if (!/^9\d{8}$/.test(numero.replace(/\D/g, ''))) {
      setError('Escribe el celular del negocio, de 9 cifras');
      return;
    }
    asignar.mutate(`51${numero.replace(/\D/g, '')}`);
  };
  const empresa = inicio?.empresa.nombre ?? linea?.empresa ?? '…';
  const conNumero = Boolean(linea?.numero);
  const conectada = linea?.estado === 'conectado';
  const continuar = (className: string) => (
    <button
      type="button"
      disabled={!conectada}
      onClick={() => navigate('/registro/conocimiento')}
      className={cn('items-center justify-center gap-2 rounded-xl bg-teal-700 font-headline font-bold text-white hover:bg-teal-800 disabled:opacity-50', className)}
    >
      <span className="md:hidden">Continuar al paso 3</span>
      <span className="hidden md:inline">Continuar</span> <Icon name="arrow_forward" className="text-xl" />
    </button>
  );

  return (
    <CascaronRegistro paso={2} subtitulo={empresa}>
      <div className="md:text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200/80 bg-teal-50 px-3 py-1 font-body text-sm font-semibold text-teal-800">
          <Icon name="lock" className="text-base" /> Cifrado de extremo a extremo
        </span>
        <h1 className="mt-4 font-headline text-[28px] font-bold leading-tight tracking-tight text-stone-900 md:text-4xl">Conecta el WhatsApp de tu negocio</h1>
        <p className="mt-2 font-body text-[15px] leading-relaxed text-stone-500 md:text-lg">Dali responde desde tu propio número. Nadie más ve tus chats.</p>
      </div>

      {!conNumero ? (
        <form onSubmit={guardarNumero} noValidate className="mt-6 rounded-2xl border border-stone-200 bg-stone-50 p-4 md:p-5">
          <label className="block">
            <span className="font-body text-[15px] font-semibold text-stone-800">
              Número del negocio <span className="text-amber-600">*</span>
            </span>
            <span className={cn('mt-2 flex h-12 items-stretch overflow-hidden rounded-xl border bg-white', error ? 'border-red-400' : 'border-stone-200')}>
              <span className="flex shrink-0 items-center gap-1.5 border-r border-stone-200 bg-stone-50 px-3 font-mono text-[15px] text-stone-600">
                <span aria-hidden="true">🇵🇪</span> +51
              </span>
              <Input
                inputMode="tel"
                autoFocus
                value={numero}
                maxLength={11}
                onChange={(e) => {
                  setNumero(e.target.value);
                  setError(null);
                }}
                placeholder="949 376 824"
                aria-invalid={Boolean(error)}
                className="h-full flex-1 rounded-none border-0 bg-transparent px-4 font-mono text-base tracking-wide text-stone-900 shadow-none placeholder:text-stone-400 focus-visible:ring-0 md:text-base"
              />
            </span>
            <span className={cn('mt-1.5 block font-body text-sm', error ? 'text-red-700' : 'text-stone-500')} role={error ? 'alert' : undefined}>
              {error ?? 'El WhatsApp con el que tus clientes ya te escriben. Tiene que estar en un teléfono con WhatsApp activo.'}
            </span>
          </label>
          <button
            type="submit"
            disabled={asignar.isPending}
            className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 font-body text-[15px] font-semibold text-white hover:bg-teal-800 disabled:opacity-60 md:w-auto md:px-6"
          >
            {asignar.isPending ? 'Guardando…' : 'Usar este número'} <Icon name="arrow_forward" className="text-xl" />
          </button>
        </form>
      ) : (
        <>
          <p className="mt-5 flex items-center gap-3 rounded-xl bg-stone-50 px-4 py-3">
            <Icon name="smartphone" className="shrink-0 text-2xl text-stone-500" />
            <span className="min-w-0 flex-1 md:flex md:items-baseline md:gap-2">
              <span className="block font-body text-xs text-stone-500 md:text-[15px] md:text-stone-700">
                Número del negocio<span className="hidden md:inline">:</span>
              </span>
              <span className="block whitespace-nowrap font-mono text-base font-semibold text-stone-900">{telefonoLegible(linea!.numero)}</span>
            </span>
            <span className="shrink-0 rounded-full bg-teal-50 px-2 py-0.5 font-body text-xs font-semibold text-teal-800">Detectado</span>
          </p>
          {linea && <Vincular estado={linea.estado} empresa={empresa} compartida={linea.compartidaCon.length > 0} className="mt-4 shadow-none md:p-5" />}
          <div className={cn('mt-5 rounded-2xl border p-4', conectada ? 'border-emerald-200 bg-emerald-50' : 'border-stone-200 bg-stone-50')}>
            <div className="mb-3 flex items-center justify-between gap-3 md:hidden">
              <p className="font-label text-[12px] font-semibold uppercase tracking-[0.06em] text-stone-600">Estado de confirmación</p>
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border bg-white px-2.5 py-1 font-body text-xs font-semibold',
                  conectada ? 'border-emerald-200 text-emerald-800' : 'border-stone-200 text-stone-600'
                )}
              >
                <span className={cn('size-1.5 rounded-full', conectada ? 'bg-emerald-500' : 'bg-amber-500')} aria-hidden="true" /> {conectada ? 'En línea' : 'Esperando'}
              </span>
            </div>
            <div className="flex items-start gap-3 md:items-center">
              <span
                className={cn('flex size-10 shrink-0 items-center justify-center rounded-full md:size-14', conectada ? 'bg-emerald-600 text-white' : 'bg-stone-200 text-stone-500')}
              >
                <Icon name={conectada ? 'check' : 'hourglass_top'} className="text-2xl md:text-3xl" />
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn('font-headline text-base font-bold', conectada ? 'text-emerald-900' : 'text-stone-900')}>
                  {conectada ? `Conectado: ${telefonoLegible(linea!.numero)} · ${empresa}` : 'Esperando que escanees…'}
                </p>
                <p className={cn('mt-0.5 font-body text-sm', conectada ? 'text-emerald-800' : 'text-stone-600')}>
                  {conectada ? 'WhatsApp vinculado correctamente. Tu asistente ya puede recibir consultas.' : 'Cuando el teléfono termine de vincularse, esto cambia solo.'}
                </p>
              </div>
              {continuar('hidden h-12 shrink-0 px-6 text-base md:inline-flex')}
            </div>
            {continuar('mt-4 flex h-14 w-full text-[17px] shadow-md shadow-teal-700/20 md:hidden')}
          </div>
        </>
      )}

      <div className="mt-4 md:mt-6 md:flex md:items-center md:justify-between md:border-t md:border-stone-200 md:pt-5">
        <Link to="/inicio" className="flex min-h-11 items-center justify-center font-body text-[15px] font-semibold text-stone-600 hover:text-stone-900 md:justify-start">
          Lo hago después
        </Link>
        <PieRegistro texto="Piloto sin costo · Sin tarjeta de crédito" className="md:mt-0" />
      </div>
    </CascaronRegistro>
  );
}
