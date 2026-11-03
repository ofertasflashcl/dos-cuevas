export const W = 168;
export const H = 84;

export const DEEP = 0;
export const SHALLOW = 1;
export const SAND = 2;
export const GRASS = 3;
export const FOREST = 4;
export const DIRT = 5;
export const ROCK = 6;
export const SNOW = 7;
export const LAVA = 8;
export const CRYSTAL = 9;
export const FLESH = 10;
export const SWAMP = 11;
export const LAKE = 12;

export function wrap(x: number, w = W) {
  return ((x % w) + w) % w;
}

export function wrapDelta(d: number, w = W) {
  let x = d;
  if (x > w / 2) x -= w;
  if (x < -w / 2) x += w;
  return x;
}

export function dist(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(wrapDelta(bx - ax), by - ay);
}

export function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

export function idx(x: number, y: number) {
  const xx = Math.floor(wrap(x));
  const yy = Math.max(0, Math.min(H - 1, Math.floor(y)));
  return yy * W + xx;
}

export function blocked(tile: number, alien = false) {
  if (tile === DEEP || tile === SHALLOW || tile === LAKE) return true;
  if (tile === LAVA && !alien) return true;
  return false;
}
