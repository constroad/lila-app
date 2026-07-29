jest.mock('../database/sharedConnection.js', () => ({
  getSharedConnection: jest.fn(),
}));

import { structureDataForReportType, AggregatedReportData } from './report-data-aggregator.service.js';

const baseRaw: AggregatedReportData = {
  service: {},
  client: null,
  company: null,
  orders: [],
  dispatches: [],
  certificates: [],
  invoices: [],
  payments: [],
  financeEntries: [],
  financeMedia: [],
  serviceMedia: [],
  orderMedia: [],
};

describe('structureDataForReportType — proyecto (autocompletado del informe de campo)', () => {
  it('usa los valores EXPLÍCITOS del servicio cuando existen', () => {
    const data = structureDataForReportType('CTL-PIS', {
      ...baseRaw,
      service: {
        projectName: 'OBRA X',
        contratista: 'ACME',
        subcontratista: 'SUB SAC',
        locationUrl: 'https://maps/x',
      },
      client: { name: 'CLIENTE' },
      company: { name: 'EMPRESA' },
    });
    expect(data.proyecto.contratista).toBe('ACME');
    expect(data.proyecto.subcontratista).toBe('SUB SAC');
    expect(data.proyecto.ubicacion).toBe('https://maps/x');
  });

  it('cae al CLIENTE (contratista) y a la EMPRESA (subcontratista) si el servicio no los trae', () => {
    const data = structureDataForReportType('CTL-PIS', {
      ...baseRaw,
      service: { projectName: 'OBRA X', location: { address: 'Av. Test 123' } },
      client: { name: 'ISS CONSTRUCTORA SAC' },
      company: { legalInfo: { businessName: 'GLOBOFAST SAC' } },
    });
    expect(data.proyecto.obra).toBe('OBRA X');
    expect(data.proyecto.contratista).toBe('ISS CONSTRUCTORA SAC');
    expect(data.proyecto.subcontratista).toBe('GLOBOFAST SAC');
    expect(data.proyecto.ubicacion).toBe('Av. Test 123');
  });
});
