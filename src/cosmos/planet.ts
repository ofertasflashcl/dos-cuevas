import { fbm } from "./noise";
import {
  CRYSTAL,
  DEEP,
  DIRT,
  FLESH,
  FOREST,
  GRASS,
  H,
  LAKE,
  LAVA,
  ROCK,
  SAND,
  SHALLOW,
  SNOW,
  SWAMP,
  W,
  blocked,
  dist,
  idx,
  wrap,
  wrapDelta,
} from "./geo";
import type { Kind } from "./names";

export type Spot = { x: number; y: number };

export type Generated = {
  tiles: Uint8Array;
  farm: Uint8Array;
  road: Uint8Array;
  spots: Spot[];
};

function seam(lon: number, lat: number, seed: number, freq: number) {
  const a = lon * Math.PI * 2;
  return fbm(Math.cos(a) * freq + lat * 0.2, Math.sin(a) * freq, seed);
}

function blob(lon: number, lat: number, cx: number, cy: number, rx: number, ry: number) {
  let dx = lon - cx;
  if (dx > 0.5) dx -= 1;
  if (dx < -0.5) dx += 1;
  const nx = dx / rx;
  const ny = (lat - cy) / ry;
  return Math.exp(-(nx * nx + ny * ny) * 1.7);
}

function earthMask(lon: number, lat: number) {
  return Math.max(
    blob(lon, lat, 0.2, 0.42, 0.138, 0.276),
    blob(lon, lat, 0.28, -0.18, 0.0805, 0.322),
    blob(lon, lat, 0.5, 0.05, 0.1035, 0.322),
    blob(lon, lat, 0.5, 0.5, 0.092, 0.138),
    blob(lon, lat, 0.74, 0.36, 0.207, 0.253),
    blob(lon, lat, 0.84, -0.34, 0.069, 0.092),
    blob(lon, lat, 0.32, 0.72, 0.052, 0.069),
    blob(lon, lat, 0.48, 0.55, 0.023, 0.0345),
    blob(lon, lat, 0.88, 0.42, 0.023, 0.0575),
    blob(lon, lat, 0.58, -0.18, 0.023, 0.0575),
    blob(lon, lat, 0.55, -0.86, 0.253, 0.115),
  );
}

function hash01(seed: number, i: number, k: number) {
  let n = Math.imul(seed ^ Math.imul(i + 1, 374761393) ^ Math.imul(k + 3, 668265263), 1274126177) >>> 0;
  n = (n ^ (n >>> 13)) >>> 0;
  return n / 4294967296;
}

function ridged(lon: number, lat: number, seed: number) {
  return 1 - Math.abs(seam(lon, lat, seed + 8, 3.8) - 0.5) * 2;
}

function islandCenters(seed: number) {
  const count = 5 + ((hash01(seed, 40, 1) * 4) | 0);
  const centers: { x: number; y: number; rx: number; ry: number }[] = [];
  const top = Math.min(4, count);
  for (let i = 0; i < count; i++) {
    const row = i < top ? 0 : 1;
    const slot = row === 0 ? i : i - top;
    const slots = row === 0 ? top : count - top;
    const cx = (slot + 0.5) / slots + (hash01(seed, i, 1) - 0.5) * 0.07 + row * 0.09;
    const cy = (row === 0 ? -0.28 : 0.34) + (hash01(seed, i, 2) - 0.5) * 0.18;
    centers.push({
      x: ((cx % 1) + 1) % 1,
      y: cy,
      rx: 0.046 + hash01(seed, i, 3) * 0.026,
      ry: 0.145 + hash01(seed, i, 4) * 0.07,
    });
  }
  return centers;
}

function oceanAt(lon: number, lat: number, seed: number) {
  let m = 0;
  for (const p of islandCenters(seed)) m = Math.max(m, blob(lon, lat, p.x, p.y, p.rx, p.ry));
  return m + (seam(lon, lat, seed + 3, 2.2) - 0.5) * 0.045 > 0.42;
}

function desertMasses(seed: number) {
  const two = hash01(seed, 0, 9) > 0.4;
  const a = {
    x: 0.18 + hash01(seed, 1, 1) * 0.2,
    y: (hash01(seed, 1, 2) - 0.5) * 0.28,
    rx: two ? 0.2 + hash01(seed, 1, 3) * 0.04 : 0.3 + hash01(seed, 1, 3) * 0.04,
    ry: two ? 0.5 + hash01(seed, 1, 4) * 0.08 : 0.68 + hash01(seed, 1, 4) * 0.08,
  };
  const b = {
    x: (a.x + 0.36 + hash01(seed, 2, 1) * 0.12) % 1,
    y: (hash01(seed, 2, 2) - 0.5) * 0.32,
    rx: 0.17 + hash01(seed, 2, 3) * 0.04,
    ry: 0.42 + hash01(seed, 2, 4) * 0.08,
  };
  return { two, a, b };
}

function desertAt(lon: number, lat: number, seed: number) {
  const { two, a, b } = desertMasses(seed);
  let m = blob(lon, lat, a.x, a.y, a.rx, a.ry);
  if (two) m = Math.max(m, blob(lon, lat, b.x, b.y, b.rx, b.ry));
  return m + (seam(lon, lat, seed + 21, 1.7) - 0.5) * 0.16 > 0.48;
}

function oasisAt(lon: number, lat: number, seed: number) {
  const { a } = desertMasses(seed);
  const ox = (a.x + 0.02 + hash01(seed, 6, 1) * 0.05) % 1;
  const oy = a.y + (hash01(seed, 6, 2) - 0.5) * 0.1;
  return blob(lon, lat, ox, oy, 0.03, 0.072);
}

function fjordAt(lon: number, seed: number) {
  const nFj = 3 + ((hash01(seed, 7, 1) * 2) | 0);
  let depthCut = 0;
  let strength = 0;
  for (let i = 0; i < nFj; i++) {
    let d = lon - hash01(seed, 30 + i, 1);
    if (d > 0.5) d -= 1;
    if (d < -0.5) d += 1;
    const width = 0.03 + hash01(seed, 30 + i, 2) * 0.014;
    const depth = 0.62 + hash01(seed, 30 + i, 3) * 0.42;
    const notch = Math.exp(-(d * d) / (2 * width * width));
    depthCut = Math.max(depthCut, notch * depth);
    strength = Math.max(strength, notch);
  }
  return { depthCut, strength };
}

function iceAt(lon: number, lat: number, seed: number) {
  const wobble = seam(lon, lat, seed + 4, 1.35);
  const edge = -0.06 - (wobble - 0.32) * 0.5 - fjordAt(lon, seed).depthCut;
  return lat < edge;
}

function jungleCenter(seed: number) {
  return {
    x: 0.3 + hash01(seed, 3, 1) * 0.28,
    y: (hash01(seed, 3, 2) - 0.5) * 0.2,
  };
}

function jungleAt(lon: number, lat: number, seed: number) {
  const c = jungleCenter(seed);
  const pulse = seam(lon, lat, seed + 11, 1.55);
  const m = blob(lon, lat, c.x, c.y, 0.27 + pulse * 0.05, 0.64 + pulse * 0.08);
  return m + (seam(lon, lat, seed + 21, 1.9) - 0.5) * 0.14 > 0.46;
}

function mangroveAt(lon: number, lat: number, seed: number) {
  const c = jungleCenter(seed);
  const b1 = blob(lon, lat, (c.x - 0.05 + 1) % 1, c.y + 0.12, 0.1, 0.2);
  const b2 = blob(lon, lat, (c.x + 0.09) % 1, c.y - 0.04, 0.07, 0.15);
  return Math.max(b1, b2);
}

function lavaAt(lon: number, lat: number, seed: number) {
  const ax = 0.24 + hash01(seed, 8, 1) * 0.14;
  const ay = (hash01(seed, 8, 2) - 0.5) * 0.26;
  const bx = (0.6 + hash01(seed, 8, 3) * 0.16) % 1;
  const by = (hash01(seed, 8, 4) - 0.5) * 0.3;
  const m = Math.max(blob(lon, lat, ax, ay, 0.28, 0.64), blob(lon, lat, bx, by, 0.24, 0.56));
  return m + (seam(lon, lat, seed + 21, 1.55) - 0.5) * 0.14 > 0.42;
}

function crystalAt(lon: number, lat: number, seed: number) {
  const cx = 0.34 + hash01(seed, 4, 1) * 0.22;
  const cy = (hash01(seed, 4, 2) - 0.5) * 0.18;
  const m = blob(lon, lat, cx, cy, 0.34, 0.76);
  return m + (seam(lon, lat, seed + 15, 1.6) - 0.5) * 0.12 > 0.44;
}

function fleshCenter(seed: number) {
  return {
    x: 0.38 + hash01(seed, 5, 1) * 0.18,
    y: (hash01(seed, 5, 2) - 0.5) * 0.16,
  };
}

function fleshAt(lon: number, lat: number, seed: number) {
  const c = fleshCenter(seed);
  const pulse = seam(lon, lat, seed + 6, 2.05);
  return blob(lon, lat, c.x, c.y, 0.22 + pulse * 0.1, 0.56 + pulse * 0.16) > 0.43;
}

function fleshBasin(lon: number, lat: number, seed: number) {
  const c = fleshCenter(seed);
  const ox = (c.x + (hash01(seed, 5, 3) - 0.5) * 0.07 + 1) % 1;
  const oy = c.y + (hash01(seed, 5, 4) - 0.5) * 0.12;
  return blob(lon, lat, ox, oy, 0.042, 0.095);
}

function fleshWet(lon: number, lat: number, seed: number) {
  const c = fleshCenter(seed);
  const a = blob(lon, lat, (c.x - 0.09 + 1) % 1, c.y + 0.14, 0.09, 0.18);
  const b = blob(lon, lat, (c.x + 0.11) % 1, c.y - 0.1, 0.075, 0.15);
  return Math.max(a, b);
}

function landAt(kind: Kind, lon: number, lat: number, seed: number) {
  if (kind === "tierra") {
    const coast = seam(lon, lat, seed + 21, 3.1);
    const mask = earthMask(lon, lat);
    const score = mask * 1.45 + (coast - 0.5) * 0.34;
    if (lat < -0.78) return blob(lon, lat, 0.55, -0.9, 0.28, 0.12) > 0.35 && coast > 0.28;
    if (lat > 0.86) return mask > 0.35;
    return score > 0.25;
  }
  if (kind === "oceano") return oceanAt(lon, lat, seed);
  if (kind === "desierto") return desertAt(lon, lat, seed);
  if (kind === "hielo") return iceAt(lon, lat, seed);
  if (kind === "jungla") return jungleAt(lon, lat, seed);
  if (kind === "lava") return lavaAt(lon, lat, seed);
  if (kind === "cristal") return crystalAt(lon, lat, seed);
  if (kind === "carne") return fleshAt(lon, lat, seed);
  return seam(lon, lat, seed, 1.4) > 0.5;
}

function biomeAt(kind: Kind, land: boolean, lat: number, lon: number, seed: number, coast: number, shore: boolean) {
  const moist = seam(lon, lat, seed + 41, 2.2);
  const woods = seam(lon, lat, seed + 41, 1.55);
  const ridges = ridged(lon, lat, seed);
  const basin = seam(lon, lat, seed + 90, 1.7);
  if (!land) {
    if (kind === "lava") return LAVA;
    return shore ? SHALLOW : DEEP;
  }
  if (kind === "tierra") {
    if (lat < -0.8 || lat > 0.86) return SNOW;
    if (ridges > 0.99 && Math.abs(lat) > 0.4) return SNOW;
    if (ridges > 0.952) return ROCK;
    if (coast <= 1) return SAND;
    if (coast > 6 && basin > 0.62 && ridges < 0.8) return LAKE;
    if (ridges < 0.7 && coast > 2) return moist > 0.5 ? GRASS : DIRT;
    if (woods > 0.6 && coast > 3 && Math.abs(lat) < 0.38 && ridges < 0.9 && ridges >= 0.7) return SWAMP;
    if (woods > 0.54 && Math.abs(lat) < 0.62 && ridges < 0.94) return FOREST;
    return GRASS;
  }
  if (kind === "desierto") {
    if (oasisAt(lon, lat, seed) > 0.55 && coast > 2) return LAKE;
    if (ridges > 0.978) return ROCK;
    if (ridges < 0.64 && coast > 2) return DIRT;
    return SAND;
  }
  if (kind === "hielo") {
    const strength = fjordAt(lon, seed).strength;
    if (strength > 0.28 && coast <= 5) return ROCK;
    if (ridges > 0.982 && coast > 3) return ROCK;
    return SNOW;
  }
  if (kind === "jungla") {
    if (coast <= 1) return SAND;
    if (mangroveAt(lon, lat, seed) > 0.48 && coast > 1) return SWAMP;
    return FOREST;
  }
  if (kind === "lava") return ROCK;
  if (kind === "cristal") {
    if (ridges > 0.976) return ROCK;
    return CRYSTAL;
  }
  if (kind === "carne") {
    if (fleshBasin(lon, lat, seed) > 0.58 && coast > 2) return LAKE;
    if (fleshWet(lon, lat, seed) > 0.5 && coast > 1) return SWAMP;
    return FLESH;
  }
  if (coast <= 1) return SAND;
  if (moist > 0.55) return FOREST;
  return GRASS;
}

function thicken(land: Uint8Array) {
  const src = land.slice();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!src[y * W + x]) continue;
      land[y * W + wrap(x - 1)] = 1;
      land[y * W + wrap(x + 1)] = 1;
      if (y > 0) land[(y - 1) * W + x] = 1;
      if (y + 1 < H) land[(y + 1) * W + x] = 1;
    }
  }
}

export function generatePlanet(kind: Kind, seed: number, spotsN: number, rng: () => number): Generated {
  const tiles = new Uint8Array(W * H);
  const land = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    const lat = 1 - (y / (H - 1)) * 2;
    for (let x = 0; x < W; x++) {
      const lon = x / W;
      const yes = landAt(kind, lon, lat, seed);
      land[y * W + x] = yes ? 1 : 0;
    }
  }
  if (kind !== "tierra" && kind !== "hielo") thicken(land);
  let lands = 0;
  for (let i = 0; i < land.length; i++) if (land[i]) lands++;
  if (lands < 30) {
    for (let k = 0; k < 40; k++) {
      const x = (rng() * W) | 0;
      const y = (H * 0.3 + rng() * H * 0.4) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) land[idx(x + dx, y + dy)] = 1;
      }
    }
  }
  const coast = new Int16Array(W * H);
  coast.fill(-1);
  const qx: number[] = [];
  const qy: number[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!land[y * W + x]) {
        coast[y * W + x] = 0;
        qx.push(x);
        qy.push(y);
      }
    }
  }
  let qh = 0;
  while (qh < qx.length) {
    const x = qx[qh]!;
    const y = qy[qh]!;
    qh++;
    const d0 = coast[y * W + x] ?? 0;
    const ns = [
      [wrap(x - 1), y],
      [wrap(x + 1), y],
      [x, y - 1],
      [x, y + 1],
    ];
    for (const n of ns) {
      const nx = n[0]!;
      const ny = n[1]!;
      if (ny < 0 || ny >= H) continue;
      const i = ny * W + wrap(nx);
      if (coast[i] !== -1) continue;
      coast[i] = d0 + 1;
      qx.push(wrap(nx));
      qy.push(ny);
    }
  }
  for (let y = 0; y < H; y++) {
    const lat = 1 - (y / (H - 1)) * 2;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const isLand = land[i] === 1;
      let shore = false;
      if (!isLand) {
        const ns = [
          [wrap(x - 1), y],
          [wrap(x + 1), y],
          [x, y - 1],
          [x, y + 1],
        ];
        for (const n of ns) {
          const ny = n[1]!;
          if (ny < 0 || ny >= H) continue;
          if (land[ny * W + wrap(n[0]!)] === 1) shore = true;
        }
      }
      const c = coast[i] === -1 ? 12 : coast[i]!;
      tiles[i] = biomeAt(kind, isLand, lat, x / W, seed, c, shore);
    }
  }
  const cells: Spot[] = [];
  for (let y = 2; y < H - 2; y++) {
    for (let x = 0; x < W; x++) {
      if (!blocked(tiles[y * W + x]!)) cells.push({ x, y });
    }
  }
  const spots: Spot[] = [];
  const buckets = kind === "tierra" ? [0, 1, 2] : null;
  for (let s = 0; s < spotsN; s++) {
    const bucket = buckets ? buckets[s]! : -1;
    let pool = cells;
    if (bucket === 0) pool = cells.filter((c) => c.x / W < 0.4 && c.y > H * 0.18 && c.y < H * 0.72);
    if (bucket === 1) pool = cells.filter((c) => c.x / W >= 0.42 && c.x / W < 0.64 && c.y > H * 0.2 && c.y < H * 0.78);
    if (bucket === 2) pool = cells.filter((c) => c.x / W >= 0.64 && c.y > H * 0.18 && c.y < H * 0.7);
    if (pool.length < 8) pool = cells;
    let best: Spot | null = null;
    let bestScore = -999;
    const tries = Math.min(100, Math.max(20, pool.length));
    for (let k = 0; k < tries; k++) {
      const c = pool[(rng() * pool.length) | 0];
      if (!c) continue;
      let minD = 80;
      for (const o of spots) minD = Math.min(minD, dist(c.x, c.y, o.x, o.y));
      const tile = tiles[idx(c.x, c.y)] ?? DEEP;
      let score = minD;
      if (kind === "tierra" && tile === SNOW) score -= 10;
      if (tile === GRASS || tile === FOREST || tile === DIRT || tile === SAND) score += 3;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (best) spots.push(best);
  }
  if (!spots.length && cells.length) spots.push(cells[(rng() * cells.length) | 0]!);
  const farm = new Uint8Array(W * H);
  const road = new Uint8Array(W * H);
  spots.forEach((spot, s) => {
    for (let y = spot.y - 4; y <= spot.y + 4; y++) {
      for (let x = spot.x - 5; x <= spot.x + 5; x++) {
        const xx = wrap(x);
        if (dist(spot.x, spot.y, xx, y) > 4.2) continue;
        const i = idx(xx, y);
        const tile = tiles[i] ?? DEEP;
        if (tile === GRASS || tile === DIRT || tile === FOREST || tile === SAND) farm[i] = s + 1;
      }
    }
  });
  for (let s = 1; s < spots.length; s++) {
    const a = spots[s - 1]!;
    const b = spots[s]!;
    const dx = wrapDelta(b.x - a.x);
    const dy = b.y - a.y;
    const steps = Math.max(6, Math.ceil(Math.hypot(dx, dy) * 2));
    for (let i = 0; i <= steps; i++) {
      const x = wrap(a.x + (dx * i) / steps);
      const y = a.y + (dy * i) / steps;
      const id = idx(x, y);
      if (!blocked(tiles[id] ?? DEEP)) road[id] = 1;
    }
  }
  return { tiles, farm, road, spots };
}

export function earthStats(seed = 1) {
  const rng = () => 0.5;
  const g = generatePlanet("tierra", seed, 3, rng);
  let land = 0;
  let lake = 0;
  let forest = 0;
  let snow = 0;
  for (const t of g.tiles) {
    if (t !== DEEP && t !== SHALLOW) land++;
    if (t === LAKE) lake++;
    if (t === FOREST) forest++;
    if (t === SNOW) snow++;
  }
  return { land: land / g.tiles.length, lake, forest, snow, spots: g.spots.length };
}