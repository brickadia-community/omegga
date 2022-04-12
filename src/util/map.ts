export const DEFAULT_MAPS = [
  { name: 'plate', brName: '/Game/Maps/Plate/Plate' },
  { name: 'peaks', brName: '/Game/Maps/Terrain/Peaks' },
  { name: 'studio', brName: '/Game/Maps/Studio/Studio' },
  { name: 'space', brName: '/Game/Maps/Space/Space' },
];

// Convert map brName to name
export function brn2n(brName: string) {
  const map = DEFAULT_MAPS.find(map => map.brName === brName);
  if (map) return map.name;
  return brName;
}

// Convert map name to brName
export function n2brn(name: string) {
  const map = DEFAULT_MAPS.find(
    map => map.name === (name && name.toLowerCase())
  );
  if (map) return map.brName;
  return name;
}
