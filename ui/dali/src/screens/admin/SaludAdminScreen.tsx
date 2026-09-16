import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, api } from '@/lib/api';
import { cuando, haceCuanto, telefonoLegible } from '@/lib/format';
import type { SaludAdmin } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/Icon';
import type { IconName } from '@/components/icon-map';
import { StatusPill, type TonoPill } from '@/components/StatusPill';
import { BotonSecundario, CabeceraAdmin, Kpi, PillLinea } from './piezas';

/**
 * S4 «Salud del sistema» (diseños `S4-admin-salud` móvil, tablet y
 * escritorio): lo que mide lila de verdad, cada 30 s y con «Actualizar»:
 * las cuatro cifras (líneas conectadas, mensajes de la última hora, tiempo
 * de respuesta de Dali —mediana de la última hora—, envíos fallidos), el
 * modelo local (cargado o no, último uso, se descarga solo tras N min sin
 * uso y se puede descargar ahora), la máquina (RAM real de la Mac mini,
 * CPU, disco, uptime, con la historia de CPU/RAM que ya guarda
 * `admin-health`), las líneas de WhatsApp de cada empresa, los errores de
 * las últimas 24 h y el deploy que corre. Sin colas ni Redis (lila no los
 * tiene) ni «Avisar al dueño de nuevo» (es un envío por WhatsApp; no sale
 * desde acá): el diseño los dibujaba y se dejan fuera a propósito.
 */
const GENERAL: Record<SaludAdmin['general'], { texto: string; tono: TonoPill }> = {
  operativo: { texto: 'Operativo', tono: 'emerald' },
  atencion: { texto: 'Con atención', tono: 'amber' },
  caido: { texto: 'Caído', tono: 'red' },
};
const TONO_ERROR: Record<SaludAdmin['errores'][number]['tipo'], { tono: TonoPill; icono: IconName }> = {
  desconexion: { tono: 'amber', icono: 'wifi_off' },
  'envio-fallido': { tono: 'red', icono: 'error' },
  'sin-conectar': { tono: 'red', icono: 'warning' },
};

const duracion = (s: number): string => {
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  if (d > 0) return `${d} ${d === 1 ? 'día' : 'días'}${h ? ` ${h} h` : ''}`;
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
};

export function SaludAdminScreen() {
  const queryClient = useQueryClient();
  const {
    data: s,
    isPending,
    refetch,
    isFetching,
    dataUpdatedAt,
  } = useQuery({ queryKey: ['admin', 'salud'], queryFn: () => api.get<SaludAdmin>('/admin/salud'), staleTime: 30_000, refetchInterval: 30_000 });
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);
  const descargar = useMutation({
    mutationFn: () => api.post('/admin/salud/modelo/descargar'),
    onSuccess: () => {
      toast.success('Modelo descargado de memoria; se vuelve a cargar con la próxima pregunta');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'salud'] });
    },
    onError: (e: Error) => toast.error(e instanceof ApiError ? e.message : 'No se pudo descargar el modelo'),
  });

  return (
    <div className="pb-8">
      <CabeceraAdmin
        miga="Infraestructura y salud"
        titulo="Salud del sistema"
        chip={
          s && (
            <StatusPill tono={GENERAL[s.general].tono} className="text-sm">
              {GENERAL[s.general].texto}
            </StatusPill>
          )
        }
        subtitulo={
          <span className="flex items-center gap-1.5">
            <Icon name="schedule" className="text-lg" /> {dataUpdatedAt ? `Actualizado ${haceCuanto(dataUpdatedAt, ahora)}` : 'Cargando…'} · se refresca cada 30 s
          </span>
        }
        acciones={
          <BotonSecundario onClick={() => void refetch()} className="h-12">
            <Icon name="refresh" className={cn('text-xl', isFetching && 'animate-spin')} /> Actualizar
          </BotonSecundario>
        }
      />
      {isPending || !s ? (
        <div className="grid grid-cols-2 gap-3 px-4 pt-4 md:gap-4 md:px-6 xl:grid-cols-4 xl:px-10" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl border border-stone-200 bg-white" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 px-4 pt-4 md:gap-4 md:px-6 md:pt-6 xl:grid-cols-4 xl:px-10">
            <Kpi
              etiqueta="Líneas conectadas"
              icono="phone_iphone"
              cifra={s.lineas.filter((l) => l.estado === 'conectado').length}
              sufijo={`/ ${s.lineas.filter((l) => l.numero).length}`}
              nota={
                s.lineas.some((l) => l.numero && l.estado !== 'conectado') ? (
                  <span className="text-amber-800">
                    <Icon name="warning" className="mr-1 align-text-bottom text-lg" />
                    {s.lineas.filter((l) => l.numero && l.estado !== 'conectado').length} sin conectar
                  </span>
                ) : (
                  'Todas las líneas arriba'
                )
              }
            />
            <Kpi
              etiqueta="Msjs. última hora"
              icono="chat"
              cifra={s.ultimaHora.mensajes}
              nota={s.ultimaHora.mensajes ? 'Entrantes y salientes, todas las empresas' : 'Sin mensajes en la última hora'}
            />
            <Kpi
              etiqueta="Tiempo rpta. Dali"
              icono="bolt"
              cifra={s.ultimaHora.respuestaS === null ? '—' : s.ultimaHora.respuestaS}
              sufijo={s.ultimaHora.respuestaS === null ? undefined : 's'}
              chip={
                <StatusPill tono="teal" punto={false}>
                  Local (Qwen)
                </StatusPill>
              }
              nota="Mediana de la última hora · óptimo < 10 s"
            />
            <Kpi
              etiqueta="Errores últ. hora"
              icono="error"
              cifra={
                <span className={s.ultimaHora.enviosFallidos + s.ultimaHora.desconexiones > 0 ? 'text-amber-700' : 'text-emerald-700'}>
                  {s.ultimaHora.enviosFallidos + s.ultimaHora.desconexiones}
                </span>
              }
              chip={
                s.ultimaHora.enviosFallidos + s.ultimaHora.desconexiones === 0 ? (
                  <StatusPill tono="emerald" punto={false}>
                    Limpio
                  </StatusPill>
                ) : undefined
              }
              nota={`${s.ultimaHora.enviosFallidos} envíos fallidos · ${s.ultimaHora.desconexiones} desconexiones`}
            />
          </div>

          <div className="grid gap-4 px-4 pt-4 md:px-6 xl:grid-cols-[3fr_2fr] xl:px-10">
            <div className="space-y-4">
              <Tarjeta
                icono="smart_toy"
                titulo="Modelo local"
                subtitulo={<span className="font-mono">{s.modelo.nombre}</span>}
                derecha={
                  !s.modelo.activo ? (
                    <StatusPill tono="stone">Apagado</StatusPill>
                  ) : !s.modelo.descargado ? (
                    <StatusPill tono="amber">Sin descargar</StatusPill>
                  ) : s.modelo.cargado ? (
                    <StatusPill tono="emerald">Cargado</StatusPill>
                  ) : (
                    <StatusPill tono="stone">En disco</StatusPill>
                  )
                }
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Dato
                    etiqueta="Memoria RAM"
                    valor={s.modelo.cargado ? `~${s.modelo.gb} GB` : '0 GB'}
                    nota={s.modelo.cargado ? 'En memoria de la Mac mini' : 'Libre: se carga con la próxima pregunta'}
                  />
                  <Dato
                    etiqueta="Última respuesta"
                    valor={s.modelo.ultimoUso ? haceCuanto(Date.parse(s.modelo.ultimoUso), ahora) : 'Sin uso desde el arranque'}
                    nota={s.modelo.ultimoUso ? cuando(Date.parse(s.modelo.ultimoUso)) : ' '}
                  />
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
                  <p className="flex items-center gap-2 font-body text-[15px] text-stone-600">
                    <Icon name="timer" className="text-xl text-stone-400" /> Se descarga solo tras {s.modelo.ociosoMin} min sin uso para liberar memoria.
                  </p>
                  <BotonSecundario onClick={() => descargar.mutate()} disabled={!s.modelo.cargado || descargar.isPending}>
                    Descargar ahora
                  </BotonSecundario>
                </div>
              </Tarjeta>

              <Tarjeta
                icono="dns"
                titulo="Máquina física"
                subtitulo={<span className="font-mono">{s.maquina.equipo} · Mac mini · Lima</span>}
                derecha={<StatusPill tono="emerald">Uptime {duracion(s.maquina.uptimeS)}</StatusPill>}
              >
                <Barra
                  etiqueta={`Memoria RAM (${s.maquina.ram.totalGb} GB total)`}
                  pct={s.maquina.ram.pct}
                  valor={`${s.maquina.ram.pct}%`}
                  nota={`lila usa ${s.maquina.ram.procesoMb} MB`}
                />
                <Barra etiqueta="CPU" pct={s.maquina.cpu.pct} valor={`${s.maquina.cpu.pct}%`} nota={`carga ${s.maquina.cpu.carga1} en ${s.maquina.cpu.nucleos} núcleos`} />
                {s.maquina.disco && <Barra etiqueta="Disco" pct={s.maquina.disco.pct} valor={`${s.maquina.disco.libre} libres`} nota={`de ${s.maquina.disco.total}`} />}
                {s.maquina.historia.length > 1 && <Historia muestras={s.maquina.historia} />}
              </Tarjeta>
            </div>

            <div className="space-y-4">
              <Tarjeta
                icono="phone_iphone"
                titulo="Líneas de WhatsApp"
                subtitulo={`${s.lineas.filter((l) => l.numero).length} números de empresas`}
                derecha={
                  <span className="rounded-lg bg-stone-100 px-2.5 py-1 font-body text-sm font-semibold text-stone-700">
                    {s.lineas.filter((l) => l.estado === 'conectado').length} activas
                  </span>
                }
              >
                <ul className="divide-y divide-stone-100">
                  {s.lineas.map((l) => (
                    <li key={l.companyId} className={cn('py-3', l.numero && l.estado !== 'conectado' && '-mx-2 rounded-xl bg-amber-50/60 px-2')}>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={`/admin/empresas/${l.companyId}`} className="font-headline text-base font-bold text-stone-900 hover:underline">
                          {l.nombre}
                        </Link>
                        <PillLinea estado={l.estado} />
                        <span className="ml-auto font-body text-sm text-stone-500">
                          {l.estado !== 'conectado' && l.caidaDesde
                            ? `desde ${cuando(Date.parse(l.caidaDesde))}`
                            : l.ultimoMensaje
                              ? haceCuanto(Date.parse(l.ultimoMensaje), ahora)
                              : ''}
                        </span>
                      </div>
                      <p className="mt-0.5 font-mono text-sm text-stone-600">
                        {l.numero ? telefonoLegible(l.numero) : 'Sin número'} · {l.rubro}
                      </p>
                      {l.estado !== 'conectado' && l.motivo && <p className="mt-1 font-body text-sm text-amber-900">{l.motivo}</p>}
                    </li>
                  ))}
                </ul>
              </Tarjeta>

              <Tarjeta icono="history" titulo="Errores recientes" derecha={<span className="font-mono text-xs text-stone-500">Últimas 24 h</span>}>
                {s.errores.length === 0 ? (
                  <p className="flex items-center gap-2 font-body text-[15px] text-emerald-800">
                    <Icon name="check_circle" className="text-xl" /> Nada en las últimas 24 horas.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {s.errores.map((e, i) => (
                      <li key={`${e.fecha}-${i}`} className="flex gap-3 rounded-xl border border-stone-200 p-3">
                        <span
                          className={cn(
                            'flex size-9 shrink-0 items-center justify-center rounded-full',
                            e.tipo === 'desconexion' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'
                          )}
                        >
                          <Icon name={TONO_ERROR[e.tipo].icono} className="text-xl" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-body text-[15px] font-semibold text-stone-900">
                              {e.titulo}
                              {e.empresa ? ` · ${e.empresa}` : ''}
                            </p>
                            <span className="font-mono text-xs text-stone-500">{cuando(Date.parse(e.fecha))}</span>
                          </div>
                          <p className="font-body text-sm text-stone-600">{e.detalle}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Tarjeta>

              <Tarjeta
                icono="rocket_launch"
                titulo={`Deploy ${s.deploy.sha ?? 'local'}`}
                subtitulo={s.deploy.desplegadoEl ? `Desplegado ${cuando(Date.parse(s.deploy.desplegadoEl))} · Mac mini (Lima)` : 'Sin carpeta de release: corre desde el código'}
              >
                <dl className="grid grid-cols-2 gap-3 font-body text-sm">
                  <div>
                    <dt className="text-stone-500">Release</dt>
                    <dd className="font-mono text-stone-800">{s.deploy.release}</dd>
                  </div>
                  <div>
                    <dt className="text-stone-500">Proceso arriba desde</dt>
                    <dd className="text-stone-800">{cuando(Date.parse(s.deploy.iniciadoEl))}</dd>
                  </div>
                  <div>
                    <dt className="text-stone-500">Node</dt>
                    <dd className="font-mono text-stone-800">{s.deploy.node}</dd>
                  </div>
                </dl>
              </Tarjeta>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Tarjeta({ icono, titulo, subtitulo, derecha, children }: { icono: IconName; titulo: string; subtitulo?: ReactNode; derecha?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm md:p-5">
      <div className="flex flex-wrap items-start gap-3 border-b border-stone-100 pb-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-stone-700">
          <Icon name={icono} className="text-2xl" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-headline text-lg font-bold text-stone-900">{titulo}</h2>
          {subtitulo && <p className="font-body text-sm text-stone-500">{subtitulo}</p>}
        </div>
        {derecha && <div className="shrink-0">{derecha}</div>}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Dato({ etiqueta, valor, nota }: { etiqueta: string; valor: string; nota: string }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
      <p className="font-label text-[11px] font-semibold uppercase tracking-[0.1em] text-stone-500">{etiqueta}</p>
      <p className="mt-1 font-mono text-2xl font-bold text-stone-900">{valor}</p>
      <p className="font-body text-sm text-stone-500">{nota}</p>
    </div>
  );
}

function Barra({ etiqueta, pct, valor, nota }: { etiqueta: string; pct: number; valor: string; nota: string }) {
  const tono = pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-teal-600';
  return (
    <div className="py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-body text-[15px] text-stone-800">{etiqueta}</p>
        <p className="font-mono text-sm font-semibold text-stone-900">{valor}</p>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-stone-200">
        <div className={cn('h-full rounded-full', tono)} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
      <p className="mt-1 font-body text-sm text-stone-500">{nota}</p>
    </div>
  );
}

/** CPU y RAM de las últimas muestras de `admin-health` (un punto por minuto), eje fijo 0–100 como allá. */
function Historia({ muestras }: { muestras: SaludAdmin['maquina']['historia'] }) {
  const W = 300;
  const H = 64;
  const paso = W / (muestras.length - 1);
  const y = (v: number) => H - (Math.max(0, Math.min(100, v)) / 100) * (H - 6) - 3;
  const linea = (clave: 'cpu' | 'ram') => muestras.map((m, i) => `${(i * paso).toFixed(1)},${y(m[clave]).toFixed(1)}`).join(' ');
  const desde = muestras[0].t;
  return (
    <div className="mt-2 border-t border-stone-100 pt-3">
      <div className="flex items-center justify-between font-body text-sm text-stone-500">
        <span>
          <span className="mr-3 inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-teal-600" /> CPU
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-amber-500" /> RAM
          </span>
        </span>
        <span>desde {cuando(desde)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-2 h-16 w-full" aria-label="CPU y RAM recientes">
        <polyline points={linea('cpu')} fill="none" stroke="currentColor" className="text-teal-700" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        <polyline points={linea('ram')} fill="none" stroke="currentColor" className="text-amber-500" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
