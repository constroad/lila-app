import { conStockDePortal, lineasDeStock, necesidadesDeAgregados, necesidadesDeLiquidos, veredictoPorItem, type AnalisisStock } from './stock';
import { CHECKLIST_PLANTA } from './checklist';
import { construirAvisoChecklist } from './aviso';
import type { Tanque } from '../consultas/planta';

/**
 * ¿ALCANZA EL STOCK? (José, 15/09). Con los datos reales de ese día: el
 * pedido del 16/09 (Globofast, 200 m³, diseño Mac 2: confitillo 20 %, grava
 * 6/7 25 %, arena primaria 35 %, arena secundaria 20 %), el kardex del 12/09 y
 * dos producciones ya hechas que Portal no había descontado.
 */
const disenos = new Map([
  ['mac2', { id: 'mac2', nombre: 'Mac 2', valores: [{ materialId: 'conf', porcentaje: 20 }, { materialId: 'g67', porcentaje: 25 }, { materialId: 'ap', porcentaje: 35 }, { materialId: 'as', porcentaje: 20 }] }],
]);
const ayer = Date.parse('2026-09-12T17:00:00.000Z');
const materiales = [
  { id: 'conf', nombre: 'CONFITILLO', cantidad: 428.73, reorden: 200, actualizadoMs: ayer },
  { id: 'g67', nombre: 'GRAVA 6/7', cantidad: 207.87, reorden: 300, actualizadoMs: ayer },
  { id: 'ap', nombre: 'ARENA PRIMARIA ', cantidad: 291.65, reorden: 400, actualizadoMs: ayer },
  { id: 'as', nombre: 'ARENA SECUNDARIA', cantidad: 632.63, reorden: 200, actualizadoMs: ayer },
];
const tanque = (nombre: string, contenido: Tanque['contenido'], galones: number, glPorM3: number, medidoMs = Date.parse('2026-09-15T12:00:00.000Z')): Tanque => ({
  nombre, contenido, galones, m3Producibles: glPorM3 ? galones / glPorM3 : 0, nivelCm: 0, capacidad: 0, stock: galones, reorden: 0, medidoMs,
});
const tanques = [tanque('INFRA PEN 1', 'pen', 2300, 25), tanque('INFRA PEN 2', 'pen', 336, 25), tanque('INFRA PEN 3', 'pen', 256, 25), tanque('INFRA GASOHOL', 'gasohol', 434.4, 2.5), tanque('INFRA HIGHWAY', 'petroleo', 250.8, 1), tanque('CUMMINS PROD.', 'petroleo', 114.5, 1)];

describe('agregados según el diseño de mezcla', () => {
  it('necesidad = m³ × porcentaje; disponible = kardex − lo producido sin descontar', () => {
    const { agregados, sinDiseno } = necesidadesDeAgregados([{ m3: 200, disenoId: 'mac2', companyId: 'g' }], [{ m3: 275, disenoId: 'mac2', companyId: 'g' }], disenos, materiales);
    expect(sinDiseno).toBe(0);
    expect(agregados).toEqual([
      { material: 'confitillo', necesario: 40, disponible: 373.7, enKardex: 428.7, porDescontar: 55, reorden: 200, ok: true },
      { material: 'grava 6/7', necesario: 50, disponible: 139.1, enKardex: 207.9, porDescontar: 68.8, reorden: 300, ok: true },
      { material: 'arena primaria', necesario: 70, disponible: 195.4, enKardex: 291.7, porDescontar: 96.3, reorden: 400, ok: true },
      { material: 'arena secundaria', necesario: 40, disponible: 577.6, enKardex: 632.6, porDescontar: 55, reorden: 200, ok: true },
    ]);
  });

  it('cuando no alcanza lo dice por material, y un pedido sin diseño se cuenta aparte', () => {
    const { agregados, sinDiseno } = necesidadesDeAgregados([{ m3: 1000, disenoId: 'mac2', companyId: 'g' }, { m3: 50, disenoId: '', companyId: 'g' }], [], disenos, materiales);
    expect(sinDiseno).toBe(1);
    expect(agregados.find((g) => g.material === 'grava 6/7')).toMatchObject({ necesario: 250, disponible: 207.9, ok: false });
    expect(agregados.find((g) => g.material === 'arena secundaria')).toMatchObject({ necesario: 200, ok: true });
  });
});

describe('líquidos según los tanques', () => {
  it('PEN y gasohol suman sus tanques; el petróleo de planta es HIGHWAY; ok si los m³ producibles cubren el día', () => {
    const l = necesidadesDeLiquidos(200, tanques);
    expect(l).toEqual([
      { nombre: 'PEN', m3Producibles: 115.7, necesarioM3: 200, galones: 2892, glPorM3: 25, ok: false },
      { nombre: 'gasohol', m3Producibles: 173.8, necesarioM3: 200, galones: 434.4, glPorM3: 2.5, ok: false },
      { nombre: 'petróleo', m3Producibles: 250.8, necesarioM3: 200, galones: 250.8, glPorM3: 1, ok: true },
    ]);
  });
});

const analisis = (): AnalisisStock => ({
  fecha: '2026-09-16',
  m3: 200,
  ...necesidadesDeAgregados([{ m3: 200, disenoId: 'mac2', companyId: 'g' }], [{ m3: 275, disenoId: 'mac2', companyId: 'g' }], disenos, materiales),
  kardexMs: ayer,
  liquidos: necesidadesDeLiquidos(200, tanques),
  tanquesMs: Date.parse('2026-09-15T12:00:00.000Z'),
});

describe('el checklist con lo que Portal sabe', () => {
  const ahora = Date.parse('2026-09-15T15:00:00.000Z');

  it('las líneas dicen de cuándo es el dato, qué alcanza y cuánto falta', () => {
    expect(lineasDeStock(analisis())).toEqual([
      'Según Portal (kardex al 12/09 · tanques al 15/09):',
      '• Agregados ✅ — confitillo 374/40 · grava 6/7 139/50 · arena primaria 195/70 · arena secundaria 578/40 (m³ disponibles/necesarios)',
      '• PEN ⚠️ 116 m³ producibles de 200 (2,892 gl, faltan ~2,108 gl)',
      '• gasohol ⚠️ 174 m³ producibles de 200 (434 gl, faltan ~66 gl)',
      '• petróleo ✅ 251 m³ producibles de 200 (251 gl)',
    ]);
  });

  it('cubre lo que alcanza con dato reciente, marca lo que falta, y no toca lo que la gente confirmó', () => {
    const items = CHECKLIST_PLANTA;
    const revision = { pendientes: items.filter((i) => i.id !== 'clima'), resueltos: items.filter((i) => i.id === 'clima') };
    const r = conStockDePortal(revision, analisis(), ahora);
    expect(r.stock?.cubiertos.map((i) => i.id)).toEqual(['agregados', 'petroleo-planta']);
    expect(r.stock?.faltantes.map((i) => i.id)).toEqual(['pen', 'gasohol']);
    expect(r.pendientes.map((i) => i.id)).toEqual(['pen', 'gasohol', 'operadores', 'riesgos']);
    expect(r.resueltos.map((i) => i.id)).toEqual(['clima', 'agregados', 'petroleo-planta']);
  });

  it('un dato viejo no cubre nada por sí solo, pero que FALTE se dice igual', () => {
    const viejo = { ...analisis(), kardexMs: ahora - 10 * 24 * 3_600_000, tanquesMs: ahora - 5 * 24 * 3_600_000 };
    expect(veredictoPorItem(viejo, ahora)).toEqual({ pen: false, gasohol: false });
  });

  it('sin análisis, la revisión queda como estaba', () => {
    const revision = { pendientes: CHECKLIST_PLANTA, resueltos: [] };
    expect(conStockDePortal(revision, null, ahora)).toBe(revision);
  });

  it('el mensaje de planta lleva las cifras, el ⚠️ en lo que falta y «(Portal)» en lo cubierto', () => {
    const r = conStockDePortal({ pendientes: CHECKLIST_PLANTA, resueltos: [] }, analisis(), ahora);
    const texto = construirAvisoChecklist(r, { fecha: '2026-09-16', minutosParaArranque: 1090, pedidos: [{ empresa: 'Globofast', hora: '04:30', cubos: 200 }], totalCubos: 200, momento: 'inicial', grupoEscuchado: 'INFRAMAQ admin' }, 'planta');
    expect(texto).toContain('Según Portal (kardex al 12/09 · tanques al 15/09):');
    expect(texto).toContain('• PEN ⚠️ 116 m³ producibles de 200');
    expect(texto).toContain('Por confirmar: PEN ⚠️ · gasohol ⚠️ · aviso a operadores · mantenimiento o riesgos · clima');
    expect(texto).toContain('✔ agregados (Portal), petróleo de planta (Portal)');
  });
});
