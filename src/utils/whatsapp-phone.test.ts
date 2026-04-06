import {
  assertWhatsAppRecipient,
  normalizeWhatsAppPhoneNumber,
  normalizeWhatsAppRecipient,
} from './whatsapp-phone.js';

describe('whatsapp-phone', () => {
  it('normalizes Peruvian local mobile numbers', () => {
    expect(normalizeWhatsAppPhoneNumber('981243514')).toBe('51981243514');
    expect(normalizeWhatsAppPhoneNumber('+51 981 243 514')).toBe('51981243514');
  });

  it('preserves existing WhatsApp JIDs', () => {
    expect(normalizeWhatsAppPhoneNumber('51981243514@s.whatsapp.net')).toBe(
      '51981243514@s.whatsapp.net'
    );
    expect(normalizeWhatsAppRecipient('120363288945205546@g.us')).toBe(
      '120363288945205546@g.us'
    );
  });

  it('builds WhatsApp phone recipients', () => {
    expect(normalizeWhatsAppRecipient('981243514')).toBe('51981243514@s.whatsapp.net');
    expect(normalizeWhatsAppRecipient('+51 981 243 514')).toBe(
      '51981243514@s.whatsapp.net'
    );
  });

  it('supports legacy group shortcuts only when explicitly allowed', () => {
    expect(normalizeWhatsAppRecipient('120363-legacy')).toBeNull();
    expect(normalizeWhatsAppRecipient('120363-legacy', { allowGroupShortcut: true })).toBe(
      '120363-legacy@g.us'
    );
  });

  it('rejects invalid values with explicit validation', () => {
    expect(normalizeWhatsAppRecipient('abc')).toBeNull();
    expect(() => assertWhatsAppRecipient('abc')).toThrow('Invalid phone number');
  });
});
