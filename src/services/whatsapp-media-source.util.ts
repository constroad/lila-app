type MediaSourceOptions = {
  buffer?: Buffer;
  fileName?: string;
  filePath?: string;
  fileUrl?: string;
  companyId?: string;
};

export type WhatsAppMediaSourceKind = 'buffer' | 'storage' | 'temp' | 'external' | 'invalid';

const extractCompanyIdFromUrl = (value?: string): string | undefined => {
  if (!value) return undefined;
  try {
    const url = value.includes('://') ? new URL(value) : null;
    const pathValue = url ? url.pathname : value;
    const match = pathValue.match(/\/files\/companies\/([^/]+)\//);
    if (match?.[1]) return match[1];
    const alt = pathValue.match(/companies\/([^/]+)\//);
    return alt?.[1];
  } catch {
    const match = value.match(/\/files\/companies\/([^/]+)\//);
    if (match?.[1]) return match[1];
    const alt = value.match(/companies\/([^/]+)\//);
    return alt?.[1];
  }
  return undefined;
};

export const resolveCompanyIdFromMediaOptions = (options: MediaSourceOptions): string | undefined => {
  return options.companyId || extractCompanyIdFromUrl(options.fileUrl);
};

export const resolveWhatsAppMediaSourceKind = (
  options: MediaSourceOptions
): WhatsAppMediaSourceKind => {
  if (options.buffer) {
    return 'buffer';
  }

  if (options.filePath) {
    return 'storage';
  }

  if (options.fileUrl) {
    return resolveCompanyIdFromMediaOptions(options) ? 'storage' : 'external';
  }

  if (options.fileName) {
    return 'temp';
  }

  return 'invalid';
};
