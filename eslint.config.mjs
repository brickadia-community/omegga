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
    // build artifacts and vendored/template code
    ignores: [
      'dist/**',
      'public/**',
      'templates/**',
      'plugins/**',
      'tools/**',
      'frontend/dist/**',
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
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // the codebase intentionally uses `any` at dynamic boundaries (plugin
      // rpc payloads, log matchers); surface them without failing the lint
      '@typescript-eslint/no-explicit-any': 'warn',
      // `catch (e) { /* ignored */ }` is a common idiom around console io
      'no-empty': ['error', { allowEmptyCatch: true }],
      // only require const when every destructured binding is never reassigned
      'prefer-const': ['error', { destructuring: 'all' }],
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
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
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
