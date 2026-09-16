import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { diaCorto, haceCuanto, oracion } from '@/lib/format';
import type { Inicio, PeriodoReporte, Reporte } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/Icon';
import type { IconName } from '@/components/icon-map';
import { Segmentado } from '@/components/Segmentado';
import { StatusPill } from '@/components/StatusPill';
import { useAccionesDeBarra } from '@/layout/barra';
import { Tarjeta } from '@/screens/asistente/cards';

/**
 * A19 «Reportes» (diseños `A19-reportes` móvil, tablet y escritorio): cómo le
 * fue a Dali en la semana, la semana pasada o los últimos 30 días, comparado
 * con el período anterior (`GET reportes?periodo=`). Todo sale de las
 * conversaciones, los leads y los mensajes; lo que el diseño dibuja y no se
 * mide (horas pico, ciclo de venta, servicio «más rentable», PDF) no está.
 */
const PERIODOS: Array<{ valor: PeriodoReporte; label: string }> = [
  { valor: 'semana', label: 'Esta semana' },
  { valor: 'semana-pasada', label: 'Semana pasada' },
  { valor: '30-dias', label: 'Últimos 30 días' },
];
const NOMBRE_PERIODO: Record<PeriodoReporte, string> = { semana: 'esta semana', 'semana-pasada': 'la semana pasada', '30-dias': 'los últimos 30 días' };

export function ReportesScreen() {
  const [periodo, setPeriodo] = useState<PeriodoReporte>('semana');
  const { data: inicio } = useQuery({ queryKey: ['inicio'], queryFn: () => api.get<Inicio>('/inicio'), staleTime: 60_000 });
  const { data: reporte, isPending } = useQuery({ queryKey: ['reportes', periodo], queryFn: () => api.get<Reporte>(`/reportes?periodo=${periodo}`), staleTime: 60_000 });

  useAccionesDeBarra(
    <Link
      to="/probar"
      className="inline-flex h-11 items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 font-body text-[15px] font-semibold text-stone-800 hover:bg-stone-50"
    >
      <Icon name="play_circle" className="text-xl" /> Probar a Dali
    </Link>,
    []
  );

  const selector = <Segmentado label="Período" valor={periodo} onChange={setPeriodo} opciones={PERIODOS} opcionClassName="whitespace-nowrap px-2 text-sm md:text-[15px]" />;
  const r = reporte;

  return (
    <div className="md:px-6 md:pb-10 xl:px-10">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-stone-200 bg-white/95 px-4 py-2 backdrop-blur-md md:hidden">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-teal-800 font-headline text-sm font-bold text-white">
          {(inicio?.empresa.nombre ?? 'D').slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-headline text-base font-bold text-stone-900">
            <span className="truncate">{inicio?.empresa.nombre ?? '…'}</span>
            <StatusPill tono={inicio?.asistente.conectado ? 'emerald' : 'stone'} className="shrink-0 text-[11px]">
              {inicio?.asistente.conectado ? 'En línea' : 'Sin conexión'}
            </StatusPill>
          </p>
          <p className="truncate font-body text-sm text-stone-500">Asistente Dali</p>
        </div>
        <Link to="/probar" aria-label="Probar a Dali" className="flex size-11 shrink-0 items-center justify-center rounded-full text-stone-700 hover:bg-stone-100">
          <Icon name="help_outline" className="text-2xl" />
        </Link>
      </header>

      <div className="px-4 pt-4 md:px-0 md:pt-6 xl:pt-8">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-headline text-3xl font-bold tracking-tight text-stone-900 xl:text-4xl">Reportes</h1>
              <StatusPill tono="teal" punto={false} className="hidden text-sm md:inline-flex">
                Resumen {periodo === '30-dias' ? 'de 30 días' : 'semanal'}
              </StatusPill>
            </div>
            <p className="mt-1.5 max-w-2xl font-body text-[15px] leading-relaxed text-stone-500 xl:text-lg">
              <span className="md:hidden">Resumen de rendimiento y ventas</span>
              <span className="hidden md:inline">Cómo atiende Dali y cómo avanzan los prospectos, comparado con el período anterior.</span>
            </p>
          </div>
          <p className="font-mono text-sm text-stone-400">{r ? `Actualizado ${haceCuanto(Date.parse(r.actualizado))}` : ''}</p>
        </div>
        <div className="mt-4 md:mt-5 md:max-w-lg">{selector}</div>
      </div>

      {isPending || !r ? (
        <ReportesEsqueleto />
      ) : (
        <div className="grid gap-4 px-4 pb-32 pt-4 md:px-0 md:pb-0 md:pt-6 lg:gap-6">
          <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
            <Kpi
              icon="chat_bubble"
              titulo="Conversaciones"
              valor={r.resumen.conversaciones}
              chip={variacionChip(r.resumen.variacionConversaciones)}
              pie={r.resumen.variacionConversaciones !== null ? `vs. período anterior (${r.resumen.anterior.conversaciones})` : 'sin período anterior para comparar'}
            />
            <Kpi
              icon="person_search"
              titulo="Leads"
              valor={r.resumen.leads}
              chip={variacionChip(r.resumen.variacionLeads)}
              pie={r.resumen.variacionLeads !== null ? `vs. período anterior (${r.resumen.anterior.leads})` : 'con servicio identificado'}
            />
            <Kpi
              icon="check_circle"
              titulo="Confirmados"
              valor={r.resumen.confirmados}
              chip={r.resumen.leads ? { texto: `${Math.round((r.resumen.confirmados / r.resumen.leads) * 100)}%`, tono: 'teal' } : undefined}
              pie={r.resumen.leads ? `de los ${r.resumen.leads} leads` : 'con todos los datos'}
            />
            <Kpi
              icon="support_agent"
              titulo="Atendidos por persona"
              valor={r.resumen.atendidos}
              tono="amber"
              chip={
                r.resumen.conversaciones
                  ? { texto: `${Math.round(((r.resumen.conversaciones - r.resumen.atendidos) / r.resumen.conversaciones) * 100)}% solo Dali`, tono: 'teal' }
                  : undefined
              }
              pie="pidieron una persona"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-6">
            <GraficoDias reporte={r} />
            <Tarjeta>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-label text-xs font-semibold uppercase tracking-[0.12em] text-stone-700 md:font-headline md:text-xl md:font-bold md:normal-case md:tracking-tight md:text-stone-900">
                    Leads por servicio
                  </h2>
                  <p className="mt-0.5 font-body text-[15px] text-stone-500">
                    {r.resumen.leads} {r.resumen.leads === 1 ? 'prospecto clasificado' : 'prospectos clasificados'} {NOMBRE_PERIODO[r.periodo]}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-teal-50 px-3 py-1 font-mono text-sm text-teal-800">Total: {r.resumen.leads}</span>
              </div>
              {r.porServicio.length === 0 ? (
                <p className="mt-6 rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-center font-body text-sm text-stone-500">
                  Ningún lead con servicio en este período.
                </p>
              ) : (
                <ul className="mt-5 space-y-4">
                  {r.porServicio.map((s, i) => (
                    <li key={s.servicio}>
                      <div className="flex items-baseline justify-between gap-3 font-body text-[15px]">
                        <span className="flex items-center gap-2 font-semibold text-stone-900">
                          <span className={cn('size-2 rounded-full', i === 0 ? 'bg-teal-700' : i === 1 ? 'bg-teal-500' : i === 2 ? 'bg-teal-300' : 'bg-stone-300')} />{' '}
                          {oracion(s.nombre)}
                        </span>
                        <span className="shrink-0 font-mono tabular-nums text-stone-900">
                          {s.leads} <span className="text-stone-500">({s.pct}%)</span>
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-stone-200">
                        <div className={cn('h-full rounded-full', i === 0 ? 'bg-teal-700' : i === 1 ? 'bg-teal-500' : 'bg-teal-300')} style={{ width: `${s.pct}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <Link to="/catalogo" className="mt-5 inline-flex items-center gap-1 font-body text-[15px] font-semibold text-teal-800 hover:underline">
                Ver catálogo <Icon name="arrow_forward" className="text-lg" />
              </Link>
            </Tarjeta>
          </div>

          <div className="grid gap-4 lg:grid-cols-3 lg:gap-6">
            <Tarjeta>
              <div className="flex items-start justify-between gap-3">
                <h2 className="flex items-center gap-2 font-headline text-xl font-bold tracking-tight text-stone-900">
                  <Icon name="filter_alt" className="text-2xl text-teal-700" /> Embudo
                </h2>
                {r.embudo[0].valor > 0 && (
                  <StatusPill tono="teal" punto={false} className="shrink-0 text-xs">
                    {r.embudo[4].pct}% a cierre
                  </StatusPill>
                )}
              </div>
              <p className="mt-0.5 font-body text-[15px] text-stone-500">Del primer mensaje a la obra ganada.</p>
              <ol className="mt-4 space-y-2">
                {r.embudo.map((p, i) => (
                  <li key={p.paso}>
                    <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5">
                      <div className="flex items-center gap-2 font-body text-[15px]">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white font-mono text-xs font-semibold text-stone-600">{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate font-semibold text-stone-900">{p.titulo}</span>
                        <span className="shrink-0 font-mono tabular-nums">
                          <b className="text-stone-900">{p.valor}</b> <span className="text-stone-500">({p.pct}%)</span>
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-200">
                        <div className="h-full rounded-full bg-teal-700" style={{ width: `${p.pct}%` }} />
                      </div>
                    </div>
                    {i < r.embudo.length - 1 && <Icon name="arrow_downward" className="mx-auto mt-1 block text-center text-lg text-stone-300" />}
                  </li>
                ))}
              </ol>
            </Tarjeta>

            <Tarjeta>
              <div className="flex items-start justify-between gap-3">
                <h2 className="flex items-center gap-2 font-headline text-xl font-bold tracking-tight text-stone-900">
                  <Icon name="forum" className="text-2xl text-teal-700" /> Lo que más preguntan
                </h2>
                <span className="shrink-0 font-mono text-sm text-stone-400">Top 5</span>
              </div>
              <p className="mt-0.5 font-body text-[15px] text-stone-500">Preguntas frecuentes por usos acumulados desde que se crearon.</p>
              {r.masPreguntadas.length === 0 ? (
                <p className="mt-4 rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-center font-body text-sm text-stone-500">
                  Todavía ninguna pregunta frecuente se usó. Cuando Dali conteste con una, aparece acá.
                </p>
              ) : (
                <ol className="mt-4 space-y-2">
                  {r.masPreguntadas.map((p, i) => (
                    <li key={p.pregunta} className="flex items-center gap-3 rounded-xl border border-stone-200 px-3 py-2.5">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-stone-100 font-mono text-xs font-semibold text-stone-600">{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-body text-[15px] font-semibold text-stone-900">{p.pregunta}</span>
                        {p.categoria && <span className="block font-body text-sm text-stone-500">{p.categoria}</span>}
                      </span>
                      <span className="shrink-0 rounded-lg bg-stone-100 px-2 py-1 font-mono text-sm font-semibold text-stone-800">{p.usos}</span>
                    </li>
                  ))}
                </ol>
              )}
              <Link to="/faq" className="mt-4 inline-flex items-center gap-1 font-body text-[15px] font-semibold text-teal-800 hover:underline">
                Gestionar preguntas frecuentes <Icon name="arrow_forward" className="text-lg" />
              </Link>
            </Tarjeta>

            <div className="grid content-start gap-4 lg:gap-6">
              <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 md:p-5">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white">
                    <Icon name="lightbulb" className="text-2xl" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-headline text-base font-bold text-stone-900">
                      Dali no supo responder
                      <StatusPill tono="amber" punto={false} className="text-[11px]">
                        {r.sinRespuesta.total} {r.sinRespuesta.total === 1 ? 'pregunta' : 'preguntas'}
                      </StatusPill>
                    </p>
                    <p className="mt-1 font-body text-[15px] leading-relaxed text-amber-900">
                      {r.sinRespuesta.total
                        ? `En los últimos 30 días, tus clientes hicieron ${r.sinRespuesta.total} ${r.sinRespuesta.total === 1 ? 'pregunta' : 'preguntas'} que Dali contestó con «solo puedo ayudarte con lo de asfalto».`
                        : 'En los últimos 30 días Dali no dejó ninguna pregunta sin respuesta.'}
                    </p>
                  </div>
                </div>
                {r.sinRespuesta.ejemplos.length > 0 && (
                  <ul className="mt-3 space-y-1 rounded-xl border border-amber-200 bg-white px-3 py-2 font-body text-sm text-amber-900">
                    {r.sinRespuesta.ejemplos.map((e) => (
                      <li key={e} className="truncate">
                        • «{e}»
                      </li>
                    ))}
                  </ul>
                )}
                <Link
                  to="/faq"
                  className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-600 font-body text-[15px] font-semibold text-white hover:bg-amber-700"
                >
                  <Icon name="add_circle" className="text-xl" /> Agregarlas a preguntas frecuentes
                </Link>
              </section>

              <Tarjeta>
                <h2 className="flex items-center gap-2 font-headline text-xl font-bold tracking-tight text-stone-900">
                  <Icon name="schedule" className="text-2xl text-teal-700" /> Tiempos de atención
                </h2>
                <p className="mt-0.5 font-body text-[15px] text-stone-500">Velocidad de Dali y de la toma humana.</p>
                <div className="mt-4 space-y-3">
                  <Tiempo icon="bolt" titulo="Respuesta de Dali" detalle="Mediana del período" valor={r.tiempos.respuestaDaliS !== null ? `${r.tiempos.respuestaDaliS} s` : '—'} />
                  <Tiempo
                    icon="person_check"
                    titulo="Toma de una persona"
                    detalle="Desde que el cliente pide a alguien hasta la primera respuesta del equipo"
                    valor={r.tiempos.tomaHumanaMin !== null ? `${r.tiempos.tomaHumanaMin} min` : '—'}
                  />
                </div>
              </Tarjeta>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const variacionChip = (v: number | null): { texto: string; tono: 'teal' | 'amber' } | undefined =>
  v === null ? undefined : { texto: `${v >= 0 ? '↑' : '↓'} ${Math.abs(v)}%`, tono: v >= 0 ? 'teal' : 'amber' };

function Kpi({
  icon,
  titulo,
  valor,
  chip,
  pie,
  tono = 'teal',
}: {
  icon: IconName;
  titulo: string;
  valor: number;
  chip?: { texto: string; tono: 'teal' | 'amber' };
  pie: string;
  tono?: 'teal' | 'amber';
}) {
  return (
    <Tarjeta className="p-4 md:p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="font-body text-[15px] text-stone-600">{titulo}</p>
        <Icon name={icon} className={cn('shrink-0 text-2xl', tono === 'amber' ? 'text-amber-600' : 'text-teal-700')} />
      </div>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
        <p className="font-headline text-4xl font-bold tabular-nums tracking-tight text-stone-900">{valor}</p>
        {chip && (
          <StatusPill tono={chip.tono} punto={false} className="whitespace-nowrap font-mono text-xs">
            {chip.texto}
          </StatusPill>
        )}
      </div>
      <p className="mt-1.5 font-body text-sm text-stone-500">{pie}</p>
    </Tarjeta>
  );
}

function Tiempo({ icon, titulo, detalle, valor }: { icon: IconName; titulo: string; detalle: string; valor: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 px-3 py-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-teal-700">
        <Icon name={icon} className="text-xl" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-body text-[15px] font-semibold text-stone-900">{titulo}</span>
        <span className="block font-body text-sm text-stone-500">{detalle}</span>
      </span>
      <span className="shrink-0 font-mono text-xl font-bold tabular-nums text-stone-900">{valor}</span>
    </div>
  );
}

/** Conversaciones nuevas por día: línea con área y el pico marcado; una serie, sin leyenda. Las etiquetas van en HTML debajo. */
function GraficoDias({ reporte: r }: { reporte: Reporte }) {
  const dias = r.porDia;
  const total = dias.reduce((a, d) => a + d.conversaciones, 0);
  const maximo = Math.max(1, ...dias.map((d) => d.conversaciones));
  const pico = dias.reduce((mejor, d) => (d.conversaciones > mejor.conversaciones ? d : mejor), dias[0]);
  const W = 100;
  const H = 100;
  const x = (i: number) => (i * W) / Math.max(1, dias.length - 1);
  const y = (n: number) => 6 + (1 - n / maximo) * (H - 8);
  const puntos = dias.map((d, i) => `${x(i)},${y(d.conversaciones)}`).join(' ');
  const area = `M0,${H} L${puntos.replace(/ /g, ' L')} L${W},${H} Z`;
  const semanal = dias.length <= 7;
  const etiquetas = semanal ? dias : dias.filter((_, i) => i % 5 === 0 || i === dias.length - 1);
  return (
    <Tarjeta>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-label text-xs font-semibold uppercase tracking-[0.12em] text-stone-700 md:font-headline md:text-xl md:font-bold md:normal-case md:tracking-tight md:text-stone-900">
            Conversaciones por día
          </h2>
          <p className="mt-0.5 font-body text-[15px] text-stone-500">
            {total
              ? `Pico el ${pico.etiqueta} ${diaCorto(pico.fecha)} (${pico.conversaciones} ${pico.conversaciones === 1 ? 'chat' : 'chats'})`
              : `Sin conversaciones nuevas ${NOMBRE_PERIODO[r.periodo]}`}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-stone-100 px-3 py-1 font-mono text-sm text-stone-700">Total: {total}</span>
      </div>
      <div className="relative mt-5 h-40 w-full md:h-56">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
          <defs>
            <linearGradient id="area-dias" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#0f766e" stopOpacity="0.28" />
              <stop offset="1" stopColor="#0f766e" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.5, 1].map((f) => (
            <line key={f} x1="0" x2={W} y1={y(maximo * f)} y2={y(maximo * f)} stroke="#e7e5e4" strokeDasharray="1.5 1.5" vectorEffect="non-scaling-stroke" />
          ))}
          <line x1="0" x2={W} y1={H} y2={H} stroke="#d6d3d1" vectorEffect="non-scaling-stroke" />
          {total > 0 && <path d={area} fill="url(#area-dias)" />}
          <polyline points={puntos} fill="none" stroke="#0f766e" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {dias.map((d, i) => (
          <span
            key={d.fecha}
            title={`${d.etiqueta} ${diaCorto(d.fecha)}: ${d.conversaciones}`}
            className={cn(
              'absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-teal-700',
              d === pico && total > 0 ? 'size-4 bg-teal-700 ring-2 ring-teal-200' : 'bg-white'
            )}
            style={{ left: `${x(i)}%`, top: `${y(d.conversaciones)}%` }}
          />
        ))}
      </div>
      <div className={cn('mt-3 grid gap-1 text-center font-mono', semanal ? 'grid-cols-7' : 'grid-cols-7')}>
        {etiquetas.map((d) => (
          <div key={d.fecha} className={cn('text-sm tabular-nums', d === pico && total > 0 ? 'font-semibold text-teal-800' : 'text-stone-500')}>
            <span className="block text-xs">{semanal ? oracion(d.etiqueta) : diaCorto(d.fecha)}</span>
            <span className="block">{d.conversaciones}</span>
          </div>
        ))}
      </div>
      <p className="sr-only">Conversaciones nuevas por día: {dias.map((d) => `${d.etiqueta} ${diaCorto(d.fecha)} ${d.conversaciones}`).join(', ')}</p>
    </Tarjeta>
  );
}

function ReportesEsqueleto() {
  return (
    <div className="animate-pulse px-4 pt-4 md:px-0 md:pt-6" aria-busy="true" aria-label="Cargando reportes">
      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-2xl bg-stone-200" />
        ))}
      </div>
      <div className="mt-4 h-80 rounded-2xl bg-stone-200" />
    </div>
  );
}
