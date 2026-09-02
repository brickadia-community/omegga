// Wirescript syntax highlighting for mdBook's bundled highlight.js (10.x).
// mdBook loads additional-js after book.js has already highlighted the page,
// so this registers the language and then re-highlights the blocks that were
// skipped. Keyword lists track the Wirescript playground's Monarch grammar.
(function () {
  if (typeof hljs === 'undefined') return;

  hljs.registerLanguage('wirescript', function (hljs) {
    var KEYWORDS = {
      keyword:
        'if else then match on return emit await var array buffer let const ' +
        'fn chip mod in out open ref import from as event static type',
      type:
        'int float bool string entity controller character vector rotator ' +
        'quat color exec brick prefab any never Map Option Result',
      literal: 'true false',
      built_in:
        'PrintToConsole SendCustomEvent SendGlobalCustomEvent CustomEvent ' +
        'GlobalCustomEvent ChatCommand Clock ReadBrickGrid Fmt Opaque ' +
        'BroadcastChatMessage BroadcastStatusMessage ShowChatMessage ' +
        'ShowStatusMessage ShowMessageBox ShowHint DisplayText FindPlayer ' +
        'ControllerOf CharacterOf GetAim InputReader GetInputs Random Timer ' +
        'Sleep SleepTicks SpawnPrefab SpawnExplosion Sweep Union Branch ' +
        'Select Vec MakeColor Dot Cross Normalize Magnitude Distance ' +
        'DeltaTime ServerUptime NearlyEqual Dampen Easing Tween ' +
        'GetLocation GetRotation SetLocation SetRotation Teleport',
    };

    // `${ ... }` inside a string drops back into ordinary code
    var SUBST = {
      className: 'subst',
      begin: /\$\{/,
      end: /\}/,
      keywords: KEYWORDS,
    };

    var STRING = {
      className: 'string',
      variants: [
        { begin: /"/, end: /"/, illegal: /\n/, contains: [hljs.BACKSLASH_ESCAPE, SUBST] },
        { begin: /'/, end: /'/, illegal: /\n/, contains: [hljs.BACKSLASH_ESCAPE, SUBST] },
      ],
    };
    SUBST.contains = [STRING];

    return {
      name: 'Wirescript',
      aliases: ['ws'],
      keywords: KEYWORDS,
      contains: [
        // `///` doc comments, before the plain `//` rule
        hljs.COMMENT('///', '$', { relevance: 10 }),
        hljs.C_LINE_COMMENT_MODE,
        hljs.C_BLOCK_COMMENT_MODE,
        STRING,
        // `$Asset/Path` references
        { className: 'symbol', begin: /\$[A-Za-z_][\w]*(\/[\w.-]+)*/ },
        // `@fold`, `@layout(...)`, `@nofold` annotations
        { className: 'meta', begin: /@[A-Za-z_]\w*/ },
        hljs.C_NUMBER_MODE,
      ],
    };
  });

  // book.js has already run and skipped these blocks, because the language was
  // not registered when it did. Flatten each back to plain text (mdBook puts
  // nothing but text inside the `code` element, and the copy button is a
  // sibling) so the pass below is the same whichever order the two scripts run.
  document
    .querySelectorAll('code.language-wirescript, code.language-ws')
    .forEach(function (block) {
      block.textContent = block.textContent;
      hljs.highlightBlock(block);
    });
})();
