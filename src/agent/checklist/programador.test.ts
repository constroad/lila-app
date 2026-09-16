import { aplicar, type AvisoProgramado, type Produccion } from './agenda';
import { textoConfirmacion, textoParaPlanta } from './programador';

const lima = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00.000-05:00`).getTime();
const globo = (extra: Partial<Produccion> = {}): Produccion => ({ companyId: 'globofas-s8k', empresa: 'Globofast Solkali', cliente: 'CONSORCIO LOMAS', hora: '04:30', cubos: 137, fuente: 'chat', ts: 1, ...extra });
const sinPedido = (a: AvisoProgramado) => a.producciones.filter((p) => !p.pedidoId);

describe('la confirmación en INFRAMAQ admin', () => {
  it('programado: cuándo sale, la línea de la producción, crear el pedido, y la válvula del 3', () => {
    const lunes = lima('2026-09-14', '09:00');
    const { efectos } = aplicar([], { accion: 'programar', fecha: '2026-09-17', produccion: globo() }, lunes);
    const t = textoConfirmacion(efectos, 'Inframaq Planta', lunes, sinPedido)!;
    expect(t).toContain('✅ Programé el aviso a «Inframaq Planta» para el miércoles 16/09 a las 17:00:');
    expect(t).toContain('• jueves 17/09 · 04:30 Globofast Solkali (CONSORCIO LOMAS) · 137 m³ · reunión 04:00');
    expect(t).toContain('No olviden crear el pedido en Portal: Globofast Solkali (jueves 17/09).');
    expect(t).toContain('(Responde 3 a este mensaje si no va.)');
  });
  it('último momento: «sale ahora»; con pedido en Portal no pide crearlo; sin cambios no dice nada', () => {
    const miercolesTarde = lima('2026-09-16', '19:00');
    const { efectos, agenda } = aplicar([], { accion: 'programar', fecha: '2026-09-17', produccion: globo({ fuente: 'portal', pedidoId: 'o1' }) }, miercolesTarde);
    const t = textoConfirmacion(efectos, 'Inframaq Planta', miercolesTarde, sinPedido)!;
    expect(t).toContain('sale ahora (último momento)');
    expect(t).toContain('El pedido ya está en Portal ✓.');
    const repetido = aplicar(agenda, { accion: 'programar', fecha: '2026-09-17', produccion: globo({ fuente: 'portal', pedidoId: 'o1' }) }, miercolesTarde);
    expect(textoConfirmacion(repetido.efectos, 'Inframaq Planta', miercolesTarde, sinPedido)).toBeNull();
  });
  it('posible movimiento: lo dice y pide «se movió»', () => {
    const martes = lima('2026-09-15', '10:00');
    const r1 = aplicar([], { accion: 'programar', fecha: '2026-09-17', produccion: globo() }, martes);
    const r2 = aplicar(r1.agenda, { accion: 'programar', fecha: '2026-09-18', produccion: globo({ ts: 2 }) }, martes);
    const t = textoConfirmacion(r2.efectos, 'Inframaq Planta', martes, sinPedido)!;
    expect(t).toContain('⚠️ Ojo: Globofast Solkali también está programado el jueves 17/09 (137 m³). Si se movió, responde a este mensaje con *se movió*');
  });
});

describe('el texto a planta', () => {
  it('programado: el aviso de siempre; último momento lleva su marca; enviado y cambiado: actualización con el cambio', () => {
    const base: AvisoProgramado = { id: 'a', fecha: '2026-09-17', envioMs: lima('2026-09-16', '17:00'), producciones: [globo()], estado: 'programada', creadoMs: 0, actualizadoMs: 0 };
    expect(textoParaPlanta(base)).toContain('📢 *Producción programada — jueves 17/09*');
    expect(textoParaPlanta(base)).toContain('• 04:30 — *Globofast Solkali* (CONSORCIO LOMAS) · 137 m³ · reunión 04:00');
    expect(textoParaPlanta({ ...base, envioMs: lima('2026-09-16', '19:00') })).toContain('⚠️ *Aviso de último momento*');
    const enviadoComo = JSON.stringify([{ empresa: 'Globofast Solkali', hora: '04:30', cubos: 137, cliente: 'CONSORCIO LOMAS', id: 'Globofast Solkali|CONSORCIO LOMAS' }]);
    const cambiado: AvisoProgramado = { ...base, estado: 'enviada', enviadoComo, producciones: [globo({ cubos: 160 })] };
    const t = textoParaPlanta(cambiado);
    expect(t).toContain('🔁 *Producción de jueves 17/09 — actualización*');
    expect(t).toContain('pasa de 137 a 160 m³');
  });
});
