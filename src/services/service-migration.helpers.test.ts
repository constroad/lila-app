export {};

jest.mock('fs-extra', () => ({
  __esModule: true,
  default: {
    pathExists: jest.fn(),
    stat: jest.fn(),
    ensureDir: jest.fn(),
    copy: jest.fn(),
    remove: jest.fn(),
  },
}));
jest.mock('../api/controllers/drive.controller.js', () => ({
  getMigrationCopyJobSnapshot: jest.fn(),
}));
jest.mock('./storage-path.service.js', () => ({
  storagePathService: {
    resolvePath: jest.fn(),
    validateAccess: jest.fn().mockReturnValue(true),
  },
}));
jest.mock('../middleware/quota.middleware.js', () => ({
  incrementStorageUsage: jest.fn(),
  decrementStorageUsage: jest.fn(),
}));
jest.mock('../utils/logger.js', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));
jest.mock('../database/sharedConnection.js', () => ({
  getSharedConnection: jest.fn(),
}));
jest.mock('./telegram-alert.service.js', () => ({
  sendTelegramAlert: jest.fn(),
}));

const { getMigrationCopyJobSnapshot } = require('../api/controllers/drive.controller.js');
const fs = require('fs-extra').default;
const helpers = require('./service-migration.helpers.js');
const service = require('./service-migration.service.js');

const createChain = (value: unknown) => ({
  sort() {
    return this;
  },
  limit() {
    return this;
  },
  lean: jest.fn().mockResolvedValue(value),
});

describe('service-migration.helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('collects attachment media selectors without duplicates', () => {
    const filters = helpers.collectAttachmentMediaFilters([
      {
        attachmentMediaType: 'GENERAL_EXPENSE',
        attachmentResourceIds: ['expense-1', 'expense-1'],
      },
      {
        attachmentMediaType: 'SERVICE_FINANCE',
        attachmentResourceIds: ['finance-1'],
      },
    ]);

    expect(filters).toEqual({
      resourceIds: ['expense-1', 'finance-1'],
      types: ['GENERAL_EXPENSE', 'SERVICE_FINANCE'],
    });
  });

  it('rewrites generated document files under service/reports', () => {
    const files = helpers.buildGeneratedDocumentFiles(
      [
        {
          _id: 'report-1',
          generatedDocuments: {
            pdfUrl: '/files/companies/globofast/service/reports/service-1/acta.pdf',
            docxUrl: 'https://constroad.com/files/companies/globofast/service/reports/service-1/acta.docx',
          },
        },
      ],
      'globofast',
      'constroad',
      'service-1',
      'service-9'
    );

    expect(files).toEqual([
      {
        mediaId: 'generated:report-1:service/reports/service-1/acta.pdf',
        sourcePath: 'companies/globofast/service/reports/service-1/acta.pdf',
        targetPath: 'companies/constroad/service/reports/service-9/acta.pdf',
      },
      {
        mediaId: 'generated:report-1:service/reports/service-1/acta.docx',
        sourcePath: 'companies/globofast/service/reports/service-1/acta.docx',
        targetPath: 'companies/constroad/service/reports/service-9/acta.docx',
      },
    ]);
  });

  it('skips order-linked files during same-company service moves', () => {
    const files = helpers.buildMigrationFiles(
      [
        {
          _id: 'media-1',
          metadata: {
            lilaAppFilePath: 'files/companies/globofast/orders/order-1/DISPATCH_PICTURES/foto.jpg',
            storageProvider: 'lila-app',
          },
        },
      ],
      'globofast',
      'globofast',
      'service-1',
      'service-9'
    );

    expect(files).toEqual([]);
  });

  it('rewrites exact order ids inside report payloads', () => {
    const replacements = helpers.buildOrderIdReplacementMap(
      ['order-1', 'order-2'],
      [{ kind: 'order', sourceId: 'order-1', targetId: 'target-9' }]
    );

    const rewritten = helpers.rewriteReportOrderReferences(
      {
        control: {
          orderId: 'order-1',
          untouched: 'order-10',
        },
        orderIds: ['order-1', 'order-2'],
      },
      replacements
    );

    expect(rewritten).toEqual({
      control: {
        orderId: 'target-9',
        untouched: 'order-10',
      },
      orderIds: ['target-9', 'order-2'],
    });
  });

  it('copies files using the target directory path helper', async () => {
    const { storagePathService } = require('./storage-path.service.js');
    storagePathService.resolvePath
      .mockReturnValueOnce('/tmp/source/companies/globofast/service/reports/service-1/acta.pdf')
      .mockReturnValueOnce('/tmp/target/companies/constroad/service/reports/service-9/acta.pdf');
    fs.pathExists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    fs.stat.mockResolvedValueOnce({
      size: 128,
      isFile: () => true,
    });

    await expect(
      helpers.copyPhysicalFiles(
        [
          {
            mediaId: 'generated:report-1:acta.pdf',
            sourcePath: 'companies/globofast/service/reports/service-1/acta.pdf',
            targetPath: 'companies/constroad/service/reports/service-9/acta.pdf',
          },
        ],
        'globofast',
        'constroad'
      )
    ).resolves.toEqual([
      '/tmp/target/companies/constroad/service/reports/service-9/acta.pdf',
    ]);

    expect(fs.ensureDir).toHaveBeenCalledWith(
      '/tmp/target/companies/constroad/service/reports/service-9'
    );
    expect(fs.copy).toHaveBeenCalledWith(
      '/tmp/source/companies/globofast/service/reports/service-1/acta.pdf',
      '/tmp/target/companies/constroad/service/reports/service-9/acta.pdf'
    );
  });
});

describe('service-migration.service validations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts a matching prepared file job', async () => {
    getMigrationCopyJobSnapshot.mockResolvedValue({
      status: 'succeeded',
      sourceCompanyId: 'globofast',
      targetCompanyId: 'constroad',
      entries: [{ targetPath: 'companies/constroad/service/reports/service-9/acta.pdf' }],
    });

    await expect(
      service.validatePreparedFiles(
        {
          sourceCompanyId: 'globofast',
          targetCompanyId: 'constroad',
          pairings: [],
          confirmationText: 'service-1',
          fileJobId: 'job-1',
        },
        [{ sourcePath: 'companies/globofast/service/reports/service-1/acta.pdf', targetPath: 'companies/constroad/service/reports/service-9/acta.pdf' }]
      )
    ).resolves.toBeUndefined();
  });

  it('rejects a prepared file job that points to another target', async () => {
    getMigrationCopyJobSnapshot.mockResolvedValue({
      status: 'succeeded',
      sourceCompanyId: 'globofast',
      targetCompanyId: 'constroad',
      entries: [{ targetPath: 'companies/constroad/service/reports/service-8/acta.pdf' }],
    });

    await expect(
      service.validatePreparedFiles(
        {
          sourceCompanyId: 'globofast',
          targetCompanyId: 'constroad',
          pairings: [],
          confirmationText: 'service-1',
          fileJobId: 'job-1',
        },
        [{ sourcePath: 'companies/globofast/service/reports/service-1/acta.pdf', targetPath: 'companies/constroad/service/reports/service-9/acta.pdf' }]
      )
    ).rejects.toThrow('Job de archivos apunta a otro destino.');
  });

  it('rejects invalid order pairings outside the allowed targets', async () => {
    const recentOrders = [{ _id: 'target-1', cliente: 'Cliente', obra: 'Obra' }];
    const sourceOrder = { _id: 'source-1', cliente: 'Cliente', obra: 'Obra' };
    const models = {
      Order: {
        find: jest.fn()
          .mockReturnValueOnce(createChain(recentOrders))
          .mockReturnValueOnce(createChain(recentOrders)),
        findOne: jest.fn().mockReturnValue(createChain(sourceOrder)),
      },
    };

    await expect(
      service.validateOrderPairings({
        models,
        sourceCompanyId: 'globofast',
        targetCompanyId: 'constroad',
        orderIds: ['source-1'],
        pairings: [{ kind: 'order', sourceId: 'source-1', targetId: 'other-target' }],
      })
    ).rejects.toThrow('Pairings inválidos: 1');
  });
});
