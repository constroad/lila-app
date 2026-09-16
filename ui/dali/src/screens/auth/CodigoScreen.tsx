import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { useSesion } from '@/lib/session';
import type { Yo } from '@/lib/types';
import { telefonoLegible } from '@/lib/format';
import { Icon } from '@/components/Icon';
import { BrandMark } from '@/components/BrandMark';
import { cn } from '@/lib/utils';

/**
 * P3 «Código de verificación» (diseño `P3-codigo`): la marca con el lema, la
 * tarjeta con «← Cambiar número», la píldora del canal, «Revisa tu WhatsApp»
 * (o tu correo), el destino, seis casillas, «Entrar →», el reenvío con cuenta
 * regresiva, el canal alternativo y la nota ámbar de vigencia.
 */
const LARGO = 6;
const REENVIO_S = 30;

export function CodigoScreen() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { recargar } = useSesion();
  const queryClient = useQueryClient();
  const destino = params.get('destino') ?? '';
  const metodo = params.get('metodo') === 'correo' ? 'correo' : 'whatsapp';
  // P4: el código del registro se confirma con el token del borrador y al entrar sigue el paso 2.
  const tokenRegistro = params.get('token') ?? '';
  const [digitos, setDigitos] = useState<string[]>(Array(LARGO).fill(''));
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [segundos, setSegundos] = useState(REENVIO_S);
  const [reenviado, setReenviado] = useState(false);
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (!destino) navigate('/entrar', { replace: true });
  }, [destino, navigate]);

  useEffect(() => {
    if (segundos <= 0) return;
    const t = setTimeout(() => setSegundos((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [segundos]);

  const codigo = digitos.join('');

  const escribir = (i: number, texto: string) => {
    const solo = texto.replace(/\D/g, '');
    if (!solo) {
      setDigitos((d) => d.map((v, k) => (k === i ? '' : v)));
      return;
    }
    // Pegar los seis de una vez también vale.
    setDigitos((d) => {
      const copia = [...d];
      solo
        .split('')
        .slice(0, LARGO - i)
        .forEach((c, k) => (copia[i + k] = c));
      return copia;
    });
    refs.current[Math.min(i + solo.length, LARGO - 1)]?.focus();
    setError(null);
  };

  const tecla = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digitos[i] && i > 0) refs.current[i - 1]?.focus();
    if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
    if (e.key === 'ArrowRight' && i < LARGO - 1) refs.current[i + 1]?.focus();
  };

  const entrar = async (e?: FormEvent) => {
    e?.preventDefault();
    if (codigo.length < LARGO) {
      setError('Escribe los 6 dígitos.');
      return;
    }
    setEnviando(true);
    try {
      if (tokenRegistro) {
        // La sesión y la ruta cambian en el mismo render: si no, «solo sin sesión» manda al inicio antes de llegar al paso 2.
        const yo = await api.post<Yo>('/registro/confirmar', { token: tokenRegistro, codigo });
        queryClient.setQueryData(['yo'], yo);
        navigate('/registro/whatsapp', { replace: true });
        return;
      }
      await api.post('/auth/verificar', { destino, codigo });
      await recargar();
      navigate('/inicio', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo verificar. Intenta de nuevo.');
      setDigitos(Array(LARGO).fill(''));
      refs.current[0]?.focus();
    } finally {
      setEnviando(false);
    }
  };

  useEffect(() => {
    if (codigo.length === LARGO && !enviando) void entrar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigo]);

  const reenviar = async () => {
    try {
      await api.post('/auth/codigo', { destino });
      setSegundos(REENVIO_S);
      setReenviado(true);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo reenviar.');
    }
  };

  const mmss = `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, '0')}`;
  const porWhatsApp = metodo === 'whatsapp';

  return (
    <div className="flex min-h-dvh flex-col items-center bg-stone-100 px-4 py-8">
      <div className="w-full max-w-[420px] rounded-xl bg-gradient-to-b from-teal-50/70 to-transparent px-4 pt-6">
        <BrandMark className="justify-center" />
        <p className="mt-2 flex items-center justify-center gap-1.5 font-label text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-500">
          <span className="size-1.5 rounded-full bg-emerald-500" /> Asistente oficial para WhatsApp
        </p>
        <form onSubmit={entrar} noValidate className="mt-5 rounded-xl bg-white px-5 pb-6 pt-5 shadow-sm ring-1 ring-stone-200/90 sm:px-7">
          <Link to={tokenRegistro ? '/registro' : '/entrar'} className="inline-flex min-h-11 items-center gap-2 font-body text-sm text-stone-600 hover:text-stone-900">
            <Icon name="arrow_back" className="text-xl" /> {tokenRegistro ? 'Volver al registro' : porWhatsApp ? 'Cambiar número' : 'Cambiar correo'}
          </Link>
          <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-teal-100/80 bg-teal-50 px-3 py-1 font-label text-sm font-semibold text-teal-800">
            <Icon name={porWhatsApp ? 'chat' : 'mail'} className="text-base" /> {porWhatsApp ? 'WhatsApp Oficial' : 'Correo'}
          </span>
          <h1 className="mt-3 font-headline text-2xl font-bold tracking-tight text-stone-900">{porWhatsApp ? 'Revisa tu WhatsApp' : 'Revisa tu correo'}</h1>
          <p className="mt-1.5 font-body text-[15px] text-stone-600">
            Te mandamos un código de 6 dígitos al
            <br />
            <span className="font-mono font-semibold text-stone-900">{porWhatsApp ? telefonoLegible(destino) : destino}</span>
          </p>

          <div className="mt-5 flex justify-between gap-2" role="group" aria-label="Código de 6 dígitos">
            {digitos.map((d, i) => {
              const activo = digitos.findIndex((v) => !v) === i;
              return (
                <input
                  key={i}
                  ref={(el) => {
                    refs.current[i] = el;
                  }}
                  value={d}
                  onChange={(e) => escribir(i, e.target.value)}
                  onKeyDown={(e) => tecla(i, e)}
                  onFocus={(e) => e.target.select()}
                  inputMode="numeric"
                  autoComplete={i === 0 ? 'one-time-code' : 'off'}
                  maxLength={LARGO}
                  aria-label={`Dígito ${i + 1}`}
                  aria-invalid={Boolean(error)}
                  className={cn(
                    'h-14 w-full min-w-0 rounded-lg border-2 text-center font-mono text-2xl font-semibold text-stone-900 transition-all focus:outline-none',
                    d ? 'border-stone-200 bg-white shadow-sm' : 'border-stone-200/90 bg-stone-50/70 shadow-inner',
                    activo && 'border-teal-700 bg-teal-50/20 ring-4 ring-teal-100',
                    error && 'border-red-400'
                  )}
                />
              );
            })}
          </div>
          {error && (
            <p className="mt-2 flex items-center gap-1.5 font-body text-[13px] text-red-600">
              <Icon name="error" className="text-base" /> {error}
            </p>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-teal-700 font-headline text-[17px] font-bold text-white shadow-md shadow-teal-700/20 transition-colors hover:bg-teal-800 disabled:opacity-60"
          >
            {enviando ? 'Verificando…' : 'Entrar'} <Icon name="arrow_forward" className="text-xl" />
          </button>

          <div className={cn('mt-5 flex flex-wrap items-center justify-center gap-2 font-body text-sm text-stone-500', tokenRegistro && 'hidden')}>
            <span>¿No llegó?</span>
            {segundos > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1 font-mono text-[13px] text-stone-500">
                <Icon name="timer" className="text-base" /> Reenviar en {mmss}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => void reenviar()}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-teal-50 px-3 font-semibold text-teal-800 hover:bg-teal-100"
              >
                <Icon name="replay" className="text-base" /> {reenviado ? 'Reenviar otra vez' : 'Reenviar código'}
              </button>
            )}
          </div>
          {tokenRegistro ? (
            <p className="mt-3 text-center font-body text-sm text-stone-500">¿No llegó? Vuelve al registro y pide el código de nuevo.</p>
          ) : (
            <Link to={`/entrar`} className="mt-3 flex min-h-10 items-center justify-center gap-1.5 font-body text-sm font-semibold text-teal-800 hover:underline">
              <Icon name={porWhatsApp ? 'mail' : 'chat'} className="text-lg" /> {porWhatsApp ? 'Recibirlo por correo' : 'Recibirlo por WhatsApp'}
            </Link>
          )}

          <p className="mt-5 flex items-start gap-2 rounded-lg border border-amber-200/80 bg-amber-50 px-3 py-2.5 font-body text-[13px] leading-snug text-amber-800">
            <Icon name="lock" className="mt-0.5 text-lg text-amber-600" /> El código vence en 10 minutos y solo sirve una vez.
          </p>
        </form>
      </div>
    </div>
  );
}
