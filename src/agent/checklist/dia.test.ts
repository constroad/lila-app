import { agruparPorDia, firmaDia, momentoVigente, momentosDelDia, type PedidoDelDia } from './dia';
import { instanteArranque } from './tiempo';

/**
 * EL DÍA DE PLANTA. José, 13/09/2026: «a las 9 Globofast programa una producción
 * para mañana; en la tarde Constroad programa otro despacho también para
 * mañana. ¿Cómo vas a hacer para informarle a la planta?».
 */
const pedido = (over: Partial<PedidoDelDia>): PedidoDelDia => ({
  id: 'p',
  companyId: 'globofas-s8k',
  empresa: 'Globofast',
  cliente: '',
  cubos: 91,
  hora: '04:00',
  arranqueMs: instanteArranque('2026-09-13', '04:00')!,
  creadoMs: instanteArranque('2026-09-12', '09:00')!,
  ...over,
});

describe('agrupar por día', () => {
  it('dos empresas el mismo día son UN día, con el total y el primer arranque', () => {
    const globofast = pedido({ id: 'g' });
    const constroad = pedido({
      id: 'c',
      companyId: 'constroad',
      empresa: 'Constroad',
      cubos: 45,
      hora: '07:00',
      arranqueMs: instanteArranque('2026-09-13', '07:00')!,
      creadoMs: instanteArranque('2026-09-12', '15:00')!,
    });

    const [dia] = agruparPorDia([constroad, globofast]);

    expect(dia.fecha).toBe('2026-09-13');
    expect(dia.pedidos.map((p) => p.empresa)).toEqual(['Globofast', 'Constroad']);
    expect(dia.totalCubos).toBe(136);
    expect(dia.arranqueMs).toBe(globofast.arranqueMs);
    // El día existe desde el primer pedido: lo que se dijo desde las 09:00 cuenta.
    expect(dia.creadoMs).toBe(globofast.creadoMs);
  });

  it('la firma cambia si se suma, se cae o se mueve un pedido', () => {
    const [solo] = agruparPorDia([pedido({ id: 'g' })]);
    const [conOtro] = agruparPorDia([pedido({ id: 'g' }), pedido({ id: 'c', hora: '07:00', arranqueMs: instanteArranque('2026-09-13', '07:00')! })]);
    const [movido] = agruparPorDia([pedido({ id: 'g', hora: '05:00', arranqueMs: instanteArranque('2026-09-13', '05:00')! })]);

    expect(firmaDia(solo)).not.toBe(firmaDia(conOtro));
    expect(firmaDia(solo)).not.toBe(firmaDia(movido));
    // Y no cambia si solo pasa el tiempo.
    expect(firmaDia(solo)).toBe(firmaDia(agruparPorDia([pedido({ id: 'g' })])[0]));
  });
});

describe('los horarios', () => {
  const [dia] = agruparPorDia([pedido({ id: 'g' })]);
  const lima = (fecha: string, hora: string) => instanteArranque(fecha, hora)!;

  // José, 14/09: uno en la mañana y otro en la tarde; la última llamada de
  // las 02:00 no la lee nadie y la reunión de las 04:00 ya está coordinada.
  it('para las 04:00 del domingo: sábado 10:00 y sábado 17:00; la última llamada de las 02:00 no existe', () => {
    expect(momentosDelDia(dia).map((m) => [m.momento, new Date(m.ms).toISOString()])).toEqual([
      ['inicial', new Date(lima('2026-09-12', '10:00')).toISOString()],
      ['recordatorio', new Date(lima('2026-09-12', '17:00')).toISOString()],
    ]);
  });

  it('para las 10:00 del domingo sí hay última llamada a las 08:00', () => {
    const [manana] = agruparPorDia([pedido({ id: 'm', hora: '10:00', arranqueMs: lima('2026-09-13', '10:00') })]);
    expect(momentosDelDia(manana).map((m) => m.momento)).toEqual(['inicial', 'recordatorio', 'ultima-llamada']);
    expect(momentoVigente(manana, lima('2026-09-13', '08:30'))).toBe('ultima-llamada');
  });

  it('antes de las 10:00 no toca nada: silencio', () => {
    expect(momentoVigente(dia, lima('2026-09-12', '09:00'))).toBeNull();
  });

  it('a cada hora le corresponde el último horario que pasó', () => {
    expect(momentoVigente(dia, lima('2026-09-12', '10:20'))).toBe('inicial');
    expect(momentoVigente(dia, lima('2026-09-12', '16:59'))).toBe('inicial');
    expect(momentoVigente(dia, lima('2026-09-12', '17:00'))).toBe('recordatorio');
    // El caso del 07/09: pedido a medianoche para las 04:00 → el recordatorio de la tarde, en el acto.
    expect(momentoVigente(dia, lima('2026-09-13', '00:40'))).toBe('recordatorio');
    expect(momentoVigente(dia, lima('2026-09-13', '02:30'))).toBe('recordatorio');
  });

  it('después del arranque no se pregunta nada', () => {
    expect(momentoVigente(dia, lima('2026-09-13', '04:00'))).toBeNull();
    expect(momentoVigente(dia, lima('2026-09-13', '05:00'))).toBeNull();
  });

  it('una producción a las 08:00 tiene los tres horarios: 10:00 y 17:00 del sábado y 06:00 del domingo', () => {
    const [temprano] = agruparPorDia([pedido({ id: 'x', hora: '08:00', arranqueMs: lima('2026-09-13', '08:00') })]);
    expect(momentosDelDia(temprano)).toHaveLength(3);
  });
});
