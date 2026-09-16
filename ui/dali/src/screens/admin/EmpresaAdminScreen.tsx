import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, api } from '@/lib/api';
import { cuando, iniciales, numero as fmt, telefonoLegible } from '@/lib/format';
import { entrarAEmpresa } from '@/lib/operador';
import { NOMBRE_ROL } from '@/lib/roles';
import type { ActividadAdmin, EmpresaDetalleAdmin } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/Icon';
import type { IconName } from '@/components/icon-map';
import { StatusPill } from '@/components/StatusPill';
import { Textarea } from '@/components/ui/textarea';
import { BotonPrimario, BotonSecundario, Kpi, PillAsistente, PillLinea } from './piezas';

/**
 * S2 «Empresa» (diseños `S2-admin-empresa` móvil, tablet y escritorio): la
 * ficha de una empresa vista por el operador: cabecera con «Abrir su panel»
 * y el botón de pausa; las cuatro cifras (conversaciones y mensajes del mes,
 * leads del mes contra la semana previa, miembros, el modelo local sin costo
 * por mensaje); la línea de WhatsApp (estado, dispositivo, desde cuándo), el
 * plan (piloto, sin pagos: «Registrar pago» y «Cambiar plan» llegan en F4),
 * la configuración del asistente y el conocimiento contados de verdad, la
 * actividad reciente (escaladas, leads, ingresos, importaciones y la línea),
 * la nota privada del operador y suspender/levantar. Las acciones sobre la
 * línea o la configuración (ver QR, desconectar, editar, reimportar) se
 * hacen en el panel de la empresa: acá cada botón entra al panel en esa
 * pantalla, con una sesión a nombre del operador.
 */
const nombreDeRol = (rol: string, n: number): string => (rol === 'owner' ? (n === 1 ? 'dueño' : 'dueños') : NOMBRE_ROL[rol as keyof typeof NOMBRE_ROL].toLowerCase());
const fechaCorta = (iso: string): string =>
  new Date(iso).toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '');
const TONO_ACTIVIDAD: Record<ActividadAdmin['tono'], string> = { ok: 'bg-teal-600', aviso: 'bg-amber-500', error: 'bg-red-500', info: 'bg-stone-400' };

export function EmpresaAdminScreen() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const clave = ['admin', 'empresa', id];
  const {
    data: e,
    isPending,
    isError,
  } = useQuery({ queryKey: clave, queryFn: () => api.get<EmpresaDetalleAdmin>(`/admin/empresas/${encodeURIComponent(id)}`), staleTime: 30_000 });
  const cambiar = useMutation({
    mutationFn: (cambios: { encendida?: boolean; suspendida?: boolean; nota?: string }) => api.patch<EmpresaDetalleAdmin>(`/admin/empresas/${encodeURIComponent(id)}`, cambios),
    onSuccess: (nueva) => {
      queryClient.setQueryData(clave, nueva);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'empresas'] });
    },
    onError: (err: Error) => toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar'),
  });
  const entrar = async (ruta: string) => {
    try {
      await entrarAEmpresa(queryClient, id);
      navigate(ruta);
    } catch {
      toast.error('No se pudo entrar al panel');
    }
  };

  if (isPending)
    return (
      <div className="px-4 pt-6 md:px-6 xl:px-10" aria-busy="true">
        <div className="h-40 animate-pulse rounded-2xl bg-white" />
      </div>
    );
  if (isError || !e) {
    return (
      <div className="px-4 pt-6 md:px-6 xl:px-10">
        <Link to="/admin/empresas" className="font-body text-[15px] text-teal-800">
          ← Volver a Empresas
        </Link>
        <p className="mt-6 rounded-2xl border border-dashed border-stone-300 bg-white p-8 text-center font-body text-stone-500">No encontramos esa empresa.</p>
      </div>
    );
  }
  const encendida = e.asistente !== 'apagado' && e.asistente !== 'suspendida';
  const variacion = e.kpis.leadsSemanaPrevia > 0 ? Math.round(((e.kpis.leadsSemana - e.kpis.leadsSemanaPrevia) / e.kpis.leadsSemanaPrevia) * 100) : null;
  const roles = ['owner', 'sales', 'viewer'].map((r) => [r, e.equipo.miembros.filter((m) => m.rol === r).length] as const).filter(([, n]) => n > 0);

  return (
    <div className="pb-8">
      <div className="border-b border-stone-200 bg-white">
        <div className="flex h-14 items-center justify-between gap-3 px-4 md:px-6 xl:px-10">
          <Link to="/admin/empresas" className="inline-flex min-h-11 items-center gap-2 font-body text-[15px] text-stone-600 hover:text-stone-900">
            <Icon name="arrow_back" className="text-xl" /> Volver a Empresas
          </Link>
          <span className="rounded-lg bg-stone-100 px-2.5 py-1 font-mono text-xs text-stone-600">ID: {e.companyId}</span>
        </div>
        <div className="flex flex-col gap-4 px-4 pb-5 md:flex-row md:items-start md:justify-between md:px-6 xl:px-10">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="hidden size-14 items-center justify-center rounded-2xl bg-stone-900 font-headline text-lg font-bold text-white xl:flex">{iniciales(e.nombre)}</div>
              <h1 className="font-headline text-[28px] font-bold tracking-tight text-stone-900 md:text-4xl">{e.nombre}</h1>
              <span className="rounded-full border border-stone-200 bg-stone-100 px-2.5 py-1 font-body text-sm text-stone-700">{e.rubro || 'Sin rubro'}</span>
              <StatusPill tono="teal">Piloto</StatusPill>
              <PillAsistente estado={e.asistente} />
            </div>
            <p className="mt-1.5 font-body text-[15px] text-stone-500 xl:pl-16">
              {e.ciudad || 'Sin ciudad'} · {e.creadaEl ? `Creada el ${fechaCorta(e.creadaEl)}` : 'Sin fecha de alta'} · {e.miembros} {e.miembros === 1 ? 'miembro' : 'miembros'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <BotonPrimario onClick={() => void entrar('/inicio')} className="h-12 flex-1 px-5 md:flex-none">
              <Icon name="open_in_new" className="text-xl" /> Abrir su panel
            </BotonPrimario>
            <button
              type="button"
              onClick={() => cambiar.mutate({ encendida: !encendida })}
              disabled={cambiar.isPending || e.suspendida}
              aria-label={encendida ? 'Apagar a Dali en esta empresa' : 'Encender a Dali en esta empresa'}
              title={encendida ? 'Apagar a Dali' : 'Encender a Dali'}
              className="flex size-12 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 disabled:opacity-50"
            >
              <Icon name={encendida ? 'pause' : 'play_arrow'} className="text-2xl" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 px-4 pt-4 md:gap-4 md:px-6 md:pt-6 xl:grid-cols-4 xl:px-10">
        <Kpi
          etiqueta="Conversaciones"
          icono="chat"
          cifra={fmt(e.kpis.conversacionesMes)}
          sufijo="este mes"
          nota={`${fmt(e.uso.mensajesMes)} mensajes${e.uso.limite > 0 ? ` de ${fmt(e.uso.limite)}` : ' · sin límite'}`}
        />
        <Kpi
          etiqueta="Leads del mes"
          icono="group"
          cifra={fmt(e.kpis.leadsMes)}
          chip={
            variacion !== null ? (
              <StatusPill tono={variacion >= 0 ? 'emerald' : 'amber'} punto={false}>
                {variacion >= 0 ? '+' : ''}
                {variacion}% vs semana previa
              </StatusPill>
            ) : undefined
          }
          nota={`${e.kpis.leadsSemana} esta semana · ${e.kpis.leadsNuevos} sin atender`}
        />
        <Kpi
          etiqueta="Miembros"
          icono="badge"
          cifra={e.equipo.activos}
          sufijo="activos en el panel"
          nota={
            <span className="flex items-center gap-2">
              <span className="flex -space-x-2">
                {e.equipo.miembros.slice(0, 3).map((m) => (
                  <span
                    key={m.id}
                    className="flex size-7 items-center justify-center rounded-full border-2 border-white bg-stone-800 font-headline text-[10px] font-bold text-white"
                  >
                    {iniciales(m.nombre)}
                  </span>
                ))}
              </span>
              <span>{roles.map(([r, n]) => `${n} ${nombreDeRol(r, n)}`).join(' · ') || 'sin miembros'}</span>
            </span>
          }
        />
        <Kpi
          etiqueta="Modelo IA"
          icono="smart_toy"
          cifra={<span className="text-2xl md:text-3xl">Local (Qwen)</span>}
          chip={<StatusPill tono="emerald">Sin costo por mensaje</StatusPill>}
          nota="Corre en la Mac mini · sin API externa"
        />
      </div>

      <div className="grid gap-4 px-4 pt-4 md:px-6 xl:grid-cols-[3fr_2fr] xl:px-10">
        <div className="space-y-4">
          <Tarjeta icono="chat" titulo="Canal WhatsApp" subtitulo="La línea desde la que Dali atiende" derecha={<PillLinea estado={e.linea.estado} />}>
            <dl className="divide-y divide-stone-100">
              <Fila etiqueta="Número oficial" valor={<span className="font-mono">{e.linea.numero ? telefonoLegible(e.linea.numero) : '—'}</span>} />
              <Fila
                etiqueta="Dispositivo vinculado"
                valor={e.lineaDetalle.cuenta ? [e.lineaDetalle.cuenta.nombre, e.lineaDetalle.cuenta.plataforma].filter(Boolean).join(' · ') : 'Sin datos'}
              />
              <Fila etiqueta="Sesión iniciada" valor={e.lineaDetalle.conectadoDesde ? cuando(Date.parse(e.lineaDetalle.conectadoDesde)) : '—'} />
              {e.lineaDetalle.compartidaCon.length > 0 && <Fila etiqueta="Compartida con" valor={e.lineaDetalle.compartidaCon.join(', ')} />}
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <BotonSecundario onClick={() => void entrar('/whatsapp')}>
                <Icon name="qr_code" className="text-xl" /> Ver QR en su panel
              </BotonSecundario>
            </div>
          </Tarjeta>

          <Tarjeta
            icono="smart_toy"
            titulo="Configuración del asistente"
            subtitulo="Reglas de negocio y tono en WhatsApp"
            derecha={<Enlace onClick={() => void entrar('/asistente')} icono="edit" texto="Editar" />}
          >
            <dl className="divide-y divide-stone-100">
              <Fila etiqueta="Nombre del asistente" valor={e.configuracion.asistente} />
              <Fila etiqueta="Tono de voz" valor={e.configuracion.tono === 'formal' ? 'Formal' : 'Cercano (tuteo peruano)'} />
              <Fila
                etiqueta="Da precios en chat"
                valor={
                  <StatusPill tono={e.configuracion.daPrecios ? 'emerald' : 'amber'} punto={false}>
                    {e.configuracion.daPrecios ? 'Sí' : 'No (deriva a cotización)'}
                  </StatusPill>
                }
              />
              <Fila etiqueta="Avisos urgentes" valor={e.configuracion.avisosA} />
              <Fila
                etiqueta="Números de prueba"
                valor={
                  e.configuracion.numerosPrueba.length ? <span className="font-mono">{e.configuracion.numerosPrueba.map(telefonoLegible).join(', ')}</span> : 'Atiende a todos'
                }
              />
              <Fila etiqueta="Pausa al escribir el dueño" valor={`${e.configuracion.pausaMin} min de espera`} />
            </dl>
          </Tarjeta>

          <Tarjeta
            icono="menu_book"
            titulo="Conocimiento"
            subtitulo="Lo que Dali sabe para responder y calificar"
            derecha={<Enlace onClick={() => void entrar('/importar')} icono="upload_file" texto="Reimportar Excel" />}
          >
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                ['Servicios', e.conocimiento.servicios],
                ['Preguntas', e.conocimiento.preguntas],
                ['FAQ', e.conocimiento.faq],
                ['Catálogo', e.conocimiento.catalogo],
              ].map(([n, v]) => (
                <div key={n} className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-4 text-center">
                  <p className="font-headline text-3xl font-bold text-stone-900">{v}</p>
                  <p className="font-body text-sm text-stone-500">{n}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 border-t border-stone-100 pt-3 font-body text-[15px] text-stone-600">
              Última importación:{' '}
              <b className="font-semibold text-stone-900">
                {e.conocimiento.ultimaImportacion
                  ? `${cuando(Date.parse(e.conocimiento.ultimaImportacion.fecha))} · ${e.conocimiento.ultimaImportacion.archivo}`
                  : 'ninguna todavía'}
              </b>
            </p>
          </Tarjeta>
        </div>

        <div className="space-y-4">
          <Tarjeta
            icono="credit_card"
            titulo="Plan y pagos"
            derecha={
              <StatusPill tono="emerald" punto={false}>
                Al día
              </StatusPill>
            }
          >
            <dl className="divide-y divide-stone-100">
              <Fila etiqueta="Plan actual" valor="Piloto · sin costo" />
              <Fila etiqueta="Mensajes este mes" valor={<span className="font-mono">{fmt(e.uso.mensajesMes)}</span>} />
              <Fila etiqueta="Miembros" valor={`${e.equipo.cupo.usados} de ${e.equipo.cupo.limite}`} />
              <Fila etiqueta="Último pago" valor="No aplica" />
            </dl>
            <p className="mt-3 font-body text-sm text-stone-500">Los planes de pago y sus comprobantes llegan cuando termine el piloto.</p>
          </Tarjeta>

          <Tarjeta icono="history" titulo="Actividad reciente" derecha={<span className="font-mono text-xs text-stone-500">Últimos 30 días</span>}>
            {e.actividad.length === 0 ? (
              <p className="font-body text-[15px] text-stone-500">Nada registrado todavía.</p>
            ) : (
              <ol className="relative space-y-4 border-l border-stone-200 pl-5">
                {e.actividad.map((a, i) => (
                  <li key={`${a.fecha}-${i}`} className="relative">
                    <span className={cn('absolute -left-[26px] top-1.5 size-3 rounded-full ring-4 ring-white', TONO_ACTIVIDAD[a.tono])} aria-hidden="true" />
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-body text-[15px] font-semibold text-stone-900">{a.titulo}</p>
                      <span className="shrink-0 font-mono text-xs text-stone-500">{cuando(Date.parse(a.fecha))}</span>
                    </div>
                    <p className="font-body text-sm text-stone-600">{a.detalle}</p>
                  </li>
                ))}
              </ol>
            )}
          </Tarjeta>

          <NotaOperador nota={e.nota} guardando={cambiar.isPending} onGuardar={(nota) => cambiar.mutate({ nota })} />

          <Suspension suspendida={e.suspendida} pendiente={cambiar.isPending} onCambiar={(suspendida) => cambiar.mutate({ suspendida })} />
        </div>
      </div>
    </div>
  );
}

function Tarjeta({ icono, titulo, subtitulo, derecha, children }: { icono: IconName; titulo: string; subtitulo?: string; derecha?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm md:p-5">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
          <Icon name={icono} className="text-2xl" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-headline text-lg font-bold text-stone-900">{titulo}</h2>
          {subtitulo && <p className="font-body text-sm text-stone-500">{subtitulo}</p>}
        </div>
        {derecha && <div className="shrink-0 pl-14 sm:pl-0">{derecha}</div>}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="font-body text-[15px] text-stone-500">{etiqueta}</dt>
      <dd className="text-right font-body text-[15px] font-semibold text-stone-900">{valor}</dd>
    </div>
  );
}

function Enlace({ onClick, icono, texto }: { onClick: () => void; icono: IconName; texto: string }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex min-h-11 items-center gap-1.5 font-body text-[15px] font-semibold text-teal-800 hover:underline">
      <Icon name={icono} className="text-lg" /> {texto}
    </button>
  );
}

function NotaOperador({ nota, guardando, onGuardar }: { nota: string; guardando: boolean; onGuardar: (nota: string) => void }) {
  const [texto, setTexto] = useState<string | null>(null);
  const valor = texto ?? nota;
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 md:p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white text-amber-700 ring-1 ring-amber-200">
          <Icon name="lock" className="text-2xl" />
        </span>
        <h2 className="flex-1 font-headline text-lg font-bold text-stone-900">Notas internas del operador</h2>
        <span className="rounded-md border border-amber-300 bg-amber-100 px-2 py-0.5 font-label text-[10px] font-bold uppercase tracking-wider text-amber-900">Privado Dali</span>
      </div>
      <Textarea
        value={valor}
        onChange={(ev) => setTexto(ev.target.value)}
        rows={3}
        maxLength={1000}
        placeholder="Lo que conviene recordar de este cliente…"
        className="mt-4 rounded-xl border-amber-200 bg-white font-body text-[15px] text-stone-900"
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="font-body text-sm italic text-stone-500">Solo visible para el operador de Dali.</p>
        <button
          type="button"
          disabled={guardando || texto === null || texto === nota}
          onClick={() => {
            onGuardar(valor);
            setTexto(null);
          }}
          className="inline-flex h-11 items-center rounded-xl bg-stone-900 px-4 font-body text-[15px] font-semibold text-white hover:bg-stone-800 disabled:opacity-50"
        >
          Guardar nota
        </button>
      </div>
    </section>
  );
}

function Suspension({ suspendida, pendiente, onCambiar }: { suspendida: boolean; pendiente: boolean; onCambiar: (suspendida: boolean) => void }) {
  const [confirmando, setConfirmando] = useState(false);
  return (
    <section className={cn('rounded-2xl border p-4 md:p-5', suspendida ? 'border-emerald-200 bg-emerald-50/50' : 'border-red-200 bg-red-50/50')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className={cn('font-headline text-base font-bold', suspendida ? 'text-emerald-900' : 'text-red-800')}>{suspendida ? 'Empresa suspendida' : 'Suspender empresa'}</p>
          <p className={cn('font-body text-sm', suspendida ? 'text-emerald-800' : 'text-red-700')}>
            {suspendida ? 'Dali está apagada y nadie de la empresa entra al panel.' : 'Apaga a Dali y cierra el acceso al panel.'}
          </p>
        </div>
        {confirmando ? (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setConfirmando(false)} className="h-11 rounded-xl px-3 font-body text-[15px] font-semibold text-stone-600 hover:bg-white">
              Cancelar
            </button>
            <button
              type="button"
              disabled={pendiente}
              onClick={() => {
                onCambiar(!suspendida);
                setConfirmando(false);
              }}
              className={cn(
                'h-11 rounded-xl px-4 font-body text-[15px] font-semibold text-white disabled:opacity-60',
                suspendida ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-red-700 hover:bg-red-800'
              )}
            >
              {suspendida ? 'Sí, reactivar' : 'Sí, suspender'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            className={cn(
              'h-11 rounded-xl border bg-white px-4 font-body text-[15px] font-semibold',
              suspendida ? 'border-emerald-300 text-emerald-800 hover:bg-emerald-50' : 'border-red-300 text-red-700 hover:bg-red-50'
            )}
          >
            {suspendida ? 'Reactivar' : 'Suspender'}
          </button>
        )}
      </div>
    </section>
  );
}
