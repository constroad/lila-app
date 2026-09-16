import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { irAConsola } from '@/lib/operador';
import { useSesion } from '@/lib/session';
import { cn } from '@/lib/utils';
import { Icon } from './Icon';

/**
 * «Consola de Dali»: solo lo ve quien además es operador (`yo.esOperador`),
 * en el sidebar, el rail y «Más» del panel de su empresa. Cambia la sesión a
 * la de operador y lleva a S1.
 */
export function BotonConsola({ variante }: { variante: 'sidebar' | 'rail' | 'lista' }) {
  const { yo } = useSesion();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  if (!yo?.esOperador || yo.usuario.rol === 'operator') return null;
  const ir = async () => {
    try {
      await irAConsola(queryClient);
      navigate('/admin/empresas');
    } catch {
      toast.error('No se pudo abrir la consola');
    }
  };
  if (variante === 'rail') {
    return (
      <button
        type="button"
        onClick={() => void ir()}
        aria-label="Consola de Dali"
        title="Consola de Dali"
        className="mb-4 flex size-11 items-center justify-center rounded-full text-stone-500 hover:bg-stone-200/60 hover:text-stone-800"
      >
        <Icon name="manage_accounts" className="text-2xl" />
      </button>
    );
  }
  const boton = (
    <button
      type="button"
      onClick={() => void ir()}
      className={cn(
        'flex w-full items-center gap-3 text-left font-body text-[15px] text-stone-800',
        variante === 'sidebar' ? 'mx-3 mb-1 w-[calc(100%-1.5rem)] rounded-lg px-3 py-2.5 hover:bg-stone-100' : 'min-h-14 px-4 hover:bg-stone-50'
      )}
    >
      <Icon name="manage_accounts" className={cn('text-2xl text-teal-700', variante === 'sidebar' && 'text-[22px] text-stone-500')} />
      <span className="flex-1">Consola de Dali</span>
      {variante === 'lista' && <Icon name="chevron_right" className="text-xl text-stone-400" />}
    </button>
  );
  return variante === 'lista' ? <li>{boton}</li> : boton;
}
