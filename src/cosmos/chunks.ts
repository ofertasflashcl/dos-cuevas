import { DEEP, FOREST, GRASS, LAVA, ROCK, SAND, SHALLOW, SNOW, SWAMP, CRYSTAL, FLESH } from "./geo";
import type { Kind } from "./names";
import { fbm } from "./noise";

/** Minecraft-sized column. Generated from the seed, never stored as a planet. */
export const CHUNK = 16;

type Chunk = { tile: Uint8Array; h: Uint8Array };

const worlds = new Map<string, Map<string, Chunk>>();

function bag(seed: number, kind: Kind) {
  const id = `${seed}:${kind}`;
  let m = worlds.get(id);
  if (!m) {
    m = new Map();
    worlds.set(id, m);
  }
  return m;
}

function shiftOf(kind: Kind) {
  if (kind === "hielo") return { temp: -0.24, humid: 0.02, cont: 0.02 };
  if (kind === "desierto") return { temp: 0.22, humid: -0.24, cont: 0.1 };
  if (kind === "jungla") return { temp: 0.06, humid: 0.22, cont: 0.08 };
  if (kind === "oceano") return { temp: 0, humid: 0.04, cont: -0.14 };
  if (kind === "lava") return { temp: 0.16, humid: -0.06, cont: 0.04 };
  if (kind === "cristal") return { temp: -0.04, humid: 0, cont: 0.06 };
  if (kind === "carne") return { temp: 0.08, humid: 0.06, cont: 0.05 };
  return { temp: 0, humid: 0, cont: 0.08 };
}

function build(seed: number, kind: Kind, cx: number, cy: number): Chunk {
  const tile = new Uint8Array(CHUNK * CHUNK);
  const h = new Uint8Array(CHUNK * CHUNK);
  const shift = shiftOf(kind);
  for (let ly = 0; ly < CHUNK; ly++) {
    for (let lx = 0; lx < CHUNK; lx++) {
      const x = cx * CHUNK + lx;
      const y = cy * CHUNK + ly;
      let cont = fbm(x / 92, y / 92, seed + 3) + shift.cont;
      const temp = fbm(x / 68, y / 68, seed + 9) + shift.temp;
      const humid = fbm(x / 68, y / 68, seed + 17) + shift.humid;
      const weird = fbm(x / 28, y / 28, seed + 23);
      const er = fbm(x / 42, y / 42, seed + 41);
      const home = Math.hypot(x - 84, y - 42);
      if (home < 78) cont += (1 - home / 78) * 0.24;
      let t = GRASS;
      let height = 2;
      if (cont < 0.36) {
        t = DEEP;
        height = 2;
      } else if (cont < 0.44) {
        t = cont < 0.4 ? SHALLOW : SAND;
        height = 2;
      } else if (temp < 0.34 && er > 0.46) {
        t = SNOW;
        height = 4;
      } else if (temp > 0.66 && humid < 0.44) {
        t = SAND;
        height = 2;
      } else if (humid > 0.68 && temp < 0.5) {
        t = SWAMP;
        height = 2;
      } else if (humid > 0.56) {
        t = FOREST;
        height = er > 0.62 ? 3 : 2;
      } else if (er > 0.74 && weird > 0.52) {
        t = ROCK;
        height = 3;
      } else {
        t = GRASS;
        height = er > 0.66 ? 3 : 2;
      }
      if (kind === "lava" && weird > 0.78 && cont > 0.48) {
        t = LAVA;
        height = 2;
      }
      if (kind === "cristal" && weird > 0.76 && cont > 0.46) {
        t = CRYSTAL;
        height = 3;
      }
      if (kind === "carne" && weird > 0.72 && humid > 0.4 && cont > 0.46) {
        t = FLESH;
        height = 2;
      }
      if (kind === "hielo" && temp < 0.48 && cont >= 0.44) {
        t = SNOW;
        height = er > 0.55 ? 4 : 3;
      }
      const i = ly * CHUNK + lx;
      tile[i] = t;
      h[i] = height;
    }
  }
  return { tile, h };
}

function ensure(seed: number, kind: Kind, cx: number, cy: number) {
  const m = bag(seed, kind);
  const key = `${cx},${cy}`;
  const hit = m.get(key);
  if (hit) return hit;
  const made = build(seed, kind, cx, cy);
  m.set(key, made);
  return made;
}

export function columnAt(seed: number, kind: Kind, x: number, y: number) {
  const cx = Math.floor(x / CHUNK);
  const cy = Math.floor(y / CHUNK);
  const ch = ensure(seed, kind, cx, cy);
  const lx = Math.floor(x) - cx * CHUNK;
  const ly = Math.floor(y) - cy * CHUNK;
  const i = ly * CHUNK + Math.max(0, Math.min(CHUNK - 1, lx));
  return { tile: ch.tile[i] ?? GRASS, h: ch.h[i] ?? 2 };
}

/** Keep the chunks around the camera. Drop the rest so the map can run forever. */
export function retainChunks(seed: number, kind: Kind, x: number, y: number, radius: number) {
  const cx = Math.floor(x / CHUNK);
  const cy = Math.floor(y / CHUNK);
  const m = bag(seed, kind);
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) ensure(seed, kind, cx + dx, cy + dy);
  }
  for (const key of m.keys()) {
    const [sx, sy] = key.split(",");
    const ix = Number(sx);
    const iy = Number(sy);
    if (Math.abs(ix - cx) > radius + 2 || Math.abs(iy - cy) > radius + 2) m.delete(key);
  }
}
