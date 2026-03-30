const DEFAULT_COMPANY_BOT_SOURCE = 'constroad';
const LEGACY_BOT_NAME = 'ConstRoadBot';

const toBotSegments = (value?: string | null): string[] => {
  const normalized = String(value || '')
    .trim()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

  return normalized.split('-').filter(Boolean);
};

const capitalize = (value: string): string =>
  value.charAt(0).toUpperCase() + value.slice(1);

export const getCompanyBotName = (source?: string | null): string => {
  const segments = toBotSegments(source);
  const fallbackSegments = toBotSegments(DEFAULT_COMPANY_BOT_SOURCE);
  const effectiveSegments = segments.length > 0 ? segments : fallbackSegments;

  return `${effectiveSegments.map(capitalize).join('')}Bot`;
};

export const getCompanyBotLabel = (source?: string | null): string =>
  `🤖 ${getCompanyBotName(source)}`;

export const replaceLegacyBotLabel = (
  message: string,
  source?: string | null
): string => {
  const botName = getCompanyBotName(source);
  const botLabel = getCompanyBotLabel(source);

  return String(message || '')
    .replace(/🤖\s*ConstRoadBot/gi, botLabel)
    .replace(new RegExp(LEGACY_BOT_NAME, 'gi'), botName);
};

export const replaceLegacyBotLabelForCompanyId = async (
  companyId: string | undefined,
  message: string
): Promise<string> => {
  if (!companyId) {
    return replaceLegacyBotLabel(message);
  }

  const { getCompanyModel } = await import('../database/models.js');
  const CompanyModel = await getCompanyModel();
  const company = await CompanyModel.findOne({ companyId }).lean();
  return replaceLegacyBotLabel(message, company?.slug || company?.name || companyId);
};
