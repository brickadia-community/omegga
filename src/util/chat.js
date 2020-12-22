// all chat emotes
const EMOTES = 'bevel pikachu shrug infeggted egghammer key banright egg flushed impeneggtrable brickbot cute banleft deadinthewater yay boibrick indestreggtable eggpty boileft tm smiley ingreggted eggangery horse dab realistegg eyes cry launcher yellegg gregg dableft unstable wink galaxybrain blush pegg goldturkey boiascended chocolate bigbrain smallbrain boi cowboy soon greggory redhouse oregg server hue windegg thumbsup clown smileyupsidedown gun facepalm angry gold hearteyes tinybrain degg sweat washinghands omegga ping pog orb eggtb tinyface dead smoothbrain thinking proteggted gunleft leon scuffed brickblue oof brick peabrain pensegg blindegged regg weary what laugh whip bregg blegg purpegg defeneggstrated'
  .split(' ');

// chat sanitize
const sanitize = str => str
  // .replace(/&/g, '&')
  .replace(/\\/g, '\\\\')
  .replace(/;/g, '&scl;')
  .replace(/>/g, '&gt;')
  .replace(/_/g, '&und;')
  .replace(/</g, '&lt;')
  .replace(/"/g, '\\"')
  .replace(/:\w+:/g, s => {
    const emote = s.slice(1, -1);
    if (EMOTES.includes(emote))
      return `<emoji>${emote}</>`;
    return s;
  });
const parseLinks = message => {
  const regex = /(\b(https?):\/\/[-A-Z0-9+&@#/%?=~_|!:,.;]*[-A-Z0-9+&@#/%=~_|])/gim;
  return message.replace(regex, '<link="$1">$1</>');
};

module.exports = { sanitize, parseLinks, EMOTES };
