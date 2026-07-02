import { quotaValidatorService } from './quota-validator.service.js';

export class WhatsAppSenderOwnershipError extends Error {
  constructor(companyId: string, sender: string) {
    super(`WhatsApp sender ${sender} is not configured for company ${companyId}`);
    this.name = 'WhatsAppSenderOwnershipError';
  }
}

export async function assertCompanyOwnsWhatsAppSender(
  sender: string,
  companyId?: string
): Promise<void> {
  const normalizedCompanyId = String(companyId || '').trim();
  if (!normalizedCompanyId) return;

  const owners = await quotaValidatorService.listCompaniesByWhatsappSender(sender);
  const belongsToCompany = owners.some(
    (owner) => owner.companyId === normalizedCompanyId
  );
  if (!belongsToCompany) {
    throw new WhatsAppSenderOwnershipError(normalizedCompanyId, sender);
  }
}
