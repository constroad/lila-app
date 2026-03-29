import { Request, Response, NextFunction } from 'express';
import fs from 'fs-extra';
import path from 'path';
import logger from '../../utils/logger.js';
import { HTTP_STATUS } from '../../config/constants.js';
import { CustomError } from '../middlewares/errorHandler.js';
import {
  getAllSchemas,
  getSchemaByCode,
} from '../../schemas/documents/registry.js';
import { generateRandomDataForSchema } from '../../services/random-data-generator.service.js';
import { aggregateReportData, structureDataForReportType } from '../../services/report-data-aggregator.service.js';
import { getServiceReportModel } from '../../models/service-report.model.js';
import { storagePathService } from '../../services/storage-path.service.js';
import { ReportHtmlRenderer } from '../../services/report-html-renderer.service.js';
import pdfGenerator from '../../pdf/generator.service.js';
import { buildEffectiveSchema } from '../../services/schema-customization.service.js';
import { PDFMergerService } from '../../services/pdf-merger.service.js';
import { FolioGeneratorService } from '../../services/folio-generator.service.js';
import { config } from '../../config/environment.js';
import { getCompanyModel } from '../../database/models.js';
import { convertPdfToDocx } from '../../services/pdf-to-docx.service.js';

function resolveProto(req: Request): string {
  const forwarded = req.headers['x-forwarded-proto'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0];
  }
  return req.protocol;
}

function buildAbsoluteUrl(req: Request, relativeUrl: string) {
  if (!relativeUrl) return relativeUrl;
  const host = req.get('x-forwarded-host') || req.get('host');
  if (!host) return relativeUrl;
  const proto = resolveProto(req);
  return `${proto}://${host}${relativeUrl}`;
}

function isPlainObject(value: any): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mergeDeep<T extends Record<string, any>>(target: T, ...sources: Record<string, any>[]): T {
  const output = { ...target } as T;
  sources.forEach((source) => {
    if (!isPlainObject(source)) return;
    Object.keys(source).forEach((key) => {
      const value = source[key];
      if (isPlainObject(value)) {
        output[key] = mergeDeep((output[key] as Record<string, any>) || {}, value);
      } else {
        output[key] = value as any;
      }
    });
  });
  return output;
}

function resolveCompanyId(req: Request, report: any, aggregated?: any): string | null {
  const fromRequest = (req as any).companyId;
  if (fromRequest) return String(fromRequest);
  if (report?.companyId) return String(report.companyId);
  if (aggregated?.service?.companyId) return String(aggregated.service.companyId);
  if (aggregated?.service?.company?.id) return String(aggregated.service.company.id);
  return null;
}

function buildCompanyPrefix(name: string): string {
  if (!name) return '';
  const letters = name.replace(/[^A-Za-z]/g, '').toUpperCase();
  if (!letters) return '';
  return letters.slice(0, 3).padEnd(3, 'X');
}

function buildHeaderCodigo(prefix: string, reportCode: string, correlativo?: string): string {
  const base = [prefix, reportCode].filter(Boolean).join('-');
  if (!correlativo) return base;
  return `${base}-${correlativo}`;
}

function buildPdfMargin(schema: any) {
  if (!schema?.margins) return undefined;
  const { top, right, bottom, left } = schema.margins;
  return {
    top: `${top}mm`,
    right: `${right}mm`,
    bottom: `${bottom}mm`,
    left: `${left}mm`,
  };
}

function toNumber(value: any): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function toNumberOrNull(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function resolveArrayInput(source: any, data: Record<string, any>): any[] {
  if (Array.isArray(source)) return source;
  if (typeof source === 'string') {
    const resolved = getNestedValue(data, source);
    return Array.isArray(resolved) ? resolved : [];
  }
  return [];
}

function sumValues(source: any, key?: string, data?: Record<string, any>): number {
  const arr = resolveArrayInput(source, data || {});
  const values = key ? arr.map((item) => item?.[key]) : arr;
  const nums = values.map(toNumberOrNull).filter((v): v is number => v !== null);
  return nums.reduce((acc, value) => acc + value, 0);
}

function avgValues(source: any, key?: string, data?: Record<string, any>): number {
  const arr = resolveArrayInput(source, data || {});
  const values = key ? arr.map((item) => item?.[key]) : arr;
  const nums = values.map(toNumberOrNull).filter((v): v is number => v !== null);
  if (nums.length === 0) return 0;
  return nums.reduce((acc, value) => acc + value, 0) / nums.length;
}

function roundValue(value: any, decimals = 2): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  const factor = 10 ** decimals;
  return Math.round(num * factor) / factor;
}

function setNestedValue(target: Record<string, any>, path: string, value: any) {
  const parts = path.split('.');
  let current = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }
  current[parts[parts.length - 1]] = value;
}

function getNestedValue(target: Record<string, any>, path: string): any {
  const parts = path.split('.');
  let current: any = target;
  for (const key of parts) {
    if (!current || typeof current !== 'object') return undefined;
    current = current[key];
  }
  return current;
}

function evaluateFormula(
  formula: string,
  context: {
    row: Record<string, any>;
    data: Record<string, any>;
    rows: Array<Record<string, any>>;
    rowValue: (key: string, columnKey: string) => number;
  }
) {
  try {
    const fn = new Function(
      'row',
      'data',
      'rows',
      'rowValue',
      'sum',
      'avg',
      'num',
      'round',
      `with (data) { return ${formula}; }`
    );
    const result = fn(
      context.row,
      context.data,
      context.rows,
      context.rowValue,
      (source: any, key?: string) => sumValues(source, key, context.data),
      (source: any, key?: string) => avgValues(source, key, context.data),
      toNumber,
      roundValue
    );
    if (typeof result === 'number' && !Number.isFinite(result)) {
      return '';
    }
    return result ?? '';
  } catch {
    return '';
  }
}

function applyComputedFields(schema: any, data: Record<string, any>) {
  const sections = schema?.sections || [];
  sections.forEach((section: any) => {
    if (section.type !== 'dataTable' && section.type !== 'resultsTable') return;
    const rows = Array.isArray(data[section.id]) ? data[section.id] : [];
    const columns = section.columns || [];
    if (rows.length === 0 || columns.length === 0) return;

    const computedRows: Array<Record<string, any>> = [];
    rows.forEach((row: Record<string, any>) => {
      const nextRow = { ...row };
      const rowValue = (key: string, columnKey: string) => {
        const computedMatch = computedRows.find((item) => item.key === key);
        const fallback = rows.find((item: any) => item.key === key);
        return toNumber(computedMatch?.[columnKey] ?? fallback?.[columnKey]);
      };

      columns.forEach((column: any) => {
        const formula =
          nextRow?._computed?.[column.key] ||
          (column.computed && column.formula ? column.formula : null);
        if (!formula) return;
        const value = evaluateFormula(formula, {
          row: nextRow,
          data,
          rows: computedRows,
          rowValue,
        });
        nextRow[column.key] = value;
      });
      computedRows.push(nextRow);
    });

    data[section.id] = computedRows;
  });

  if (Array.isArray(schema?.computedFields)) {
    schema.computedFields.forEach((field: any) => {
      if (!field?.key || !field?.formula) return;
      const value = evaluateFormula(field.formula, {
        row: data,
        data,
        rows: [],
        rowValue: () => 0,
      });
      setNestedValue(data, field.key, value);
    });
  }
}

async function applyHeaderDefaults(
  data: Record<string, any>,
  schema: any,
  report: any,
  companyId: string
): Promise<void> {
  if (!isPlainObject(data.header)) {
    data.header = {};
  }

  const header = data.header as Record<string, any>;
  const needsCompanyName = !String(header.companyName || '').trim();
  const needsCodigo = !String(header.codigo || '').trim();
  const needsVersion = !String(header.version || '').trim();
  const needsFecha = !String(header.fecha || '').trim();
  const needsLogo = !String(header.logoUrl || '').trim();

  let companyName = '';
  let companyLogoUrl = '';
  if (needsCompanyName || needsCodigo || needsLogo) {
    try {
      const CompanyModel = await getCompanyModel();
      const company = await CompanyModel.findOne({ companyId }).lean();
      companyName = company?.name || '';
      companyLogoUrl =
        company?.branding?.logoLight ||
        company?.branding?.logoDark ||
        company?.branding?.favicon ||
        '';
    } catch {
      companyName = '';
      companyLogoUrl = '';
    }
  }

  if (needsCompanyName && companyName) {
    header.companyName = companyName;
  }

  if (!String(header.logoUrl || '').trim() && companyLogoUrl) {
    header.logoUrl = companyLogoUrl;
  }

  if (needsCodigo) {
    const prefixSource = companyName || String(header.companyName || '');
    let prefix = buildCompanyPrefix(prefixSource);
    const reportCode = schema?.code || report?.type || '';
    if (!prefix && reportCode) {
      prefix = 'XXX';
    }
    const correlativo = String(header.correlativo || '').trim();
    header.codigo = buildHeaderCodigo(prefix, reportCode, correlativo);
  }

  if (needsVersion && schema?.version) {
    header.version = schema.version;
  }

  if (needsFecha) {
    const candidateDates = [
      typeof report?.date === 'string' && report.date.trim() ? report.date : '',
      typeof data?.control?.fecha === 'string' ? data.control.fecha : '',
      typeof data?.acta?.fecha === 'string' ? data.acta.fecha : '',
      typeof data?.proyecto?.fecha === 'string' ? data.proyecto.fecha : '',
      typeof (data as any)?.areaAdicional?.fecha === 'string' ? (data as any).areaAdicional.fecha : '',
      typeof (data as any)?.tasa?.fecha === 'string' ? (data as any).tasa.fecha : '',
      typeof (data as any)?.fecha === 'string' ? (data as any).fecha : '',
    ].filter(Boolean);
    if (candidateDates.length > 0) {
      header.fecha = candidateDates[0];
    }
  }
}

type ReportPayload = {
  type: string;
  serviceManagementId?: string;
  schemaData?: Record<string, any>;
  draftData?: {
    schemaData?: Record<string, any>;
    schemaOverrides?: Record<string, any>;
    customSections?: Array<Record<string, any>>;
    annexes?: Array<Record<string, any>>;
    folioConfig?: Record<string, any>;
  };
  schemaOverrides?: Record<string, any>;
  customSections?: Array<Record<string, any>>;
  annexes?: Array<Record<string, any>>;
  folioConfig?: Record<string, any>;
  companyId?: string;
};

type DocumentContext = {
  report: any;
  schema: any;
  data: Record<string, any>;
  companyId: string;
  schemaOverrides: Record<string, any>;
  customSections: Array<Record<string, any>>;
  annexes: Array<Record<string, any>>;
  folioConfig: Record<string, any>;
  isTransient: boolean;
};

async function resolveDocumentContext(req: Request): Promise<DocumentContext> {
  const { reportId, reportPayload } = req.body || {};

  let report: any = null;
  let isTransient = false;

  if (reportId) {
    const ServiceReport = await getServiceReportModel();
    report = await ServiceReport.findById(reportId);
  }

  if (!report && reportPayload) {
    report = reportPayload as ReportPayload;
    isTransient = true;
  }

  if (!report) {
    const err: CustomError = new Error('Report not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  const reportType = report.type || reportPayload?.type;
  if (!reportType) {
    const err: CustomError = new Error('Missing required field: type');
    err.statusCode = HTTP_STATUS.BAD_REQUEST;
    throw err;
  }

  const schema = getSchemaByCode(reportType);
  if (!schema) {
    const err: CustomError = new Error('Schema not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  let aggregated: any = null;
  const payloadSchemaData = reportPayload?.schemaData;
  let baseData: Record<string, any> =
    (payloadSchemaData && Object.keys(payloadSchemaData).length > 0
      ? payloadSchemaData
      : null) ||
    report.schemaData ||
    report.draftData?.schemaData ||
    {};

  if (!baseData || Object.keys(baseData).length === 0) {
    const serviceId = report.serviceManagementId || reportPayload?.serviceManagementId;
    if (serviceId) {
      aggregated = await aggregateReportData(serviceId);
      baseData = structureDataForReportType(reportType, aggregated);
    }
  }

  const schemaOverrides =
    reportPayload?.schemaOverrides ||
    report.schemaOverrides ||
    report.draftData?.schemaOverrides ||
    {};
  const customSections =
    reportPayload?.customSections ||
    report.customSections ||
    report.draftData?.customSections ||
    [];
  const annexes =
    reportPayload?.annexes ||
    report.annexes ||
    report.draftData?.annexes ||
    [];
  const folioConfig =
    reportPayload?.folioConfig ||
    report.folioConfig ||
    report.draftData?.folioConfig || {
      enabled: true,
      format: 'Folio {current}/{total}',
      position: 'footer-right',
      startNumber: 1,
      fontSize: 10,
      includeAnnexes: true,
    };

  const companyId =
    resolveCompanyId(req, report, aggregated) ||
    (req as any).companyId ||
    reportPayload?.companyId;
  if (!companyId) {
    const err: CustomError = new Error('Company ID is required to generate document');
    err.statusCode = HTTP_STATUS.BAD_REQUEST;
    throw err;
  }

  const data = mergeDeep({}, schema.defaultData || {}, baseData || {});
  await applyHeaderDefaults(data, schema, report, companyId);
  applyComputedFields(schema, data);

  return {
    report,
    schema,
    data,
    companyId,
    schemaOverrides,
    customSections,
    annexes,
    folioConfig,
    isTransient,
  };
}

export async function getSchemas(req: Request, res: Response, next: NextFunction) {
  try {
    const schemas = getAllSchemas();
    logger.info('documents.schemas.list', { count: schemas.length });
    res.status(HTTP_STATUS.OK).json({ success: true, data: schemas });
  } catch (error) {
    logger.error('documents.schemas.list_failed', { error });
    next(error);
  }
}

export async function getSchema(req: Request, res: Response, next: NextFunction) {
  try {
    const { code } = req.params;
    const schema = getSchemaByCode(code);

    if (!schema) {
      logger.warn('documents.schemas.not_found', { code });
      const err: CustomError = new Error('Schema not found');
      err.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(err);
    }

    res.status(HTTP_STATUS.OK).json({ success: true, data: schema });
  } catch (error) {
    logger.error('documents.schemas.get_failed', { error });
    next(error);
  }
}

export async function generateRandomData(req: Request, res: Response, next: NextFunction) {
  try {
    const { code } = req.body;
    if (!code) {
      const err: CustomError = new Error('Missing required field: code');
      err.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(err);
    }

    const schema = getSchemaByCode(code);
    if (!schema) {
      logger.warn('documents.random_data.schema_not_found', { code });
      const err: CustomError = new Error('Schema not found');
      err.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(err);
    }

    const data = generateRandomDataForSchema(schema);
    logger.info('documents.random_data.generated', { code });
    res.status(HTTP_STATUS.OK).json({ success: true, data });
  } catch (error) {
    logger.error('documents.random_data.failed', { error });
    next(error);
  }
}

export async function getReportData(req: Request, res: Response, next: NextFunction) {
  try {
    const { serviceId, type } = req.params;
    const startedAt = Date.now();
    const aggregated = await aggregateReportData(serviceId);
    const data = structureDataForReportType(type, aggregated);
    const schema = getSchemaByCode(type);
    const companyId = (req as any).companyId || aggregated?.service?.companyId;
    if (schema && companyId) {
      await applyHeaderDefaults(data, schema, { type }, companyId);
    }

    logger.info('documents.report_data.generated', {
      serviceId,
      type,
      durationMs: Date.now() - startedAt,
    });
    res.status(HTTP_STATUS.OK).json({ success: true, data, meta: aggregated });
  } catch (error) {
    logger.error('documents.report_data.failed', { error });
    next(error);
  }
}

export async function generateDocument(req: Request, res: Response, next: NextFunction) {
  const startedAt = Date.now();
  try {
    const { format } = req.body || {};
    const requestedFormat = typeof format === 'string' ? format : 'pdf';
    const normalizedFormat = requestedFormat === 'word' ? 'docx' : requestedFormat;
    const generateDocx = normalizedFormat === 'both' || normalizedFormat === 'docx';
    const generatePdf = normalizedFormat === 'both' || normalizedFormat === 'pdf' || normalizedFormat === 'docx';

    if (!generateDocx && !generatePdf) {
      const err: CustomError = new Error('Invalid format');
      err.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(err);
    }

    const {
      report,
      schema,
      data,
      companyId,
      schemaOverrides,
      customSections,
      annexes,
      folioConfig,
      isTransient,
    } = await resolveDocumentContext(req);

    const effectiveSchema = buildEffectiveSchema(schema, schemaOverrides, customSections);

    await storagePathService.ensureCompanyStructure(companyId);

    const reportsDir = storagePathService.getModulePath(
      companyId,
      'service',
      path.join('reports', report.serviceManagementId || 'generic')
    );
    await fs.ensureDir(reportsDir);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseFilename = `${report.type}-${timestamp}`;

    let docxUrl: string | undefined;
    let pdfUrl: string | undefined;
    let docxDuration: number | undefined;
    let pdfDuration: number | undefined;
    let mainPages: number | undefined;
    let annexPages: number | undefined;
    let totalPages: number | undefined;
    let pdfSizeBytes: number | undefined;
    let docxSizeBytes: number | undefined;

    if (generatePdf) {
      const pdfFilename = `${baseFilename}.pdf`;
      const pdfPath = path.join(reportsDir, pdfFilename);
      const pdfStarted = Date.now();
      const baseUrl = buildAbsoluteUrl(req, '');
      const htmlRenderer = new ReportHtmlRenderer(effectiveSchema, data, { companyId, baseUrl });
      const html = await htmlRenderer.render();
      await pdfGenerator.generateFromHtml(html, {
        outputPath: pdfPath,
        format: effectiveSchema.pageSize || 'A4',
        landscape: effectiveSchema.orientation === 'landscape',
        margin: buildPdfMargin(effectiveSchema),
      });
      pdfDuration = Date.now() - pdfStarted;

      let currentPdfPath = pdfPath;
      mainPages = await PDFMergerService.getPageCount(pdfPath);
      annexPages = 0;
      totalPages = mainPages;

      if (annexes.length > 0) {
        const mergedPath = path.join(reportsDir, `${baseFilename}-merged.pdf`);
        const mergeResult = await PDFMergerService.mergePDFWithAnnexes(
          pdfPath,
          annexes,
          mergedPath,
          companyId
        );
        currentPdfPath = mergedPath;
        mainPages = mergeResult.mainPages;
        annexPages = mergeResult.annexPages;
        totalPages = mergeResult.totalPages;
      }

      if (folioConfig?.enabled) {
        const folioPath = path.join(reportsDir, `${baseFilename}-folio.pdf`);
        const limitPages = folioConfig.includeAnnexes ? undefined : mainPages;
        await FolioGeneratorService.addFolios(
          currentPdfPath,
          folioConfig,
          folioPath,
          { limitPages }
        );
        currentPdfPath = folioPath;
      }

      if (currentPdfPath !== pdfPath) {
        await fs.copyFile(currentPdfPath, pdfPath);
        await fs.remove(currentPdfPath);
      }

      pdfUrl = `/files/companies/${companyId}/${path.posix.join(
        'service',
        'reports',
        report.serviceManagementId || 'generic',
        pdfFilename
      )}`;
      try {
        const stats = await fs.stat(pdfPath);
        pdfSizeBytes = stats.size;
      } catch (error) {
        logger.warn('Failed to read generated PDF size', { error: String(error), pdfPath });
      }

      if (generateDocx) {
        const docxFilename = `${baseFilename}.docx`;
        const docxPath = path.join(reportsDir, docxFilename);
        const docxStarted = Date.now();
        await convertPdfToDocx(pdfPath, docxPath);
        docxDuration = Date.now() - docxStarted;
        docxUrl = `/files/companies/${companyId}/${path.posix.join(
          'service',
          'reports',
          report.serviceManagementId || 'generic',
          docxFilename
        )}`;
        try {
          const stats = await fs.stat(docxPath);
          docxSizeBytes = stats.size;
        } catch (error) {
          logger.warn('Failed to read generated DOCX size', { error: String(error), docxPath });
        }
      }
    }

    if (!isTransient && report && typeof report.save === 'function') {
      const existingGenerated = report.generatedDocuments || {};
      report.generatedDocuments = {
        ...existingGenerated,
        ...(docxUrl ? { docxUrl } : {}),
        ...(pdfUrl ? { pdfUrl } : {}),
        generatedAt: new Date().toISOString(),
        ...(typeof totalPages === 'number' ? { totalPages } : {}),
        ...(typeof mainPages === 'number' ? { mainPages } : {}),
        ...(typeof annexPages === 'number' ? { annexPages } : {}),
      };
      report.schemaOverrides = schemaOverrides;
      report.customSections = customSections;
      report.annexes = annexes;
      report.folioConfig = folioConfig;
      report.status = 'completed';
      await report.save();
    }

    logger.info('documents.generate.completed', {
      reportId: report?._id || req.body?.reportId,
      type: report.type,
      companyId,
      serviceId: report.serviceManagementId,
      durationMs: Date.now() - startedAt,
      docxDurationMs: docxDuration,
      pdfDurationMs: pdfDuration,
      mainPages,
      annexPages,
      totalPages,
    });
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        reportId: report?._id || req.body?.reportId,
        status: 'generated',
        ...(docxUrl ? { docxUrl, docxUrlAbsolute: buildAbsoluteUrl(req, docxUrl) } : {}),
        ...(pdfUrl ? { pdfUrl, pdfUrlAbsolute: buildAbsoluteUrl(req, pdfUrl) } : {}),
        ...(typeof pdfSizeBytes === 'number' ? { pdfSizeBytes } : {}),
        ...(typeof docxSizeBytes === 'number' ? { docxSizeBytes } : {}),
        ...(typeof totalPages === 'number' ? { totalPages } : {}),
        ...(typeof mainPages === 'number' ? { mainPages } : {}),
        ...(typeof annexPages === 'number' ? { annexPages } : {}),
      },
    });
  } catch (error) {
    logger.error('documents.generate.failed', { error, durationMs: Date.now() - startedAt });
    next(error);
  }
}

export async function previewDocument(req: Request, res: Response, next: NextFunction) {
  const startedAt = Date.now();
  try {
    const {
      report,
      schema,
      data,
      companyId,
      schemaOverrides,
      customSections,
      annexes,
      folioConfig,
    } = await resolveDocumentContext(req);

    const effectiveSchema = buildEffectiveSchema(schema, schemaOverrides, customSections);
    await fs.ensureDir(config.pdf.tempDir);

    const baseUrl = buildAbsoluteUrl(req, '');
    const htmlRenderer = new ReportHtmlRenderer(effectiveSchema, data, { companyId, baseUrl });
    const html = await htmlRenderer.render();

    const previewId = `${report.type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const previewFilename = `${previewId}.pdf`;
    const previewPath = path.join(config.pdf.tempDir, previewFilename);

    await pdfGenerator.generateFromHtml(html, {
      outputPath: previewPath,
      format: effectiveSchema.pageSize || 'A4',
      landscape: effectiveSchema.orientation === 'landscape',
      margin: buildPdfMargin(effectiveSchema),
    });

    let currentPdfPath = previewPath;
    let mainPages = await PDFMergerService.getPageCount(previewPath);
    let annexPages = 0;
    let totalPages = mainPages;

    if (annexes.length > 0) {
      const mergedPath = path.join(config.pdf.tempDir, `${previewId}-merged.pdf`);
      const mergeResult = await PDFMergerService.mergePDFWithAnnexes(
        previewPath,
        annexes,
        mergedPath,
        companyId
      );
      currentPdfPath = mergedPath;
      mainPages = mergeResult.mainPages;
      annexPages = mergeResult.annexPages;
      totalPages = mergeResult.totalPages;
    }

    if (folioConfig?.enabled) {
      const folioPath = path.join(config.pdf.tempDir, `${previewId}-folio.pdf`);
      const limitPages = folioConfig.includeAnnexes ? undefined : mainPages;
      await FolioGeneratorService.addFolios(
        currentPdfPath,
        folioConfig,
        folioPath,
        { limitPages }
      );
      currentPdfPath = folioPath;
    }

    if (currentPdfPath !== previewPath) {
      await fs.copyFile(currentPdfPath, previewPath);
      await fs.remove(currentPdfPath);
    }

    const previewUrl = path.posix.join(config.pdf.tempPublicBaseUrl, previewFilename);
    const stat = await fs.stat(previewPath);

    logger.info('documents.preview.completed', {
      reportId: report?._id,
      type: report.type,
      companyId,
      durationMs: Date.now() - startedAt,
      totalPages,
      mainPages,
      annexPages,
      sizeBytes: stat.size,
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        previewUrl,
        previewUrlAbsolute: buildAbsoluteUrl(req, previewUrl),
        totalPages,
        mainPages,
        annexPages,
        sizeBytes: stat.size,
      },
    });
  } catch (error) {
    logger.error('documents.preview.failed', { error, durationMs: Date.now() - startedAt });
    next(error);
  }
}

export async function getDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const ServiceReport = await getServiceReportModel();
    const report = await ServiceReport.findById(id).lean();

    if (!report) {
      const err: CustomError = new Error('Document not found');
      err.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(err);
    }

    res.status(HTTP_STATUS.OK).json({ success: true, data: report });
  } catch (error) {
    next(error);
  }
}

export async function downloadDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { format = 'pdf' } = req.query;
    const normalizedFormat =
      typeof format === 'string' && format.toLowerCase() === 'word' ? 'docx' : format;

    const ServiceReport = await getServiceReportModel();
    const report = await ServiceReport.findById(id).lean();

    if (!report?.generatedDocuments) {
      logger.warn('documents.download.not_generated', { reportId: id, format });
      const err: CustomError = new Error('Document not generated');
      err.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(err);
    }

    const url =
      normalizedFormat === 'pdf'
        ? report.generatedDocuments.pdfUrl
        : report.generatedDocuments.docxUrl;
    if (!url) {
      logger.warn('documents.download.file_missing', { reportId: id, format });
      const err: CustomError = new Error('Document file not available');
      err.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(err);
    }

    logger.info('documents.download.url', { reportId: id, format });
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        url,
        urlAbsolute: buildAbsoluteUrl(req, url),
      },
    });
  } catch (error) {
    logger.error('documents.download.failed', { error });
    next(error);
  }
}
