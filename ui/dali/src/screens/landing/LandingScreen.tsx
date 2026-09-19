import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BrandMark } from '@/components/BrandMark';
import { Icon } from '@/components/Icon';
import type { IconName } from '@/components/icon-map';
import { cn } from '@/lib/utils';

/**
 * P1 «Landing» (diseños `P1-landing` móvil, tablet y escritorio): la página
 * pública de Dali, en la raíz sin sesión (con sesión se va al inicio). Dali
 * es para cualquier negocio que venda por WhatsApp —el rubro solo cambia el
 * guion—, así que la landing habla en general (José, 16/09: nada de «obra» ni
 * de ejemplos de asfalto en el héroe); la conversación de muestra es el patrón
 * de Dali con un negocio cualquiera, los tres pasos son P4→P6, «lo que Dali
 * no hace» son las reglas del asistente (sin precios cerrados, sin fechas
 * prometidas, pasa a una persona y se calla 30 min). Los rubros dicen cuál
 * está disponible hoy y cuáles vienen, sin esconderlo. **Contra el diseño,
 * deliberado**: sin precios ni planes (el piloto no tiene costo; los planes
 * los define José en F4), sin «14 días» (el piloto no tiene plazo), sin
 * logos de clientes (Inframaq es un cliente y no dio permiso; Globofast no
 * existe), sin «Ver una demo» (no hay video), sin número de soporte ni
 * «Hablar con un asesor» (no hay línea de soporte definida), sin
 * «Términos» ni «Privacidad» (no existen las páginas), y los rubros que no
 * tienen pack van como «próximamente».
 */
const RUBROS: Array<{ icono: IconName; nombre: string; chip: string; texto: string; ejemplo: string; disponible: boolean }> = [
  {
    icono: 'construction',
    nombre: 'Asfalto y obras',
    chip: 'Guion de cotización técnica',
    texto: 'Junta área (m²), distrito, espesor de carpeta (1", 2", 3"), estado de la base, cuándo lo necesitan y para quién es.',
    ejemplo: '«¿La base ya está preparada o es terreno natural?»',
    disponible: true,
  },
  {
    icono: 'restaurant',
    nombre: 'Restaurantes y pollerías',
    chip: 'Pedidos, reservas y delivery',
    texto: 'Tomará pedidos del menú del día, la dirección de reparto y el medio de pago, y confirmará comensales.',
    ejemplo: '«¿Para cuántas personas y a qué dirección enviamos?»',
    disponible: false,
  },
  {
    icono: 'local_gas_station',
    nombre: 'Grifos y lubricentros',
    chip: 'Citas y precios del día',
    texto: 'Informará precios del día, agendará cambios de aceite y filtros y dirá los horarios por sede.',
    ejemplo: '«¿Qué marca de auto y qué kilometraje tiene?»',
    disponible: false,
  },
  {
    icono: 'handyman',
    nombre: 'Servicios y talleres',
    chip: 'Calificación previa para cotizar',
    texto: 'Separará al curioso del que tiene urgencia: requerimiento, zona, fotos de la falla y aviso al técnico de turno.',
    ejemplo: '«¿Para cuándo necesitas el servicio y en qué distrito?»',
    disponible: false,
  },
];

const PASOS: Array<{ icono: IconName; tono: string; titulo: string; texto: string; pie: string; pieIcono: IconName }> = [
  {
    icono: 'qr_code_scanner',
    tono: 'teal',
    titulo: '1. Conecta tu WhatsApp',
    texto: 'Escaneas un código QR desde el WhatsApp de tu empresa, como si abrieras WhatsApp Web. Listo en 2 minutos, sin cambiar de chip.',
    pie: '2 minutos, sin cambiar de chip',
    pieIcono: 'schedule',
  },
  {
    icono: 'description',
    tono: 'amber',
    titulo: '2. Cuéntale de tu negocio',
    texto: 'Sube tu Excel o llena la ficha rápida: qué servicios das, qué preguntarle al cliente y qué datos juntar antes de cotizar.',
    pie: 'Plantilla lista para tu rubro',
    pieIcono: 'table_view',
  },
  {
    icono: 'notifications_active',
    tono: 'teal',
    titulo: '3. Dali atiende y te avisa',
    texto: 'Dali guía la conversación con amabilidad y te manda el resumen ordenado a tu celular: qué necesita, cuánto, dónde y el teléfono del cliente.',
    pie: 'Leads listos para cotizar',
    pieIcono: 'check_circle',
  },
];

const NO_HACE: Array<{ icono: IconName; titulo: string; texto: string }> = [
  {
    icono: 'block',
    titulo: 'No inventa precios cerrados ni descuentos',
    texto: 'Junta los datos que tú necesitas (cantidad, lugar, fecha). No da presupuestos: deriva a tu cotización, salvo que tú pongas una tarifa fija en el catálogo.',
  },
  {
    icono: 'event_busy',
    titulo: 'No promete fechas de entrega',
    texto: 'Pregunta para cuándo lo necesita el cliente, y aclara con cordialidad que la fecha la confirma alguien de tu empresa.',
  },
  {
    icono: 'person_pin',
    titulo: 'Pasa a una persona cuando el cliente lo pide',
    texto: 'Si alguien escribe «quiero hablar con el dueño» o «pásame con un asesor», Dali se calla 30 minutos y te avisa al toque.',
  },
];

const NAV = [
  { href: '#como-funciona', label: 'Cómo funciona' },
  { href: '#rubros', label: 'Rubros' },
  { href: '#garantias', label: 'Lo que no hace' },
  { href: '#piloto', label: 'Piloto' },
];

export function LandingScreen() {
  return (
    <div className="min-h-dvh bg-stone-50 text-stone-900">
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 md:h-20 md:px-6">
          <div className="flex items-center gap-2">
            <BrandMark
              size="sm"
              junto={
                <span className="rounded-md border border-teal-200/70 bg-teal-50 px-1.5 py-0.5 font-label text-[10px] font-bold tracking-wider text-teal-800 lg:hidden">PERÚ</span>
              }
            />
          </div>
          <nav className="hidden items-center gap-8 lg:flex" aria-label="Secciones">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="font-body text-[15px] text-stone-700 hover:text-stone-900">
                {n.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <Link to="/entrar" className="font-body text-[15px] font-semibold text-stone-700 hover:text-stone-900">
              Entrar
            </Link>
            <Link to="/registro" className="inline-flex h-11 items-center gap-2 rounded-xl bg-teal-700 px-4 font-body text-[15px] font-semibold text-white hover:bg-teal-800">
              Probar gratis <Icon name="arrow_forward" className="hidden text-lg md:inline" />
            </Link>
          </div>
        </div>
        <div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 pb-3 lg:hidden [scrollbar-width:none]">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="shrink-0 rounded-full bg-stone-100 px-4 py-2 font-body text-[15px] text-stone-700">
              {n.label}
            </a>
          ))}
        </div>
      </header>

      <section className="bg-gradient-to-b from-teal-50/70 to-stone-50">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 md:px-6 md:py-16 lg:grid-cols-[1.25fr_1fr] lg:items-center lg:py-20">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-teal-200/80 bg-white px-3 py-1.5 font-body text-sm font-semibold text-teal-800">
              <span className="size-2 rounded-full bg-teal-500" /> Asistente con IA para el WhatsApp de cualquier negocio
            </span>
            <h1 className="mt-5 font-headline text-[36px] font-bold leading-[1.05] tracking-tight text-stone-900 md:text-[56px] lg:text-[60px]">
              Tu negocio responde por WhatsApp <span className="text-teal-800 underline decoration-teal-300 decoration-4 underline-offset-8">aunque tú no estés</span>
            </h1>
            <p className="mt-6 max-w-xl font-body text-lg leading-relaxed text-stone-600 md:text-xl">
              Dali atiende a tus clientes, junta los datos de cada pedido o consulta y te avisa ordenado al celular.{' '}
              <b className="font-semibold text-stone-900">Tú solo cierras la venta.</b>
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/registro"
                className="inline-flex h-14 items-center justify-center gap-2 rounded-xl bg-teal-700 px-6 font-headline text-lg font-bold text-white shadow-md shadow-teal-700/20 hover:bg-teal-800"
              >
                <Icon name="rocket_launch" className="text-2xl" /> Probar gratis
              </Link>
              <a
                href="#como-funciona"
                className="inline-flex h-14 items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-6 font-headline text-lg font-bold text-stone-800 hover:bg-stone-50"
              >
                <Icon name="play_circle" className="text-2xl text-teal-700" /> Ver cómo funciona
              </a>
            </div>
            <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 font-body text-sm text-stone-700 sm:flex sm:flex-wrap sm:gap-x-6 sm:text-[15px]">
              {[
                ['verified', 'Sin tarjeta de crédito'],
                ['bolt', 'Conexión en 2 minutos'],
                ['forum', 'Español de Perú con tuteo'],
                ['lock', 'Conservas tu chip y tus chats'],
              ].map(([icono, texto]) => (
                <li key={texto} className="flex items-center gap-2">
                  <Icon name={icono as IconName} className="text-xl text-teal-700" /> {texto}
                </li>
              ))}
            </ul>
          </div>
          <ChatDeMuestra />
        </div>
      </section>

      <section className="border-y border-stone-200 bg-white">
        <p className="mx-auto max-w-6xl px-4 py-6 text-center font-label text-[13px] font-semibold uppercase tracking-[0.12em] text-stone-600 md:px-6">
          Ya atiende negocios en Lima y provincias
        </p>
      </section>

      <Seccion
        id="como-funciona"
        pill="Fácil y sin enredos técnicos"
        titulo="Cómo funciona Dali en 3 pasos"
        texto="No necesitas saber de programación. Si sabes mandar un mensaje por WhatsApp, puedes configurar a Dali."
      >
        <div className="grid gap-4 md:grid-cols-3">
          {PASOS.map((p, i) => (
            <article key={p.titulo} className="flex flex-col rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
              <span className={cn('flex size-14 items-center justify-center rounded-xl', p.tono === 'amber' ? 'bg-amber-50 text-amber-700' : 'bg-teal-50 text-teal-700')}>
                <Icon name={p.icono} className="text-3xl" />
              </span>
              <p className={cn('mt-5 font-label text-[12px] font-bold uppercase tracking-[0.12em]', p.tono === 'amber' ? 'text-amber-700' : 'text-teal-800')}>Paso 0{i + 1}</p>
              <h3 className="mt-1 font-headline text-2xl font-bold tracking-tight text-stone-900">{p.titulo}</h3>
              <p className="mt-3 flex-1 font-body text-[15px] leading-relaxed text-stone-600">{p.texto}</p>
              <p
                className={cn(
                  'mt-5 flex items-center gap-2 border-t border-stone-100 pt-4 font-body text-[15px] font-semibold',
                  p.tono === 'amber' ? 'text-amber-700' : 'text-teal-800'
                )}
              >
                <Icon name={p.pieIcono} className="text-xl" /> {p.pie}
              </p>
            </article>
          ))}
        </div>
      </Seccion>

      <Seccion
        id="rubros"
        pill="Vocabulario y lógica peruana"
        titulo="Un asistente preparado para cada rubro"
        texto="Dali no da respuestas genéricas de robot: conoce los términos y las preguntas clave de cada rubro, y se le enseña el tuyo con un Excel."
        fondo="bg-white"
      >
        <div className="grid gap-4 md:grid-cols-2">
          {RUBROS.map((r) => (
            <article key={r.nombre} className={cn('rounded-2xl border p-5 md:p-6', r.disponible ? 'border-teal-200 bg-teal-50/30' : 'border-stone-200 bg-stone-50')}>
              <div className="flex flex-wrap items-start gap-3">
                <span className={cn('flex size-14 shrink-0 items-center justify-center rounded-xl', r.disponible ? 'bg-teal-100 text-teal-800' : 'bg-stone-200 text-stone-600')}>
                  <Icon name={r.icono} className="text-3xl" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-headline text-xl font-bold tracking-tight text-stone-900">{r.nombre}</h3>
                  <span
                    className={cn(
                      'mt-1 inline-block rounded-full border px-2.5 py-0.5 font-body text-sm',
                      r.disponible ? 'border-teal-200 bg-white text-teal-800' : 'border-stone-200 bg-white text-stone-600'
                    )}
                  >
                    {r.disponible ? `${r.chip} · disponible` : 'Próximamente'}
                  </span>
                </div>
              </div>
              <p className="mt-4 font-body text-[15px] leading-relaxed text-stone-600">{r.texto}</p>
              <p className="mt-3 flex items-start gap-2 font-body text-[15px] italic text-stone-800">
                <Icon name="forum" className="mt-0.5 shrink-0 text-xl text-teal-700" /> {r.ejemplo}
              </p>
            </article>
          ))}
        </div>
      </Seccion>

      <Seccion
        id="garantias"
        pill="Transparencia total"
        titulo="Lo que Dali NO hace (por tu seguridad)"
        texto="A nadie le gusta una IA que promete imposibles o da precios equivocados. Dali trabaja con reglas claras, y las eliges tú desde el panel."
      >
        <div className="grid gap-4 md:grid-cols-3">
          {NO_HACE.map((n) => (
            <article key={n.titulo} className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
              <span className="flex size-12 items-center justify-center rounded-xl bg-red-50 text-red-700">
                <Icon name={n.icono} className="text-2xl" />
              </span>
              <h3 className="mt-4 font-headline text-xl font-bold tracking-tight text-stone-900">{n.titulo}</h3>
              <p className="mt-2 font-body text-[15px] leading-relaxed text-stone-600">{n.texto}</p>
            </article>
          ))}
        </div>
      </Seccion>

      <Seccion
        id="piloto"
        pill="Piloto sin costo"
        titulo="Empieza hoy, sin tarjeta"
        texto="Mientras dure el piloto, Dali no cobra nada. Los planes de pago, en soles y sin permanencia, llegan después y te los contamos antes."
        fondo="bg-white"
      >
        <div className="mx-auto max-w-2xl rounded-2xl border-2 border-teal-700 bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-headline text-2xl font-bold tracking-tight text-stone-900">Piloto</h3>
            <span className="rounded-full bg-teal-700 px-3 py-1 font-label text-[11px] font-bold uppercase tracking-wider text-white">Sin costo</span>
          </div>
          <p className="mt-1 font-body text-[15px] text-stone-500">Para negocios con una línea de WhatsApp principal</p>
          <ul className="mt-5 space-y-3">
            {[
              '1 número de WhatsApp conectado (el tuyo, sin cambiar de chip)',
              'Conversaciones sin límite mientras dure el piloto',
              'El pack de tu rubro listo: servicios, preguntas y plantilla de Excel',
              'Avisos de cada lead a tu WhatsApp personal',
              'Carga de conocimiento por Excel, las veces que quieras',
            ].map((t) => (
              <li key={t} className="flex items-start gap-2 font-body text-[15px] text-stone-700">
                <Icon name="check" className="mt-0.5 shrink-0 text-xl text-teal-700" /> {t}
              </li>
            ))}
          </ul>
          <Link
            to="/registro"
            className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 font-headline text-lg font-bold text-white shadow-md shadow-teal-700/20 hover:bg-teal-800"
          >
            <Icon name="chat" className="text-2xl" /> Empezar el piloto
          </Link>
          <p className="mt-3 text-center font-body text-sm text-stone-500">Sin tarjeta. Conectas tu WhatsApp en 2 minutos y lo pruebas con tus propios clientes.</p>
        </div>
      </Seccion>

      <footer className="border-t border-stone-200 bg-stone-50">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 md:flex-row md:items-center md:justify-between md:px-6">
          <div className="flex items-center gap-3">
            <BrandMark size="sm" />
            <span className="font-body text-sm text-stone-500">· un producto de Constroad Ingenieros</span>
          </div>
          <p className="font-body text-sm text-stone-500">© 2026 Dali.pe — Para negocios de Lima y todo el Perú.</p>
        </div>
      </footer>
    </div>
  );
}

function Seccion({ id, pill, titulo, texto, fondo, children }: { id: string; pill: string; titulo: string; texto: string; fondo?: string; children: ReactNode }) {
  return (
    <section id={id} className={cn('scroll-mt-24', fondo)}>
      <div className="mx-auto max-w-6xl px-4 py-14 md:px-6 md:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-block rounded-full border border-teal-200/80 bg-teal-50 px-3 py-1 font-label text-[12px] font-bold uppercase tracking-[0.1em] text-teal-800">
            {pill}
          </span>
          <h2 className="mt-4 font-headline text-3xl font-bold tracking-tight text-stone-900 md:text-5xl">{titulo}</h2>
          <p className="mt-4 font-body text-lg leading-relaxed text-stone-600">{texto}</p>
        </div>
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

/**
 * La conversación de muestra: el patrón de Dali en modo lead —saluda, pregunta
 * qué necesita, cuánto, dónde y para cuándo, y avisa— con un negocio
 * cualquiera, porque Dali no es de un rubro: el guion de cada rubro solo
 * cambia las preguntas.
 */
function ChatDeMuestra() {
  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-stone-200/70 shadow-xl">
      <div className="flex items-center gap-3 bg-teal-900 px-4 py-3 text-white">
        <span className="relative flex size-11 items-center justify-center rounded-full border-2 border-teal-500 bg-stone-900 font-headline text-sm font-bold">
          TN
          <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-teal-900 bg-emerald-400" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-headline text-base font-bold">
            Tu negocio <Icon name="verified" className="text-base text-emerald-300" />
          </p>
          <p className="font-body text-xs text-teal-100">en línea · Dali, asistente</p>
        </div>
        <Icon name="videocam" className="text-xl text-teal-100" />
        <Icon name="call" className="text-xl text-teal-100" />
        <Icon name="more_vert" className="text-xl text-teal-100" />
      </div>
      <div className="space-y-3 px-3 py-4">
        <p className="mx-auto w-fit rounded-lg bg-white/80 px-3 py-1 font-label text-[11px] font-semibold uppercase tracking-wider text-stone-500">Hoy · Lima, Perú</p>
        <Burbuja lado="cliente" hora="10:41">
          Hola, ¿tienen para el viernes? Necesito una cotización
        </Burbuja>
        <Burbuja lado="dali" hora="10:41" quien="Dali (asistente de Tu negocio)">
          ¡Hola! Soy Dali, la asistente de <b className="font-semibold">Tu negocio</b> 👋 Con gusto te ayudo. ¿Qué necesitas y en qué cantidad?
        </Burbuja>
        <Burbuja lado="cliente" hora="10:42">
          Unas 40 unidades, para mi local en Surco
        </Burbuja>
        <Burbuja lado="dali" hora="10:42" quien="Dali">
          Perfecto: 40 unidades para el viernes en Surco. ¿A nombre de quién va la cotización y a qué número te llamamos?
        </Burbuja>
        <div className="flex items-center gap-3 rounded-xl bg-stone-900 px-4 py-3 text-white">
          <Icon name="notifications_active" className="shrink-0 text-2xl text-amber-400" />
          <p className="min-w-0 flex-1 font-body text-sm">
            Aviso a tu WhatsApp personal: <b className="font-semibold">Lead calificado (40 unidades · Surco · viernes)</b>
          </p>
          <span className="shrink-0 rounded-lg bg-teal-700 px-2.5 py-1.5 text-center font-body text-xs font-semibold">Listo para cotizar</span>
        </div>
      </div>
      <div className="flex items-center gap-3 border-t border-stone-200 bg-white px-3 py-2.5">
        <Icon name="mood" className="text-2xl text-stone-400" />
        <Icon name="attach_file" className="text-2xl text-stone-400" />
        <span className="flex-1 rounded-full border border-stone-200 bg-stone-50 px-4 py-2 font-body text-sm text-stone-400">Escribe una respuesta…</span>
        <span className="flex size-10 items-center justify-center rounded-full bg-teal-700 text-white">
          <Icon name="mic" className="text-xl" />
        </span>
      </div>
    </div>
  );
}

function Burbuja({ lado, hora, quien, children }: { lado: 'cliente' | 'dali'; hora: string; quien?: string; children: ReactNode }) {
  return (
    <div className={cn('flex', lado === 'cliente' ? 'justify-end' : 'justify-start')}>
      <div className={cn('max-w-[85%] rounded-2xl px-3.5 py-2.5 shadow-sm', lado === 'cliente' ? 'rounded-br-md bg-emerald-100' : 'rounded-bl-md bg-white')}>
        {quien && (
          <p className="mb-0.5 flex items-center gap-1 font-body text-xs font-bold text-teal-800">
            <Icon name="smart_toy" className="text-sm" /> {quien}
          </p>
        )}
        <p className="font-body text-[15px] leading-snug text-stone-900">{children}</p>
        <p className="mt-1 flex items-center justify-end gap-1 font-body text-[11px] text-stone-500">
          {hora} a. m. {lado === 'cliente' && <Icon name="done_all" className="text-sm text-sky-500" />}
        </p>
      </div>
    </div>
  );
}
