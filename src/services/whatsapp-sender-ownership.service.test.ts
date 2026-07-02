export {};

const mockListCompaniesByWhatsappSender = jest.fn();

jest.mock('./quota-validator.service.js', () => ({
  quotaValidatorService: {
    listCompaniesByWhatsappSender: mockListCompaniesByWhatsappSender,
  },
}));

const {
  assertCompanyOwnsWhatsAppSender,
  WhatsAppSenderOwnershipError,
} = require('./whatsapp-sender-ownership.service.js');

describe('whatsapp sender ownership', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows a sender configured for the requesting company', async () => {
    mockListCompaniesByWhatsappSender.mockResolvedValue([
      { companyId: 'constroad' },
    ]);

    await expect(
      assertCompanyOwnsWhatsAppSender('51949376824', 'constroad')
    ).resolves.toBeUndefined();
  });

  it('rejects another company session instead of using it as fallback', async () => {
    mockListCompaniesByWhatsappSender.mockResolvedValue([
      { companyId: 'constroad' },
    ]);

    await expect(
      assertCompanyOwnsWhatsAppSender('51949376824', 'test')
    ).rejects.toBeInstanceOf(WhatsAppSenderOwnershipError);
  });

  it('keeps legacy unscoped internal calls compatible', async () => {
    await expect(
      assertCompanyOwnsWhatsAppSender('51949376824')
    ).resolves.toBeUndefined();
    expect(mockListCompaniesByWhatsappSender).not.toHaveBeenCalled();
  });
});
