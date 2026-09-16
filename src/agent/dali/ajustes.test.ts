import ExcelJS from 'exceljs';
import { armarExportacion, filaDeConversacion, filaDeLead, nombreDePerfil, PerfilInvalido } from './ajustes';

/**
 * AJUSTES (A20): el nombre con el que aparece la persona, y la exportación a
 * Excel de conversaciones y leads (lo que la empresa tiene derecho a
 * llevarse). Sin contraseñas, sin sesiones para cerrar a distancia, sin
 * borrar la cuenta desde el panel: lo que no existe no se dibuja.
 */
describe('nombreDePerfil', () => {
  it('recorta y limita el nombre; vacío no vale', () => {
    expect(nombreDePerfil('  José Zena  ')).toBe('José Zena');
    expect(() => nombreDePerfil('   ')).toThrow(PerfilInvalido);
    expect(nombreDePerfil('x'.repeat(80))).toHaveLength(60);
  });
});

describe('exportación', () => {
  const conversacion = {
    id: 'c1',
    customerName: 'Cliente de ejemplo',
    customerPhone: '51900000000',
    status: 'bot' as const,
    messageCount: 7,
    createdAt: new Date('2026-09-14T15:00:00Z'),
    lastMessageAt: new Date('2026-09-14T15:20:00Z'),
    lead: { servicio: 'colocacion', cantidad: '600 m²', distrito: 'Lurín', listo: true },
  };
  const lead = {
    conversationId: 'c1',
    estado: 'cotizado' as const,
    cotizacion: { monto: 12500 },
    notas: [{ texto: 'llamar el lunes', autor: 'José', fecha: new Date('2026-09-15T13:00:00Z') }],
  };

  it('cada fila lleva fechas en hora de Lima, el teléfono legible y el lead resumido', () => {
    expect(filaDeConversacion(conversacion, { colocacion: 'asfaltado (colocación)' })).toEqual([
      '2026-09-14 10:00',
      '2026-09-14 10:20',
      'Cliente de ejemplo',
      '+51 900 000 000',
      'Dali atiende',
      7,
      'asfaltado (colocación)',
      '600 m²',
      'Lurín',
      'sí',
    ]);
    expect(filaDeLead(conversacion, lead, { colocacion: 'asfaltado (colocación)' })).toEqual([
      '2026-09-14 10:00',
      'Cliente de ejemplo',
      '+51 900 000 000',
      'asfaltado (colocación)',
      '600 m²',
      'Lurín',
      'cotizado',
      12500,
      '2026-09-15 08:00 José: llamar el lunes',
    ]);
  });

  it('el libro trae las dos hojas: una fila por conversación, y un lead por conversación con servicio (sin trabajo del dueño, «nuevo»)', async () => {
    const sinTrabajo = { ...conversacion, id: 'c2', customerName: 'Otro cliente', lead: { servicio: 'venta' } };
    const sinLead = { ...conversacion, id: 'c3', customerName: 'Solo saludó', lead: undefined };
    const buffer = await armarExportacion({ conversaciones: [conversacion, sinTrabajo, sinLead], leads: [lead], nombres: {} });
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(libro.worksheets.map((h) => h.name)).toEqual(['Conversaciones', 'Leads']);
    expect(libro.getWorksheet('Conversaciones')!.rowCount).toBe(4);
    const hojaLeads = libro.getWorksheet('Leads')!;
    expect(hojaLeads.rowCount).toBe(3);
    expect(String(hojaLeads.getRow(1).getCell(7).value)).toBe('Estado del lead');
    expect(String(hojaLeads.getRow(2).getCell(7).value)).toBe('cotizado');
    expect(String(hojaLeads.getRow(3).getCell(7).value)).toBe('nuevo');
  });
});
