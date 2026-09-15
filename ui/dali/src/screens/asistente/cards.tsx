import { useState, type ReactNode } from 'react';
import { Icon } from '@/components/Icon';
import type { IconName } from '@/components/icon-map';
import { Interruptor } from '@/components/Interruptor';
import { Segmentado } from '@/components/Segmentado';
import { StatusPill } from '@/components/StatusPill';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { horaDe, telefonoLegible } from '@/lib/format';
import type { Asistente, AvisosAsistente, FranjaHoraria, PerfilAsistente } from '@/lib/types';
import { cn } from '@/lib/utils';
import { FUERA_DE_HORARIO_MAX, NOMBRE_MAX, SALUDO_MAX, normalizarNumero, type Formulario, type Pausa } from './formulario';

/** Las tarjetas de «Asistente» (A6), en el lenguaje de las tres capturas. */

export function Tarjeta({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('rounded-2xl border border-stone-200 bg-white p-4 shadow-sm md:p-6', className)}>{children}</section>;
}

/** Título con icono: en móvil el icono va en línea; en tablet y escritorio, en un círculo teal. */
export function CabeceraTarjeta({
  icon,
  titulo,
  detalle,
  derecha,
  tonoIcono = 'teal',
  divisor = true,
}: {
  icon: IconName;
  titulo: ReactNode;
  detalle?: string;
  derecha?: ReactNode;
  tonoIcono?: 'teal' | 'amber';
  divisor?: boolean;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3', divisor && 'border-b border-stone-100 pb-4 md:pb-5')}>
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={cn(
            'mt-0.5 flex shrink-0 items-center justify-center md:mt-0 md:size-12 md:rounded-full',
            tonoIcono === 'amber' ? 'text-amber-600 md:bg-amber-50' : 'text-teal-700 md:bg-teal-50'
          )}
        >
          <Icon name={icon} className="text-[26px] md:text-2xl" />
        </span>
        <div className="min-w-0">
          <h2 className="font-headline text-lg font-bold tracking-tight text-stone-900 md:text-xl">{titulo}</h2>
          {detalle && <p className="mt-0.5 font-body text-[15px] text-stone-500">{detalle}</p>}
        </div>
      </div>
      {derecha && <div className="shrink-0">{derecha}</div>}
    </div>
  );
}

export function Campo({ label, ayuda, derecha, children, className }: { label: string; ayuda?: string; derecha?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="mb-2 flex items-end justify-between gap-3">
        <span className="font-body text-[15px] font-semibold text-stone-800">{label}</span>
        {derecha}
      </div>
      {children}
      {ayuda && <p className="mt-2 font-body text-sm text-stone-500">{ayuda}</p>}
    </div>
  );
}

const CAMPO = 'h-12 rounded-xl border-stone-200 bg-white px-4 font-body text-base text-stone-900 placeholder:text-stone-400 md:text-base';
const AREA = 'min-h-[104px] rounded-xl border-stone-200 bg-white px-4 py-3 font-body text-base leading-relaxed text-stone-900 placeholder:text-stone-400 md:text-base';

/* ------------------------------------------------------------------ estado */

const PAUSAS: Array<{ valor: Pausa; label: string; corto: string }> = [
  { valor: '30', label: '30 min', corto: '30 min' },
  { valor: '120', label: '2 horas', corto: '2 h' },
  { valor: 'manana', label: 'Hasta mañana', corto: 'Hasta mañana' },
];

export function TarjetaEstado({
  asistente,
  pausaVigente,
  silencio,
  onEncender,
  onPausar,
  onSilencio,
  ocupado,
}: {
  asistente: Asistente;
  pausaVigente: Pausa | null;
  silencio: number;
  onEncender: (v: boolean) => void;
  onPausar: (p: Pausa | null) => void;
  onSilencio: (min: number) => void;
  ocupado: boolean;
}) {
  const pausada = Boolean(pausaVigente);
  return (
    <Tarjeta>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="hidden size-12 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700 md:flex">
            <Icon name="power_settings_new" className="text-2xl" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-headline text-lg font-bold tracking-tight text-stone-900 md:text-xl">
                <span className="md:hidden">Estado de Dali</span>
                <span className="hidden md:inline">Estado del Asistente</span>
              </h2>
              <StatusPill tono={asistente.enabled && !pausada ? 'teal' : pausada ? 'amber' : 'stone'} className="md:hidden">
                {asistente.enabled ? (pausada ? 'En pausa' : 'Atendiendo') : 'Apagada'}
              </StatusPill>
            </div>
            <p className="mt-1 font-body text-[15px] text-stone-500">
              <span className="md:hidden">Dali responde cotizaciones y requerimientos en tiempo real.</span>
              <span className="hidden md:inline">Controla si Dali atiende de inmediato las conversaciones entrantes de WhatsApp.</span>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Interruptor checked={asistente.enabled} onChange={onEncender} disabled={ocupado} label={asistente.enabled ? 'Apagar a Dali' : 'Encender a Dali'} />
          <span className="hidden w-24 font-headline text-[15px] font-semibold leading-tight text-teal-900 md:block xl:hidden">
            {asistente.enabled ? 'Dali está atendiendo' : 'Dali está apagada'}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-4 border-t border-stone-100 pt-4 md:mt-5 md:pt-5 lg:grid-cols-2 xl:grid-cols-1">
        <div className="md:rounded-xl md:border md:border-stone-200 md:bg-stone-50 md:p-5 xl:rounded-none xl:border-0 xl:bg-transparent xl:p-0">
          <p className="font-label text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 md:font-body md:text-base md:normal-case md:tracking-normal md:text-stone-800">
            Pausar atención temporalmente
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2 md:flex md:flex-wrap">
            {PAUSAS.map((p) => {
              const activa = pausaVigente === p.valor;
              return (
                <button
                  key={p.valor}
                  type="button"
                  aria-pressed={activa}
                  disabled={ocupado || !asistente.enabled}
                  onClick={() => onPausar(activa ? null : p.valor)}
                  className={cn(
                    'h-12 whitespace-nowrap rounded-full border px-1 font-body text-[14px] transition-colors disabled:opacity-50 md:h-11 md:px-4 md:text-[15px]',
                    activa ? 'border-teal-600 bg-teal-50 font-semibold text-teal-800' : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
                  )}
                >
                  <span className="md:hidden">{p.label}</span>
                  <span className="hidden md:inline">{p.corto}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 hidden font-body text-sm text-stone-500 md:block">
            {pausada && asistente.pausadoHasta ? (
              <>
                En pausa hasta las <span className="font-mono text-stone-700">{horaDe(Date.parse(asistente.pausadoHasta))}</span>; vuelve a tocar el lapso para reanudar.
              </>
            ) : (
              'Dali reanudará la atención automática luego del lapso elegido.'
            )}
          </p>
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-stone-100 pt-4 md:block md:rounded-xl md:border md:border-stone-200 md:bg-stone-50 md:p-5 xl:flex xl:items-center xl:justify-between">
          <div className="min-w-0">
            <p className="font-body text-[15px] font-semibold text-stone-900 md:text-base">
              <span className="md:hidden">Silencio al intervenir</span>
              <span className="hidden md:inline">Regla de silencio por intervención humana</span>
            </p>
            <p className="mt-0.5 font-body text-sm text-stone-500 md:mt-1 md:text-[15px]">
              <span className="md:hidden">Si respondes tú desde el celular, Dali se silencia.</span>
              <span className="hidden md:inline">Cuando escribes tú desde el WhatsApp del negocio, Dali se calla para no interrumpir tu diálogo.</span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3 md:mt-4 md:justify-between xl:mt-0">
            <span className="hidden font-body text-[15px] text-stone-700 md:inline xl:hidden">Tiempo de silencio:</span>
            <span className="relative inline-flex h-12 items-center rounded-xl border border-stone-200 bg-white pl-3 pr-9 md:h-11">
              <Icon name="timer" className="mr-2 hidden text-lg text-stone-500 md:inline" />
              <select
                aria-label="Tiempo de silencio"
                value={silencio}
                onChange={(e) => onSilencio(Number(e.target.value))}
                className="appearance-none bg-transparent font-mono text-[15px] text-stone-900 outline-none md:font-body md:text-base"
              >
                {[15, 30, 60, 120].map((m) => (
                  <option key={m} value={m}>
                    {m < 60 ? `${m} min` : `${m / 60} h`}
                  </option>
                ))}
              </select>
              <Icon name="expand_more" className="pointer-events-none absolute right-2.5 text-xl text-stone-500" />
            </span>
          </div>
        </div>
      </div>
    </Tarjeta>
  );
}

/* --------------------------------------------------------------- identidad */

export function TarjetaIdentidad({ perfil, empresa, onChange }: { perfil: PerfilAsistente; empresa: string; onChange: (p: PerfilAsistente) => void }) {
  return (
    <Tarjeta>
      <CabeceraTarjeta icon="badge" titulo="Identidad y Personalidad" detalle="Define el tono y las palabras con las que responderá a tus clientes" />
      <div className="mt-5 space-y-5">
        <Campo label="Nombre de la asistente" ayuda="Es el nombre con el que se identificará al saludar en WhatsApp.">
          <div className="relative">
            <Input
              value={perfil.asistente}
              maxLength={NOMBRE_MAX}
              onChange={(e) => onChange({ ...perfil, asistente: e.target.value })}
              className={cn(CAMPO, 'pr-24')}
              aria-label="Nombre de la asistente"
            />
            {perfil.asistente.trim() === 'Dali' && (
              <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center font-mono text-sm text-stone-400">Defecto</span>
            )}
          </div>
        </Campo>
        <Campo
          label="Se presenta como (Saludo inicial)"
          derecha={
            <span className="font-mono text-sm text-stone-500">
              {perfil.saludo.length} / {SALUDO_MAX}
            </span>
          }
          ayuda="Este mensaje se envía la primera vez que un número escribe a tu empresa. Vacío, Dali se presenta con su nombre y el de tu empresa."
        >
          <Textarea
            value={perfil.saludo}
            maxLength={SALUDO_MAX}
            onChange={(e) => onChange({ ...perfil, saludo: e.target.value })}
            placeholder={`¡Hola! Soy ${perfil.asistente || 'Dali'}, la asistente de ${empresa} 👋`}
            className={AREA}
            aria-label="Saludo inicial"
          />
        </Campo>
        <Campo
          label="Tono de voz"
          ayuda={
            perfil.tono === 'cercano'
              ? 'Tuteo peruano respetuoso y dinámico, ideal para agilizar cotizaciones técnicas de asfalto.'
              : 'De usted, cordial y precisa. Las preguntas guiadas de hoy siguen en tuteo; el tono formal se aplica cuando Dali conversa libremente.'
          }
        >
          <Segmentado
            label="Tono de voz"
            valor={perfil.tono}
            onChange={(tono) => onChange({ ...perfil, tono })}
            opciones={[
              { valor: 'cercano', label: 'Cercano (tuteo)', icon: perfil.tono === 'cercano' ? 'check_circle' : undefined },
              { valor: 'formal', label: 'Formal (usted)', icon: perfil.tono === 'formal' ? 'check_circle' : undefined },
            ]}
            iconoDesdeMd
            opcionClassName="min-h-12 whitespace-nowrap"
          />
        </Campo>
        <Campo label="Uso de emojis">
          <Segmentado
            label="Uso de emojis"
            valor={perfil.emojis}
            onChange={(emojis) => onChange({ ...perfil, emojis })}
            opciones={[
              {
                valor: 'pocos',
                label: (
                  <span>
                    Pocos <span className="hidden md:inline">(1 o 2 por mensaje)</span>
                    <span className="md:hidden">(1 o 2)</span>
                  </span>
                ),
                icon: perfil.emojis === 'pocos' ? 'check_circle' : undefined,
              },
              { valor: 'ninguno', label: 'Ninguno', icon: perfil.emojis === 'ninguno' ? 'check_circle' : undefined },
            ]}
            iconoDesdeMd
            opcionClassName="min-h-12 whitespace-nowrap"
          />
        </Campo>
      </div>
    </Tarjeta>
  );
}

/* ----------------------------------------------------------------- horario */

const DIAS: Array<{ clave: keyof PerfilAsistente['horario']; label: string; cerrado: string }> = [
  { clave: 'semana', label: 'Lunes a Viernes', cerrado: 'Cerrado' },
  { clave: 'sabado', label: 'Sábados', cerrado: 'Cerrado' },
  { clave: 'domingo', label: 'Domingos', cerrado: 'Cerrado (despacho bajo coordinación)' },
];

/** Cada media hora entre las 05:00 y las 23:30, en 24 h como lo escribe el guion (el `type=time` del navegador sale en 12 h y no entra en 390). */
const HORAS = Array.from({ length: 38 }, (_, i) => `${String(5 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

function SelectorHora({ valor, onChange, label }: { valor: string; onChange: (v: string) => void; label: string }) {
  const opciones = HORAS.includes(valor) ? HORAS : [valor, ...HORAS];
  return (
    <span className="relative inline-flex h-11 items-center rounded-lg border border-stone-200 bg-stone-50 md:bg-white">
      <select
        aria-label={label}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="h-full appearance-none bg-transparent pl-2 pr-6 font-mono text-[14px] text-stone-900 outline-none md:pl-2.5 md:pr-7 md:text-[15px]"
      >
        {opciones.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <Icon name="expand_more" className="pointer-events-none absolute right-1.5 text-lg text-stone-400" />
    </span>
  );
}

function FilaDia({ label, franja, cerrado, onChange }: { label: string; franja: FranjaHoraria; cerrado: string; onChange: (f: FranjaHoraria) => void }) {
  return (
    <div
      className={cn('flex items-center justify-between gap-3 py-3 md:rounded-xl md:border md:border-stone-200 md:px-4 md:py-3', franja.activo ? 'md:bg-white' : 'md:bg-stone-50')}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={franja.activo}
        onClick={() => onChange({ ...franja, activo: !franja.activo })}
        className="flex min-h-11 items-center gap-3 text-left"
      >
        <span
          className={cn(
            'flex size-7 items-center justify-center rounded-full border-2 transition-colors',
            franja.activo ? 'border-teal-700 bg-teal-700 text-white' : 'border-stone-300 bg-white'
          )}
        >
          {franja.activo && <Icon name="check" className="text-lg" />}
        </span>
        <span className={cn('font-body text-[15px] font-semibold md:text-base', franja.activo ? 'text-stone-900' : 'text-stone-400')}>{label}</span>
      </button>
      {franja.activo ? (
        <span className="flex shrink-0 items-center gap-1.5">
          <SelectorHora label={`${label}, desde`} valor={franja.desde} onChange={(desde) => onChange({ ...franja, desde })} />
          <span className="font-body text-sm text-stone-400">a</span>
          <SelectorHora label={`${label}, hasta`} valor={franja.hasta} onChange={(hasta) => onChange({ ...franja, hasta })} />
        </span>
      ) : (
        <span className="text-right font-body text-[14px] italic leading-tight text-stone-400 md:text-[15px]">{cerrado}</span>
      )}
    </div>
  );
}

export function TarjetaHorario({ perfil, onChange }: { perfil: PerfilAsistente; onChange: (p: PerfilAsistente) => void }) {
  const h = perfil.horario;
  return (
    <Tarjeta>
      <CabeceraTarjeta
        icon="schedule"
        titulo="Horario de atención"
        detalle="Define cuándo responde Dali de forma inmediata"
        derecha={<span className="font-mono text-sm text-stone-500">GMT-5 Lima</span>}
      />
      <div className="mt-2 divide-y divide-stone-100 md:mt-4 md:space-y-3 md:divide-y-0">
        {DIAS.map((d) => (
          <FilaDia key={d.clave} label={d.label} cerrado={d.cerrado} franja={h[d.clave]} onChange={(f) => onChange({ ...perfil, horario: { ...h, [d.clave]: f } })} />
        ))}
      </div>
      <Campo
        label="Respuesta fuera de horario"
        className="mt-5"
        derecha={
          <span className="font-mono text-sm text-stone-500">
            {perfil.fueraDeHorario.length} / {FUERA_DE_HORARIO_MAX}
          </span>
        }
        ayuda="Dali atiende igual y aclara que el asesor confirma al abrir; esto se agrega al primer mensaje cuando escriben fuera de horario."
      >
        <Textarea
          value={perfil.fueraDeHorario}
          maxLength={FUERA_DE_HORARIO_MAX}
          onChange={(e) => onChange({ ...perfil, fueraDeHorario: e.target.value })}
          placeholder="Ahora estamos cerrados, pero tomo tus datos y un asesor te escribe a primera hora."
          className={cn(AREA, 'min-h-[88px]')}
          aria-label="Respuesta fuera de horario"
        />
      </Campo>
    </Tarjeta>
  );
}

/* ------------------------------------------------------------------ reglas */

const REGLAS: Array<{ clave: keyof PerfilAsistente['reglas']; titulo: string; detalle: string }> = [
  {
    clave: 'sinPrecios',
    titulo: 'Nunca da precios de obra cerrados',
    detalle: 'Dali recopila el metrado, espesor y zona, y explica que el precio final lo confirma el asesor con la cotización.',
  },
  {
    clave: 'sinPromesas',
    titulo: 'Nunca promete fechas de entrega inmediatas',
    detalle: 'Dali pregunta para qué fecha planean la obra y aclara que el despacho lo confirma el asesor.',
  },
  {
    clave: 'escala',
    titulo: 'Derivación inmediata a persona',
    detalle: 'Pasa a una persona cuando el cliente lo pide («hablar con un asesor»), se nota molestia o van tres mensajes fuera de tema.',
  },
];

export function TarjetaReglas({ perfil, onChange }: { perfil: PerfilAsistente; onChange: (p: PerfilAsistente) => void }) {
  const r = perfil.reglas;
  const cambiar = (clave: keyof PerfilAsistente['reglas'], v: boolean) => onChange({ ...perfil, reglas: { ...r, [clave]: v } });
  return (
    <Tarjeta>
      <CabeceraTarjeta icon="verified_user" titulo="Reglas del negocio y Asfalto" detalle="Límites y criterio para el rubro pavimentación" />
      <div className="mt-2 divide-y divide-stone-100 md:mt-4 md:space-y-3 md:divide-y-0">
        {REGLAS.map((regla) => (
          <div key={regla.clave} className="flex items-start justify-between gap-4 py-4 md:rounded-xl md:border md:border-stone-200 md:bg-stone-50 md:px-4">
            <div className="min-w-0">
              <p className="font-body text-base font-semibold text-stone-900">{regla.titulo}</p>
              <p className="mt-0.5 font-body text-[15px] leading-relaxed text-stone-500">{regla.detalle}</p>
            </div>
            <Interruptor checked={r[regla.clave]} onChange={(v) => cambiar(regla.clave, v)} label={regla.titulo} className="mt-0.5" />
          </div>
        ))}
        <div className="py-4 md:rounded-xl md:border md:border-stone-200 md:bg-stone-50 md:px-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="font-body text-base font-semibold text-stone-900">Zona de cobertura estricta</p>
              <p className="mt-0.5 font-body text-[15px] leading-relaxed text-stone-500">
                Fuera de la zona toma los datos, dice que un asesor evalúa si se llega y no compromete atención.
              </p>
            </div>
            <Interruptor checked={r.zonaEstricta} onChange={(v) => cambiar('zonaEstricta', v)} label="Zona de cobertura estricta" className="mt-0.5" />
          </div>
          <label className="mt-3 flex items-center gap-3">
            <span className="shrink-0 font-body text-[15px] font-semibold text-stone-800">Zona principal:</span>
            <Input
              value={perfil.zona}
              maxLength={120}
              onChange={(e) => onChange({ ...perfil, zona: e.target.value })}
              className={cn(CAMPO, 'h-11 border-teal-200 bg-teal-50 text-teal-900')}
              aria-label="Zona de cobertura principal"
            />
          </label>
        </div>
      </div>
      <p className="mt-4 font-body text-sm text-stone-500">
        Con las preguntas guiadas de hoy estas reglas se cumplen siempre; los interruptores mandan cuando Dali conversa libremente.
      </p>
    </Tarjeta>
  );
}

/* ------------------------------------------------------------------ avisos */

const CASOS: Array<{ clave: keyof AvisosAsistente['casos']; label: string; tono: string }> = [
  { clave: 'leadNuevo', label: 'Lead nuevo con datos técnicos recolectados', tono: 'bg-teal-700' },
  { clave: 'pideUrgente', label: 'Cliente pide hablar con una persona', tono: 'bg-amber-600' },
  { clave: 'fallo', label: 'Dali no pudo contestar y pasó la conversación (alerta crítica)', tono: 'bg-red-600' },
];

export function TarjetaAvisos({ avisos, grupoConectado, onChange }: { avisos: AvisosAsistente; grupoConectado: boolean; onChange: (a: AvisosAsistente) => void }) {
  const opciones: Array<{ canal: AvisosAsistente['canal']; icon: IconName; titulo: string; detalle: ReactNode }> = [
    {
      canal: 'grupo',
      icon: 'groups',
      titulo: 'Grupo de WhatsApp de ventas',
      detalle: grupoConectado ? 'Notifica al grupo conectado' : 'Sin grupo conectado: pídelo al equipo de Dali',
    },
    {
      canal: 'dueno',
      icon: 'person',
      titulo: 'Número personal del dueño',
      detalle: avisos.numeroDueno ? <span className="font-mono">{telefonoLegible(avisos.numeroDueno)}</span> : 'Escribe el celular que recibe los avisos',
    },
  ];
  return (
    <Tarjeta>
      <CabeceraTarjeta icon="notifications" tonoIcono="amber" titulo="Avisos y Notificaciones" detalle="¿A quién avisa Dali cuando entra un pedido o piden atención?" />
      <div role="radiogroup" aria-label="A quién avisar" className="mt-5 space-y-3">
        {opciones.map((o) => {
          const activa = avisos.canal === o.canal;
          return (
            <div key={o.canal}>
              <button
                type="button"
                role="radio"
                aria-checked={activa}
                onClick={() => onChange({ ...avisos, canal: o.canal })}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors',
                  activa ? 'border-teal-600 bg-teal-50' : 'border-stone-200 bg-white hover:bg-stone-50'
                )}
              >
                <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-full border-2', activa ? 'border-teal-700' : 'border-stone-300')}>
                  {activa && <span className="size-3 rounded-full bg-teal-700" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-body text-base font-semibold text-stone-900">{o.titulo}</span>
                  <span className="block truncate font-body text-[15px] text-stone-500">{o.detalle}</span>
                </span>
                <Icon name={o.icon} className={cn('text-2xl', activa ? 'text-teal-700' : 'text-stone-400')} />
              </button>
              {o.canal === 'dueno' && activa && (
                <Input
                  inputMode="tel"
                  value={avisos.numeroDueno}
                  onChange={(e) => onChange({ ...avisos, numeroDueno: e.target.value.replace(/[^\d+ ]/g, '') })}
                  placeholder="51 987 654 321"
                  className={cn(CAMPO, 'mt-2 font-mono')}
                  aria-label="Número del dueño"
                />
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-5 font-body text-[15px] font-semibold text-stone-800">Eventos que disparan alerta inmediata</p>
      <div className="mt-2 space-y-1">
        {CASOS.map((c) => {
          const activo = avisos.casos[c.clave];
          return (
            <button
              key={c.clave}
              type="button"
              role="checkbox"
              aria-checked={activo}
              onClick={() => onChange({ ...avisos, casos: { ...avisos.casos, [c.clave]: !activo } })}
              className="flex min-h-11 w-full items-center gap-3 text-left"
            >
              <span
                className={cn('flex size-6 shrink-0 items-center justify-center rounded-full text-white transition-colors', activo ? c.tono : 'border-2 border-stone-300 bg-white')}
              >
                {activo && <Icon name="check" className="text-base" />}
              </span>
              <span className={cn('font-body text-[15px]', activo ? 'text-stone-800' : 'text-stone-400')}>{c.label}</span>
            </button>
          );
        })}
      </div>
    </Tarjeta>
  );
}

/* ------------------------------------------------------------------ piloto */

export function TarjetaPiloto({ numeros, onChange }: { numeros: string[]; onChange: (n: string[]) => void }) {
  const [agregando, setAgregando] = useState(false);
  const [nuevo, setNuevo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const agregar = () => {
    const n = normalizarNumero(nuevo);
    if (!n) {
      setError('Escribe un celular válido, con código de país si no es peruano');
      return;
    }
    if (!numeros.includes(n)) onChange([...numeros, n]);
    setNuevo('');
    setError(null);
    setAgregando(false);
  };
  return (
    <Tarjeta>
      <CabeceraTarjeta
        icon="science"
        titulo={
          <>
            Modo Piloto<span className="hidden md:inline"> (Pruebas controladas)</span>
          </>
        }
        derecha={
          <StatusPill tono={numeros.length ? 'amber' : 'stone'} punto={false} className="mt-1">
            {numeros.length ? 'Activo' : 'Opcional'}
          </StatusPill>
        }
      />
      <p className="mt-4 font-body text-[15px] leading-relaxed text-stone-600">
        Si agregas números aquí, Dali solo responderá a ellos. Los demás clientes no reciben mensajes automáticos hasta que vacíes la lista.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {numeros.map((n) => (
          <span key={n} className="inline-flex h-11 items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 pl-3 pr-1 font-mono text-[15px] text-stone-800">
            <Icon name="smartphone" className="text-lg text-stone-500" />
            {telefonoLegible(n)}
            <button
              type="button"
              aria-label={`Quitar ${telefonoLegible(n)}`}
              onClick={() => onChange(numeros.filter((x) => x !== n))}
              className="flex size-9 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-200 hover:text-stone-700"
            >
              <Icon name="close" className="text-lg" />
            </button>
          </span>
        ))}
      </div>
      {agregando ? (
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            agregar();
          }}
        >
          <div className="basis-full md:basis-auto md:flex-1">
            <Input
              autoFocus
              inputMode="tel"
              value={nuevo}
              onChange={(e) => setNuevo(e.target.value)}
              placeholder="9xx xxx xxx"
              aria-invalid={Boolean(error)}
              className={cn(CAMPO, 'font-mono')}
              aria-label="Número de prueba"
            />
            {error && <p className="mt-1.5 font-body text-sm text-red-700">{error}</p>}
          </div>
          <button type="submit" className="h-12 shrink-0 rounded-xl bg-teal-700 px-4 font-body text-[15px] font-semibold text-white hover:bg-teal-800">
            Agregar
          </button>
          <button
            type="button"
            onClick={() => setAgregando(false)}
            className="h-12 shrink-0 rounded-xl border border-stone-200 px-3 font-body text-[15px] text-stone-600 hover:bg-stone-50"
          >
            Cancelar
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAgregando(true)}
          className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-teal-200 font-body text-[15px] font-semibold text-teal-800 hover:bg-teal-50 md:w-auto md:px-5"
        >
          <Icon name="add" className="text-xl" /> Agregar número de prueba
        </button>
      )}
      <p className="mt-4 font-body text-sm text-stone-500">* Si dejas la lista vacía, Dali atenderá a todos los clientes que escriban al WhatsApp del negocio.</p>
    </Tarjeta>
  );
}

export type { Formulario };
