module.exports = {
  // santize chat, emote list
  chat: require('./chat'),

  // hsv and sRGB to linearRGB helpers
  color: require('./color'),

  // uuid utils
  uuid: require('./uuid'),

  // pattern matching utils
  pattern: require('./pattern'),

  // time parsing utils
  time: require('./time'),

  // map parsing utils
  map: require('./map'),

  // brick utils
  brick: require('./brick'),

  // brs
  wsl: () => require('./wsl'),

  // brs
  brs: require('brs-js')
};
