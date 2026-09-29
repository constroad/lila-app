/**
 * Adjuntos de un cronjob de mensaje (José, 23/09/2026): el recordatorio de
 * cobranza manda las cuentas bancarias, y hasta hoy solo podía ir texto.
 *
 * El job guarda enlaces (el archivo vive en el Drive); acá se decide QUÉ se
 * envía y en qué orden: el texto viaja como pie del PRIMER adjunto para que en
 * el grupo sea un solo mensaje, y los demás van sueltos. Sin adjuntos, texto.
 */
export interface CronAttachment {
  url: string;
  fileName?: string;
  mimeType?: string;
}

export type CronSendStep =
  | { kind: 'text'; body: string }
  | {
      kind: 'image' | 'document';
      url: string;
      fileName?: string;
      mimeType?: string;
      caption?: string;
    };

const IMAGE_EXTENSION = /\.(jpe?g|png|webp|gif|heic|heif)(\?|#|$)/i;

const trimToEmpty = (value: unknown): string => String(value ?? '').trim();

export const isImageAttachment = (attachment: CronAttachment): boolean => {
  const mimeType = trimToEmpty(attachment.mimeType).toLowerCase();
  if (mimeType) return mimeType.startsWith('image/');
  return IMAGE_EXTENSION.test(trimToEmpty(attachment.url));
};

/** Solo enlaces http(s): lila los descarga para reenviarlos. */
export const usableCronAttachments = (
  attachments?: CronAttachment[] | null,
): CronAttachment[] =>
  (attachments ?? []).filter((attachment) =>
    /^https?:\/\//i.test(trimToEmpty(attachment?.url)),
  );

export const buildCronSendPlan = (params: {
  body: string;
  attachments?: CronAttachment[] | null;
}): CronSendStep[] => {
  const body = trimToEmpty(params.body);
  const usable = usableCronAttachments(params.attachments);
  if (usable.length === 0) return body ? [{ kind: 'text', body }] : [];

  return usable.map((attachment, index) => ({
    kind: isImageAttachment(attachment)
      ? ('image' as const)
      : ('document' as const),
    url: trimToEmpty(attachment.url),
    fileName: trimToEmpty(attachment.fileName) || undefined,
    mimeType: trimToEmpty(attachment.mimeType) || undefined,
    // El texto acompaña al primero; repetirlo en cada archivo sería spam.
    caption: index === 0 && body ? body : undefined,
  }));
};
