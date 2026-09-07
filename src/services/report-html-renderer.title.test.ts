import { describe, expect, it } from '@jest/globals';
import { resolverTituloCtlImp } from './report-html-renderer.service';

/**
 * EL CASO DE GLOBOFAST (04/09/2026): el título del PDF de un control CTL-IMP
 * usaba `control.material?.ligante || 'MC-30'` — con el ligante vacío (un
 * tramo recién creado, antes de elegir líquido) el `||` trataba `''` como
 * "ausente" y adivinaba MC-30, aunque el resto del informe fuera Emulsión.
 * Réplica local del clasificador de Portal (imprimacionLiquidos.ts
 * `resolverTipoLiquido`) — mismo contrato, dos copias porque los repos no
 * comparten workspace.
 */
describe('resolverTituloCtlImp (contrato espejo de Portal — imprimacionLiquidos.ts)', () => {
  it('MC-30 → "Imprimación de base granular"', () => {
    expect(resolverTituloCtlImp('MC-30')).toBe('IMPRIMACIÓN DE BASE GRANULAR');
  });

  it('Emulsión → "Riego de liga"', () => {
    expect(resolverTituloCtlImp('Emulsión')).toBe('RIEGO DE LIGA');
  });

  it('tolerante a mayúsculas/tildes/espaciado, igual que el catálogo de Portal', () => {
    expect(resolverTituloCtlImp('emulsion')).toBe('RIEGO DE LIGA');
    expect(resolverTituloCtlImp('  MC 30  ')).toBe('IMPRIMACIÓN DE BASE GRANULAR');
    expect(resolverTituloCtlImp('riego de liga')).toBe('RIEGO DE LIGA');
  });

  it('sin ligante (tramo recién creado), NO adivina ninguno de los dos títulos fijos', () => {
    expect(resolverTituloCtlImp('')).toBe('RIEGO DE IMPRIMACIÓN');
    expect(resolverTituloCtlImp(undefined)).toBe('RIEGO DE IMPRIMACIÓN');
    expect(resolverTituloCtlImp(null)).toBe('RIEGO DE IMPRIMACIÓN');
  });

  it('un ligante legacy fuera del catálogo tampoco se adivina', () => {
    // Informes viejos con un nombre comercial escrito a mano ('RC-250'): no es
    // MC-30 ni Emulsión — inventar uno de los dos sería peor que el genérico.
    expect(resolverTituloCtlImp('RC-250')).toBe('RIEGO DE IMPRIMACIÓN');
  });
});
