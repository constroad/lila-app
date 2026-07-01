jest.mock('../config/environment.js', () => ({
  config: {
    portal: { baseUrl: 'https://constroad.com' },
    pdf: { tempDir: '/tmp' },
  },
}));
jest.mock('../database/models.js', () => ({ getCompanyModel: jest.fn() }));
jest.mock('../pdf/generator.service.js', () => ({
  __esModule: true,
  default: { generateFromHtml: jest.fn() },
}));

import { getCompanyModel } from '../database/models.js';
import pdfGenerator from '../pdf/generator.service.js';
import {
  generatePlantSettlementPdf,
  renderPlantSettlementHtml,
} from './plant-dispatch-settlement-document.service.js';

const getCompanyModelMock = getCompanyModel as jest.MockedFunction<typeof getCompanyModel>;

describe('plant dispatch settlement PDF', () => {
  it('renders branded header, works and accumulated totals', () => {
    const html = renderPlantSettlementHtml({
      companyId: 'globofast',
      companyName: 'Globofast',
      logoUrl: '/logo.png',
      payload: {
        plant: { plantId: 'plant-01', name: 'Planta Norte' },
        period: { startDate: '2026-06-01', endDate: '2026-06-30' },
        groups: [
          {
            groupId: 'order-secret-id',
            clientName: 'Cliente Uno',
            projectName: 'Obra Central',
            orderDate: '2026-06-02',
            dueDate: '2026-07-02',
            paymentStatus: 'pending',
            dispatchCount: 2,
            unfinishedDispatchCount: 1,
            confirmedM3: 12.25,
            pendingM3: 3.5,
          },
          {
            groupId: 'other-secret-id',
            clientName: 'Cliente Dos',
            projectName: 'Obra Sur',
            paymentStatus: 'paid',
            dispatchCount: 1,
            unfinishedDispatchCount: 0,
            confirmedM3: 7.75,
            pendingM3: 0,
          },
        ],
      },
    });

    expect(html).toContain('REPORTE DE PRODUCCIÓN POR PLANTA');
    expect(html).toContain('RPP-20260630-GLOBOFAS-LANT01');
    expect(html).toContain('Obra Central');
    expect(html).toContain('20.00');
    expect(html).toContain('3.50');
    expect(html).not.toContain('order-secret-id');
  });

  it('generates the PDF using company branding', async () => {
    getCompanyModelMock.mockResolvedValue({
      findOne: () => ({
        select: () => ({
          lean: async () => ({
            name: 'Globofast',
            branding: { logoLight: '/logo.png' },
          }),
        }),
      }),
    } as never);

    const generated = await generatePlantSettlementPdf({
      companyId: 'globofast',
      payload: {
        plant: { plantId: 'plant-01', name: 'Planta Norte' },
        period: { startDate: '2026-06-01', endDate: '2026-06-30' },
        groups: [{
          groupId: 'order-1',
          clientName: 'Cliente',
          projectName: 'Obra',
          paymentStatus: 'pending',
          dispatchCount: 1,
          unfinishedDispatchCount: 0,
          confirmedM3: 10,
          pendingM3: 0,
        }],
      },
    });

    expect(generated.fileName).toMatch(/^reporte-produccion-/);
    expect(pdfGenerator.generateFromHtml).toHaveBeenCalledWith(
      expect.stringContaining('Obra'),
      expect.objectContaining({ landscape: true })
    );
  });

  it('rejects malformed reports', async () => {
    await expect(generatePlantSettlementPdf({
      companyId: 'globofast',
      payload: {} as never,
    })).rejects.toThrow('inválido');
  });
});
