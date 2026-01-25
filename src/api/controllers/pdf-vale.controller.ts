import { Request, Response, NextFunction } from 'express';
import fs from 'fs-extra';
import path from 'path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { randomUUID } from 'crypto';
import { HTTP_STATUS } from '../../config/constants.js';
import { CustomError } from '../middlewares/errorHandler.js';
import { config } from '../../config/environment.js';
import { renderPdfPageToPngWithGrid } from '../../pdf/render.service.js';
import connectionManager from '../../whatsapp/baileys/connection.manager.js';

type ValeFields = {
  nroVale?: string;
  fecha?: string;
  senores: string;
  obra: string;
  tipoMaterial: string;
  nroM3: string;
  placa: string;
  chofer: string;
  hora: string;
  nota?: string;
};

type NotifyPayload = {
  whatsapp?: {
    from?: string;
    to?: string;
    caption?: string;
  };
  telegram?: {
    chatId?: string;
    caption?: string;
  };
};

type ValeCoords = Record<
  keyof ValeFields,
  {
    x: number;
    y: number;
    size?: number;
    bold?: boolean;
  }
>;

const DEFAULT_TEMPLATE = 'plantilla_dispatch_note.pdf';

const DEFAULT_COORDS: ValeCoords = {
  nroVale: { x: 445, y: 755, size: 11, bold: true },
  fecha: { x: 450, y: 725, size: 11, bold: true },
  senores: { x: 122, y: 676, size: 11, bold: true },
  obra: { x: 122, y: 655, size: 11 },
  tipoMaterial: { x: 122, y: 632, size: 11 },
  nroM3: { x: 230, y: 608, size: 11 },
  placa: { x: 405, y: 610, size: 11 },
  chofer: { x: 405, y: 585, size: 11 },
  hora: { x: 405, y: 560, size: 11 },
  nota: { x: 122, y: 588, size: 11 },
};

function adjustFontSizeForValue(
  key: keyof ValeFields,
  value: string,
  baseSize: number
) {
  if (key !== 'obra') return baseSize;
  const length = value.trim().length;
  if (length > 70) return Math.max(8, baseSize - 4);
  if (length > 55) return Math.max(9, baseSize - 3);
  if (length > 40) return Math.max(10, baseSize - 2);
  if (length > 30) return Math.max(11, baseSize - 1);
  return baseSize;
}

function normalizeWhatsappTarget(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.includes('@')) return trimmed;
  if (trimmed.includes('-')) {
    return `${trimmed}@g.us`;
  }
  const digits = trimmed.replace(/[^\d]/g, '');
  if (digits.length < 8) return null;
  return `${digits}@s.whatsapp.net`;
}

function getDefaultWhatsappSession() {
  const sessions = Array.from(connectionManager.getAllConnections().keys());
  return sessions.find((phone) => connectionManager.isConnected(phone)) || null;
}

async function sendWhatsappNotification(
  sessionOverride: string | undefined,
  target: string,
  caption: string | undefined,
  fileBuffer: Buffer,
  filename: string
) {
  const sessionPhone = sessionOverride || getDefaultWhatsappSession();
  if (!sessionPhone) {
    throw new Error('No WhatsApp session connected');
  }
  const recipient = normalizeWhatsappTarget(target);
  if (!recipient) {
    throw new Error('Invalid WhatsApp target');
  }

  const isConnected = await connectionManager.ensureConnected(sessionPhone);
  if (!isConnected) {
    throw new Error('WhatsApp session not connected');
  }

  const socket = connectionManager.getConnection(sessionPhone);
  if (!socket) {
    throw new Error('WhatsApp session not connected');
  }

  await socket.sendMessage(recipient, {
    document: fileBuffer,
    fileName: filename,
    mimetype: 'application/pdf',
    caption,
  });

  return { sessionPhone, recipient };
}

async function sendTelegramNotification(
  chatId: string,
  caption: string | undefined,
  fileBuffer: Buffer,
  filename: string
) {
  if (!config.telegram.botToken) {
    throw new Error('Telegram bot token not configured');
  }

  const form = new FormData();
  form.append('chat_id', chatId);
  if (caption) form.append('caption', caption);
  form.append('document', new Blob([fileBuffer], { type: 'application/pdf' }), filename);

  const response = await fetch(
    `https://api.telegram.org/bot${config.telegram.botToken}/sendDocument`,
    {
      method: 'POST',
      body: form,
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Telegram error: ${response.status} ${text}`);
  }
}

function buildAbsoluteUrl(req: Request, relativeUrl: string) {
  const host = req.get('host');
  if (!host) return relativeUrl;
  const proto = req.protocol;
  return `${proto}://${host}${relativeUrl}`;
}

export async function generateVale(req: Request, res: Response, next: NextFunction) {
  try {
    const {
      template = DEFAULT_TEMPLATE,
      fields,
      coords,
      notify,
    }: {
      template?: string;
      fields?: Partial<ValeFields>;
      coords?: Partial<ValeCoords>;
      notify?: NotifyPayload;
    } = req.body;

    if (!fields) {
      const error: CustomError = new Error('fields are required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    const requiredFields: (keyof ValeFields)[] = [
      'senores',
      'obra',
      'tipoMaterial',
      'nroM3',
      'placa',
      'chofer',
      'hora',
      'fecha',
    ];

    for (const key of requiredFields) {
      if (!fields[key]) {
        const error: CustomError = new Error(`${key} is required`);
        error.statusCode = HTTP_STATUS.BAD_REQUEST;
        return next(error);
      }
    }

    const templatePath = path.join(config.pdf.templatesDir, template);
    if (!(await fs.pathExists(templatePath))) {
      const error: CustomError = new Error('Template not found');
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(error);
    }

    const bytes = await fs.readFile(templatePath);
    const pdfDoc = await PDFDocument.load(bytes);
    const page = pdfDoc.getPages()[0];
    const { width, height } = page.getSize();
    if (width > height) {
      const error: CustomError = new Error('Template must be portrait (vertical)');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const signaturePath = path.join(
      path.dirname(config.pdf.templatesDir),
      'signatures',
      'signature-dispatch-note.png'
    );
    if (await fs.pathExists(signaturePath)) {
      const signatureBytes = await fs.readFile(signaturePath);
      const signatureImage = await pdfDoc.embedPng(signatureBytes);
      page.drawImage(signatureImage, {
        x: 120,
        y: 500,
        width: 140,
        height: 55,
      });
    }

    const values: ValeFields = {
      nroVale: fields.nroVale || `VALE-${Date.now()}`,
      fecha: fields.fecha,
      senores: fields.senores!,
      obra: fields.obra!,
      tipoMaterial: fields.tipoMaterial!,
      nroM3: fields.nroM3!,
      placa: fields.placa!,
      chofer: fields.chofer!,
      hora: fields.hora!,
      nota: fields.nota || '',
    };

    const positions: ValeCoords = {
      ...DEFAULT_COORDS,
      ...(coords || {}),
    } as ValeCoords;

    (Object.keys(values) as (keyof ValeFields)[]).forEach((key) => {
      const value = values[key];
      if (!value) return;
      const pos = positions[key];
      const isVale = key === 'nroVale';
      const isbold = pos.bold || false;
      const size = adjustFontSizeForValue(key, String(value), pos.size || 12);
      page.drawText(String(value), {
        x: pos.x,
        y: pos.y,
        size,
        font: isbold ? fontBold : font,
        color: isVale ? rgb(0.8, 0, 0) : rgb(0, 0, 0),
      });
    });

    await fs.ensureDir(config.pdf.tempDir);
    const valeNumber = fields.nroVale || randomUUID().slice(0, 8);
    const safeVale = String(valeNumber).replace(/[^a-zA-Z0-9_-]+/g, '-');
    const filename = `vale-despacho-${safeVale}.pdf`;
    const outputPath = path.join(config.pdf.tempDir, filename);
    const pdfBytes = await pdfDoc.save();
    await fs.writeFile(outputPath, pdfBytes);

    const publicUrl = `${config.pdf.tempPublicBaseUrl.replace(/\/+$/, '')}/${encodeURI(
      filename
    )}`;

    const notifyStatus: Record<string, unknown> = {};
    const notifyTasks: Promise<void>[] = [];

    if (notify?.whatsapp?.to) {
      notifyTasks.push(
        (async () => {
          try {
            const result = await sendWhatsappNotification(
              notify.whatsapp.from,
              notify.whatsapp.to,
              notify.whatsapp.caption,
              Buffer.from(pdfBytes),
              filename
            );
            notifyStatus.whatsapp = { sent: true, ...result };
          } catch (error) {
            notifyStatus.whatsapp = { sent: false, error: String(error) };
          }
        })()
      );
    }

    if (notify?.telegram?.chatId) {
      notifyTasks.push(
        (async () => {
          try {
            await sendTelegramNotification(
              notify.telegram.chatId,
              notify.telegram.caption,
              Buffer.from(pdfBytes),
              filename
            );
            notifyStatus.telegram = { sent: true };
          } catch (error) {
            notifyStatus.telegram = { sent: false, error: String(error) };
          }
        })()
      );
    }

    if (notifyTasks.length > 0) {
      await Promise.allSettled(notifyTasks);
    }

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        filename,
        url: publicUrl,
        urlAbsolute: buildAbsoluteUrl(req, publicUrl),
        notify: notifyStatus,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function previewValeTemplateGrid(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const template = String(req.query.template || DEFAULT_TEMPLATE);
    const page = parseInt(String(req.query.page || '1'), 10);
    const scale = parseFloat(String(req.query.scale || '1.5'));
    const gridSize = parseInt(String(req.query.grid || '50'), 10);

    const templatePath = path.join(config.pdf.templatesDir, template);
    if (!(await fs.pathExists(templatePath))) {
      const error: CustomError = new Error('Template not found');
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(error);
    }

    const { cacheFile } = await renderPdfPageToPngWithGrid(templatePath, {
      page,
      scale,
      gridSize,
    });
    res.setHeader('Cache-Control', 'public, max-age=3600, immutable');
    res.setHeader('Content-Type', 'image/png');
    res.status(HTTP_STATUS.OK).sendFile(path.resolve(cacheFile));
  } catch (error) {
    const err: CustomError = error instanceof Error ? error : new Error('Invalid request');
    if (!err.statusCode) {
      err.statusCode = HTTP_STATUS.BAD_REQUEST;
    }
    next(err);
  }
}
