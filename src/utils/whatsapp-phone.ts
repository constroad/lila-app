export type NormalizeWhatsAppRecipientOptions = {
  allowGroupShortcut?: boolean;
  minPhoneDigits?: number;
};

export function normalizeWhatsAppPhoneNumber(value?: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.endsWith('@g.us') || raw.endsWith('@s.whatsapp.net')) return raw;

  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';

  // Operators often enter the local 9-digit Peruvian mobile number in field forms.
  if (digits.length === 9 && digits.startsWith('9')) {
    return `51${digits}`;
  }

  return digits;
}

export function normalizeWhatsAppRecipient(
  value: string,
  options: NormalizeWhatsAppRecipientOptions = {}
): string | null {
  const raw = String(value || '').trim().replace(/\s/g, '').replace(/\+/g, '');
  if (!raw) return null;
  if (raw.endsWith('@g.us') || raw.endsWith('@s.whatsapp.net')) return raw;
  if (options.allowGroupShortcut && raw.includes('-')) return `${raw}@g.us`;
  if (/[a-z]/i.test(raw)) return null;

  const digits = normalizeWhatsAppPhoneNumber(raw);
  const minPhoneDigits = options.minPhoneDigits ?? 1;
  if (!digits || digits.includes('@') || digits.length < minPhoneDigits) return null;

  return `${digits}@s.whatsapp.net`;
}

export function assertWhatsAppRecipient(value: string): string {
  const recipient = normalizeWhatsAppRecipient(value);
  if (!recipient) {
    throw new Error('Invalid phone number');
  }
  return recipient;
}
