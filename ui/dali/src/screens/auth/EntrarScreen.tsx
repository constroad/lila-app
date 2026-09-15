import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '@/lib/api';
import { Icon } from '@/components/Icon';
import { BrandMark } from '@/components/BrandMark';
import { cn } from '@/lib/utils';

/**
 * P2 «Entrar» (diseño `P2-entrar`): la tarjeta centrada con la marca, el
 * título, el conmutador WhatsApp/Correo, el campo con prefijo +51 (o el @), la
 * ayuda debajo, el botón «Enviar código →», y el pie con «Crea tu cuenta» y los
 * términos. Sin contraseñas: el código llega por WhatsApp o el enlace por
 * correo (hoy, en piloto, lo da quien opera Dali: ver `acceso.ts` en lila).
 */
type Metodo = 'whatsapp' | 'correo';

export function EntrarScreen() {
  const navigate = useNavigate();
  const [metodo, setMetodo] = useState<Metodo>('whatsapp');
  const [valor, setValor] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Nueve cifras de Perú → con el 51 adelante, como lo guarda lila.
  const digitos = valor.replace(/\D/g, '');
  const destino = metodo === 'whatsapp' ? (digitos.length === 9 ? `51${digitos}` : digitos) : valor.trim().toLowerCase();
  const valido = metodo === 'whatsapp' ? /^519\d{8}$/.test(destino) : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destino);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!valido) {
      setError(metodo === 'whatsapp' ? 'Escribe tu celular de 9 cifras.' : 'Escribe un correo válido.');
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      await api.post('/auth/codigo', { destino });
      navigate(`/entrar/codigo?destino=${encodeURIComponent(destino)}&metodo=${metodo}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo enviar el código. Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col items-center bg-stone-100 px-4 py-8">
      <form onSubmit={enviar} noValidate className="w-full max-w-[420px] rounded-xl bg-white px-6 pb-7 pt-8 shadow-sm ring-1 ring-stone-200/60 sm:px-8">
        <BrandMark className="justify-center" />
        <h1 className="mt-6 text-center font-headline text-[26px] font-bold tracking-tight text-stone-900">Entra a Dali</h1>
        <p className="mx-auto mt-2 max-w-[300px] text-center font-body text-[15px] leading-relaxed text-stone-500">
          Te mandamos un código por WhatsApp o un enlace al correo. <span className="font-semibold text-stone-800">Sin contraseñas.</span>
        </p>

        <div role="tablist" aria-label="Cómo quieres entrar" className="mt-6 grid grid-cols-2 gap-1 rounded-lg bg-stone-100 p-1">
          {(
            [
              ['whatsapp', 'chat', 'Número de WhatsApp'],
              ['correo', 'mail', 'Correo'],
            ] as const
          ).map(([m, icon, label]) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={metodo === m}
              onClick={() => {
                setMetodo(m);
                setValor('');
                setError(null);
              }}
              className={cn(
                'flex min-h-11 items-center justify-center gap-2 rounded-md px-3 font-body text-sm transition-all',
                metodo === m ? 'bg-white font-semibold text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'
              )}
            >
              <Icon name={icon} className={cn('text-lg', metodo === m ? 'text-teal-700' : 'text-stone-400')} />
              <span className="text-left leading-tight">{label}</span>
            </button>
          ))}
        </div>

        <div className="mt-5 flex items-end justify-between">
          <label htmlFor="destino" className="font-body text-sm font-semibold text-stone-800">
            {metodo === 'whatsapp' ? 'Número de celular' : 'Correo corporativo o personal'}
          </label>
          {metodo === 'whatsapp' && <span className="font-label text-xs text-stone-400">Perú (+51)</span>}
        </div>
        <div
          className={cn(
            'mt-1.5 flex h-14 items-stretch overflow-hidden rounded-lg border bg-white transition-shadow focus-within:ring-2 focus-within:ring-teal-600/60',
            error ? 'border-red-400' : 'border-stone-300'
          )}
        >
          {metodo === 'whatsapp' ? (
            <span className="flex items-center gap-1.5 border-r border-stone-200 bg-stone-50 px-3 font-mono text-sm font-semibold text-stone-700">
              <span aria-hidden="true" className="inline-block h-3 w-4 overflow-hidden rounded-[2px]">
                <span className="flex h-full">
                  <span className="w-1/3 bg-[#D91023]" />
                  <span className="w-1/3 bg-white" />
                  <span className="w-1/3 bg-[#D91023]" />
                </span>
              </span>
              +51
            </span>
          ) : (
            <span className="flex items-center pl-3 pr-1 text-stone-400">
              <Icon name="alternate_email" className="text-xl" />
            </span>
          )}
          <input
            id="destino"
            type={metodo === 'whatsapp' ? 'tel' : 'email'}
            inputMode={metodo === 'whatsapp' ? 'numeric' : 'email'}
            autoComplete={metodo === 'whatsapp' ? 'tel-national' : 'email'}
            placeholder={metodo === 'whatsapp' ? '9xx xxx xxx' : 'tu@correo.com'}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby="destino-ayuda"
            className="min-w-0 flex-1 bg-transparent px-3 font-mono text-lg tracking-wide text-stone-900 placeholder:text-stone-300 focus:outline-none"
          />
        </div>
        <p id="destino-ayuda" className={cn('mt-2 flex items-start gap-1.5 font-body text-[13px]', error ? 'text-red-600' : 'text-stone-500')}>
          <Icon name={error ? 'error' : metodo === 'whatsapp' ? 'check_circle' : 'mark_email_read'} className={cn('mt-0.5 text-base', !error && 'text-teal-700')} />
          <span>{error ?? (metodo === 'whatsapp' ? 'Recibirás un código de 6 dígitos por WhatsApp oficial.' : 'Te mandamos un enlace instantáneo para acceder sin clave.')}</span>
        </p>

        <button
          type="submit"
          disabled={enviando}
          className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-teal-700 font-headline text-[17px] font-bold text-white shadow-md shadow-teal-700/20 transition-colors hover:bg-teal-800 active:scale-[0.99] disabled:opacity-60"
        >
          {metodo === 'whatsapp' ? (
            <>
              {enviando ? 'Enviando…' : 'Enviar código'} <Icon name="arrow_forward" className="text-xl" />
            </>
          ) : (
            <>
              <Icon name="send" className="text-xl" /> {enviando ? 'Enviando…' : 'Enviarme el enlace'}
            </>
          )}
        </button>

        <div className="my-6 border-t border-stone-100" />
        <p className="text-center font-body text-sm text-stone-600">
          ¿Tu negocio todavía no está en Dali?{' '}
          <Link to="/registro" className="font-semibold text-teal-800 hover:underline">
            Crea tu cuenta
          </Link>
        </p>
        <p className="mx-auto mt-4 max-w-[300px] text-center font-body text-xs leading-relaxed text-stone-400">
          Al entrar aceptas los{' '}
          <a className="underline" href="#terminos">
            Términos
          </a>{' '}
          y la{' '}
          <a className="underline" href="#privacidad">
            Política de privacidad
          </a>{' '}
          de Dali.
        </p>
      </form>
      <p className="mt-8 font-label text-xs text-stone-400">Dali Perú · Asistente con IA para WhatsApp</p>
    </div>
  );
}
