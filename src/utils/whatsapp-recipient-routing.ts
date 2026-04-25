import { GROUP_ERRORS_TRACKING } from '../constants/whatsapp.constants.js';

type WhatsAppScope = {
  companyId?: string | null;
  tenantId?: string | null;
};

const normalizeScopeId = (value?: string | null): string => String(value || '').trim().toLowerCase();

export const isTestWhatsAppScope = (scope: WhatsAppScope): boolean => {
  return normalizeScopeId(scope.companyId) === 'test' || normalizeScopeId(scope.tenantId) === 'test';
};

export const resolveWhatsAppRecipient = (
  recipient: string,
  scope: WhatsAppScope & { errorsTrackingGroupId?: string }
): string => {
  const normalizedRecipient = String(recipient || '').trim();
  if (!normalizedRecipient) {
    return normalizedRecipient;
  }

  if (process.env.NODE_ENV === 'development' || isTestWhatsAppScope(scope)) {
    return scope.errorsTrackingGroupId || GROUP_ERRORS_TRACKING;
  }

  return normalizedRecipient;
};
