import puppeteer, { Browser } from 'puppeteer';
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

  constructor() {
    this.templatesDir = config.pdf.templatesDir;
    this.uploadsDir = config.pdf.uploadsDir;
  }

  async initialize(): Promise<void> {
    try {
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
    }
  }

  async generatePDF(request: PDFGenerationRequest): Promise<string> {
    try {
      if (!this.browser) {
        throw new Error('PDF Generator not initialized');
      }

      logger.info(`Generating PDF from template: ${request.templateId}`);

      // Cargar template
      const template = await this.loadTemplate(request.templateId);

      // Compilar y renderizar HTML
      const compiled = Handlebars.compile(template);
      const html = compiled(request.data);

      // Crear PDF
      const filename = request.filename || `pdf-${randomUUID()}.pdf`;
      const filepath = path.join(this.uploadsDir, filename);

      const page = await this.browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      await page.pdf({
        path: filepath,
        format: 'A4',
        margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' },
      });
      await page.close();

      logger.info(`PDF generated: ${filepath}`);
      return filepath;
    } catch (error) {
      logger.error('Error generating PDF:', error);
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
