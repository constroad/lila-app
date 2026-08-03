import { shouldLinearize } from './pdf-linearize.helpers.js';

describe('qué archivos se linearizan', () => {
  // Linearizar reordena el PDF para que un visor pueda pintar la página 1 con
  // los primeros KB, sin bajar el archivo entero ("Fast Web View").
  it('un PDF sí, por mime o por extensión', () => {
    expect(shouldLinearize({ fileName: 'cv.pdf', mimeType: 'application/pdf' })).toBe(true);
    expect(shouldLinearize({ fileName: 'CV.PDF' })).toBe(true);
    expect(shouldLinearize({ fileName: 'sin-extension', mimeType: 'application/pdf' })).toBe(true);
  });

  it('cualquier otra cosa NO se toca', () => {
    // Pasarle un JPG a qpdf lo rompería: solo entiende PDF.
    expect(shouldLinearize({ fileName: 'foto.jpg', mimeType: 'image/jpeg' })).toBe(false);
    expect(shouldLinearize({ fileName: 'obra.mp4', mimeType: 'video/mp4' })).toBe(false);
    expect(shouldLinearize({ fileName: 'planilla.xlsx' })).toBe(false);
    expect(shouldLinearize({ fileName: '' })).toBe(false);
  });
});
