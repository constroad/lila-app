import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { diaCorto, numero, telefonoLegible } from '@/lib/format';
import type { Inicio, PlanYUso, Semana } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/Icon';
import type { IconName } from '@/components/icon-map';
import { StatusPill } from '@/components/StatusPill';
import { useAccionesDeBarra } from '@/layout/barra';
import { Tarjeta } from '@/screens/asistente/cards';

/**
 * A17 «Plan y uso» (diseños `A17-plan` móvil, tablet y escritorio): lo que la
 * empresa usa este ciclo y cómo viene la actividad (`GET plan`). El diseño
 * dibuja un «Plan Negocio» de S/ 149, un «Plan Crecimiento» de S/ 299,
 * comprobantes y pagos: nada de eso existe todavía. El único plan es el
 * piloto, sin costo; los planes de pago se definen al cerrar el piloto, y la
 * pantalla lo dice en vez de inventar precios. Lo real: mensajes de WhatsApp
 * del mes contra la cuota, respuestas de Dali, número conectado, equipo y
 * conversaciones por semana.
 */
const SIN_LIMITE = -1;

const fechaLarga = (fecha: string): string => {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('es-PE', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
};

export function PlanScreen() {
  const { data: inicio } = useQuery({ queryKey: ['inicio'], queryFn: () => api.get<Inicio>('/inicio'), staleTime: 60_000 });
  const { data: plan, isPending } = useQuery({ queryKey: ['plan'], queryFn: () => api.get<PlanYUso>('/plan'), staleTime: 60_000 });

  useAccionesDeBarra(
    <Link
      to="/probar"
      className="inline-flex h-11 items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 font-body text-[15px] font-semibold text-stone-800 hover:bg-stone-50"
    >
      <Icon name="play_circle" className="text-xl" /> Probar a Dali
    </Link>,
    []
  );

  if (isPending || !plan) return <PlanEsqueleto />;
  const { ciclo } = plan.plan;
  const { uso } = plan;
  const conTope = uso.mensajesLimite !== SIN_LIMITE;
  const porcentaje = conTope && uso.mensajesLimite > 0 ? Math.min(100, Math.round((uso.mensajesMes / uso.mensajesLimite) * 100)) : null;
  const disponibles = conTope ? Math.max(0, uso.mensajesLimite - uso.mensajesMes) : null;
  const pctMiembros = Math.round((uso.miembros.usados / uso.miembros.limite) * 100);

  return (
    <div className="md:px-6 md:pb-10 xl:px-10">
      <header className="sticky top-0 z-30 flex items-center gap-1 border-b border-stone-200 bg-white/95 px-2 py-2 backdrop-blur-md md:hidden">
        <Link to="/inicio" aria-label="Volver al inicio" className="flex size-11 shrink-0 items-center justify-center rounded-full text-stone-700 hover:bg-stone-100">
          <Icon name="arrow_back" className="text-2xl" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-headline text-lg font-bold leading-tight tracking-tight text-stone-900">Plan y uso</h1>
          <p className="truncate font-body text-sm text-stone-500">
            {inicio?.empresa.nombre ?? '…'} {inicio?.empresa.rubro && <span className="text-stone-300">• </span>}
            {inicio?.empresa.rubro}
          </p>
        </div>
        <Link to="/probar" aria-label="Probar a Dali" className="flex size-11 shrink-0 items-center justify-center rounded-full text-stone-700 hover:bg-stone-100">
          <Icon name="help_outline" className="text-2xl" />
        </Link>
      </header>

      <div className="hidden pt-6 md:block xl:pt-8">
        <h1 className="font-headline text-3xl font-bold tracking-tight text-stone-900 xl:text-4xl">Plan y uso</h1>
        <p className="mt-1.5 max-w-2xl font-body text-[15px] leading-relaxed text-stone-500 xl:text-lg">
          Lo que tu empresa usa en este ciclo y cómo viene la actividad en WhatsApp. Durante el piloto no hay costo ni comprobantes.
        </p>
      </div>

      <div className="grid gap-4 px-4 pb-32 pt-4 md:px-0 md:pb-0 md:pt-6 lg:gap-6">
        <Tarjeta>
          <div className="flex items-center justify-between gap-3 border-b border-stone-100 pb-4">
            <p className="flex items-center gap-2 font-label text-xs font-semibold uppercase tracking-[0.12em] text-stone-600">
              <Icon name="verified" className="text-2xl text-teal-700" /> Suscripción activa
            </p>
            <StatusPill tono="emerald" className="text-xs">
              Activo
            </StatusPill>
          </div>
          <div className="mt-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="font-headline text-3xl font-bold tracking-tight text-stone-900 md:text-4xl">Plan {plan.plan.nombre}</h2>
              <p className="mt-1 font-body text-[15px] text-stone-500">Asistente Dali atendiendo en tu WhatsApp</p>
            </div>
            <div className="text-right">
              <p className="whitespace-nowrap font-mono text-2xl font-bold leading-none text-teal-800 md:text-4xl">Sin costo</p>
              <p className="mt-1 font-body text-sm text-stone-500">durante el piloto</p>
            </div>
          </div>
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-stone-50 px-4 py-3 font-body text-[15px] leading-relaxed text-stone-600">
            <Icon name="calendar_month" className="mt-0.5 shrink-0 text-xl text-stone-500" />
            <span>
              <b className="font-semibold text-stone-900">El ciclo se renueva el {diaCorto(ciclo.renuevaEl)}</b> · Los planes de pago se definen al cerrar el piloto; te avisamos
              antes de cobrar nada.
            </span>
          </p>
        </Tarjeta>

        <Tarjeta>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 font-headline text-xl font-bold tracking-tight text-stone-900">
                <Icon name="data_usage" className="hidden text-2xl text-teal-700 md:inline-block" />
                <span className="md:hidden">Uso de este mes</span>
                <span className="hidden md:inline">Uso del ciclo actual</span>
              </h2>
              <p className="mt-0.5 font-body text-sm text-stone-500">
                <span className="hidden md:inline">
                  ({diaCorto(ciclo.desde)} – {diaCorto(ciclo.hasta)} · {ciclo.diasRestantes} {ciclo.diasRestantes === 1 ? 'día restante' : 'días restantes'}) ·{' '}
                </span>
                Cierre: {fechaLarga(ciclo.hasta)} 23:59
              </p>
            </div>
            <StatusPill tono={porcentaje !== null && porcentaje >= 90 ? 'amber' : 'teal'} punto={false} className="shrink-0 whitespace-nowrap font-mono text-sm">
              {porcentaje !== null ? `${porcentaje}% global` : 'Sin tope'}
            </StatusPill>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-2 md:gap-4 xl:grid-cols-4">
            <Consumo
              icon="forum"
              titulo="Mensajes de WhatsApp enviados"
              valor={uso.mensajesMes}
              limite={conTope ? uso.mensajesLimite : null}
              porcentaje={porcentaje}
              pie={disponibles !== null ? `${numero(disponibles)} disponibles` : 'Todo lo que salió por la línea este mes (Dali y avisos); sin tope en el piloto'}
              pieDerecha={porcentaje !== null ? `${porcentaje}% consumido` : undefined}
            />
            <Consumo
              icon="phone_iphone"
              titulo="Números WhatsApp conectados"
              valor={uso.numeros.usados}
              limite={uso.numeros.limite}
              porcentaje={Math.round((uso.numeros.usados / uso.numeros.limite) * 100)}
              tono="amber"
              chip={uso.numeros.usados >= uso.numeros.limite ? 'Límite' : undefined}
              pie={uso.numeros.principal ? `Línea activa: ${telefonoLegible(uso.numeros.principal)}` : 'Sin número configurado'}
              pieMono
            />
            <Consumo
              icon="badge"
              titulo="Miembros del equipo"
              valor={uso.miembros.usados}
              limite={uso.miembros.limite}
              porcentaje={pctMiembros}
              pie={uso.miembros.nombres.join(', ') || 'Nadie todavía'}
            />
            <Consumo
              icon="smart_toy"
              titulo="Respuestas de Dali este mes"
              valor={uso.respuestasDali}
              limite={null}
              porcentaje={null}
              chip="Sin límite"
              pie="Respuestas, cotizaciones y seguimientos"
            />
          </div>

          <p className="mt-5 flex items-start gap-3 rounded-xl border border-teal-100 bg-teal-50 px-4 py-3 font-body text-[15px] leading-relaxed text-teal-900">
            <Icon name="security" className="mt-0.5 shrink-0 text-xl text-teal-700" />
            <span>
              <b className="font-semibold">Sin sorpresas durante el piloto:</b> no hay tope de mensajes y Dali sigue respondiendo. Cuando existan planes con límite, te avisaremos
              antes de llegar a él.
            </span>
          </p>
        </Tarjeta>

        <GraficoSemanas semanas={plan.semanas} promedio={plan.promedioSemanal} variacion={plan.variacionPct} />

        <Tarjeta>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-headline text-xl font-bold tracking-tight text-stone-900">Planes</h2>
              <p className="mt-0.5 font-body text-[15px] text-stone-500">Hoy hay uno solo: el piloto. Los de pago llegan cuando cierre.</p>
            </div>
            <Icon name="trending_up" className="shrink-0 text-2xl text-stone-400" />
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border-2 border-teal-200 bg-white p-4 md:p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="font-label text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">Plan {plan.plan.nombre}</p>
                <StatusPill tono="teal" punto={false} className="text-xs">
                  Tu plan actual
                </StatusPill>
              </div>
              <p className="mt-2 font-mono text-3xl font-bold text-stone-900">
                Sin costo <span className="font-body text-base font-normal text-stone-500">/ mes</span>
              </p>
              <ul className="mt-4 space-y-2.5">
                {[
                  <>
                    <b className="font-semibold text-stone-900">1 línea de WhatsApp</b> conectada
                  </>,
                  <>
                    <b className="font-semibold text-stone-900">Mensajes sin tope</b> durante el piloto
                  </>,
                  <>Guion de servicios, preguntas frecuentes y catálogo</>,
                  <>
                    Hasta <b className="font-semibold text-stone-900">{uso.miembros.limite} accesos</b> para tu equipo
                  </>,
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2 font-body text-[15px] text-stone-600">
                    <Icon name="check_circle" className="mt-0.5 shrink-0 text-xl text-teal-700" /> <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-4 md:p-5">
              <p className="font-label text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">Planes de pago</p>
              <p className="mt-2 font-headline text-xl font-bold text-stone-900">En camino</p>
              <p className="mt-2 font-body text-[15px] leading-relaxed text-stone-600">
                Los definimos al cerrar el piloto, con lo que de verdad usa cada empresa: líneas, mensajes y personas. Ningún cobro sin avisarte antes.
              </p>
            </div>
          </div>
        </Tarjeta>

        <Tarjeta>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-headline text-xl font-bold tracking-tight text-stone-900">Historial de pagos</h2>
              <p className="mt-0.5 font-body text-[15px] text-stone-500">
                {plan.facturacion.ruc ? `A nombre de ${plan.facturacion.razonSocial} · RUC ${plan.facturacion.ruc}` : `A nombre de ${plan.facturacion.razonSocial}`}
              </p>
            </div>
            <Icon name="receipt_long" className="shrink-0 text-2xl text-stone-400" />
          </div>
          <div className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-center">
            <Icon name="history" className="text-[32px] text-stone-400" />
            <p className="font-headline text-base font-bold text-stone-900">Sin pagos todavía</p>
            <p className="max-w-sm font-body text-sm text-stone-500">El piloto no tiene costo. Cuando haya un plan de pago, aquí verás cada comprobante para descargar.</p>
          </div>
        </Tarjeta>
      </div>
    </div>
  );
}

function Consumo({
  icon,
  titulo,
  valor,
  limite,
  porcentaje,
  pie,
  pieDerecha,
  pieMono = false,
  chip,
  tono = 'teal',
}: {
  icon: IconName;
  titulo: string;
  valor: number;
  limite: number | null;
  porcentaje: number | null;
  pie: string;
  pieDerecha?: string;
  pieMono?: boolean;
  chip?: string;
  tono?: 'teal' | 'amber';
}) {
  const lleno = porcentaje !== null && porcentaje >= 100;
  return (
    <div className="border-b border-stone-100 pb-5 last:border-0 last:pb-0 md:rounded-xl md:border md:border-stone-200 md:bg-stone-50 md:p-4 md:last:border">
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-2 font-body text-[15px] font-medium text-stone-700">
          <Icon name={icon} className="shrink-0 text-2xl text-teal-700" /> {titulo}
        </p>
        {chip && (
          <StatusPill tono={lleno ? 'amber' : 'teal'} punto={false} className="shrink-0 text-xs">
            {chip}
          </StatusPill>
        )}
      </div>
      <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-stone-900 md:text-3xl">
        <span className={cn(porcentaje !== null && !lleno && 'text-teal-800')}>{numero(valor)}</span>
        {limite !== null && <span className="text-lg font-normal text-stone-500 md:text-xl"> / {numero(limite)}</span>}
      </p>
      {porcentaje !== null && (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200">
          <div
            className={cn('h-full rounded-full', lleno && tono === 'amber' ? 'bg-amber-500' : lleno ? 'bg-amber-500' : 'bg-teal-700')}
            style={{ width: `${Math.min(100, porcentaje)}%` }}
          />
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 font-body text-sm text-stone-500">
        <span className={cn(pieMono && 'font-mono')}>{pie}</span>
        {pieDerecha && <span className="font-semibold text-teal-800">{pieDerecha}</span>}
      </div>
    </div>
  );
}

/** Ocho barras, una serie: la semana en curso resaltada; el promedio como línea punteada desde tablet. */
function GraficoSemanas({ semanas, promedio, variacion }: { semanas: Semana[]; promedio: number; variacion: number | null }) {
  const maximo = Math.max(1, ...semanas.map((s) => s.conversaciones));
  const alto = (n: number) => `${Math.max(2, Math.round((n / maximo) * 100))}%`;
  return (
    <Tarjeta>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-headline text-xl font-bold tracking-tight text-stone-900">Conversaciones por semana</h2>
          <p className="mt-0.5 font-body text-[15px] text-stone-500">Últimas 8 semanas de actividad</p>
        </div>
        <span className="rounded-full bg-stone-100 px-3 py-1.5 font-mono text-sm text-stone-700">~{promedio}/sem</span>
      </div>
      <div className="relative mt-6">
        {promedio > 0 && (
          <div
            className="pointer-events-none absolute inset-x-0 hidden border-t border-dashed border-stone-300 md:block"
            style={{ bottom: `calc(${alto(promedio)} * 0.72 + 2rem)` }}
          >
            <span className="absolute right-0 -top-5 font-mono text-xs text-stone-400">Promedio: {promedio}</span>
          </div>
        )}
        <ol className="grid h-64 grid-cols-8 items-end gap-2 md:gap-4" role="list" aria-label="Conversaciones nuevas por semana">
          {semanas.map((s) => (
            <li key={s.desde} className="flex h-full flex-col items-center justify-end gap-1.5" title={`Semana del ${diaCorto(s.desde)}: ${s.conversaciones} conversaciones`}>
              <span className={cn('font-mono text-sm tabular-nums', s.actual ? 'font-bold text-teal-800' : 'text-stone-500')}>{s.conversaciones}</span>
              <div className="flex w-full flex-1 items-end">
                <div
                  className={cn('w-full rounded-t-lg transition-[height]', s.actual ? 'bg-teal-800 ring-2 ring-teal-300 ring-offset-2' : 'bg-teal-500/70')}
                  style={{ height: `calc(${alto(s.conversaciones)} * 0.72)` }}
                  aria-hidden="true"
                />
              </div>
              <span className={cn('font-mono text-xs', s.actual ? 'font-bold text-teal-800' : 'text-stone-500')}>{s.etiqueta}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-4 font-body text-[15px] text-stone-600">
        <span className="flex items-center gap-2">
          <span className="size-3 rounded-sm bg-teal-800" /> Semana en curso (desde el {diaCorto(semanas[semanas.length - 1].desde)})
        </span>
        {variacion !== null ? (
          <span className={cn('font-semibold', variacion >= 0 ? 'text-teal-800' : 'text-amber-800')}>
            {variacion >= 0 ? '+' : ''}
            {variacion}% vs. anterior
          </span>
        ) : (
          <span className="text-stone-400">Sin semana anterior para comparar</span>
        )}
      </div>
    </Tarjeta>
  );
}

function PlanEsqueleto() {
  return (
    <div className="animate-pulse px-4 pt-4 md:px-6 md:pt-6 xl:px-10" aria-busy="true" aria-label="Cargando plan y uso">
      <div className="hidden h-9 w-48 rounded-lg bg-stone-200 md:block" />
      <div className="mt-4 h-52 rounded-2xl bg-stone-200 md:mt-6" />
      <div className="mt-4 h-80 rounded-2xl bg-stone-200" />
      <div className="mt-4 h-72 rounded-2xl bg-stone-200" />
    </div>
  );
}
