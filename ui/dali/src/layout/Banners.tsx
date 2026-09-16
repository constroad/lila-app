import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '@/components/Icon';
import { api } from '@/lib/api';
import { telefonoLegible } from '@/lib/format';
import { useSesion } from '@/lib/session';
import type { Equipo, Inicio } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * LOS AVISOS GLOBALES (E1 §01): arriba de cualquier pantalla del panel,
 * mientras duren. Sin conexión (el navegador está offline: se dice, sin
 * prometer que lo que cambies se guarde después, porque no hay cola);
 * la línea desconectada («Dali no está atendiendo», con «Vincular ahora»,
 * salvo en WhatsApp, que ya lo muestra); el límite del plan (si hay límite
 * y el uso pasa del 90 %); y, en las pantallas de configuración, «esto lo
 * cambia el dueño» para quien no lo es (E1 §11).
 */
const RUTAS_DE_DUENO = ['/asistente', '/negocio', '/servicios', '/faq', '/catalogo', '/importar', '/whatsapp', '/equipo', '/notificaciones'];
const UMBRAL_PLAN = 0.9;

const useEnLinea = () => {
  const [enLinea, setEnLinea] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const arriba = () => setEnLinea(true);
    const abajo = () => setEnLinea(false);
    window.addEventListener('online', arriba);
    window.addEventListener('offline', abajo);
    return () => {
      window.removeEventListener('online', arriba);
      window.removeEventListener('offline', abajo);
    };
  }, []);
  return enLinea;
};

export function Banners({ inicio }: { inicio?: Inicio }) {
  const { yo } = useSesion();
  const { pathname } = useLocation();
  const enLinea = useEnLinea();
  const deDueno = RUTAS_DE_DUENO.some((r) => pathname.startsWith(r));
  const soyDueno = yo?.usuario.rol === 'owner';
  const { data: equipo } = useQuery({ queryKey: ['equipo'], queryFn: () => api.get<Equipo>('/equipo'), staleTime: 5 * 60_000, enabled: Boolean(yo) && deDueno && !soyDueno });
  const dueno = equipo?.miembros.find((m) => m.rol === 'owner')?.nombre;
  const lineaCaida = Boolean(inicio?.asistente.numero) && inicio?.asistente.conectado === false && !pathname.startsWith('/whatsapp');
  const plan = inicio?.plan;
  const cercaDelLimite = Boolean(plan && plan.limite > 0 && plan.usados / plan.limite >= UMBRAL_PLAN);
  if (enLinea && !lineaCaida && !cercaDelLimite && !(deDueno && !soyDueno)) return null;
  return (
    <div className="mx-auto w-full max-w-[390px] space-y-2 px-4 pt-3 md:max-w-none md:px-6 xl:px-10">
      {!enLinea && (
        <Aviso
          tono="oscuro"
          icono="wifi_off"
          titulo="Sin conexión · lo que ves puede estar desactualizado"
          detalle="Dali sigue atendiendo desde el servidor; cuando vuelva el internet, esto se actualiza solo."
        />
      )}
      {lineaCaida && (
        <Aviso
          tono="rojo"
          icono="error"
          titulo="Tu WhatsApp está desconectado. Dali no está atendiendo."
          detalle={`Los clientes que escriban al ${telefonoLegible(inicio!.asistente.numero)} no reciben respuesta hasta que vuelvas a vincular.`}
          accion={
            <Link
              to="/whatsapp"
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-red-700 px-4 font-body text-[15px] font-semibold text-white hover:bg-red-800"
            >
              <Icon name="qr_code" className="text-xl" /> Vincular ahora
            </Link>
          }
        />
      )}
      {cercaDelLimite && plan && (
        <Aviso
          tono="ambar"
          icono="notifications_active"
          titulo={`Usaste ${plan.usados} de ${plan.limite} conversaciones este mes.`}
          detalle={`Te quedan ${Math.max(0, plan.limite - plan.usados)} antes de que Dali deje de responder.`}
          accion={
            <Link
              to="/plan"
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-amber-600 px-4 font-body text-[15px] font-semibold text-white hover:bg-amber-700"
            >
              Ver plan
            </Link>
          }
        />
      )}
      {deDueno && !soyDueno && (
        <Aviso
          tono="ambar"
          icono="lock"
          titulo="Esto lo cambia el dueño"
          detalle={`Puedes mirar; para editar, pídele a ${dueno ?? 'quien administra la cuenta'} el rol de Dueño. Tu rol: ${yo?.usuario.rol === 'sales' ? 'Ventas' : 'Solo lectura'}.`}
        />
      )}
    </div>
  );
}

function Aviso({
  tono,
  icono,
  titulo,
  detalle,
  accion,
}: {
  tono: 'oscuro' | 'rojo' | 'ambar';
  icono: 'wifi_off' | 'error' | 'notifications_active' | 'lock';
  titulo: string;
  detalle: string;
  accion?: React.ReactNode;
}) {
  return (
    <div
      role="status"
      className={cn(
        'flex flex-col gap-3 rounded-2xl border px-4 py-3 md:flex-row md:items-center',
        tono === 'oscuro' && 'border-stone-800 bg-stone-900 text-white',
        tono === 'rojo' && 'border-red-200 bg-red-50 text-red-900',
        tono === 'ambar' && 'border-amber-200 bg-amber-50 text-amber-900'
      )}
    >
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-full',
          tono === 'oscuro' ? 'bg-stone-800 text-white' : tono === 'rojo' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'
        )}
      >
        <Icon name={icono} className="text-2xl" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-headline text-[15px] font-bold">{titulo}</p>
        <p className={cn('font-body text-sm', tono === 'oscuro' ? 'text-stone-300' : tono === 'rojo' ? 'text-red-800' : 'text-amber-800')}>{detalle}</p>
      </div>
      {accion}
    </div>
  );
}
