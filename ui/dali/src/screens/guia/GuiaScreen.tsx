import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Asistente, Catalogo, Equipo, Faq, FichaNegocio, LineaWhatsApp, Servicios } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/Icon';
import type { IconName } from '@/components/icon-map';

/**
 * LA GUÍA DE DALI («Cómo funciona», `/guia`): la referencia del workflow de la
 * empresa, como las páginas «Workflow» de cada vertical del Portal: qué
 * alimenta y qué produce cada pantalla, en el orden en que se configura, se
 * prueba y se opera; los ciclos de estado; y cómo decide Dali cada mensaje.
 * Arriba, **lo que te falta**, contado de verdad contra la configuración de
 * la empresa (no una lista fija). Data-driven: para actualizarla se editan
 * los arreglos de abajo, y **refleja el código real** (`src/agent/dali/*`,
 * `src/agent/ventas/*`), no un flujo ideal. Stitch no dibujó esta pantalla;
 * se construye con el lenguaje de las otras.
 */
interface Etapa {
  n: number;
  nombre: string;
  icono: IconName;
  ruta: string;
  alimenta: string;
  produce: string;
}

interface Fase {
  clave: string;
  titulo: string;
  etapas: Etapa[];
}

const FASES: Fase[] = [
  {
    clave: 'configurar',
    titulo: '1 · Configurar (una vez, y se mantiene)',
    etapas: [
      {
        n: 1,
        nombre: 'Negocio',
        icono: 'storefront',
        ruta: '/negocio',
        alimenta: 'Descripción, dirección y cómo llegar, contacto, zona que atiendes, qué ofreces y qué no',
        produce: 'Cómo se presenta Dali y qué rechaza con cortesía: lo que no ofreces no se cotiza, y fuera de tu zona solo toma los datos',
      },
      {
        n: 2,
        nombre: 'Asistente',
        icono: 'smart_toy',
        ruta: '/asistente',
        alimenta: 'Nombre y saludo, tono, horario, reglas (¿da precios? ¿promete fechas? ¿pasa a persona?), a quién avisa, silencio al intervenir, números de prueba',
        produce: 'La personalidad y los límites de Dali. Con números de prueba, atiende SOLO a esos: la lista vacía es «atiende a todos»',
      },
      {
        n: 3,
        nombre: 'Servicios (el guion)',
        icono: 'construction',
        ruta: '/servicios',
        alimenta: 'Cada servicio con sus palabras y sus preguntas en orden (viene el pack del rubro; se edita o se restaura)',
        produce: 'Qué pregunta Dali y en qué orden. Las respuestas del cliente arman el lead; sin guion no hay calificación',
      },
      {
        n: 4,
        nombre: 'Preguntas frecuentes',
        icono: 'quiz',
        ruta: '/faq',
        alimenta: 'Pregunta, respuesta y sus variantes; «Probar» dice si la reconoce; «sugeridas» son las que Dali no supo',
        produce: 'Respuestas directas fuera del guion (horario, zona, formas de pago). Se comparan por significado, no por palabra exacta',
      },
      {
        n: 5,
        nombre: 'Catálogo',
        icono: 'menu_book',
        ruta: '/catalogo',
        alimenta: 'Ítems con unidad y precio, y la política «Dali dice precios»',
        produce: 'El precio en el chat solo si lo permites; si no, deriva a tu cotización (lo recomendado para servicios)',
      },
      {
        n: 6,
        nombre: 'Importar (Excel)',
        icono: 'upload_file',
        ruta: '/importar',
        alimenta: 'La plantilla con cinco hojas: Negocio, Servicios, Preguntas, Preguntas frecuentes y Catálogo',
        produce: 'Todo lo anterior de una vez, en modo agregar o reemplazar, con análisis previo e historial. Es el camino rápido',
      },
      {
        n: 7,
        nombre: 'WhatsApp',
        icono: 'phone_iphone',
        ruta: '/whatsapp',
        alimenta: 'El QR (o el código) desde el WhatsApp del negocio',
        produce: 'La línea conectada. Sin línea, Dali no atiende y el panel lo avisa arriba',
      },
      {
        n: 8,
        nombre: 'Equipo y notificaciones',
        icono: 'badge',
        ruta: '/equipo',
        alimenta: 'Quién entra al panel y con qué rol; a quién le llegan los avisos y en qué horario de descanso no',
        produce: 'Dueño edita todo, ventas atiende conversaciones y leads, solo lectura mira. Los avisos salen a cada miembro con celular',
      },
    ],
  },
  {
    clave: 'probar',
    titulo: '2 · Probar antes de abrir',
    etapas: [
      {
        n: 9,
        nombre: 'Probar a Dali',
        icono: 'play_circle',
        ruta: '/probar',
        alimenta: 'Un mensaje como el que mandaría un cliente, con la configuración vigente',
        produce: 'La respuesta y «lo que Dali entendió»: servicio, datos anotados y pendientes, señales. No crea conversación ni lead ni avisa',
      },
      {
        n: 10,
        nombre: 'La primera conversación real',
        icono: 'chat',
        ruta: '/whatsapp',
        alimenta: 'Un mensaje desde uno de los números de prueba a la línea del negocio',
        produce: 'La conversación en Conversaciones, el lead en Leads y el aviso a tu WhatsApp. Cuando quede bien, vacías los números de prueba',
      },
    ],
  },
  {
    clave: 'operar',
    titulo: '3 · Operar todos los días',
    etapas: [
      {
        n: 11,
        nombre: 'Inicio',
        icono: 'home',
        ruta: '/inicio',
        alimenta: 'Hoy contra ayer: conversaciones, leads nuevos, sin responder, tiempo de respuesta',
        produce: 'Quién pide atención (y de qué), los últimos leads y el estado de la línea y del plan',
      },
      {
        n: 12,
        nombre: 'Conversaciones',
        icono: 'chat',
        ruta: '/chats',
        alimenta: 'Tomar, devolver, cerrar y escribirle al cliente desde el panel',
        produce: 'Al intervenir, Dali se calla el tiempo que fijaste en Asistente y retoma sola; escribes con el número del negocio',
      },
      {
        n: 13,
        nombre: 'Leads',
        icono: 'group',
        ruta: '/leads',
        alimenta: 'Lo que Dali juntó (servicio, cantidad, lugar, fecha, contacto) y tu trabajo: estado, cotización, notas',
        produce: 'El embudo nuevo → contactado → cotizado → ganado o perdido, y la exportación a Excel',
      },
      {
        n: 14,
        nombre: 'Reportes',
        icono: 'bar_chart',
        ruta: '/reportes',
        alimenta: 'Conversaciones, leads y mensajes de los últimos 90 días',
        produce: 'Por día, por servicio, embudo, tiempo de toma y lo que Dali no supo responder (para convertirlo en preguntas frecuentes)',
      },
    ],
  },
];

interface Ciclo {
  kicker: string;
  titulo: string;
  chips: Array<{ label: string; tono: string }>;
  nota: string;
}

const CICLOS: Ciclo[] = [
  {
    kicker: 'Estados',
    titulo: 'Una conversación',
    chips: [
      { label: 'Dali atendiendo', tono: 'bg-teal-50 text-teal-800 border-teal-200' },
      { label: 'Pide atención', tono: 'bg-amber-50 text-amber-800 border-amber-200' },
      { label: 'Persona a cargo', tono: 'bg-stone-100 text-stone-700 border-stone-200' },
      { label: 'Cerrada', tono: 'bg-stone-100 text-stone-500 border-stone-200' },
    ],
    nota: 'Pide atención cuando el cliente lo pide o Dali no puede seguir; vuelve a «Dali atendiendo» al devolverla o cuando pasa el silencio.',
  },
  {
    kicker: 'Estados',
    titulo: 'Un lead',
    chips: [
      { label: 'Nuevo', tono: 'bg-amber-50 text-amber-800 border-amber-200' },
      { label: 'Contactado', tono: 'bg-teal-50 text-teal-800 border-teal-200' },
      { label: 'Cotizado', tono: 'bg-stone-100 text-stone-700 border-stone-200' },
      { label: 'Ganado / Perdido', tono: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    ],
    nota: 'El lead nace cuando Dali tiene el servicio y, al menos, el lugar o la cantidad; de ahí en adelante es tuyo.',
  },
];

interface Regla {
  titulo: string;
  como: string;
  nota: string;
}

const REGLAS: Array<{ grupo: string; items: Regla[] }> = [
  {
    grupo: 'Qué hace Dali con cada mensaje',
    items: [
      {
        titulo: '1. ¿Está pausada?',
        como: 'switch apagado · pausa del panel · silencio por intervención · fuera de números de prueba',
        nota: 'Si sí, no contesta y no avisa. Fuera de horario atiende igual y suma tu aviso de «fuera de horario» al saludo.',
      },
      { titulo: '2. ¿Es una pregunta frecuente?', como: 'similitud(mensaje, pregunta o variante) ≥ 0,87', nota: 'Responde la FAQ y sigue con el guion donde estaba.' },
      { titulo: '3. ¿Pide precio o persona?', como: 'reglas de Asistente + catálogo', nota: 'Precio: solo si lo permites y el ítem lo tiene; persona: pasa, se calla y te avisa.' },
      {
        titulo: '4. El guion',
        como: 'servicio detectado por palabras → siguiente pregunta pendiente',
        nota: 'Los datos del texto libre los extrae el modelo local; lo que no entiende, lo vuelve a preguntar con la pista.',
      },
      {
        titulo: '5. Lead y aviso',
        como: 'servicio + (lugar o cantidad) → lead · resumen confirmado → aviso',
        nota: 'Un aviso por conversación y día, a tu WhatsApp o al grupo, respetando el descanso.',
      },
    ],
  },
  {
    grupo: 'Cómo se miden las cosas',
    items: [
      {
        titulo: 'Tiempo de respuesta',
        como: 'mediana(primera respuesta de Dali − mensaje del cliente), demoras > 10 min afuera',
        nota: 'Es de Dali, no tuyo: mide qué tan rápido atiende el asistente.',
      },
      {
        titulo: 'Uso del mes',
        como: 'mensajes enviados por la línea en el mes calendario (Lima)',
        nota: 'El piloto no tiene límite; el panel avisa al pasar el 90 % cuando lo haya.',
      },
      { titulo: 'Sin responder', como: 'conversaciones donde el último mensaje es del cliente y nadie contestó', nota: 'Aparecen en Inicio como «piden tu atención».' },
    ],
  },
  {
    grupo: 'Dónde vive todo',
    items: [
      {
        titulo: 'La memoria de Dali',
        como: 'perfil · negocio · guion · preguntas frecuentes · catálogo · avisos',
        nota: 'Una sola ficha por empresa en la base compartida de Constroad (Atlas); se edita desde estas pantallas o por Excel.',
      },
      { titulo: 'El modelo', como: 'Qwen local en el servidor de Constroad', nota: 'Extrae los datos del texto libre. Nada sale a una API externa.' },
      { titulo: 'Las conversaciones', como: '90 días de mensajes · leads sin vencimiento', nota: 'Exportables a Excel desde Ajustes y Leads.' },
    ],
  },
];

interface Pendiente {
  clave: string;
  titulo: string;
  ruta: string;
  listo: boolean;
  detalle: string;
}

function usePendientes(): { pendientes: Pendiente[]; cargando: boolean } {
  const negocio = useQuery({ queryKey: ['negocio'], queryFn: () => api.get<FichaNegocio>('/negocio'), staleTime: 60_000 });
  const asistente = useQuery({ queryKey: ['asistente'], queryFn: () => api.get<Asistente>('/asistente'), staleTime: 60_000 });
  const servicios = useQuery({ queryKey: ['servicios'], queryFn: () => api.get<Servicios>('/servicios'), staleTime: 60_000 });
  const faq = useQuery({ queryKey: ['faq'], queryFn: () => api.get<{ faqs: Faq[] }>('/faq'), staleTime: 60_000 });
  const catalogo = useQuery({ queryKey: ['catalogo'], queryFn: () => api.get<Catalogo>('/catalogo'), staleTime: 60_000 });
  const linea = useQuery({ queryKey: ['whatsapp'], queryFn: () => api.get<LineaWhatsApp>('/whatsapp'), staleTime: 60_000 });
  const equipo = useQuery({ queryKey: ['equipo'], queryFn: () => api.get<Equipo>('/equipo'), staleTime: 60_000 });
  const cargando = [negocio, asistente, servicios, faq, catalogo, linea, equipo].some((q) => q.isPending);
  const n = negocio.data;
  const a = asistente.data;
  const pendientes: Pendiente[] = [
    {
      clave: 'negocio',
      titulo: 'La ficha del negocio',
      ruta: '/negocio',
      listo: Boolean(n?.descripcion?.trim() && n?.zona?.trim()),
      detalle: n?.descripcion?.trim() ? 'Descripción y zona listas' : 'Falta la descripción (y la zona que atiendes)',
    },
    {
      clave: 'guion',
      titulo: 'Los servicios y sus preguntas',
      ruta: '/servicios',
      listo: (servicios.data?.activos ?? 0) > 0,
      detalle: servicios.data ? `${servicios.data.activos} servicios activos${servicios.data.delPack ? ' (el pack del rubro)' : ''}` : '',
    },
    {
      clave: 'faq',
      titulo: 'Preguntas frecuentes',
      ruta: '/faq',
      listo: (faq.data?.faqs.length ?? 0) > 0,
      detalle: faq.data?.faqs.length ? `${faq.data.faqs.length} cargadas` : 'Ninguna todavía: horario, zona y formas de pago son las primeras',
    },
    {
      clave: 'catalogo',
      titulo: 'Catálogo y política de precios',
      ruta: '/catalogo',
      listo: Boolean(catalogo.data && (catalogo.data.items.length > 0 || !catalogo.data.dicePrecios)),
      detalle: catalogo.data
        ? catalogo.data.items.length
          ? `${catalogo.data.items.length} ítems · ${catalogo.data.dicePrecios ? 'Dali dice precios' : 'deriva a cotización'}`
          : 'Sin ítems · deriva a cotización (opcional)'
        : '',
    },
    {
      clave: 'linea',
      titulo: 'La línea de WhatsApp conectada',
      ruta: '/whatsapp',
      listo: linea.data?.estado === 'conectado',
      detalle: linea.data
        ? linea.data.estado === 'conectado'
          ? `Conectada: +${linea.data.numero}`
          : linea.data.numero
            ? 'La línea no está conectada'
            : 'Sin número vinculado'
        : '',
    },
    {
      clave: 'pruebas',
      titulo: 'Abrir a todos los clientes',
      ruta: '/asistente',
      listo: Boolean(a && a.testNumbers.length === 0 && a.enabled),
      detalle: a
        ? !a.enabled
          ? 'Dali está apagada'
          : a.testNumbers.length
            ? `Solo atiende a ${a.testNumbers.length} ${a.testNumbers.length === 1 ? 'número de prueba' : 'números de prueba'}`
            : 'Atiende a todos'
        : '',
    },
    {
      clave: 'equipo',
      titulo: 'Quién recibe los avisos',
      ruta: '/equipo',
      listo:
        Boolean(a && (a.avisos.canal === 'grupo' ? a.ownerNotifyTarget : a.avisos.numeroDueno)) ||
        (equipo.data?.miembros.some((m) => m.recibeAvisos && !m.identidad.includes('@')) ?? false),
      detalle: a
        ? a.avisos.canal === 'dueno'
          ? `Al dueño${a.avisos.numeroDueno ? ` (+${a.avisos.numeroDueno})` : ': falta el número'}`
          : a.ownerNotifyTarget
            ? 'Al grupo de la línea'
            : 'Sin destino de avisos'
        : '',
    },
  ];
  return { pendientes, cargando };
}

export function GuiaScreen() {
  const { pendientes, cargando } = usePendientes();
  const listos = pendientes.filter((p) => p.listo).length;
  return (
    <div className="px-4 pb-10 pt-5 md:px-6 md:pt-8 xl:px-10">
      <p className="font-label text-[12px] font-semibold uppercase tracking-[0.12em] text-teal-800">Guía</p>
      <h1 className="mt-1 font-headline text-[28px] font-bold tracking-tight text-stone-900 md:text-4xl">Cómo funciona Dali</h1>
      <p className="mt-2 max-w-2xl font-body text-[15px] text-stone-500 md:text-base">
        El circuito completo: qué le das a Dali en cada pantalla y qué hace con eso, en el orden en que se configura, se prueba y se opera.
      </p>

      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-headline text-lg font-bold text-stone-900">Lo que te falta</h2>
          <span
            className={cn('rounded-full px-2.5 py-1 font-mono text-xs font-bold', listos === pendientes.length ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800')}
          >
            {cargando ? '…' : `${listos} de ${pendientes.length} listo${listos === 1 ? '' : 's'}`}
          </span>
        </div>
        <ul className="mt-3 divide-y divide-stone-100">
          {pendientes.map((p) => (
            <li key={p.clave}>
              <Link to={p.ruta} className="flex items-center gap-3 py-3 hover:bg-stone-50">
                {p.listo ? (
                  <Icon name="check_circle" className="shrink-0 text-2xl text-emerald-600" />
                ) : (
                  <span className="size-6 shrink-0 rounded-full border-2 border-stone-300" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1">
                  <span className={cn('block font-body text-[15px] font-semibold', p.listo ? 'text-stone-500 line-through decoration-stone-300' : 'text-stone-900')}>
                    {p.titulo}
                  </span>
                  {p.detalle && <span className="block font-body text-sm text-stone-500">{p.detalle}</span>}
                </span>
                <Icon name="chevron_right" className="shrink-0 text-xl text-stone-400" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <Seccion kicker="Flujo" titulo="Pantalla por pantalla">
        <div className="space-y-6">
          {FASES.map((f) => (
            <div key={f.clave}>
              <p className="font-label text-[12px] font-semibold uppercase tracking-[0.1em] text-stone-500">{f.titulo}</p>
              <div className="mt-2 grid gap-3 md:grid-cols-2">
                {f.etapas.map((e) => (
                  <Link key={e.n} to={e.ruta} className="flex gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm hover:border-teal-300">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                      <Icon name={e.icono} className="text-2xl" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-headline text-base font-bold text-stone-900">
                          {e.n}. {e.nombre}
                        </span>
                        <span className="rounded bg-teal-50 px-1.5 py-0.5 font-mono text-[11px] text-teal-800">{e.ruta}</span>
                      </span>
                      <span className="mt-1 block font-body text-sm text-stone-600">
                        <b className="font-semibold text-stone-800">Le das:</b> {e.alimenta}
                      </span>
                      <span className="mt-0.5 block font-body text-sm text-emerald-800">
                        <b className="font-semibold">Produce:</b> {e.produce}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Seccion>

      {CICLOS.map((c) => (
        <Seccion key={c.titulo} kicker={c.kicker} titulo={c.titulo}>
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            {c.chips.map((chip, i) => (
              <span key={chip.label} className="flex items-center gap-2">
                <span className={cn('rounded-md border px-2.5 py-1 font-body text-sm font-semibold', chip.tono)}>{chip.label}</span>
                {i < c.chips.length - 1 && <Icon name="arrow_forward" className="text-lg text-stone-400" />}
              </span>
            ))}
            <span className="basis-full font-body text-sm text-stone-500">{c.nota}</span>
          </div>
        </Seccion>
      ))}

      <Seccion kicker="Reglas" titulo="Cómo decide Dali, y cómo se mide">
        <div className="grid gap-4 lg:grid-cols-3">
          {REGLAS.map((g) => (
            <div key={g.grupo} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <p className="font-headline text-base font-bold text-stone-900">{g.grupo}</p>
              <div className="mt-3 space-y-3">
                {g.items.map((r) => (
                  <div key={r.titulo} className="border-l-2 border-teal-200 pl-3">
                    <p className="font-body text-sm font-semibold text-teal-800">{r.titulo}</p>
                    <p className="mt-1 rounded bg-stone-50 px-2 py-1 font-mono text-[12px] leading-relaxed text-stone-800">{r.como}</p>
                    <p className="mt-1 font-body text-sm text-stone-500">{r.nota}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Seccion>
    </div>
  );
}

function Seccion({ kicker, titulo, children }: { kicker: string; titulo: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <p className="font-label text-[11px] font-semibold uppercase tracking-[0.12em] text-teal-800">{kicker}</p>
      <h2 className="mt-0.5 font-headline text-xl font-bold text-stone-900">{titulo}</h2>
      <span className="mt-1.5 block h-0.5 w-10 rounded bg-teal-700" />
      <div className="mt-4">{children}</div>
    </section>
  );
}
