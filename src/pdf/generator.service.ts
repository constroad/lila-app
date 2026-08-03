import { linearizePdfInPlace } from '../services/pdf-linearize.service.js';
import puppeteer, { Browser, Page } from 'puppeteer';
import Handlebars from 'handlebars';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import logger from '../utils/logger.js';
import { PDFGenerationRequest } from '../types/index.js';
import { config } from '../config/environment.js';
import { createLimiter } from '../utils/concurrency.js';

// Renders concurrentes máximos (páginas de Chromium abiertas a la vez). Dos
// previews simultáneos con fotos ya saturaban la CPU de la Mac mini y los DOS
// terminaban en timeout; el resto encola FIFO (ver incidente PDF jul-2026).
const renderLimiter = createLimiter(Number(process.env.PDF_MAX_CONCURRENT_RENDERS) || 2);

// Espera acotada a que las imágenes del documento terminen de decodificar antes
// del pdf(). Con el HTML autocontenido (data URLs) esto es casi instantáneo;
// si alguna imagen quedó por URL, la espera tiene tope y NUNCA cuelga el render.
const IMAGES_READY_TIMEOUT_MS = 15_000;

/**
 * Resuelve el ejecutable de Chrome a usar por Puppeteer.
 *
 * El Chromium que Puppeteer 21 descarga por defecto (Chrome 121) se rompe tras
 * actualizaciones de macOS ("Failed to launch the browser process" / exit 133 /
 * "unexpected crash info version"). Para evitarlo preferimos el Chrome del
 * sistema (canal estable, se auto-actualiza con el OS) y, si no, el build de
 * Puppeteer más nuevo en caché — saltando explícitamente las versiones viejas
 * y rotas. Override manual con PUPPETEER_EXECUTABLE_PATH.
 */
function resolveChromeExecutable(): string | undefined {
  const candidates: string[] = [];

  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    candidates.push(process.env.PUPPETEER_EXECUTABLE_PATH);
  }

  // Chrome estable del sistema (macOS): se mantiene compatible con el OS.
  candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');

  // Builds de Puppeteer en caché, del más nuevo al más viejo, descartando los
  // anteriores a la 130 que crashean en macOS recientes.
  try {
    const cacheRoot = path.join(os.homedir(), '.cache', 'puppeteer', 'chrome');
    const builds = fs
      .readdirSync(cacheRoot)
      .map((name) => {
        const major = Number((name.match(/mac_arm-(\d+)\./) || [])[1] || 0);
        return { name, major };
      })
      .filter((b) => b.major >= 130)
      .sort((a, b) => b.major - a.major);
    for (const b of builds) {
      candidates.push(
        path.join(
          cacheRoot,
          b.name,
          'chrome-mac-arm64',
          'Google Chrome for Testing.app',
          'Contents',
          'MacOS',
          'Google Chrome for Testing'
        )
      );
    }
  } catch {
    // sin caché legible: seguimos con los demás candidatos
  }

  for (const candidate of candidates) {
    try {
      if (candidate && fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // ignorar candidato inaccesible
    }
  }

  return undefined; // último recurso: dejar que Puppeteer use su default
}

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

      const executablePath = resolveChromeExecutable();
      logger.info(
        `Puppeteer usará Chrome: ${executablePath || '(default de Puppeteer)'}`
      );

      const launchBrowser = async (headless: boolean | 'new') =>
        puppeteer.launch({
          headless,
          ...(executablePath ? { executablePath } : {}),
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

  /**
   * Espera (con tope) a que todas las <img> de la página estén decodificadas.
   * Reemplaza a `networkidle0`: mismo objetivo (no imprimir imágenes a medias)
   * sin el modo de falla de colgarse esperando quiescencia de red.
   */
  private async waitForImagesReady(page: Page): Promise<void> {
    try {
      await page.evaluate(async (timeoutMs: number) => {
        const images = Array.from(document.images);
        const allReady = Promise.all(
          images.map((img) =>
            img.complete
              ? Promise.resolve()
              : new Promise<void>((resolve) => {
                  img.addEventListener('load', () => resolve(), { once: true });
                  img.addEventListener('error', () => resolve(), { once: true });
                })
          )
        );
        await Promise.race([allReady, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
      }, IMAGES_READY_TIMEOUT_MS);
    } catch (error) {
      // Mejor imprimir con una imagen a medias que abortar el documento entero.
      logger.warn(`waitForImagesReady falló (se continúa): ${String(error)}`);
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

      return await renderLimiter.run(async () => {
        const page = await this.createPageWithRetry();
        try {
          page.setDefaultNavigationTimeout(this.protocolTimeout);
          page.setDefaultTimeout(this.protocolTimeout);
          await page.setContent(html, { waitUntil: 'load', timeout: this.protocolTimeout });
          await this.waitForImagesReady(page);
          await page.pdf({
            path: filepath,
            format: 'A4',
            margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' },
            preferCSSPageSize: true,
          });
        } finally {
          // Cerrar SIEMPRE: una page fugada queda viva en Chromium y acumula memoria.
          await page.close().catch(() => {});
        }

        // Los PDF que GENERA lila (vales, informes, cotizaciones, órdenes) salen
        // igual de "pesados de abrir" que los subidos: se linearizan acá, que es
        // el punto por el que pasan todos.
        await linearizePdfInPlace(filepath, { mimeType: 'application/pdf' });

        logger.info(`PDF generated: ${filepath}`);
        return filepath;
      });
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
      const startedAt = Date.now();
      const htmlBytes = Buffer.byteLength(html);

      return await renderLimiter.run(async () => {
        const page = await this.createPageWithRetry();
        try {
          page.setDefaultNavigationTimeout(this.protocolTimeout);
          page.setDefaultTimeout(this.protocolTimeout);
          // `load` (no `networkidle0`): el HTML llega AUTOCONTENIDO (imágenes como
          // data URLs vía inlineCanvasHtmlImages) y no hay red que esperar. Con
          // `networkidle0`, cualquier imagen que quedara sin embeber mantenía la red
          // ocupada y colgaba el setContent hasta 180s (informe IPP, jul-2026).
          // Puppeteer moderno incluso eliminó networkidle de setContent.
          await page.setContent(html, { waitUntil: 'load', timeout: this.protocolTimeout });
          await this.waitForImagesReady(page);
          await page.pdf({
            path: filepath,
            format: options.format || 'A4',
            landscape: Boolean(options.landscape),
            margin: options.margin || { top: '20px', right: '20px', bottom: '20px', left: '20px' },
            preferCSSPageSize: true,
            printBackground: true,
          });
        } finally {
          // Cerrar SIEMPRE: una page fugada queda viva en Chromium y acumula memoria.
          await page.close().catch(() => {});
        }

        await linearizePdfInPlace(filepath, { mimeType: 'application/pdf' });

        logger.info(`PDF generated from HTML: ${filepath}`, {
          htmlBytes,
          durationMs: Date.now() - startedAt,
          queuedRenders: renderLimiter.pending(),
        });
        return filepath;
      });
    } catch (error) {
      logger.error('Error generating PDF from HTML:', error);
      throw error;
    }
  }

  /**
   * Visita una vista de impresión de Portal (`/print/service-report/[id]`,
   * firmada) y extrae el HTML serializado del canvas. La página marca
   * `window.__PRINT_READY__` cuando `__CANVAS_PRINT_HTML__` está listo, o
   * `__PRINT_ERROR__` si el render falló. El HTML resultante entra al MISMO
   * pipeline que el canvas horneado (inline de imágenes + generateFromHtml).
   */
  async fetchPrintedHtml(url: string, options: { timeoutMs?: number } = {}): Promise<string> {
    await this.ensureBrowser();
    const timeout = options.timeoutMs ?? Math.min(this.protocolTimeout, 60000);
    // Dentro del limiter: es una page más de Chromium compitiendo por CPU.
    // El goto SÍ usa networkidle0 a propósito: aquí se navega una URL real de
    // Portal (Next) y hay que esperar su hidratación; el guard duro es el
    // waitForFunction de __PRINT_READY__ con timeout acotado.
    return await renderLimiter.run(async () => {
      const page = await this.createPageWithRetry();
      try {
        page.setDefaultNavigationTimeout(timeout);
        page.setDefaultTimeout(timeout);
        const response = await page.goto(url, { waitUntil: 'networkidle0', timeout });
        if (response && !response.ok()) {
          throw new Error(`print page respondió ${response.status()}`);
        }
        await page.waitForFunction(
          '(window.__PRINT_READY__ === true) || Boolean(window.__PRINT_ERROR__)',
          { timeout }
        );
        const result = await page.evaluate(() => ({
          html: (window as any).__CANVAS_PRINT_HTML__ || '',
          error: (window as any).__PRINT_ERROR__ || '',
        }));
        if (result.error) {
          throw new Error(`print page error: ${result.error}`);
        }
        if (!result.html) {
          throw new Error('print page devolvió HTML vacío');
        }
        return result.html;
      } finally {
        await page.close().catch(() => undefined);
      }
    });
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
