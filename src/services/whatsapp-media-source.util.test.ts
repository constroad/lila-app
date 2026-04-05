import {
  resolveCompanyIdFromMediaOptions,
  resolveWhatsAppMediaSourceKind,
} from './whatsapp-media-source.util.js';

describe('whatsapp-media-source.util', () => {
  it('prefers storage when filePath and fileName coexist', () => {
    expect(
      resolveWhatsAppMediaSourceKind({
        filePath: 'dispatches/vales/nro-1/vale.pdf',
        fileName: 'vale.pdf',
        companyId: 'test',
      })
    ).toBe('storage');
  });

  it('treats company storage urls as storage', () => {
    expect(
      resolveWhatsAppMediaSourceKind({
        fileUrl: 'https://host/files/companies/test/dispatches/vale.pdf',
      })
    ).toBe('storage');
    expect(
      resolveCompanyIdFromMediaOptions({
        fileUrl: 'https://host/files/companies/test/dispatches/vale.pdf',
      })
    ).toBe('test');
  });

  it('treats external urls without company scope as external', () => {
    expect(
      resolveWhatsAppMediaSourceKind({
        fileUrl: 'https://example.com/file.pdf',
      })
    ).toBe('external');
  });

  it('uses temp source only when only fileName exists', () => {
    expect(
      resolveWhatsAppMediaSourceKind({
        fileName: 'upload.pdf',
      })
    ).toBe('temp');
  });
});
