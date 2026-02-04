module.exports = {
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}\/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'ES2020',
          target: 'ES2020',
          moduleResolution: 'node',
          esModuleInterop: true,
          resolveJsonModule: true,
          skipLibCheck: true,
        },
        diagnostics: false,
      },
    ],
  },
  testMatch: ['**/?(*.)+(test).ts'],
};
