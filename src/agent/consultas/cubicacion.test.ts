import { cubicacionDeDoc } from './cubicacion';

describe('cubicacionDeDoc', () => {
  it('toma m³, forma y quién cubicó; sin m³ válido queda null (no inventa 0)', () => {
    expect(cubicacionDeDoc({ plate: 'A1Y-825', m3: 25.4, shape: 'Concavo', cubicator: 'JUAN PEREZ' })).toEqual({ plate: 'A1Y-825', m3: 25.4, shape: 'Concavo', cubicator: 'JUAN PEREZ' });
    expect(cubicacionDeDoc({ plate: 'A1Y-825', m3: 0 })).toEqual({ plate: 'A1Y-825', m3: null, shape: undefined, cubicator: undefined });
    expect(cubicacionDeDoc(null)).toBeNull();
  });
});
