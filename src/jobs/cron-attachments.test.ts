import { describe, it, expect } from '@jest/globals';
import {
  buildCronSendPlan,
  isImageAttachment,
  usableCronAttachments,
} from './cron-attachments.js';

describe('buildCronSendPlan', () => {
  it('sin adjuntos manda el texto, como siempre', () => {
    expect(buildCronSendPlan({ body: 'Nuestras cuentas:' })).toEqual([
      { kind: 'text', body: 'Nuestras cuentas:' },
    ]);
    expect(buildCronSendPlan({ body: '   ', attachments: [] })).toEqual([]);
  });

  it('con una imagen: UN mensaje en el grupo, el texto de pie', () => {
    expect(
      buildCronSendPlan({
        body: 'Nuestras cuentas:',
        attachments: [
          {
            url: 'https://lila/cuentas.png',
            fileName: 'cuentas.png',
            mimeType: 'image/png',
          },
        ],
      }),
    ).toEqual([
      {
        kind: 'image',
        url: 'https://lila/cuentas.png',
        fileName: 'cuentas.png',
        mimeType: 'image/png',
        caption: 'Nuestras cuentas:',
      },
    ]);
  });

  it('el PDF va como documento y el texto solo acompaña al primero', () => {
    const plan = buildCronSendPlan({
      body: 'Cuentas y voucher',
      attachments: [
        { url: 'https://lila/cuentas.pdf', mimeType: 'application/pdf' },
        { url: 'https://lila/yape.jpg', mimeType: 'image/jpeg' },
      ],
    });

    expect(plan.map((step) => step.kind)).toEqual(['document', 'image']);
    expect(plan[0]).toEqual(
      expect.objectContaining({ caption: 'Cuentas y voucher' }),
    );
    expect((plan[1] as { caption?: string }).caption).toBeUndefined();
  });

  it('un adjunto sin enlace http(s) se ignora: lila no puede descargarlo', () => {
    const plan = buildCronSendPlan({
      body: 'Hola',
      attachments: [{ url: '/files/local.png' }, { url: 'blob:http://x/y' }],
    });

    expect(plan).toEqual([{ kind: 'text', body: 'Hola' }]);
    expect(
      usableCronAttachments([
        { url: 'https://lila/a.png' },
        { url: 'ftp://x/a.png' },
      ]),
    ).toHaveLength(1);
  });
});

describe('isImageAttachment', () => {
  it('por mime, y si no hay mime por extensión', () => {
    expect(
      isImageAttachment({ url: 'https://lila/a.bin', mimeType: 'image/webp' }),
    ).toBe(true);
    expect(isImageAttachment({ url: 'https://lila/a.JPG' })).toBe(true);
    expect(isImageAttachment({ url: 'https://lila/a.pdf' })).toBe(false);
  });
});
