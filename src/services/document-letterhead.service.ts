interface DocumentMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface DocumentLetterheadSnapshot {
  id?: string;
  name?: string;
  url?: string;
  orientation?: 'portrait' | 'landscape';
  margins?: Partial<DocumentMargins>;
  enabled?: boolean;
  hideLogo?: boolean;
}

const DEFAULT_MARGIN_MM = 20;
const MAX_MARGIN_MM = 80;

function clampMargin(value: unknown): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return DEFAULT_MARGIN_MM;
  return Math.min(MAX_MARGIN_MM, Math.max(0, Math.round(numericValue)));
}

export function getDocumentLetterhead(data: Record<string, unknown>): DocumentLetterheadSnapshot | null {
  const settings = data.documentSettings;
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return null;
  const letterhead = (settings as Record<string, unknown>).letterhead;
  if (!letterhead || typeof letterhead !== 'object' || Array.isArray(letterhead)) return null;
  const snapshot = letterhead as DocumentLetterheadSnapshot;
  if (snapshot.enabled === false) return null;
  if (!String(snapshot.url || '').trim()) return null;
  return snapshot;
}

export function getDocumentLetterheadMargins(
  letterhead: DocumentLetterheadSnapshot | null,
  fallback?: Partial<DocumentMargins>
): DocumentMargins {
  const source = letterhead?.margins || fallback || {};
  return {
    top: clampMargin(source.top),
    right: clampMargin(source.right),
    bottom: clampMargin(source.bottom),
    left: clampMargin(source.left),
  };
}

export function shouldHideDocumentLogo(data: Record<string, unknown>): boolean {
  const letterhead = getDocumentLetterhead(data);
  return Boolean(letterhead?.hideLogo);
}
