import PluginTypescript from '@typescript-eslint/eslint-plugin';
import ParserTypescriptEslint from '@typescript-eslint/parser';
import PluginPrettier from 'eslint-plugin-prettier';
import PluginReact from 'eslint-plugin-react';
import PluginReactHooks from 'eslint-plugin-react-hooks';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import path from 'node:path';

export default defineConfig({
  files: [
    'frontend/src**/*.ts',
    'frontend/src**/*.tsx',
    'frontend/src**/*.js',
    'frontend/src**/*.jsx',
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
});
