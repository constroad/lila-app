import { createContext, useContext, useEffect, useState, type DependencyList, type ReactNode } from 'react';

/**
 * LA BARRA DE ARRIBA (tablet y escritorio) la dibuja el cascarón; lo que va a
 * la derecha lo pone cada pantalla: «Probar a Dali» y «Guardar cambios» en
 * las de configuración (A6–A14), la línea y la persona en las demás.
 */
interface Barra {
  acciones: ReactNode | null;
  setAcciones: (acciones: ReactNode | null) => void;
}

const BarraContext = createContext<Barra>({ acciones: null, setAcciones: () => undefined });

export function BarraProvider({ children }: { children: ReactNode }) {
  const [acciones, setAcciones] = useState<ReactNode | null>(null);
  return <BarraContext.Provider value={{ acciones, setAcciones }}>{children}</BarraContext.Provider>;
}

export const useBarra = (): Barra => useContext(BarraContext);

/** La pantalla deja sus acciones en la barra mientras está montada; `deps` dice cuándo cambian. */
export function useAccionesDeBarra(acciones: ReactNode, deps: DependencyList): void {
  const { setAcciones } = useBarra();
  useEffect(() => {
    setAcciones(acciones);
    return () => setAcciones(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
