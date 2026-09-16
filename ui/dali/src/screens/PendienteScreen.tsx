import { BotonConsola } from '@/components/BotonConsola';
import { Icon } from '@/components/Icon';
import { NAV_MAS, NAV_SECTIONS } from '@/layout/nav';
import { Link } from 'react-router-dom';

/**
 * Las pantallas que todavía no llegaron (F3 se construye por fases): en vez
 * de un hueco, un estado que dice qué es y a dónde ir. «Más» del móvil lista
 * lo que no cabe en la barra.
 */
export function PendienteScreen({ titulo }: { titulo: string }) {
  if (titulo === 'mas') return <MasScreen />;
  const nombre = [...NAV_SECTIONS.flatMap((s) => s.items), ...NAV_MAS].find((i) => i.to === `/${titulo}`)?.label ?? titulo;
  return (
    <div className="px-4 pt-6 md:px-6 xl:px-10">
      <h1 className="font-headline text-2xl font-bold tracking-tight text-stone-900 md:text-3xl">{nombre}</h1>
      <div className="mt-6 flex flex-col items-center gap-3 rounded-xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center">
        <Icon name="construction" className="text-4xl text-stone-300" />
        <p className="font-headline text-lg font-semibold text-stone-800">Esta pantalla se está construyendo</p>
        <p className="max-w-sm font-body text-sm text-stone-500">Llega en la siguiente fase del panel. Lo que ya funciona: Inicio, Conversaciones y Leads.</p>
        <Link to="/inicio" className="mt-2 inline-flex h-11 items-center rounded-full bg-teal-700 px-5 font-headline text-sm font-semibold text-white hover:bg-teal-800">
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}

function MasScreen() {
  const items = [...NAV_SECTIONS[1].items.filter((i) => i.to !== '/asistente'), ...NAV_MAS, ...NAV_SECTIONS[2].items];
  return (
    <div className="px-4 pt-6">
      <h1 className="font-headline text-2xl font-bold tracking-tight text-stone-900">Más</h1>
      <ul className="mt-4 divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        {items.map((i) => (
          <li key={i.to}>
            <Link to={i.to} className="flex min-h-14 items-center gap-3 px-4 font-body text-[15px] text-stone-800 hover:bg-stone-50">
              <Icon name={i.icon} className="text-2xl text-teal-700" />
              <span className="flex-1">{i.label}</span>
              <Icon name="chevron_right" className="text-xl text-stone-400" />
            </Link>
          </li>
        ))}
        <BotonConsola variante="lista" />
      </ul>
    </div>
  );
}
