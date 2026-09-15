import { Link } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { StatusPill } from '@/components/StatusPill';
import { horaDe, iniciales, telefonoLegible } from '@/lib/format';
import type { Asistente } from '@/lib/types';
import { cn } from '@/lib/utils';
import { abiertoAhora, primerMensaje, type Formulario } from './formulario';

/**
 * La columna derecha de A6 en tablet y escritorio: el primer mensaje de Dali
 * tal como saldría con lo que hay en el formulario (se recalcula al escribir),
 * y el resumen de comportamiento. El mensaje del cliente es un ejemplo fijo.
 */
const EJEMPLO_CLIENTE = { nombre: 'Luis Paredes (Transportes)', texto: 'Buenas tardes, necesito cotizar asfalto caliente puesto en obra en Villa El Salvador, son aprox 450 m².' };

export function Previsualizacion({ form, asistente, className }: { form: Formulario; asistente: Asistente; className?: string }) {
  const ahoraMs = Date.now();
  const abierto = abiertoAhora(form.perfil.horario, ahoraMs);
  const mensajes = primerMensaje(form.perfil, asistente.empresa.nombre, abierto);
  const enLinea = asistente.enabled && !asistente.pausadoHasta;
  const resumen: Array<[string, string]> = [
    ['Tono de voz', form.perfil.tono === 'cercano' ? 'Cercano (tuteo peruano)' : 'Formal (usted)'],
    ['Precios de asfalto', form.perfil.reglas.sinPrecios ? 'Solo formal tras cotizar' : 'Orienta sin cifras'],
    ['Entrega', form.perfil.reglas.sinPromesas ? 'Sin promesas: la confirma el asesor' : 'Fecha tentativa, sin descuentos'],
    ['Horario', abierto ? 'Abierto ahora' : 'Cerrado ahora'],
    ['Alertas a', form.avisos.canal === 'dueno' && form.avisos.numeroDueno ? telefonoLegible(form.avisos.numeroDueno) : 'Grupo de ventas'],
  ];
  return (
    <div className={cn('space-y-4', className)}>
      <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm md:p-5">
        <div className="flex items-center justify-between gap-3 border-b border-stone-100 pb-4">
          <h2 className="flex items-center gap-2 font-headline text-lg font-bold tracking-tight text-stone-900">
            <Icon name="visibility" className="text-2xl text-teal-700" /> Vista previa en WhatsApp
          </h2>
          <StatusPill tono="teal" punto={false} className="hidden xl:inline-flex">
            Simulación en vivo
          </StatusPill>
          <span className="font-mono text-xs text-stone-500 xl:hidden">Hoy {horaDe(ahoraMs)}</span>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-stone-200">
          <div className="flex items-center gap-3 bg-teal-900 px-3 py-2.5 text-white">
            <Icon name="arrow_back" className="text-xl text-white/80" />
            <span className="flex size-9 items-center justify-center rounded-full bg-teal-700 font-headline text-xs font-bold ring-2 ring-teal-600">
              {iniciales(asistente.empresa.nombre)}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate font-headline text-[15px] font-bold">{asistente.empresa.nombre}</p>
              <p className="flex items-center gap-1.5 font-body text-xs text-teal-100">
                <span className={cn('size-1.5 rounded-full', enLinea ? 'bg-emerald-400' : 'bg-stone-300')} /> {form.perfil.asistente || 'Dali'} {enLinea ? 'en línea' : 'en pausa'}
              </p>
            </div>
            <Icon name="videocam" className="text-xl text-white/80" />
            <Icon name="call" className="text-xl text-white/80" />
            <Icon name="more_vert" className="text-xl text-white/80" />
          </div>
          <div
            className="space-y-3 px-3 py-4"
            style={{ backgroundColor: 'var(--color-stone-200)', backgroundImage: 'radial-gradient(var(--color-stone-300) 0.8px, transparent 0.8px)', backgroundSize: '14px 14px' }}
          >
            <p className="mx-auto w-fit max-w-full rounded-lg bg-amber-100 px-3 py-1 text-center font-body text-xs leading-snug text-amber-900">
              Los mensajes están cifrados de extremo a extremo
            </p>
            <p className="mx-auto w-fit rounded-lg bg-white/80 px-2.5 py-1 font-mono text-[11px] font-semibold text-stone-500">HOY</p>
            <div className="mr-8 rounded-xl rounded-tl-sm bg-white px-3 py-2 shadow-sm">
              <p className="font-body text-xs font-bold text-teal-800">{EJEMPLO_CLIENTE.nombre}</p>
              <p className="mt-0.5 font-body text-sm leading-relaxed text-stone-800">{EJEMPLO_CLIENTE.texto}</p>
              <p className="mt-1 text-right font-mono text-[11px] text-stone-400">{horaDe(ahoraMs - 120_000)}</p>
            </div>
            {mensajes.map((m, i) => (
              <div key={i} className="ml-8 rounded-xl rounded-tr-sm border border-teal-100 bg-teal-50 px-3 py-2 shadow-sm">
                <p className="flex items-center gap-2 font-body text-xs font-bold text-teal-800">
                  {form.perfil.asistente || 'Dali'}
                  <span className="rounded-md bg-teal-100 px-1.5 py-0.5 text-[10px] font-semibold text-teal-800">Asistente</span>
                </p>
                <p className="mt-0.5 whitespace-pre-line font-body text-sm leading-relaxed text-stone-800">{m}</p>
                <p className="mt-1 flex items-center justify-end gap-1 font-mono text-[11px] text-stone-400">
                  {horaDe(ahoraMs)} <Icon name="done_all" className="text-sm text-teal-600" />
                </p>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 border-t border-stone-200 bg-white px-3 py-2.5">
            <Icon name="mood" className="text-2xl text-stone-400" />
            <Icon name="attach_file" className="text-2xl text-stone-400" />
            <span className="flex h-10 flex-1 items-center rounded-full border border-stone-200 bg-stone-50 px-4 font-body text-sm text-stone-400">
              Escribe un mensaje de prueba…
            </span>
            <Link to="/probar" aria-label="Probar a Dali" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-teal-700 text-white hover:bg-teal-800">
              <Icon name="send" className="text-xl" />
            </Link>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm md:p-5">
        <h3 className="font-label text-xs font-bold uppercase tracking-[0.12em] text-stone-700">Resumen de comportamiento</h3>
        <dl className="mt-3 divide-y divide-stone-100">
          {resumen.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-3 py-2.5">
              <dt className="font-body text-[15px] text-stone-500">{k}:</dt>
              <dd className="text-right font-body text-[15px] font-semibold text-stone-900 first:text-teal-800">{v}</dd>
            </div>
          ))}
        </dl>
        <Link
          to="/probar"
          className="mt-4 flex h-12 items-center justify-center gap-2 rounded-xl border border-teal-200 bg-teal-50 font-body text-[15px] font-semibold text-teal-800 hover:bg-teal-100"
        >
          Probar en simulador interactivo <Icon name="arrow_forward" className="text-xl" />
        </Link>
      </section>
    </div>
  );
}
