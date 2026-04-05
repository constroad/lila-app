type WhatsAppScope = {
  companyId?: string | null;
  tenantId?: string | null;
};

const DEFAULT_ERRORS_TRACKING_GROUP_ID =
  process.env.WHATSAPP_ERRORS_TRACKING_GROUP_ID ||
  process.env.NEXT_PUBLIC_GROUP_ERRORS_TRACKING ||
  '120363376500470254@g.us';

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

  if (isTestWhatsAppScope(scope)) {
    return scope.errorsTrackingGroupId || DEFAULT_ERRORS_TRACKING_GROUP_ID;
  }

  return normalizedRecipient;
};
