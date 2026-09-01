#!/usr/bin/env node
// Renders docs/api/*.md from the plugin-facing type declarations.
//
//   npm run docs:api           write the pages
//   npm run docs:api -- --check  fail if the committed pages are stale
//
// Only the JSDoc already on the declarations is used, so the way to improve a
// page is to improve the comment in src/.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'docs', 'api');

const SOURCES = ['src/plugin.ts', 'src/omegga/types.ts'];

/** Declarations that belong on each page, in the order they are rendered. */
const PAGES = [
  {
    file: 'omegga.md',
    title: 'Omegga API',
    intro: `The \`Omegga\` global (and the \`omegga\` passed to a plugin constructor)
implements \`OmeggaLike\`. It is an event emitter, so everything in
[Events](events.md) is available on it too.`,
    names: ['OmeggaLike', 'OmeggaCore', 'InjectedCommands', 'LogWrangling'],
  },
  {
    file: 'player.md',
    title: 'Player API',
    intro: `\`Omegga.getPlayer(target)\` returns an \`OmeggaPlayer\`. The same methods are
available as statics on the \`Player\` global when all you have is a uuid.`,
    names: ['OmeggaPlayer', 'StaticPlayer'],
  },
  {
    file: 'plugin.md',
    title: 'Plugin API',
    intro: `What a plugin class implements, and the \`config\`, \`store\`, and \`metrics\`
handed to its constructor.`,
    names: [
      'OmeggaPlugin',
      'PluginStore',
      'PluginConfig',
      'PluginMetrics',
      'PluginMetricOptions',
      'MetricCounter',
      'MetricGauge',
      'MetricHistogram',
      'PluginMetricLabels',
      'PluginInterop',
    ],
  },
  {
    file: 'types.md',
    title: 'Types',
    intro: `Supporting types returned by the [Omegga](omegga.md) and
[Player](player.md) APIs.`,
    names: [
      'IServerStatus',
      'IGamemode',
      'ILogMinigame',
      'IMinigameList',
      'IPlayerPositions',
      'BrickBounds',
      'BrickInteraction',
      'AutoRestartConfig',
      'WeaponClass',
      'IPluginConfigDefinition',
      'IPluginCommand',
      'IPluginCommandArgument',
      'IPluginDocumentation',
      'IMatcher',
      'IWatcher',
      'WatcherPattern',
    ],
  },
];

// ---------------------------------------------------------------- parsing

/** name -> { node, source } for every exported declaration we can render */
function collectDeclarations() {
  const decls = new Map();
  for (const rel of SOURCES) {
    const path = join(root, rel);
    const source = ts.createSourceFile(
      path,
      readFileSync(path, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    for (const node of source.statements) {
      if (
        !ts.isInterfaceDeclaration(node) &&
        !ts.isTypeAliasDeclaration(node) &&
        !ts.isClassDeclaration(node)
      )
        continue;
      if (!node.name) continue;
      decls.set(node.name.text, { node, source, file: rel });
    }
  }
  return decls;
}

function jsDocOf(node) {
  // `jsDoc` is only populated when the source was parsed with parent nodes
  const blocks = node.jsDoc ?? [];
  return blocks[blocks.length - 1];
}

function descriptionOf(node) {
  const doc = jsDocOf(node);
  if (!doc) return '';
  return (ts.getTextOfJSDocComment(doc.comment) ?? '').trim();
}

function tagsOf(node) {
  const doc = jsDocOf(node);
  const params = new Map();
  let returns = '';
  let deprecated = null;
  for (const tag of doc?.tags ?? []) {
    // `@param foo - bar` keeps the dash in the comment text
    const text = (ts.getTextOfJSDocComment(tag.comment) ?? '')
      .trim()
      .replace(/^[-\u2013]\s*/, '');
    if (ts.isJSDocParameterTag(tag)) {
      params.set(tag.name.getText(), text);
    } else if (ts.isJSDocReturnTag(tag)) {
      returns = text;
    } else if (tag.tagName.text === 'deprecated') {
      deprecated = text || 'Deprecated.';
    }
  }
  return { params, returns, deprecated };
}

/** Collapse a type node down to one line of source text. */
function typeText(node, source) {
  if (!node) return '';
  return (
    node
      .getText(source)
      // doc comments on the members of an inline object type
      .replace(/\/\*\*[\s\S]*?\*\//g, '')
      .replace(/\s*\n\s*/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
  );
}

/**
 * JSDoc `{@link Foo.bar}` renders as a bare word in markdown; turn it into
 * code so it at least reads as an identifier.
 */
function cleanDoc(text) {
  return text.replace(/\{@link\s+([^}]+)\}/g, (_, target) => {
    const name = target.trim().split(/\s+/)[0];
    return `\`${name.split('.').pop()}\``;
  });
}

/** Markdown tables break on a literal pipe, even inside a code span. */
function cell(text) {
  return text.replace(/\|/g, '\\|');
}

function paragraphs(text) {
  return cleanDoc(text).trim();
}

// ---------------------------------------------------------------- rendering

function renderMembers(members, source, out) {
  const properties = [];
  const methods = new Map();

  for (const member of members) {
    if (!member.name || ts.isIndexSignatureDeclaration(member)) continue;
    const name = member.name.getText(source);

    if (ts.isMethodSignature(member) || ts.isMethodDeclaration(member)) {
      if (!methods.has(name)) methods.set(name, []);
      methods.get(name).push(member);
    } else if (
      ts.isPropertySignature(member) ||
      ts.isPropertyDeclaration(member)
    ) {
      // an arrow-typed property is a method in everything but syntax
      if (member.type && ts.isFunctionTypeNode(member.type)) {
        if (!methods.has(name)) methods.set(name, []);
        methods.get(name).push(member);
      } else {
        properties.push(member);
      }
    }
  }

  if (properties.length) {
    out.push('| Property | Type | Description |');
    out.push('| --- | --- | --- |');
    for (const prop of properties) {
      const name = prop.name.getText(source);
      const optional = prop.questionToken ? '?' : '';
      const type = typeText(prop.type, source) || 'unknown';
      const desc = paragraphs(descriptionOf(prop)).replace(/\n+/g, ' ');
      out.push(
        `| \`${cell(name + optional)}\` | \`${cell(type)}\` | ${cell(desc)} |`,
      );
    }
    out.push('');
  }

  for (const [name, overloads] of methods) {
    out.push(`### \`${name}\``);
    out.push('');
    out.push('```ts');
    for (const overload of overloads) out.push(signature(overload, source));
    out.push('```');
    out.push('');

    const documented = overloads.find(o => descriptionOf(o)) ?? overloads[0];
    const { params, returns, deprecated } = tagsOf(documented);
    if (deprecated) {
      out.push(`**Deprecated.** ${paragraphs(deprecated)}`);
      out.push('');
    }
    const desc = paragraphs(descriptionOf(documented));
    if (desc) {
      out.push(desc);
      out.push('');
    }

    const signatureParams = declParams(documented);
    if (signatureParams.length && params.size) {
      out.push('| Param | Type | Description |');
      out.push('| --- | --- | --- |');
      for (const param of signatureParams) {
        const pname =
          (param.dotDotDotToken ? '...' : '') + param.name.getText(source);
        const type = typeText(param.type, source) || 'any';
        const pdesc = paragraphs(
          params.get(param.name.getText(source)) ?? '',
        ).replace(/\n+/g, ' ');
        out.push(`| \`${cell(pname)}\` | \`${cell(type)}\` | ${cell(pdesc)} |`);
      }
      out.push('');
    }

    if (returns) {
      out.push(`**Returns** ${paragraphs(returns)}`);
      out.push('');
    }
  }
}

function declParams(node) {
  if (node.parameters) return [...node.parameters];
  if (node.type && ts.isFunctionTypeNode(node.type))
    return [...node.type.parameters];
  return [];
}

function signature(node, source) {
  const name = node.name.getText(source);
  const optional = node.questionToken ? '?' : '';

  if (node.type && ts.isFunctionTypeNode(node.type) && !node.parameters) {
    return `${name}${optional}: ${typeText(node.type, source)}`;
  }

  const generics = node.typeParameters?.length
    ? `<${node.typeParameters.map(p => typeText(p, source)).join(', ')}>`
    : '';
  const params = (node.parameters ?? [])
    .filter(p => p.name.getText(source) !== 'this')
    .map(p => {
      const dots = p.dotDotDotToken ? '...' : '';
      const q = p.questionToken ? '?' : '';
      const type = typeText(p.type, source);
      return `${dots}${p.name.getText(source)}${q}${type ? `: ${type}` : ''}`;
    })
    .join(', ');
  const ret = typeText(node.type, source);
  return `${name}${optional}${generics}(${params})${ret ? `: ${ret}` : ''}`;
}

function renderDeclaration(name, entry, decls, out) {
  const { node, source, file } = entry;

  out.push(`## \`${name}\``);
  out.push('');

  const desc = paragraphs(descriptionOf(node));
  if (desc) {
    out.push(desc);
    out.push('');
  }

  const heritage = (node.heritageClauses ?? [])
    .flatMap(clause => clause.types.map(t => typeText(t, source)))
    .map(base => {
      const bare = base.replace(/<.*/, '');
      const page = PAGES.find(p => p.names.includes(bare));
      if (!decls.has(bare) || !page) return `\`${base}\``;
      const href = page.file === entry.page ? '' : page.file;
      return `[\`${base}\`](${href}#${bare.toLowerCase()})`;
    });
  if (heritage.length) {
    out.push(`Extends ${heritage.join(', ')}.`);
    out.push('');
  }

  if (ts.isTypeAliasDeclaration(node)) {
    if (ts.isTypeLiteralNode(node.type)) {
      renderMembers(node.type.members, source, out);
    } else if (
      ts.isArrayTypeNode(node.type) &&
      ts.isTypeLiteralNode(node.type.elementType)
    ) {
      out.push('An array of:');
      out.push('');
      renderMembers(node.type.elementType.members, source, out);
    } else {
      out.push('```ts');
      out.push(
        `type ${name}${
          node.typeParameters?.length
            ? `<${node.typeParameters.map(p => typeText(p, source)).join(', ')}>`
            : ''
        } = ${node.type.getText(source)}`,
      );
      out.push('```');
      out.push('');
    }
  } else {
    renderMembers(node.members, source, out);
  }

  out.push(`<sub>Declared in [\`${file}\`](${sourceUrl(file)}).</sub>`);
  out.push('');
}

function sourceUrl(file) {
  return `https://github.com/brickadia-community/omegga/blob/master/${file}`;
}

function renderPage(page, decls) {
  const out = [
    '<!-- Generated by tools/gen-api-docs.mjs. Edit the JSDoc in src/ instead. -->',
    '',
    `# ${page.title}`,
    '',
    page.intro.trim(),
    '',
  ];

  for (const name of page.names) {
    const entry = decls.get(name);
    if (!entry) throw new Error(`no declaration named ${name} in ${SOURCES}`);
    renderDeclaration(name, entry, decls, out);
  }

  return (
    out
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd() + '\n'
  );
}

// ---------------------------------------------------------------- main

const check = process.argv.includes('--check');
const decls = collectDeclarations();
for (const page of PAGES)
  for (const name of page.names)
    if (decls.has(name)) decls.get(name).page = page.file;
let stale = 0;

for (const page of PAGES) {
  const path = join(outDir, page.file);
  const next = renderPage(page, decls);
  if (check) {
    let current = null;
    try {
      current = readFileSync(path, 'utf8');
    } catch {
      /* missing counts as stale */
    }
    if (current !== next) {
      console.error(`stale: ${relative(root, path)}`);
      stale++;
    }
  } else {
    writeFileSync(path, next);
    console.log(
      `${relative(root, path)} (${createHash('sha256').update(next).digest('hex').slice(0, 8)})`,
    );
  }
}

if (stale) {
  console.error('\nrun `npm run docs:api` and commit the result');
  process.exit(1);
}
