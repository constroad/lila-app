module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  env: {
    es2020: true,
    node: true,
  },
  ignorePatterns: ['dist/', 'node_modules/'],
  extends: ['eslint:recommended'],
  rules: {
    'no-control-regex': 'off',
    'no-empty': 'off',
    'no-undef': 'off',
    'no-unreachable': 'off',
    'no-unused-vars': 'off',
  },
  overrides: [
    {
      files: ['**/*.test.ts'],
      env: {
        jest: true,
        node: true,
      },
    },
  ],
};
