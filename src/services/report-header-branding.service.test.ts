import { describe, expect, it, jest } from '@jest/globals';
import { companyLogoOf, seedReportHeaderBranding } from './report-header-branding.service.js';

const constroad = {
  name: 'CONSTROAD SAC',
  branding: { logoLight: 'https://lila/light.svg', logoDark: 'https://lila/dark.svg' },
};

describe('companyLogoOf', () => {
  it('prefiere el logo claro, y cae al oscuro y al favicon', () => {
    expect(companyLogoOf(constroad)).toBe('https://lila/light.svg');
    expect(companyLogoOf({ branding: { logoDark: 'd.svg' } })).toBe('d.svg');
    expect(companyLogoOf({ branding: { favicon: 'f.png' } })).toBe('f.png');
    expect(companyLogoOf({})).toBe('');
    expect(companyLogoOf(null)).toBe('');
  });
});

describe('seedReportHeaderBranding', () => {
  it('pone el logo y el nombre cuando el informe no los trae', async () => {
    // El schemaData de un parte de campo nunca trae el logo: lo pone la empresa.
    const data: Record<string, any> = { header: { fecha: '2026-09-09' } };

    await seedReportHeaderBranding(data, 'constroad', async () => constroad);

    expect(data.header.logoUrl).toBe('https://lila/light.svg');
    expect(data.header.companyName).toBe('CONSTROAD SAC');
    expect(data.header.fecha).toBe('2026-09-09');
  });

  it('crea el header si el informe no tiene ninguno', async () => {
    const data: Record<string, any> = {};

    await seedReportHeaderBranding(data, 'constroad', async () => constroad);

    expect(data.header.logoUrl).toBe('https://lila/light.svg');
  });

  it('NO pisa el logo que el informe ya trae', async () => {
    // Un documento con membrete de un tercero manda sobre el de la empresa.
    const data: Record<string, any> = { header: { logoUrl: 'propio.png', companyName: 'OTRA' } };

    await seedReportHeaderBranding(data, 'constroad', async () => constroad);

    expect(data.header.logoUrl).toBe('propio.png');
    expect(data.header.companyName).toBe('OTRA');
  });

  it('un logo en blanco cuenta como ausente', async () => {
    const data: Record<string, any> = { header: { logoUrl: '   ' } };

    await seedReportHeaderBranding(data, 'constroad', async () => constroad);

    expect(data.header.logoUrl).toBe('https://lila/light.svg');
  });

  it('sin company, el informe sale igual', async () => {
    const data: Record<string, any> = { header: {} };

    await seedReportHeaderBranding(data, 'constroad', async () => null);

    expect(data.header.logoUrl).toBeUndefined();
  });

  it('si la base falla, el PDF no se cae', async () => {
    const data: Record<string, any> = { header: {} };

    await expect(
      seedReportHeaderBranding(data, 'constroad', async () => {
        throw new Error('sin conexion');
      })
    ).resolves.toBeUndefined();
  });

  it('sin companyId no toca nada', async () => {
    const data: Record<string, any> = { header: {} };
    const load = jest.fn();

    await seedReportHeaderBranding(data, '', load as never);

    expect(load).not.toHaveBeenCalled();
  });
});
