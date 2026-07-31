import { describe, expect, it } from '@jest/globals';
import { hasClientFacingM3, resolveClientFacingM3 } from './client-facing-m3';

// CONTRATO COMPARTIDO con Portal (`src/common/utils/dispatchClientFacingM3.ts`).
// lila lee el mismo documento `dispatch` del Mongo compartido, así que la regla
// tiene que ser idéntica: si divergen, el vale automático y el manual imprimen
// números distintos para el MISMO despacho.
describe('resolveClientFacingM3 (contrato espejo de Portal)', () => {
  it('usa el override de presentación cuando existe', () => {
    expect(resolveClientFacingM3({ placeholders: { m3Dispatched: 14 }, quantity: 15 })).toBe(14);
  });

  it('trata 0 como SIN override (el vale imprimía "0 m3")', () => {
    expect(hasClientFacingM3(0)).toBe(false);
    expect(resolveClientFacingM3({ placeholders: { m3Dispatched: 0 }, quantity: 15 })).toBe(15);
  });

  it('descarta negativos y no finitos', () => {
    expect(resolveClientFacingM3({ placeholders: { m3Dispatched: -3 }, quantity: 15 })).toBe(15);
    expect(resolveClientFacingM3({ placeholders: { m3Dispatched: Number.NaN }, quantity: 15 })).toBe(15);
  });

  it('cae al m3 real y luego al planificado', () => {
    expect(resolveClientFacingM3({ quantity: 15 })).toBe(15);
    expect(resolveClientFacingM3({ planedQuantity: 20 })).toBe(20);
    expect(resolveClientFacingM3({})).toBe(0);
  });
});
