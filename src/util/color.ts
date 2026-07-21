/* accepts parameters
 * h  Object = {h:x, s:y, v:z}
 * OR
 * h, s, v
 */
export function hsv(
  h: number | { h: number; s: number; v: number },
  s?: number,
  v?: number,
) {
  let hue: number, sat: number, val: number;
  if (typeof h === 'object') {
    ({ h: hue, s: sat, v: val } = h);
  } else {
    hue = h;
    sat = s ?? 0;
    val = v ?? 0;
  }
  const i = Math.floor(hue * 6);
  const f = hue * 6 - i;
  const p = val * (1 - sat);
  const q = val * (1 - f * sat);
  const t = val * (1 - (1 - f) * sat);
  let r = 0,
    g = 0,
    b = 0;
  switch (i % 6) {
    case 0:
      ((r = val), (g = t), (b = p));
      break;
    case 1:
      ((r = q), (g = val), (b = p));
      break;
    case 2:
      ((r = p), (g = val), (b = t));
      break;
    case 3:
      ((r = p), (g = q), (b = val));
      break;
    case 4:
      ((r = t), (g = p), (b = val));
      break;
    case 5:
      ((r = val), (g = p), (b = q));
      break;
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// convert a color into the weird linearRGB format
export const linearRGB = (rgba: number[]) =>
  rgba.map((c, i) =>
    i === 3
      ? c
      : Math.round(
          (c / 255 > 0.04045
            ? Math.pow((c / 255) * (1.0 / 1.055) + 0.0521327, 2.4)
            : (c / 255) * (1.0 / 12.92)) * 255,
        ),
  );

export const sRGB = (linear: number[]) =>
  linear.map((c, i) =>
    i === 3
      ? c
      : Math.round(
          (c / 255 > 0.0031308
            ? 1.055 * Math.pow(c / 255, 1 / 2.4) - 0.055
            : (c / 255) * 12.92) * 255,
        ),
  );

// convert (r, g, b), ([r, g, b]), and ({r, g, b}) to hex string
export const rgbToHex = (
  r: number | [number, number, number] | { r: number; g: number; b: number },
  g?: number,
  b?: number,
) => {
  // parse array arguments
  if (typeof r === 'object' && 'length' in r && r.length > 0) [r, g, b] = r;
  // parse object arguments
  else if (typeof r === 'object' && 'r' in r) {
    g = r.g;
    b = r.b;
    r = r.r;
  }

  return [r, g, b]
    .map(v => Math.round(Number(v)).toString(16).padStart(2, '0'))
    .join('');
};

export const DEFAULT_COLORSET = [
  [255, 255, 255, 255],
  [136, 136, 136, 255],
  [89, 89, 89, 255],
  [57, 57, 57, 255],
  [35, 35, 35, 255],
  [17, 17, 17, 255],
  [6, 6, 6, 255],
  [0, 0, 0, 255],
  [87, 5, 9, 255],
  [234, 6, 6, 255],
  [246, 73, 6, 255],
  [234, 157, 6, 255],
  [8, 138, 5, 255],
  [4, 152, 170, 255],
  [163, 35, 85, 255],
  [90, 18, 55, 255],
  [22, 4, 1, 255],
  [49, 20, 13, 255],
  [89, 16, 4, 255],
  [144, 60, 18, 255],
  [166, 104, 62, 255],
  [255, 159, 78, 255],
  [194, 163, 58, 255],
  [255, 175, 47, 255],
  [5, 18, 5, 255],
  [5, 30, 2, 255],
  [21, 36, 0, 255],
  [0, 76, 0, 255],
  [11, 54, 10, 255],
  [67, 79, 12, 255],
  [255, 146, 10, 255],
  [109, 64, 5, 255],
  [10, 30, 43, 255],
  [30, 39, 41, 255],
  [71, 92, 96, 255],
  [131, 172, 181, 255],
  [80, 147, 162, 255],
  [8, 118, 200, 255],
  [0, 64, 122, 255],
  [1, 34, 64, 255],
  [255, 14, 14, 153],
  [255, 204, 5, 153],
  [31, 144, 18, 153],
  [43, 133, 189, 153],
  [87, 5, 9, 153],
  [246, 73, 6, 153],
  [8, 43, 15, 153],
  [255, 255, 255, 153],
  [255, 255, 255, 153],
  [136, 136, 136, 153],
  [89, 89, 89, 153],
  [57, 57, 57, 153],
  [35, 35, 35, 153],
  [17, 17, 17, 153],
  [6, 6, 6, 153],
  [0, 0, 0, 153],
];
