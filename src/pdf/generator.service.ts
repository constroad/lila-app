import puppeteer, { Browser, Page } from 'puppeteer';
import Handlebars from 'handlebars';
import fs from 'fs-extra';
import path from 'path';
import { randomUUID } from 'crypto';
import logger from '../utils/logger.js';
import { PDFGenerationRequest } from '../types/index.js';
import { config } from '../config/environment.js';

export class PDFGenerator {
  private browser: Browser | null = null;
  private templatesDir: string;
  private uploadsDir: string;
  private protocolTimeout: number;
  private isInitializing = false;
  private initializePromise?: Promise<void>;

  constructor() {
    this.templatesDir = config.pdf.templatesDir;
    this.uploadsDir = config.pdf.uploadsDir;
    this.protocolTimeout =
      Number(process.env.PUPPETEER_PROTOCOL_TIMEOUT) ||
      (config.pdf as any)?.protocolTimeout ||
      180000;
  }

  async initialize(): Promise<void> {
    try {
      if (this.isInitializing && this.initializePromise) {
        await this.initializePromise;
        return;
      }
      this.isInitializing = true;
      logger.info('Initializing PDF Generator...');
      
      // Asegurar que los directorios existen
      await fs.ensureDir(this.templatesDir);
      await fs.ensureDir(this.uploadsDir);

      // Inicializar navegador
      const headlessEnv = process.env.PUPPETEER_HEADLESS;
      const headlessMode: boolean | 'new' =
        headlessEnv === 'true' ? true : headlessEnv === 'false' ? false : 'new';

      const launchBrowser = async (headless: boolean | 'new') =>
        puppeteer.launch({
          headless,
          protocolTimeout: this.protocolTimeout,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
          ],
        });

      if (headlessEnv) {
        this.browser = await launchBrowser(headlessMode);
      } else {
        try {
          this.browser = await launchBrowser(headlessMode);
        } catch (error) {
          logger.warn(
            `Puppeteer launch failed with headless=${String(headlessMode)}. Retrying with headless=true`,
            error
          );
          this.browser = await launchBrowser(true);
        }
      }

      logger.info('PDF Generator initialized');
    } catch (error) {
      logger.error('Error initializing PDF Generator:', error);
      throw error;
    } finally {
      this.isInitializing = false;
      this.initializePromise = undefined;
    }
  }

  private async ensureBrowser(): Promise<void> {
    if (this.browser && this.browser.isConnected()) {
      return;
    }
    if (!this.initializePromise) {
      this.initializePromise = this.initialize();
    }
    await this.initializePromise;
  }

  private isProtocolTimeoutError(error: any): boolean {
    const message = error?.message || '';
    return (
      error?.name === 'ProtocolError' ||
      message.includes('Target.createTarget timed out') ||
      message.includes('Protocol error')
    );
  }

  private async restartBrowser(): Promise<void> {
    try {
      if (this.browser) {
        await this.browser.close();
      }
    } catch (error) {
      logger.warn('Failed to close browser before restart', { error: String(error) });
    } finally {
      this.browser = null;
    }
    this.initializePromise = this.initialize();
    await this.initializePromise;
  }

  private async createPageWithRetry(): Promise<Page> {
    await this.ensureBrowser();
    try {
      return await this.browser!.newPage();
    } catch (error) {
      if (this.isProtocolTimeoutError(error)) {
        logger.warn('Puppeteer newPage timed out. Restarting browser...', {
          error: String(error),
        });
        await this.restartBrowser();
        return await this.browser!.newPage();
      }
      throw error;
    }
  }

  async generatePDF(request: PDFGenerationRequest): Promise<string> {
    try {
      await this.ensureBrowser();

      logger.info(`Generating PDF from template: ${request.templateId}`);

      // Cargar template
      const template = await this.loadTemplate(request.templateId);

      // Compilar y renderizar HTML
      const compiled = Handlebars.compile(template);
      const html = compiled(request.data);

      // Crear PDF
      const filename = request.filename || `pdf-${randomUUID()}.pdf`;
      const filepath = path.join(this.uploadsDir, filename);

      const page = await this.createPageWithRetry();
      page.setDefaultNavigationTimeout(this.protocolTimeout);
      page.setDefaultTimeout(this.protocolTimeout);
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: this.protocolTimeout });
      await page.pdf({
        path: filepath,
        format: 'A4',
        margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' },
        preferCSSPageSize: true,
      });
      await page.close();

      logger.info(`PDF generated: ${filepath}`);
      return filepath;
    } catch (error) {
      logger.error('Error generating PDF:', error);
      throw error;
    }
  }

  async generateFromHtml(
    html: string,
    options: {
      filename?: string;
      outputPath?: string;
      format?: 'A4' | 'Letter' | 'Legal';
      landscape?: boolean;
      margin?: { top: string; right: string; bottom: string; left: string };
    } = {}
  ): Promise<string> {
    try {
      await this.ensureBrowser();

      const filepath = options.outputPath
        ? options.outputPath
        : path.join(this.uploadsDir, options.filename || `pdf-${randomUUID()}.pdf`);

      await fs.ensureDir(path.dirname(filepath));

      const page = await this.createPageWithRetry();
      page.setDefaultNavigationTimeout(this.protocolTimeout);
      page.setDefaultTimeout(this.protocolTimeout);
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: this.protocolTimeout });
      await page.pdf({
        path: filepath,
        format: options.format || 'A4',
        landscape: Boolean(options.landscape),
        margin: options.margin || { top: '20px', right: '20px', bottom: '20px', left: '20px' },
        preferCSSPageSize: true,
      });
      await page.close();

      logger.info(`PDF generated from HTML: ${filepath}`);
      return filepath;
    } catch (error) {
      logger.error('Error generating PDF from HTML:', error);
      throw error;
    }
  }

  async createTemplate(id: string, name: string, htmlContent: string): Promise<void> {
    try {
      const filepath = path.join(this.templatesDir, `${id}.hbs`);
      await fs.ensureDir(path.dirname(filepath));
      await fs.writeFile(filepath, htmlContent, 'utf-8');

      logger.info(`Created PDF template: ${id}`);
    } catch (error) {
      logger.error('Error creating PDF template:', error);
      throw error;
    }
  }

  async loadTemplate(templateId: string): Promise<string> {
    try {
      const filepath = path.join(this.templatesDir, `${templateId}.hbs`);

      if (!(await fs.pathExists(filepath))) {
        throw new Error(`Template not found: ${templateId}`);
      }

      return await fs.readFile(filepath, 'utf-8');
    } catch (error) {
      logger.error('Error loading template:', error);
      throw error;
    }
  }

  async listTemplates(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.templatesDir);
      return files
        .filter((f) => f.endsWith('.hbs'))
        .map((f) => f.replace('.hbs', ''));
    } catch (error) {
      logger.error('Error listing templates:', error);
      return [];
    }
  }

  async deleteTemplate(templateId: string): Promise<void> {
    try {
      const filepath = path.join(this.templatesDir, `${templateId}.hbs`);
      if (await fs.pathExists(filepath)) {
        await fs.remove(filepath);
        logger.info(`Deleted template: ${templateId}`);
      }
    } catch (error) {
      logger.error('Error deleting template:', error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      logger.info('PDF Generator shut down');
    }
  }
}

export default new PDFGenerator();
