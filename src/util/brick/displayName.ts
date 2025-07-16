import { brickSizeMap } from './constants';

type NameConversion = [string, [number, number, number]];

function genericBrick(
  name: string,
  asset?: string
): (typeof displayNameMap)[number] {
  if (!asset) asset = 'B_' + name.replace(/\s/g, '_');
  return [name, [asset, brickSizeMap[asset] ?? [0, 0, 0]]];
}

const microMap: Record<string, string> = {
  'Micro-Brick': 'PB_DefaultMicroBrick',
  'Micro-Wedge 1/2 Inner Corner': 'PB_DefaultMicroWedgeHalfInnerCorner',
  'Micro-Wedge Inv. 1/2 Inner Corner':
    'PB_DefaultMicroWedgeHalfInnerCornerInverted',
  'Micro-Wedge 1/2 Outer Corner': 'PB_DefaultMicroWedgeHalfOuterCorner',
  'Micro-Wedge Corner': 'PB_DefaultMicroWedgeCorner',
  'Micro-Wedge Inner Corner': 'PB_DefaultMicroWedgeInnerCorner',
  'Micro-Wedge Outer Corner': 'PB_DefaultMicroWedgeOuterCorner',
  'Micro-Wedge Triangle Corner': 'PB_DefaultMicroWedgeTriangleCorner',
  'Micro-Wedge': 'PB_DefaultMicroWedge',
};

export const displayNameMap: [
  string | RegExp,
  NameConversion | ((name: string, ...rest: string[]) => NameConversion)
][] = [
  // Games
  genericBrick('Checkpoint', 'B_CheckPoint'),
  genericBrick('Goalpoint', 'B_GoalPoint'),
  genericBrick('Spawnpoint', 'B_SpawnPoint'),

  // Ramps
  genericBrick('2x1 Slipper'),
  genericBrick('2x2 Slipper'),

  // Rounds
  genericBrick('1x Octo'),
  genericBrick('1x Octo 90°', 'B_1x_Octo_90Deg'),
  genericBrick('1x Octo 90° Inv', 'B_1x_Octo_90Deg_Inv'),
  genericBrick('1x Octo T'),
  genericBrick('1x Octo T Inv'),
  genericBrick('1x1f Octo', 'B_1x1F_Octo'),
  genericBrick('1x1 Cone'),
  genericBrick('1x1 Round'),
  genericBrick('1x1f Round', 'B_1x1F_Round'),
  genericBrick('2x Octo'),
  genericBrick('2x Octo 90°', 'B_2x_Octo_90Deg'),
  genericBrick('2x Octo 90° Inv', 'B_2x_Octo_90Deg_Inv'),
  genericBrick('2x Octo Cone'),
  genericBrick('2x Octo T'),
  genericBrick('2x Octo T Inv'),
  genericBrick('2x2f Converter', 'B_2x2F_Octo_Converter'),
  genericBrick('2x2f Converter Inv', 'B_2x2F_Octo_Converter_Inv'),
  genericBrick('2x2f Octo', 'B_2x2F_Octo'),
  genericBrick('2x2 Cone'),

  // Special
  genericBrick('1x2f Plate Center'),
  genericBrick('1x2f Plate Center Inv'),
  genericBrick('2x2f Plate Center'),
  genericBrick('2x2f Plate Center Inv'),
  genericBrick('Bishop'),
  genericBrick('King'),
  genericBrick('Knight'),
  genericBrick('Pawn'),
  genericBrick('Queen'),
  genericBrick('Rook'),
  genericBrick('2x2 Corner'),
  genericBrick('8x8 Lattice Plate'),
  genericBrick('Bone', 'B_BoneStraight'),
  genericBrick('Carved Pumpkin', 'B_Pumpkin_Carved'),
  genericBrick('Coffin'),
  genericBrick('Coffin Lid'),
  genericBrick('Diagonal Bone', 'B_Bone'),
  genericBrick('Flame'),
  genericBrick('Gravestone'),
  genericBrick('Handle'),
  genericBrick('Inverted Cone'),
  genericBrick('Ladder Step', 'B_Ladder'),
  genericBrick('Pumpkin'),
  genericBrick('Round Swirl Plate', 'B_Swirl_Plate'),
  genericBrick('Sausage'),
  genericBrick('Turkey Body'),
  genericBrick('Turkey Leg'),
  genericBrick('2x4 Door Frame'),
  genericBrick('Picket Fence'),
  genericBrick('Branch'),
  genericBrick('Bush', 'B_Leaf_Bush'),
  genericBrick('Fern'),
  genericBrick('Flower'),
  genericBrick('Hedge 1x1'),
  genericBrick('Hedge 1x1 Corner'),
  genericBrick('Hedge 1x2'),
  genericBrick('Hedge 1x4'),
  genericBrick('Pine Tree'),
  genericBrick('Shrub', 'B_Bush'),
  genericBrick('Small Flower'),
  genericBrick('Cauldron'),
  genericBrick('Chalice'),
  genericBrick('Jar'),
  genericBrick('1x1 Brick Side'),
  genericBrick('1x1 Brick Side Lip'),
  genericBrick('1x2 Overhang Panel', 'B_1x2_Overhang'),
  genericBrick('1x4 Brick Side'),
  genericBrick('2x2 Overhang Panel', 'B_2x2_Overhang_Panel'),

  // Micros
  [
    // 8x Micro-Brick Cube
    /^(\d+)x (Micro-.+) Cube$/,
    (_, size, micro) => [
      microMap[micro],
      [Number(size) / 2, Number(size) / 2, Number(size) / 2],
    ],
  ],
  [
    // 8x8x10 Micro-Brick
    /^(\d+)x(\d+)x(\d+) (Micro-.+)$/,
    (_, x, y, z, micro) => [
      microMap[micro],
      [Number(x) / 2, Number(y) / 2, Number(z) / 2],
    ],
  ],

  // Rounds
  [
    // 4x2 Pole
    /^(\d+)x(\d+) Pole$/,
    (_, x, z) => [
      'PB_DefaultPole',
      [Number(x) / 2, Number(x) / 2, Number(z) / 2],
    ],
  ],
  [
    // 2x Cone
    /^(\d+)x Pole$/,
    (_, size) => [
      'PB_DefaultPole',
      [Number(size) / 2, Number(size) / 2, Number(size) / 2],
    ],
  ],

  // Ramps
  [
    // 4x Inv. Cube Ramp Corner,
    // weird edge case because Inv. Cube and not Cube Inv. or Cube ... (Inverted)
    /^(\d+)x Inv. Cube Ramp Corner/,
    (name, size) => [
      'PB_DefaultRampCornerInverted',
      [Number(size) * 5, Number(size) * 5, Number(size) * 5],
    ],
  ],

  // Bricks
  [
    // 4x Cube
    /^(\d+)}?x Cube/,
    (name, size) => [
      brickTypeSuffix(name),
      [Number(size) * 5, Number(size) * 5, Number(size) * 5],
    ],
  ],
  [
    // 1x1x4f
    /^(\d+)x(\d+)x([\d.]+)f/,
    (name, x, y, z) => [
      brickTypeSuffix(name),
      [Number(x) * 5, Number(y) * 5, Number(z) * 2],
    ],
  ],
  [
    // 1x1x2
    /^(\d+)x(\d+)x(\d+)/,
    (name, x, y, z) => [
      brickTypeSuffix(name),
      [Number(x) * 5, Number(y) * 5, Number(z) * 6],
    ],
  ],
  [
    // 1x1f
    /^(\d+)x(\d+)f/,
    (name, x, y) => [brickTypeSuffix(name), [Number(x) * 5, Number(y) * 5, 2]],
  ],
  [
    // 1x1
    /^(\d+)x(\d+)/,
    (name, x, y) => [brickTypeSuffix(name), [Number(x) * 5, Number(y) * 5, 6]],
  ],
];

const brickTypeSuffixMap: [string, string][] = [
  ['Side Wedge', 'PB_DefaultSideWedge'],
  ['Wedge', 'PB_DefaultWedge'],
  ['Inner Ramp Corner', 'PB_DefaultRampInnerCorner'],
  ['Inv. Ramp Corner', 'PB_DefaultRampCornerInverted'],
  ['Ramp Inner Corner (Inverted)', 'PB_DefaultRampInnerCornerInverted'],
  ['Ramp Corner', 'PB_DefaultRampCorner'],
  ['Ramp Crest', 'PB_DefaultRampCrest'],
  ['Ramp Crest End', 'PB_DefaultRampCrestEnd'],
  ['Ramp Crest Corner', 'PB_DefaultRampCrestCorner'],
  ['Inv. Ramp', 'PB_DefaultRampInverted'],
  ['Ramp', 'PB_DefaultRamp'],
  ['Inv. Arch', 'PB_DefaultArchInverted'],
  ['Arch', 'PB_DefaultArch'],
  ['(Tile)', 'PB_DefaultTile'],
  ['(Smooth Tile)', 'PB_DefaultSmoothTile'],
];

function brickTypeSuffix(name: string): string {
  for (const [test, res] of brickTypeSuffixMap)
    if (name.endsWith(test)) return res;

  return 'PB_DefaultBrick';
}

export function convertDisplayName(name: string): NameConversion {
  for (const matcher of displayNameMap) {
    let matchDetails: RegExpMatchArray | null = null;
    if (typeof matcher[0] === 'string') {
      if (matcher[0] !== name) continue;
    } else {
      matchDetails = name.match(matcher[0]);
      if (matchDetails == null) continue;
    }

    if (typeof matcher[1] === 'function') {
      return matcher[1](name, ...(matchDetails ? matchDetails.slice(1) : []));
    } else {
      return matcher[1];
    }
  }

  return null;
}

export default convertDisplayName;
