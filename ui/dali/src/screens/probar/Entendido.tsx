import { Icon } from '@/components/Icon';
import { StatusPill } from '@/components/StatusPill';
import { oracion } from '@/lib/format';
import type { Simulacion } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * «Lo que Dali entendió» (A15): los datos del guion que ya tiene, el paso
 * activo y las señales del último mensaje. Todo sale del estado real del
 * motor: ninguna certeza inventada.
 */
export function Entendido({ ultima, pendiente }: { ultima: Simulacion | null; pendiente: boolean }) {
  const listos = ultima?.campos.filter((c) => c.estado === 'listo').length ?? 0;
  const total = ultima?.campos.length ?? 0;
  const activo = ultima?.campos.find((c) => c.estado === 'activo');
  const indiceActivo = activo ? ultima!.campos.indexOf(activo) + 1 : 0;
  const senales: Array<[string, boolean]> = ultima
    ? [
        ['¿Preguntó precio?', ultima.senales.preguntaPrecio],
        ['¿Pide asesor humano?', ultima.senales.quierePersona],
        ['¿Fuera de tema?', ultima.senales.fueraDeTema],
        ['¿Confirmó el resumen?', ultima.senales.confirma],
      ]
    : [];
  return (
    <section className="rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-stone-100 px-4 py-4 md:px-5">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-teal-100 bg-teal-50 text-teal-700">
            <Icon name="psychology" className="text-2xl" />
          </span>
          <div>
            <h2 className="font-headline text-lg font-bold tracking-tight text-stone-900">Lo que Dali entendió</h2>
            <p className="font-body text-sm text-stone-500">Del estado real del guion, mensaje a mensaje</p>
          </div>
        </div>
        <StatusPill tono="teal" className="shrink-0">
          En vivo
        </StatusPill>
      </div>

      {!ultima ? (
        <p className="px-5 py-8 text-center font-body text-[15px] text-stone-500">{pendiente ? 'Dali está leyendo el mensaje…' : 'Escríbele a Dali para ver qué entiende.'}</p>
      ) : (
        <div className="space-y-5 px-4 py-4 md:px-5">
          <div>
            <div className="flex items-center justify-between gap-3">
              <p className="font-label text-xs font-bold uppercase tracking-[0.1em] text-stone-700">Variables capturadas (cotizador)</p>
              <span className="rounded-lg bg-teal-50 px-2.5 py-1 font-mono text-sm text-teal-800">
                {listos} de {total} campos listos
              </span>
            </div>
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Icon name="construction" className="shrink-0 text-xl text-teal-700" />
                  <div className="min-w-0">
                    <p className="font-body text-sm text-stone-500">Servicio detectado</p>
                    <p className="truncate font-body text-[15px] font-semibold text-stone-900">{ultima.servicio ? oracion(ultima.servicio.nombre) : 'Todavía no lo dijo'}</p>
                  </div>
                </div>
                {ultima.servicio && (
                  <StatusPill tono="teal" punto={false} className="shrink-0">
                    {ultima.servicio.porPalabras ? 'Por tus palabras' : 'Por el pack'}
                  </StatusPill>
                )}
              </div>
              {ultima.campos.map((c) => (
                <div
                  key={c.campo}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-xl border px-4 py-3',
                    c.estado === 'activo' ? 'border-amber-300 bg-amber-50/70' : 'border-stone-200 bg-white'
                  )}
                >
                  <div className="min-w-0">
                    <p className={cn('font-body text-sm', c.estado === 'activo' ? 'text-amber-800' : 'text-stone-500')}>{c.etiqueta}</p>
                    <p
                      className={cn(
                        'truncate font-body text-[15px]',
                        c.estado === 'listo' ? 'font-mono font-semibold text-stone-900' : c.estado === 'activo' ? 'italic text-amber-900' : 'text-stone-400'
                      )}
                    >
                      {c.estado === 'listo' ? c.valor : c.estado === 'activo' ? 'Esperando respuesta del cliente…' : 'Paso posterior'}
                    </p>
                  </div>
                  {c.estado === 'listo' && (
                    <StatusPill tono="emerald" punto={false} className="shrink-0">
                      <Icon name="check" className="text-sm" /> Anotado
                    </StatusPill>
                  )}
                  {c.estado === 'activo' && (
                    <StatusPill tono="amber" punto={false} className="shrink-0">
                      <Icon name="hourglass_top" className="text-sm" /> Pendiente
                    </StatusPill>
                  )}
                </div>
              ))}
              {!ultima.campos.length && ultima.servicio && <p className="font-body text-sm text-stone-500">Este servicio pasa directo a un asesor: no junta datos.</p>}
            </div>
          </div>

          {activo && (
            <div>
              <p className="font-label text-xs font-bold uppercase tracking-[0.1em] text-stone-700">
                Paso activo del guion ({indiceActivo} de {total})
              </p>
              <div className="mt-2 rounded-xl border border-stone-200 bg-stone-50 p-4">
                <p className="flex items-start gap-2 font-body text-[15px] font-semibold text-stone-900">
                  <Icon name="call_split" className="mt-0.5 shrink-0 text-xl text-teal-700" /> {activo.pregunta}
                </p>
                {activo.opciones?.length ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="font-body text-sm text-stone-500">Opciones esperadas:</span>
                    {activo.opciones.map((o) => (
                      <span key={o} className="inline-flex h-8 items-center rounded-lg border border-stone-200 bg-white px-2.5 font-body text-sm text-stone-700">
                        {o}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          )}

          <div>
            <p className="font-label text-xs font-bold uppercase tracking-[0.1em] text-stone-700">Señales y detección</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {senales.map(([k, v]) => (
                <div
                  key={k}
                  className={cn('flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5', v ? 'border-amber-200 bg-amber-50' : 'border-stone-200 bg-white')}
                >
                  <span className="font-body text-sm text-stone-600">{k}</span>
                  <span className={cn('font-body text-sm font-bold', v ? 'text-amber-900' : 'text-stone-900')}>{v ? 'Sí' : 'No'}</span>
                </div>
              ))}
              <div
                className={cn(
                  'col-span-2 flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5',
                  ultima.escalar ? 'border-red-200 bg-red-50' : ultima.lead.listo ? 'border-emerald-200 bg-emerald-50' : 'border-stone-200 bg-white'
                )}
              >
                <span className="font-body text-sm text-stone-600">{ultima.escalar ? 'Pasaría a un asesor' : 'Lead'}</span>
                <span className="text-right font-body text-sm font-bold text-stone-900">
                  {ultima.escalar ? ultima.escalar : ultima.lead.listo ? 'Listo para cotizar' : ultima.servicio ? 'Juntando datos' : 'Sin servicio aún'}
                </span>
              </div>
            </div>
            <p className="mt-3 font-mono text-xs text-stone-500">
              {ultima.motor === 'qwen-local' ? 'Qwen local' : 'Solo reglas (sin modelo local)'} · {(ultima.duracionMs / 1000).toFixed(1)} s
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
