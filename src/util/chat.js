// all chat emotes
const EMOTES = 'egg boiascended banleft gun omegga dableft cry sweat soon shrug smallbrain house oof weary brickboi bigbrain angry smiley tm dead cowboy clown angery deadinthewater pikachu key bevel ban goldturkey whip hue horse eyes orb gold boileft galaxybrain facepalm dab hearteyes boi blush thinking'
  .split(' ');

// chat sanitize
const sanitize = str => str
  // .replace(/&/g, '&')
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
