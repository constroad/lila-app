import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { EstadoLinea, Vinculacion } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/Icon';
import { Segmentado } from '@/components/Segmentado';
import { StatusPill } from '@/components/StatusPill';
import { CabeceraTarjeta, Tarjeta } from '@/screens/asistente/cards';

/**
 * «Vincular dispositivo» (A14): el QR que Baileys rota cada 20 s (se pide
 * cada 5 s a `POST whatsapp/vincular {metodo:'qr'}` mientras el panel está a
 * la vista y la línea no está conectada), o el código de ocho letras para
 * vincular con el número. Con la línea ya conectada no hay QR que mostrar:
 * se dice, y para cambiar de teléfono hay que desconectar primero.
 */
type Metodo = 'qr' | 'codigo';

const PASOS_QR = [
  <>
    Abre <b className="font-semibold text-stone-900">WhatsApp</b> en tu teléfono personal o del negocio.
  </>,
  <>
    Toca <b className="font-semibold text-stone-900">Ajustes / Menú (⋮)</b> y selecciona <b className="font-semibold text-stone-900">Dispositivos vinculados</b>.
  </>,
  <>
    Toca <b className="font-semibold text-teal-800">Vincular un dispositivo</b> y apunta tu cámara a este código QR.
  </>,
];
const PASOS_CODIGO = [
  <>
    Abre <b className="font-semibold text-stone-900">WhatsApp</b> en el teléfono del negocio y entra a <b className="font-semibold text-stone-900">Dispositivos vinculados</b>.
  </>,
  <>
    Toca <b className="font-semibold text-stone-900">Vincular un dispositivo</b> y luego <b className="font-semibold text-stone-900">Vincular con el número de teléfono</b>.
  </>,
  <>
    Escribe el código de ocho letras <b className="font-semibold text-teal-800">tal como aparece aquí</b>.
  </>,
];

const segundosRestantes = (v: Vinculacion | undefined, ahoraMs: number): number | null => {
  if (!v?.generadoEn) return null;
  return Math.max(0, Math.round((Date.parse(v.generadoEn) + v.vigenciaS * 1000 - ahoraMs) / 1000));
};

export function Vincular({ estado, empresa, compartida, className }: { estado: EstadoLinea; empresa: string; compartida: boolean; className?: string }) {
  const [metodo, setMetodo] = useState<Metodo>('qr');
  const [ahoraMs, setAhoraMs] = useState(() => Date.now());
  const conectada = estado === 'conectado';
  const qr = useQuery({
    queryKey: ['whatsapp', 'vincular', 'qr'],
    queryFn: () => api.post<Vinculacion>('/whatsapp/vincular', { metodo: 'qr' }),
    enabled: metodo === 'qr' && !conectada && estado !== 'sin-numero',
    refetchInterval: 5_000,
    retry: false,
  });
  const codigo = useMutation({
    mutationFn: () => api.post<{ codigo: string }>('/whatsapp/vincular', { metodo: 'codigo' }),
    onError: (e: Error) => toast.error(e.message || 'No se pudo generar el código'),
  });
  const hayQr = qr.data?.estado === 'qr';
  useEffect(() => {
    if (!hayQr) return;
    const t = setInterval(() => setAhoraMs(Date.now()), 1_000);
    return () => clearInterval(t);
  }, [hayQr]);
  const restan = segundosRestantes(qr.data, ahoraMs);

  return (
    <Tarjeta className={cn('scroll-mt-24', className)} id="vincular">
      <CabeceraTarjeta
        icon="qr_code_scanner"
        titulo="Vincular dispositivo"
        detalle={conectada ? 'Escanea para cambiar de teléfono o reanudar la sesión.' : `Usa tu WhatsApp oficial de ${empresa}`}
        derecha={
          <StatusPill tono="teal" punto={false} className="hidden whitespace-nowrap xl:inline-flex">
            Multi-dispositivo
          </StatusPill>
        }
        divisor={false}
      />
      <Segmentado
        className="mt-4"
        label="Método para vincular"
        valor={metodo}
        onChange={(m) => {
          setMetodo(m);
          if (m === 'codigo') codigo.reset();
        }}
        opciones={[
          { valor: 'qr', label: 'Código QR', icon: 'qr_code_2' },
          { valor: 'codigo', label: 'Código por texto', icon: 'pin' },
        ]}
        iconoDesdeMd
      />

      {conectada ? (
        <div className="mt-4 rounded-2xl border border-dashed border-emerald-300 bg-emerald-50/60 px-5 py-8 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <Icon name="check_circle" className="text-[32px]" />
          </span>
          <p className="mt-3 font-headline text-lg font-bold text-stone-900">Este número ya está vinculado</p>
          <p className="mx-auto mt-1 max-w-xs font-body text-[15px] text-stone-600">
            {compartida
              ? 'Lo comparten varias empresas: para cambiar de teléfono, escríbenos y lo hacemos contigo.'
              : 'Para cambiar de teléfono, primero desconecta la línea y vuelve a escanear.'}
          </p>
        </div>
      ) : estado === 'sin-numero' ? (
        <div className="mt-4 rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-5 py-8 text-center font-body text-[15px] text-stone-600">
          Tu empresa todavía no tiene un número de WhatsApp configurado. Escríbenos para activarlo.
        </div>
      ) : metodo === 'qr' ? (
        <ZonaQr vinculacion={qr.data} cargando={qr.isPending} error={qr.error as Error | null} restan={restan} onActualizar={() => void qr.refetch()} />
      ) : (
        <ZonaCodigo codigo={codigo.data?.codigo} generando={codigo.isPending} onGenerar={() => codigo.mutate()} />
      )}

      {!conectada && estado !== 'sin-numero' && (
        <>
          <p className="mt-5 font-label text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-500">Pasos para conectar</p>
          <ol className="mt-3 space-y-3">
            {(metodo === 'qr' ? PASOS_QR : PASOS_CODIGO).map((paso, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-stone-300 bg-stone-50 font-mono text-sm font-semibold text-stone-700 lg:border-teal-700 lg:bg-teal-700 lg:text-white">
                  {i + 1}
                </span>
                <p className="font-body text-[15px] leading-relaxed text-stone-600">{paso}</p>
              </li>
            ))}
          </ol>
          {metodo === 'qr' && (
            <p className="mt-5 hidden border-t border-stone-100 pt-4 font-body text-sm text-stone-500 lg:block">
              ¿No puedes escanear con la cámara?{' '}
              <button type="button" onClick={() => setMetodo('codigo')} className="font-semibold text-teal-800 underline underline-offset-4">
                Vincular con tu número de teléfono
              </button>
            </p>
          )}
        </>
      )}
    </Tarjeta>
  );
}

function ZonaQr({
  vinculacion,
  cargando,
  error,
  restan,
  onActualizar,
}: {
  vinculacion?: Vinculacion;
  cargando: boolean;
  error: Error | null;
  restan: number | null;
  onActualizar: () => void;
}) {
  const estado = vinculacion?.estado;
  return (
    <div className="mt-4 rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-4">
      {estado === 'qr' && vinculacion?.qrImagen ? (
        <>
          <div className="mx-auto w-fit rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
            <img src={vinculacion.qrImagen} alt="Código QR para vincular WhatsApp" width={224} height={224} className="size-56 [image-rendering:pixelated]" />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 font-body text-sm text-stone-600">
            <span className="inline-flex items-center gap-1.5">
              <Icon name="timer" className="text-lg text-amber-600" />
              Se renueva en <span className="font-mono font-semibold text-stone-900">{restan ?? '–'} s</span>
            </span>
            <button type="button" onClick={onActualizar} className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-teal-800 hover:underline">
              <Icon name="refresh" className="text-lg" /> Actualizar QR
            </button>
          </div>
        </>
      ) : (
        <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-center">
          <span className={cn('flex size-14 items-center justify-center rounded-full', error ? 'bg-red-50 text-red-600' : 'bg-teal-50 text-teal-700')}>
            <Icon name={error ? 'error' : estado === 'vinculando' ? 'link' : 'qr_code_2'} className={cn('text-[32px]', !error && estado !== 'vinculando' && 'animate-pulse')} />
          </span>
          <p className="font-headline text-base font-bold text-stone-900">
            {error ? 'No se pudo preparar el código' : estado === 'vinculando' ? 'Código escaneado' : cargando ? 'Preparando el código…' : 'Esperando a WhatsApp…'}
          </p>
          <p className="max-w-xs font-body text-sm text-stone-500">
            {error
              ? error.message
              : estado === 'vinculando'
                ? 'WhatsApp está terminando de vincular el teléfono. Puede tardar hasta un minuto; no cierres esta pantalla.'
                : 'En unos segundos aparece el código QR para escanear.'}
          </p>
          {error && (
            <button type="button" onClick={onActualizar} className="inline-flex min-h-11 items-center gap-1.5 font-body text-[15px] font-semibold text-teal-800 hover:underline">
              <Icon name="refresh" className="text-lg" /> Reintentar
            </button>
          )}
        </div>
      )}
      <p className="mt-4 flex items-center justify-center gap-1.5 border-t border-stone-200 pt-3 font-body text-xs text-stone-500">
        <Icon name="smart_toy" className="text-base text-teal-700" /> El código se actualiza cada 20 segundos
      </p>
    </div>
  );
}

function ZonaCodigo({ codigo, generando, onGenerar }: { codigo?: string; generando: boolean; onGenerar: () => void }) {
  const copiar = () => {
    if (!codigo) return;
    void navigator.clipboard?.writeText(codigo).then(() => toast.success('Código copiado'));
  };
  return (
    <div className="mt-4 rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-5 text-center">
      {codigo ? (
        <>
          <p className="font-label text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-500">Tu código de vinculación</p>
          <p className="mt-2 font-mono text-4xl font-bold tracking-[0.2em] text-stone-900">{codigo}</p>
          <p className="mt-2 font-body text-sm text-stone-500">Vale unos minutos. Escríbelo en WhatsApp → Vincular con el número de teléfono.</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={copiar}
              className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-4 font-body text-[15px] font-semibold text-stone-800 hover:bg-stone-50"
            >
              <Icon name="content_copy" className="text-lg" /> Copiar
            </button>
            <button
              type="button"
              onClick={onGenerar}
              disabled={generando}
              className="inline-flex h-11 items-center gap-1.5 px-3 font-body text-[15px] font-semibold text-teal-800 hover:underline disabled:opacity-50"
            >
              <Icon name="refresh" className="text-lg" /> Otro código
            </button>
          </div>
        </>
      ) : (
        <>
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-teal-50 text-teal-700">
            <Icon name="pin" className="text-[32px]" />
          </span>
          <p className="mt-3 font-headline text-base font-bold text-stone-900">Vincular sin cámara</p>
          <p className="mx-auto mt-1 max-w-xs font-body text-sm text-stone-500">
            WhatsApp te pide un código de ocho letras en vez del QR. Lo generamos para el número de tu empresa.
          </p>
          <button
            type="button"
            onClick={onGenerar}
            disabled={generando}
            className="mt-4 inline-flex h-12 items-center gap-2 rounded-xl bg-teal-700 px-5 font-body text-[15px] font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
          >
            <Icon name="pin" className="text-xl" /> {generando ? 'Generando…' : 'Generar código'}
          </button>
        </>
      )}
    </div>
  );
}
