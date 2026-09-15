import { cubicacionDeDoc } from './cubicacion';

describe('cubicacionDeDoc', () => {
  it('toma m³, forma y quién cubicó; sin m³ válido queda null (no inventa 0)', () => {
    expect(cubicacionDeDoc({ plate: 'A1Y-825', m3: 25.4, shape: 'Concavo', cubicator: 'JUAN PEREZ' })).toEqual({ plate: 'A1Y-825', m3: 25.4, shape: 'Concavo', cubicator: 'JUAN PEREZ' });
    expect(cubicacionDeDoc({ plate: 'A1Y-825', m3: 0 })).toEqual({ plate: 'A1Y-825', m3: null, shape: undefined, cubicator: undefined });
    expect(cubicacionDeDoc(null)).toBeNull();
  });
});

describe('empresaDeLaUnidad', () => {
  it('la empresa sale del pedido de la unidad (unidadPor devuelve una COPIA con `pedido`, no el objeto de la vista)', async () => {
    // 15/09 18:36: «no tiene cubicación» con la ficha cargada — `units.includes(u)`
    // nunca era true y la búsqueda salía con companyId vacío sin tocar la base.
    const { empresaDeLaUnidad } = await import('./cubicacion');
    const u = { dispatchId: 'd', unitNumber: 9, plate: 'A1Y825', driverName: '', state: 'despachado' as const, quantity: 25, picturesCount: 0, pedido: { orderId: 'o1', companyId: 'globofas-s8k', companySlug: 'globofast', cliente: '', obra: '', cantidadCubos: 0, m3Dispatched: 0, hora: '', units: [] } };
    expect(empresaDeLaUnidad(u)).toBe('globofas-s8k');
  });
});
