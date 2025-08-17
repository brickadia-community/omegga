// all chat emotes
export const EMOTES =
  '1984 7777 UMG agony angeggry angry awestruck banhammer banhammerleft behaviors bevel bigbrain binted blegg blindegged blurrily boi boibrick boileft bonkedbrain boohoo bregg brick brickadian brickblue brickbot brickpink brickpurple brickwhite bunny burninghands cake cash cashwings chocolate clearly clown clueless coingold coinsilver cold concur contempt copyright cowboy cuteblush cutesy dableft dabright de dead deadinthewater degg delete egg egghammer eggpty eggtb eyes facepalm fear fire flushed forteggfied frog galaxybrain gold goldenturkey gregg greggory gun gunleft heart hearteyes horse hue hunterbug hype imp impeneggtrable indestreggtable infeggted ingreggted key laugh launcher madman microbrick missingbrick mods monocle moyai nice no noise nononono nononopog nonopog nopog omegga oregg peabrain pegg pensegg pensive perspeggtive pikachu pin ping playful plead pog point pointleft proteggted purpegg raisedeyebrow realistegg redhouse regg registered removesoul salute scuffed server shit shrug shrugleft sisyphus sleepy smallbrain smilecreepy smiletiny smileupsidedown smoothbrain smug sob soontm stickynote sweaty theorb thinking thumbsup tinfoil tinybrain tm trans trash unstable washinghands what whegg whip wink yay yellegg'.split(
    ' ',
  );

// chat sanitize
export const sanitize = (str: string) =>
  str
    // .replace(/&/g, '&')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '&scl;')
    .replace(/>/g, '&gt;')
    .replace(/_/g, '&und;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '\\"')
    .replace(/:\w+:/g, s => {
      const emote = s.slice(1, -1);
      if (EMOTES.includes(emote)) return `<emoji>${emote}</>`;
      return s;
    });

export const parseLinks = (message: string) => {
  const regex =
    /(\b(https?):\/\/[-A-Z0-9+&@#/%?=~_|!:,.;]*[-A-Z0-9+&@#/%=~_|])/gim;
  return message.replace(regex, '<link="$1">$1</>');
};

export const attr =
  (attr: string, param?: string): ((message: string) => string) =>
  (message: string): string =>
    `<${attr}${param ? `="${param}"` : ''}>${message}</>`;

export const attrParam =
  <T = string>(attr: string) =>
  (message: string, param: T) =>
    `<${attr}="${param}">${message}</>`;

const colorize = (color: string) => attr('color', color);
export const color = attrParam('color');
export const bold = attr('b');
export const italic = attr('i');
export const underline = attr('u');
export const emoji = attr('emoji');
export const code = attr('code');
export const font = attrParam('font');
export const size = attrParam<number>('size');
export const link = attrParam('link');

export const red = colorize('f00');
export const green = colorize('0f0');
export const blue = colorize('00f');
export const yellow = colorize('ff0');
export const cyan = colorize('0ff');
export const magenta = colorize('f0f');
export const black = colorize('000');
export const white = colorize('fff');
export const gray = colorize('888');
