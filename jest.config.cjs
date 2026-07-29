const fs = require('fs');
const path = require('path');

/**
 * El repo es ESM (`"type": "module"`), pero conviven DOS estilos de test:
 *
 *  - ESM real: los que usan `jest.unstable_mockModule` (única forma de mockear módulos
 *    ESM). Necesitan `extensionsToTreatAsEsm` + `NODE_OPTIONS=--experimental-vm-modules`
 *    (ver script `test` en package.json). Sin esa flag Jest cae a CJS y todo lo que
 *    importe `config/environment.ts` explota con "Cannot use 'import.meta' outside a
 *    module".
 *  - CJS clásico: los que usan `jest.mock()` + `require()` y los globals inyectados
 *    (`jest`, `require`). En modo ESM, Jest NO inyecta globals y esos tests fallan con
 *    "jest is not defined".
 *
 * Forzar un solo modo rompe una de las dos familias, así que se separan en `projects`.
 * El reparto se calcula leyendo los archivos —no hay lista hardcodeada que mantener—:
 * un test nuevo que use `unstable_mockModule` entra solo al proyecto ESM.
 */
const TEST_SUFFIX = '.test.ts';

function collectTests(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      collectTests(full, out);
    } else if (entry.name.endsWith(TEST_SUFFIX)) {
      out.push(full);
    }
  }
  return out;
}

const allTests = collectTests(path.join(__dirname, 'src'));

/**
 * ESM es el modo por DEFECTO (es lo que el repo es realmente): cualquier test que importe,
 * aunque sea transitivamente, un módulo con `import.meta` —p.ej. `config/environment.ts`—
 * solo funciona ahí. Se manda a CJS únicamente lo que depende de los globals que Jest
 * inyecta en CJS y no en ESM (`jest`, `require`); importar `@jest/globals` es la señal
 * inequívoca de que un test ya no los necesita.
 */
const needsCjs = (file) => {
  const src = fs.readFileSync(file, 'utf8');
  if (src.includes('@jest/globals')) return false;
  return /\brequire\s*\(/.test(src) || /\bjest\./.test(src);
};
const cjsTests = allTests.filter(needsCjs);
const esmTests = allTests.filter((f) => !needsCjs(f));

const baseTsconfig = {
  target: 'ES2020',
  moduleResolution: 'node',
  esModuleInterop: true,
  resolveJsonModule: true,
  skipLibCheck: true,
};

// '../foo.js' → '../foo': el source usa extensiones .js (obligatorio en ESM) pero los
// archivos en disco son .ts.
const moduleNameMapper = { '^(\\.{1,2}/.*)\\.js$': '$1' };

/** Un proyecto sin tests haría fallar a Jest ("no tests found"), así que se omite. */
const projects = [];

if (esmTests.length > 0) {
  projects.push({
    displayName: 'esm',
    testEnvironment: 'node',
    testMatch: esmTests,
    extensionsToTreatAsEsm: ['.ts'],
    moduleNameMapper,
    transform: {
      '^.+\\.ts$': [
        'ts-jest',
        { useESM: true, tsconfig: { ...baseTsconfig, module: 'ES2020' }, diagnostics: false },
      ],
    },
  });
}

if (cjsTests.length > 0) {
  projects.push({
    displayName: 'cjs',
    testEnvironment: 'node',
    testMatch: cjsTests,
    moduleNameMapper,
    transform: {
      '^.+\\.ts$': [
        'ts-jest',
        { useESM: false, tsconfig: { ...baseTsconfig, module: 'CommonJS' }, diagnostics: false },
      ],
    },
  });
}

module.exports = { projects };
