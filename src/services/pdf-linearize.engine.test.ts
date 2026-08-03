import { WASM_MAX_BYTES, resolveLinearizeEngine } from './pdf-linearize.helpers.js';

const MB = 1024 * 1024;

describe('qué motor lineariza cada PDF', () => {
  // El WASM viaja en node_modules (funciona en cualquier máquina) pero trabaja
  // en memoria. El binario nativo usa acceso aleatorio a disco y aguanta
  // archivos enormes, pero hay que instalarlo. Se combinan.
  it('un PDF normal usa el WASM, aunque haya binario nativo', () => {
    expect(resolveLinearizeEngine({ bytes: 3 * MB, nativeAvailable: true })).toBe('wasm');
    expect(resolveLinearizeEngine({ bytes: 3 * MB, nativeAvailable: false })).toBe('wasm');
  });

  it('uno grande usa el nativo, que no lo carga en RAM', () => {
    // tus permite subir hasta 2 GB al drive: con WASM eso volteaba el proceso.
    expect(resolveLinearizeEngine({ bytes: 900 * MB, nativeAvailable: true })).toBe('native');
  });

  it('uno grande SIN binario nativo se saltea, no se arriesga la RAM', () => {
    expect(resolveLinearizeEngine({ bytes: 900 * MB, nativeAvailable: false })).toBe('skip');
  });

  it('justo en el límite del WASM todavía es WASM', () => {
    expect(resolveLinearizeEngine({ bytes: WASM_MAX_BYTES, nativeAvailable: false })).toBe('wasm');
    expect(resolveLinearizeEngine({ bytes: WASM_MAX_BYTES + 1, nativeAvailable: false })).toBe(
      'skip'
    );
  });

  it('un archivo vacío o ilegible no se procesa', () => {
    expect(resolveLinearizeEngine({ bytes: 0, nativeAvailable: true })).toBe('skip');
  });
});
