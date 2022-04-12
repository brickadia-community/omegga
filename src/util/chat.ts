// all chat emotes
export const EMOTES =
  '7777 UMG angeggry angry banhammer banhammerleft bevel bigbrain binted blegg blindegged blurrily boi boibrick boileft bonkedbrain bregg brick brickadian brickblue brickbot bunny cake chocolate clearly clown contempt cowboy cuteblush dableft dabright dead deadinthewater degg diamond egg egghammer eggpty eggtb eyes facepalm flushed forteggfied galaxybrain gold goldenturkey gregg greggory gun gunleft heart hearteyes horse hue hype impeneggtrable indestreggtable infeggted ingreggted key laugh launcher leon madman missingsmile moyai nice no noise nononono nononopog nonopog nopog omegga oof oregg peabrain pegg pensegg pensive perspeggtive pikachu pin ping plead pog proteggted purpegg rage realistegg redhouse regg removesoul scuffed server shit shrug shrugleft smallbrain smilecreepy smiletiny smileupsidedown smoothbrain smug soontm sweaty theorb thinking thumbsup tinybrain trash unstable washinghands what whegg whip windegg wink yay yellegg'.split(
    ' '
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
