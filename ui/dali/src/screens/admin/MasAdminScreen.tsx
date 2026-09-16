import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Icon } from '@/components/Icon';
import { iniciales } from '@/lib/format';
import { irAMiEmpresa } from '@/lib/operador';
import { useSesion } from '@/lib/session';

/**
 * «Más» de la consola en móvil (la cuarta pestaña de S1–S4): quién está
 * operando, volver a mi empresa (la sesión vuelve a ser la del dueño) y
 * salir. En tablet y escritorio esto vive en el rail y el sidebar.
 */
export function MasAdminScreen() {
  const { yo, salir } = useSesion();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const volver = async () => {
    try {
      await irAMiEmpresa(queryClient);
      navigate('/inicio');
    } catch {
      toast.error('No se pudo volver a tu empresa');
    }
  };
  return (
    <div className="px-4 pt-6">
      <h1 className="font-headline text-2xl font-bold tracking-tight text-stone-900">Más</h1>
      <div className="mt-4 flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="flex size-12 items-center justify-center rounded-full bg-teal-800 font-headline text-sm font-bold text-white">{iniciales(yo?.usuario.nombre ?? '?')}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-headline text-base font-bold text-stone-900">{yo?.usuario.nombre}</p>
          <p className="truncate font-body text-sm text-stone-500">Operador de Dali · Lima GMT-5</p>
        </div>
      </div>
      <ul className="mt-4 divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        <li>
          <button
            type="button"
            onClick={() => void volver()}
            className="flex min-h-14 w-full items-center gap-3 px-4 text-left font-body text-[15px] text-stone-800 hover:bg-stone-50"
          >
            <Icon name="swap_horiz" className="text-2xl text-teal-700" />
            <span className="flex-1">Volver a mi empresa</span>
            <Icon name="chevron_right" className="text-xl text-stone-400" />
          </button>
        </li>
        <li>
          <button
            type="button"
            onClick={() => void salir()}
            className="flex min-h-14 w-full items-center gap-3 px-4 text-left font-body text-[15px] text-stone-800 hover:bg-stone-50"
          >
            <Icon name="logout" className="text-2xl text-stone-500" />
            <span className="flex-1">Salir</span>
          </button>
        </li>
      </ul>
    </div>
  );
}
