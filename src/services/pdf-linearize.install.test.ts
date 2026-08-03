import { buildQpdfInstallHint } from './pdf-linearize.helpers.js';

describe('cómo instalar el binario qpdf', () => {
  // El aviso decía "instalar el binario qpdf" y nada más: quien lo lee al mover
  // lila a otra máquina tiene que salir a buscar el comando (José, 03/08/2026).
  it('en macOS da el comando de brew', () => {
    expect(buildQpdfInstallHint('darwin')).toBe('brew install qpdf');
  });

  it('en Linux da apt y la alternativa de Alpine', () => {
    const hint = buildQpdfInstallHint('linux');

    expect(hint).toContain('apt-get install -y qpdf');
    expect(hint).toContain('apk add qpdf');
  });

  it('en una plataforma desconocida no deja al lector sin nada', () => {
    expect(buildQpdfInstallHint('win32')).toContain('qpdf.sourceforge.io');
  });
});
