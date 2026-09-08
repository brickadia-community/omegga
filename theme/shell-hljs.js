// Shell command highlighting for mdBook's bundled highlight.js (10.x).
//
// The bundled bash grammar knows shell builtins and nothing else, so `cd` and
// `export` come out coloured while `sudo apt install ...` and `curl ... | bash`,
// the lines a reader is actually being told to run, come out as plain text.
// This teaches it the programs the docs use, keeping every upstream rule for
// comments, strings, variables and heredocs.
//
// Programs are matched by position rather than added to the keyword list,
// which would colour the word anywhere: `sudo apt install curl git` would
// light up curl and git in the middle of a package list. Only a word that
// starts a command is a command.
(function () {
  if (typeof hljs === 'undefined') return;

  var bash = hljs.getLanguage('bash');
  if (!bash || typeof bash.rawDefinition !== 'function') return;

  // Program names only, never subcommands. `install` is a real command, but
  // listing it would colour the middle of `apt install`.
  var PROGRAMS = [
    'sudo|su|doas|bash|sh',
    'apt-get|apt|dpkg|dnf|yum|pacman|zypper|apk',
    'npm|npx|node|nvm|omegga',
    'curl|wget|tar|unzip|xz|git',
    'docker|podman|systemctl|journalctl',
    'useradd|usermod|passwd|chown|chmod|chattr',
    'mkdir|rm|cp|mv|ln|ls|cat|grep|sed|awk|find',
    'ssh|scp|rsync',
    // demoted from upstream's keyword list below
    'clone|set',
  ].join('|');

  // hljs lists zsh's builtins as keywords, which colours them wherever they
  // appear: `git clone` lights up clone, and `npm config set` lights up set.
  // Moving them into the position rule above keeps `set -euo pipefail` and
  // loses nothing else.
  var DEMOTED = ['clone', 'set'];

  // What can sit in front of a command: the start of a line, a pipe or list
  // separator, or a program that runs another one. Indentation counts as the
  // start, or a command inside an if block would be missed. \n is spelled out
  // because highlight.js matches against the whole block rather than line by
  // line, so ^ alone would only ever match the first line of one.
  var COMMAND_POSITION =
    '(?<=^[ \\t]*|\\n[ \\t]*|[|&;(][ \\t]*|\\b(?:sudo|doas|env|exec|xargs)[ \\t]+)';

  var definition = bash.rawDefinition();
  definition.keywords.built_in = definition.keywords.built_in
    .split(/\s+/)
    .filter(function (word) {
      return DEMOTED.indexOf(word) === -1;
    })
    .join(' ');

  try {
    definition.contains.unshift({
      className: 'built_in',
      // \b would end a match at the hyphen in apt-get, colouring `apt` and
      // leaving `-get` behind, so the boundary has to reject hyphens too
      begin: new RegExp(COMMAND_POSITION + '(?:' + PROGRAMS + ')(?![\\w-])'),
    });
  } catch (e) {
    // No lookbehind support (Safari before 16.4). Colouring the words wherever
    // they appear is worse than this, but it beats leaving every command dark.
    definition.keywords.built_in += ' ' + PROGRAMS.replace(/\|/g, ' ');
  }
  hljs.registerLanguage('bash', function () {
    return definition;
  });

  // book.js highlighted these with the old grammar before this file ran, so
  // they are flattened back to plain text first. mdBook puts nothing but text
  // inside the code element, and the copy button is a sibling, so nothing is
  // lost. The names come from the grammar itself rather than a hardcoded list,
  // because `shell` and `console` are a different language and must be left be.
  var selector = ['bash']
    .concat(definition.aliases || [])
    .map(function (name) {
      return 'code.language-' + name;
    })
    .join(', ');

  document.querySelectorAll(selector).forEach(function (block) {
    block.textContent = block.textContent;
    hljs.highlightBlock(block);
  });
})();
