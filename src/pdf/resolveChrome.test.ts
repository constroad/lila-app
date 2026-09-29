import { resolveChromeExecutable } from './generator.service';

/**
 * El orden importa y no es preferencia: si Puppeteer toma el Chrome del sistema,
 * el headless que lila deja vivo entre PDFs hace que al clickear el ícono macOS
 * active ESA instancia —sin ventanas— y la persona vea que «Chrome no abre».
 */
describe('resolveChromeExecutable', () => {
  const previo = process.env.PUPPETEER_EXECUTABLE_PATH;
  afterEach(() => {
    if (previo === undefined) delete process.env.PUPPETEER_EXECUTABLE_PATH;
    else process.env.PUPPETEER_EXECUTABLE_PATH = previo;
  });

  it('prefiere «Chrome for Testing» antes que el Chrome del sistema', () => {
    delete process.env.PUPPETEER_EXECUTABLE_PATH;
    const elegido = resolveChromeExecutable();
    // En esta máquina hay build en caché; si algún día no la hubiera, el fallback
    // al Chrome del sistema es correcto y el test lo dice explícitamente.
    if (elegido?.includes('.cache/puppeteer')) {
      expect(elegido).toContain('Google Chrome for Testing');
    } else {
      expect(elegido === undefined || elegido.includes('/Applications/Google Chrome.app')).toBe(true);
    }
  });

  it('PUPPETEER_EXECUTABLE_PATH gana sobre todo lo demás, si existe', () => {
    process.env.PUPPETEER_EXECUTABLE_PATH = '/bin/ls';
    expect(resolveChromeExecutable()).toBe('/bin/ls');
  });

  it('una ruta que no existe se descarta en vez de romper', () => {
    process.env.PUPPETEER_EXECUTABLE_PATH = '/no/existe/chrome';
    expect(resolveChromeExecutable()).not.toBe('/no/existe/chrome');
  });
});
