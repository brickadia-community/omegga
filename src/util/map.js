const DEFAULT_MAPS = [
  { name: 'plate', brName: '/Game/Maps/Plate/Plate' },
  { name: 'peaks', brName: '/Game/Maps/Terrain/Peaks' },
  { name: 'studio', brName: '/Game/Maps/Studio/Studio' },
];

// Convert map brName to name
function brn2n(brName) {
  const map = DEFAULT_MAPS.find(map => map.brName === brName);
  if (map) return map.name;
  return brName;
}

// Convert map name to brName
function n2brn(name) {
  const map = DEFAULT_MAPS.find(map => map.name === (name && name.toLowerCase()));
  if (map) return map.brName;
  return name;
}

module.exports = {
  DEFAULT_MAPS,
  brn2n,
  n2brn,
};