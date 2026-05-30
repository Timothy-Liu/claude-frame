module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
  },
  overrides: [
    {
      // Forbid core/ and webview/ from importing jetski-specific modules.
      // The export script removes src/backends/jetski/ entirely, so any such
      // import would break the public build.
      files: ['src/core/**/*.ts', 'src/webview/**/*.ts', 'src/extension.ts'],
      rules: {
        'no-restricted-imports': ['error', {
          patterns: [
            { group: ['**/backends/jetski', '**/backends/jetski/**'], message: 'core/ and webview/ must not import jetski backend (see project-leakage-redline).' },
          ],
        }],
      },
    },
  ],
  ignorePatterns: ['dist/', 'out/', 'node_modules/', 'v1/'],
};
