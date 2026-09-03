import js from '@eslint/js';
import PluginTypescript from '@typescript-eslint/eslint-plugin';
import ParserTypescriptEslint from '@typescript-eslint/parser';
import ConfigPrettier from 'eslint-config-prettier';
import PluginPrettier from 'eslint-plugin-prettier';
import PluginReact from 'eslint-plugin-react';
import PluginReactHooks from 'eslint-plugin-react-hooks';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import path from 'node:path';

// flatten the typescript-eslint recommended preset (an array of flat configs)
// into a single rules object so it can be scoped to our own files globs
const tsRecommendedRules = PluginTypescript.configs['flat/recommended'].reduce(
  (rules, config) => ({ ...rules, ...config.rules }),
  {},
);

export default defineConfig([
  {
    // build artifacts and vendored/template/generated code
    ignores: [
      'dist/**',
      'public/**',
      'templates/**',
      'plugins/**',
      'tools/**',
      'frontend/dist/**',
      // mdbook output; its bundled vendor js carries its own lint directives
      'book/**',
    ],
  },

  // backend/server code
  {
    files: ['src/**/*.ts', 'src/**/*.d.ts'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
      parser: ParserTypescriptEslint,
    },
    plugins: {
      '@typescript-eslint': PluginTypescript,
      prettier: PluginPrettier,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tsRecommendedRules,
      // turn off stylistic rules that conflict with prettier
      ...ConfigPrettier.rules,
      'prettier/prettier': 'error',

      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // `any` is down to the two places that cannot be typed without changing
      // behaviour (see MockEventListener in src/plugin.ts and the player method
      // dispatch in plugin_jsonrpc_stdio.ts), both commented at the site. This
      // stays a warning rather than an error so those two do not need inline
      // disables; a new one still shows up in `npm run lint`
      '@typescript-eslint/no-explicit-any': 'warn',
      // `catch (e) { /* ignored */ }` is a common idiom around console io
      'no-empty': ['error', { allowEmptyCatch: true }],
      // path references pull ambient module declarations into entry-driven
      // compilations (dts-bundle-generator) that never see the tsconfig globs
      '@typescript-eslint/triple-slash-reference': [
        'error',
        { types: 'prefer-import', path: 'always', lib: 'always' },
      ],
      // only require const when every destructured binding is never reassigned
      'prefer-const': ['error', { destructuring: 'all' }],
      // `smart` still allows `x == null`, which the codebase uses to mean
      // "null or undefined"
      eqeqeq: ['error', 'smart'],
      'object-shorthand': ['error', 'properties'],
      '@typescript-eslint/no-inferrable-types': 'error',
    },
  },

  // frontend code
  {
    files: [
      'frontend/src/**/*.ts',
      'frontend/src/**/*.tsx',
      'frontend/src/**/*.js',
      'frontend/src/**/*.jsx',
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
      parser: ParserTypescriptEslint,
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: path.join(import.meta.dirname, 'frontend'),
      },
    },
    plugins: {
      react: PluginReact,
      reactHooks: PluginReactHooks,
      typescript: PluginTypescript,
      prettier: PluginPrettier,
    },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'prettier/prettier': 'error',
      'typescript/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
]);
