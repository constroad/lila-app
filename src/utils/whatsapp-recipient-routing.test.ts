import { isTestWhatsAppScope, resolveWhatsAppRecipient } from './whatsapp-recipient-routing.js';

describe('whatsapp-recipient-routing', () => {
  it('routes test company recipients to errors tracking group', () => {
    expect(
      resolveWhatsAppRecipient('+51999999999', {
        companyId: 'test',
        errorsTrackingGroupId: 'errors@g.us',
      })
    ).toBe('errors@g.us');
  });

  it('routes test tenant recipients to errors tracking group', () => {
    expect(
      resolveWhatsAppRecipient('+51999999999', {
        tenantId: 'test',
        errorsTrackingGroupId: 'errors@g.us',
      })
    ).toBe('errors@g.us');
  });

  it('keeps original recipient for non-test scope', () => {
    expect(
      resolveWhatsAppRecipient('+51999999999', {
        companyId: 'constroad',
        errorsTrackingGroupId: 'errors@g.us',
      })
    ).toBe('+51999999999');
  });

  it('detects test scope case-insensitively', () => {
    expect(isTestWhatsAppScope({ companyId: ' Test ' })).toBe(true);
    expect(isTestWhatsAppScope({ tenantId: 'TEST' })).toBe(true);
    expect(isTestWhatsAppScope({ companyId: 'constroad', tenantId: 'prod' })).toBe(false);
  });
});
