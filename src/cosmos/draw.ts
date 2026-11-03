import { cellOf, type Art } from "./art";
import { columnAt, retainChunks } from "./chunks";
import { drawCreature } from "./creature";
import { drawFolk, drawGrove, drawHouse, type FolkAct, type FolkLook, type GroveKind } from "./folk";
import { columnColors } from "./voxel-skin";
import { CRYSTAL, DEEP, DIRT, FLESH, FOREST, GRASS, H, LAKE, LAVA, ROCK, SAND, SHALLOW, SNOW, SWAMP, W, blocked, clamp, idx, wrap, wrapDelta } from "./geo";
import type { Fauna, Person, Planet, Work, World } from "./types";
import { BABY_DAYS, CHILD_DAYS } from "./types";

export type Cam = { x: number; y: number; zoom: number };
export type Screen = "sistema" | "planeta" | "cronica";

const TILE = 24;
const BIOME_CELL = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 1];

type Cache = { canvas: HTMLCanvasElement; key: string };
const surfaces = new WeakMap<Planet, Cache>();
const globes = new WeakMap<Planet, { key: string; rot: number; canvas: HTMLCanvasElement }>();
const ghost = new Map<number, { x: number; y: number; t: number }>();
const rgbCache = new Map<string, [number, number, number]>();

const INK = "#0e0c0a";
const BONE = "#f0e2c8";
const GOLD = "#e2b15a";
const MOSS = "#6f8f5e";
const RUST = "#c45c26";

function hash(x: number, y: number, salt: number) {
  let n = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + salt) >>> 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

const LIFT = 0.72;

export function columnRise(planet: Planet, x: number, y: number) {
  return (blocksAt(planet, x, y) - 1) * LIFT;
}

function blocksAt(planet: Planet, x: number, y: number) {
  const col = columnAt(planet.seed, planet.kind, x, y);
  const yy = Math.floor(y);
  if (yy < 0 || yy >= H) return col.h;
  const i = idx(x, yy);
  if (planet.span?.[i]) return Math.max(col.h, 2);
  return col.h;
}

function drawColumn(
  ctx: CanvasRenderingContext2D,
  art: Art,
  planet: Planet,
  x: number,
  y: number,
  sx: number,
  anim: number,
) {
  const col = columnAt(planet.seed, planet.kind, x, y);
  let tile = col.tile;
  const yy = Math.floor(y);
  const onDisk = yy >= 0 && yy < H;
  const i = onDisk ? idx(x, yy) : -1;
  if (onDisk && planet.farm[i]) tile = GRASS;
  const wet = tile === DEEP || tile === SHALLOW || tile === LAKE;
  const blocks = col.h;
  const south = blocksAt(planet, x, y + 1);
  const shift = (blocks - 1) * LIFT;
  const ty = y - shift;
  const salt = hash(x, y, planet.seed + 19);
  const paintTop = (tx: number, ty: number) => {
    const img = art.sheets.terrain;
    const cell = onDisk && planet.farm[i] ? 12 : onDisk && (planet.road[i] || planet.span?.[i]) ? 13 : (BIOME_CELL[tile] ?? 3);
    if (img) {
      const flip = hash(x, y, planet.seed + 2) > 0.5 ? -1 : 1;
      const flop = hash(x, y, planet.seed + 5) > 0.5 ? -1 : 1;
      ctx.save();
      ctx.translate(tx + 0.52, ty + 0.52);
      ctx.scale(flip, flop);
      blitIndex(ctx, img, cell, 4, -0.52, -0.52, 1.04, 1.04, columnColors(tile, salt).top);
      ctx.restore();
    } else {
      ctx.fillStyle = columnColors(tile, salt).top;
      ctx.fillRect(tx, ty, 1, 1);
    }
  };

  if (wet) {
    paintTop(sx - 0.02, ty - 0.02);
    const land = (nx: number, ny: number) => {
      const t = columnAt(planet.seed, planet.kind, nx, ny).tile;
      return t !== DEEP && t !== SHALLOW && t !== LAKE;
    };
    const foam = 0.28 + Math.sin(anim * 2.2 + x * 0.7 + y) * 0.12;
    ctx.fillStyle = `rgba(236,240,234,${foam})`;
    if (land(x, y - 1)) ctx.fillRect(sx, ty, 1, 0.14);
    if (land(x, y + 1)) ctx.fillRect(sx, ty + 0.86, 1, 0.14);
    if (land(x - 1, y)) ctx.fillRect(sx, ty, 0.14, 1);
    if (land(x + 1, y)) ctx.fillRect(sx + 0.86, ty, 0.14, 1);
    const slide = (anim * 0.35 + x * 0.2 + y) % 1;
    ctx.fillStyle = `rgba(255,255,255,${0.07 + Math.sin(anim * 1.6 + y) * 0.04})`;
    ctx.fillRect(sx + 0.15 + slide * 0.35, ty + 0.28, 0.28, 0.07);
    return;
  }

  if (tile === LAVA) {
    paintTop(sx, ty);
    const pulse = 0.25 + Math.sin(anim * 2.4 + x * 0.7 + y) * 0.12;
    ctx.fillStyle = `rgba(255,150,48,${pulse})`;
    ctx.fillRect(sx + 0.22, ty + 0.34, 0.5, 0.1);
    return;
  }

  paintTop(sx - 0.02, ty - 0.02);
  const southTop = y + 1 - (south - 1) * LIFT;
  const drop = southTop - (ty + 1);
  const skin = columnColors(tile, salt);
  if (drop > 0.2) {
    ctx.fillStyle = skin.side;
    ctx.fillRect(sx, ty + 1, 1, drop);
  }
  const north = blocksAt(planet, x, y - 1);
  if (north > blocks + 0.2) {
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(sx, ty, 1, 0.08);
  }
}

function drawTreeArt(ctx: CanvasRenderingContext2D, art: Art, kind: GroveKind, salt: number) {
  const img = art.sheets.trees;
  const index = kind === "nieve" || kind === "pino" ? 1 : kind === "palma" ? 2 : kind === "seco" ? 3 : 0;
  if (!img || kind === "carne" || kind === "cristal") {
    drawGrove(ctx, kind, salt);
    return;
  }
  const cell = cellOf(img, index, 2, 2, 2);
  const h = 2.35;
  const w = h * (cell.sw / cell.sh);
  ctx.drawImage(img, cell.sx, cell.sy, cell.sw, cell.sh, -w / 2, -h, w, h);
}
function rgbOf(hex: string): [number, number, number] {
  const hit = rgbCache.get(hex);
  if (hit) return hit;
  const n = Number.parseInt(hex.slice(1), 16);
  const rgb: [number, number, number] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  rgbCache.set(hex, rgb);
  return rgb;
}

function maxEra(world: World, planetId: number) {
  let era = 0;
  for (const civ of world.civs) if (civ.planet === planetId) era = Math.max(era, civ.era);
  return era;
}

function surfaceKey(world: World, planet: Planet) {
  let key = `${planet.stamp ?? 0}:${planet.sites.length}:`;
  for (const civ of world.civs) if (civ.planet === planet.id) key += `${civ.id}:${civ.era},`;
  for (const site of planet.sites) key += `${site.civId}@${site.x | 0},${site.y | 0},${site.level};`;
  return key;
}

function paintActor(ctx: CanvasRenderingContext2D, img: HTMLImageElement, frame: number, height: number, hue = 0) {
  ctx.save();
  ctx.fillStyle = "rgba(12,10,8,0.28)";
  ctx.beginPath();
  ctx.ellipse(0, 0.03, height * 0.2, height * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  if (hue) ctx.filter = `hue-rotate(${hue}deg)`;
  const col = frame % 2;
  const row = (frame / 2) | 0;
  const cw = img.width / 2;
  const ch = img.height / 2;
  const h = height;
  ctx.drawImage(img, col * cw, row * ch, cw, ch, -h * 0.42, -h, h * 0.84, h);
  ctx.filter = "none";
  ctx.imageSmoothingEnabled = prev;
  ctx.restore();
}

function actorFrame(phase: number, moving: boolean) {
  if (!moving) return 0;
  const t = ((phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return Math.floor((t / (Math.PI * 2)) * 4) % 4;
}

function blitIndex(
  g: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  index: number,
  cols: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  fallback: string,
  sample = 0,
  jx = 0.5,
  jy = 0.5,
) {
  if (!img) {
    g.fillStyle = fallback;
    g.fillRect(dx, dy, dw, dh);
    return;
  }
  const cell = cellOf(img, index, cols, cols === 4 ? 4 : 2);
  let sx = cell.sx;
  let sy = cell.sy;
  let sw = cell.sw;
  let sh = cell.sh;
  if (sample > 8 && sample < sw && sample < sh) {
    sx += (sw - sample) * jx;
    sy += (sh - sample) * jy;
    sw = sample;
    sh = sample;
  }
  g.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

function paintSurface(art: Art, planet: Planet, world: World) {
  const canvas = document.createElement("canvas");
  canvas.width = W * TILE;
  canvas.height = H * TILE;
  const g = canvas.getContext("2d");
  if (!g) return canvas;
  g.imageSmoothingEnabled = true;
  const terrain = art.sheets.terrain;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const tile = planet.tiles[i] ?? 0;
      const cell = BIOME_CELL[tile] ?? 0;
      blitIndex(g, terrain, cell, 4, x * TILE, y * TILE, TILE, TILE, art.palette[cell] ?? MOSS, 120, hash(x, y, planet.seed), hash(x, y, planet.seed + 5));
      const span = planet.span?.[i] ?? 0;
      if (planet.farm[i]) blitIndex(g, terrain, 12, 4, x * TILE, y * TILE, TILE, TILE, art.palette[12] ?? GOLD, 48, hash(x, y, 2), hash(x, y, 3));
      if (planet.road[i] || span) blitIndex(g, terrain, 13, 4, x * TILE, y * TILE, TILE, TILE, art.palette[13] ?? BONE, 48, hash(x, y, 4), hash(x, y, 6));
    }
  }
  g.globalAlpha = 0.42;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = planet.tiles[y * W + x] ?? 0;
      const left = planet.tiles[y * W + wrap(x - 1)] ?? t;
      if (left !== t && !planet.road[y * W + x]) {
        g.fillStyle = art.palette[BIOME_CELL[left] ?? 0] ?? MOSS;
        g.fillRect(x * TILE, y * TILE, 4, TILE);
      }
      const up = y > 0 ? (planet.tiles[(y - 1) * W + x] ?? t) : t;
      if (up !== t && !planet.road[y * W + x]) {
        g.fillStyle = art.palette[BIOME_CELL[up] ?? 0] ?? MOSS;
        g.fillRect(x * TILE, y * TILE, TILE, 4);
      }
    }
  }
  g.globalAlpha = 1;
  for (const site of planet.sites) {
    const rad = site.level >= 3 ? 3.1 : site.level >= 2 ? 2.1 : 0;
    const cell = site.level >= 3 ? 15 : 14;
    if (!rad) continue;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        if (Math.hypot(dx, dy) > rad) continue;
        const x = wrap(site.x + dx);
        const y = site.y + dy;
        if (y < 0 || y >= H) continue;
        const i = y * W + x;
        if (blocked(planet.tiles[i] ?? 0)) continue;
        blitIndex(g, terrain, cell, 4, x * TILE, y * TILE, TILE, TILE, art.palette[cell] ?? BONE, 32);
      }
    }
  }
  return canvas;
}

export function ensureSurface(art: Art, planet: Planet, world: World) {
  const key = surfaceKey(world, planet);
  const prev = surfaces.get(planet);
  if (prev && prev.key === key) return prev.canvas;
  const canvas = paintSurface(art, planet, world);
  surfaces.set(planet, { canvas, key });
  globes.delete(planet);
  return canvas;
}

function tileColor(art: Art, planet: Planet, world: World, x: number, y: number) {
  const i = y * W + x;
  const tile = planet.tiles[i] ?? 0;
  let cell = BIOME_CELL[tile] ?? 0;
  if (planet.farm[i]) cell = 12;
  if (planet.road[i] || planet.span?.[i]) cell = 13;
  for (const site of planet.sites) {
    if (site.level < 2) continue;
    if (Math.hypot(wrapDelta(x - site.x), y - site.y) <= (site.level >= 3 ? 3 : 2)) cell = site.level >= 3 ? 15 : 14;
  }
  return rgbOf(art.palette[cell] ?? MOSS);
}

function chase(id: number, x: number, y: number, anim: number) {
  let g = ghost.get(id);
  if (!g) {
    g = { x, y, t: anim };
    ghost.set(id, g);
    return g;
  }
  const dt = Math.min(0.05, Math.max(0, anim - g.t));
  g.t = anim;
  const dx = wrapDelta(x - g.x);
  const dy = y - g.y;
  const dist = Math.hypot(dx, dy);
  if (dist > 12) {
    g.x = x;
    g.y = y;
    return g;
  }
  if (dist < 0.004 || dt <= 0) return g;
  const rate = Math.max(0.38, Math.min(2.8, dist / 2.15));
  const step = Math.min(dist, rate * dt);
  g.x = wrap(g.x + (dx / dist) * step);
  g.y += (dy / dist) * step;
  return g;
}

function folkLook(p: Person): FolkLook {
  return {
    hair: p.hair ?? Math.abs(p.id) % 6,
    cloth: p.cloth ?? Math.abs(p.id * 3) % 6,
    mark: p.mark ?? Math.abs(p.id) % 5,
  };
}

function drawSprite(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  index: number,
  cols: number,
  x: number,
  y: number,
  w: number,
  h: number,
  flip: boolean,
  fallback: string,
  rows = cols,
  pose?: Pose,
) {
  const psx = pose?.sx ?? 1;
  const psy = pose?.sy ?? 1;
  const rot = pose?.rot ?? 0;
  const ox = pose?.ox ?? 0;
  const oy = pose?.oy ?? 0;
  const smear = pose?.smear ?? 0;
  ctx.save();
  ctx.translate(x + ox, y + oy);
  ctx.fillStyle = "rgba(14,12,10,0.4)";
  ctx.beginPath();
  ctx.ellipse(0, -0.08, w * 0.28 * psx, 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  const paint = (alpha: number, extra: number) => {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate((flip ? 1 : -1) * extra, 0);
    ctx.rotate(rot);
    ctx.scale((flip ? -1 : 1) * psx, psy);
    if (!img) {
      ctx.fillStyle = fallback;
      ctx.fillRect(-w / 2, -h, w, h * 0.72);
    } else {
      const cell = cellOf(img, index, cols, 2, rows);
      ctx.drawImage(img, cell.sx, cell.sy, cell.sw, cell.sh, -w / 2, -h, w, h);
    }
    if ((pose?.flash ?? 0) > 0.02 && extra === 0) {
      ctx.globalCompositeOperation = "source-atop";
      ctx.fillStyle = `rgba(255,246,230,${pose?.flash})`;
      ctx.fillRect(-w / 2, -h, w, h);
    }
    ctx.restore();
  };
  if (smear > 0.04) paint(0.32, smear);
  paint(1, 0);
  ctx.restore();
}

function wind(anim: number, salt: number) {
  return Math.sin(anim * 0.9 + salt) * 0.09 + Math.sin(anim * 1.8 + salt * 2.1) * 0.035;
}

function drawFoliage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  index: number,
  cols: number,
  rows: number,
  x: number,
  y: number,
  w: number,
  h: number,
  rot: number,
) {
  if (!img) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const cell = cellOf(img, index, cols, 1, rows);
  ctx.drawImage(img, cell.sx, cell.sy, cell.sw, cell.sh, -w / 2, -h, w, h);
  ctx.restore();
}

type Pose = { sx?: number; sy?: number; rot?: number; smear?: number; flash?: number; ox?: number; oy?: number };

type Mot = {
  x: number;
  y: number;
  t: number;
  vx: number;
  vy: number;
  speed: number;
  phase: number;
  act: number;
  dt: number;
  lastWalk: number;
  lastAct: number;
  landed: boolean;
  face: number;
  turn: number;
  hop: number;
  rise: number;
};

const mots = new Map<number, Mot>();
const fallVis = new Map<number, number>();
const treeVis = new Map<number, { ang: number; burst: boolean }>();

type Mote = {
  planet: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  kind: "dust" | "chip" | "leaf" | "spark" | "ring";
};

const motes: Mote[] = [];
let lastAnim = -1;
let shake = 0;

function kick(n: number) {
  shake = Math.min(0.22, shake + n);
}

function burst(planet: number, x: number, y: number, kind: Mote["kind"], n: number, dir: number) {
  for (let i = 0; i < n; i++) {
    motes.push({
      planet,
      x,
      y: y - 0.7,
      vx: dir * (0.4 + Math.random() * 1.1) + (Math.random() - 0.5) * 0.8,
      vy: -0.8 - Math.random() * 1.6,
      life: 0.28 + Math.random() * 0.28,
      max: 0.56,
      kind,
    });
  }
  if (motes.length > 160) motes.splice(0, motes.length - 160);
}

function stepFx(anim: number) {
  if (lastAnim < 0) {
    lastAnim = anim;
    return;
  }
  const dt = Math.min(0.05, Math.max(0, anim - lastAnim));
  lastAnim = anim;
  shake *= Math.exp(-7 * dt);
  for (let i = motes.length - 1; i >= 0; i--) {
    const m = motes[i]!;
    m.life -= dt;
    if (m.life <= 0) {
      motes.splice(i, 1);
      continue;
    }
    if (m.kind !== "ring") {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.vy += 2.4 * dt;
    }
  }
}

function beat(phase: number, weights: number[]) {
  const sum = weights.reduce((a, b) => a + b, 0);
  let f = phase % 1;
  if (f < 0) f += 1;
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i]! / sum;
    if (f < acc) return i;
  }
  return weights.length - 1;
}

function sample(id: number, x: number, y: number, anim: number, still: boolean) {
  let m = mots.get(id);
  if (!m) {
    m = { x, y, t: anim, vx: 0, vy: 0, speed: 0, phase: (id % 5) * 0.17, act: 0, dt: 0, lastWalk: 0, lastAct: -1, landed: false, face: 0, turn: 0, hop: 0, rise: -1 };
    mots.set(id, m);
    return m;
  }
  if (still) {
    m.x = x;
    m.y = y;
    m.t = anim;
    m.speed = 0;
    m.vx = 0;
    m.vy = 0;
    m.dt = 0;
    return m;
  }
  const dt = Math.min(0.05, Math.max(0, anim - m.t));
  const dx = wrapDelta(x - m.x);
  const dy = y - m.y;
  const dist = Math.hypot(dx, dy);
  const inst = dt > 0 ? dist / dt : 0;
  m.speed += (inst - m.speed) * 0.4;
  m.vx = dt > 0 ? dx / dt : 0;
  m.vy = dt > 0 ? dy / dt : 0;
  m.phase += dt * 2.1 + dist * 2.2;
  m.dt = dt;
  m.x = x;
  m.y = y;
  m.t = anim;
  return m;
}

function easeFall(id: number, down: boolean) {
  const v = fallVis.get(id) ?? 0;
  const next = v + ((down ? 1 : 0) - v) * (down ? 0.22 : 0.14);
  const landed = down && v < 0.72 && next >= 0.72;
  fallVis.set(id, next < 0.02 && !down ? 0 : next);
  return { v: next, landed };
}

function drawMotes(ctx: CanvasRenderingContext2D, planetId: number) {
  for (const m of motes) {
    if (m.planet !== planetId) continue;
    const a = clamp(m.life / m.max, 0, 1);
    if (m.kind === "ring") {
      const k = 1 - a;
      ctx.globalAlpha = a * 0.7;
      ctx.strokeStyle = BONE;
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      ctx.ellipse(m.x, m.y, 0.25 + k * 1.3, 0.1 + k * 0.38, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      continue;
    }
    ctx.globalAlpha = a;
    if (m.kind === "dust") {
      ctx.fillStyle = "#cbb892";
      ctx.beginPath();
      ctx.ellipse(m.x, m.y, 0.16 + (1 - a) * 0.2, 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (m.kind === "chip") {
      ctx.fillStyle = "#a56b3c";
      ctx.fillRect(m.x, m.y, 0.14, 0.06);
    } else if (m.kind === "leaf") {
      ctx.fillStyle = "#3e7a3a";
      ctx.beginPath();
      ctx.ellipse(m.x, m.y, 0.12, 0.07, m.vx, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = BONE;
      ctx.lineWidth = 0.04;
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(m.x - m.vx * 0.08, m.y - m.vy * 0.08);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

function slash(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number, power: number) {
  ctx.save();
  ctx.translate(x, y - 1.1);
  ctx.strokeStyle = "rgba(255,246,230,0.9)";
  ctx.lineWidth = 0.07;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(0, 0, 0.85, dir > 0 ? -1.1 : Math.PI + 0.2, dir > 0 ? 0.7 : Math.PI + 1.8);
  ctx.stroke();
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 0.035;
  for (let i = 0; i < 3; i++) {
    const yy = -0.35 + i * 0.22;
    ctx.beginPath();
    ctx.moveTo(dir * 0.15, yy);
    ctx.lineTo(dir * (0.35 + power + i * 0.12), yy - 0.04);
    ctx.stroke();
  }
  ctx.restore();
}

type Body = { y: number; paint: () => void };

function fillRound(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
  ctx.fill();
}

function drawScaffold(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.09;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (const x of [-0.9, 0.08, 0.92]) {
    ctx.moveTo(x, 0.12);
    ctx.lineTo(x, -1.9);
  }
  ctx.moveTo(-0.9, -1.2);
  ctx.lineTo(0.92, -1.2);
  ctx.moveTo(-0.9, -0.55);
  ctx.lineTo(0.92, -0.55);
  ctx.stroke();
  ctx.restore();
}

function drawDeck(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dx: number,
  dy: number,
  t: number,
  kind: "puente" | "acueducto" | "dique",
) {
  const len = Math.hypot(dx, dy);
  if (len < 0.2) return;
  const span = len * t;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const hw = 0.35;
  ctx.save();
  ctx.fillStyle = kind === "dique" ? "#8a8478" : "#6a4b34";
  ctx.beginPath();
  ctx.moveTo(x + px * hw, y + py * hw);
  ctx.lineTo(x + ux * span + px * hw, y + uy * span + py * hw);
  ctx.lineTo(x + ux * span - px * hw, y + uy * span - py * hw);
  ctx.lineTo(x - px * hw, y - py * hw);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = BONE;
  const step = kind === "dique" ? 0.28 : 0.42;
  const thick = kind === "dique" ? 0.2 : 0.15;
  for (let d = 0.14; d < span - 0.02; d += step) {
    const cx = x + ux * d;
    const cy = y + uy * d;
    const pw = hw * 0.88;
    ctx.beginPath();
    ctx.moveTo(cx - ux * thick + px * pw, cy - uy * thick + py * pw);
    ctx.lineTo(cx + ux * thick + px * pw, cy + uy * thick + py * pw);
    ctx.lineTo(cx + ux * thick - px * pw, cy + uy * thick - py * pw);
    ctx.lineTo(cx - ux * thick - px * pw, cy - uy * thick - py * pw);
    ctx.closePath();
    ctx.fill();
  }
  if (kind === "acueducto") {
    ctx.strokeStyle = "rgba(110,160,170,0.9)";
    ctx.lineWidth = 0.16;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x + ux * 0.2, y + uy * 0.2);
    ctx.lineTo(x + ux * Math.max(0.2, span - 0.12), y + uy * Math.max(0.2, span - 0.12));
    ctx.stroke();
  }
  ctx.strokeStyle = RUST;
  ctx.lineWidth = 0.07;
  ctx.beginPath();
  ctx.moveTo(x + px * hw, y + py * hw);
  ctx.lineTo(x + ux * span + px * hw, y + uy * span + py * hw);
  ctx.moveTo(x - px * hw, y - py * hw);
  ctx.lineTo(x + ux * span - px * hw, y + uy * span - py * hw);
  ctx.stroke();
  ctx.fillStyle = RUST;
  for (let d = 0; d <= span + 0.01; d += 2) {
    const dd = Math.min(d, span);
    for (const side of [-1, 1]) {
      const cx = x + ux * dd + px * side * hw;
      const cy = y + uy * dd + py * side * hw;
      ctx.fillRect(cx - 0.1, cy - 0.72, 0.2, 0.8);
    }
  }
  ctx.restore();
}

function drawRoute(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, t: number, color: string) {
  const len = Math.hypot(dx, dy);
  if (len < 0.15) return;
  const span = len * t;
  const ux = dx / len;
  const uy = dy / len;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.35;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + ux * span, y + uy * span);
  ctx.stroke();
  ctx.restore();
}

function drawBoatShape(ctx: CanvasRenderingContext2D, scale: number) {
  ctx.save();
  ctx.scale(scale, scale);
  ctx.fillStyle = RUST;
  ctx.beginPath();
  ctx.ellipse(0.05, 0.08, 1.28, 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(1.05, 0.08);
  ctx.lineTo(1.55, 0.02);
  ctx.lineTo(1.05, -0.08);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.fillRect(0.18, -1.62, 0.09, 1.52);
  ctx.fillStyle = BONE;
  ctx.beginPath();
  ctx.moveTo(0.28, -1.48);
  ctx.lineTo(1.4, -0.58);
  ctx.lineTo(0.28, -0.12);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function waterDir(planet: Planet, x: number, y: number) {
  const dirs = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];
  for (const d of dirs) {
    if (blocked(planet.tiles[idx(x + d.x, y + d.y)] ?? 0)) return d;
  }
  return { x: 1, y: 0 };
}

function roofColor(kind: Work["kind"]) {
  if (kind === "horno" || kind === "mina") return RUST;
  if (kind === "escuela" || kind === "hospital") return BONE;
  if (kind === "molino") return GOLD;
  return MOSS;
}

function drawCivic(ctx: CanvasRenderingContext2D, kind: Work["kind"], t: number) {
  const stage = Math.min(8, Math.floor(t * 8));
  ctx.strokeStyle = "rgba(215,181,106,0.85)";
  ctx.lineWidth = 0.06;
  ctx.strokeRect(-2.2, -0.08, 4.4, 0.2);
  for (let i = 0; i < 6; i++) {
    const x = -1.9 + i * 0.76;
    if (i < stage) {
      const h = 1.1 + (i % 3) * 0.55;
      ctx.fillStyle = i % 2 ? "#6b4428" : "#a56b3c";
      ctx.fillRect(x, -h, 0.16, h);
    } else {
      ctx.fillStyle = "#d7b56a";
      ctx.fillRect(x, -0.45, 0.06, 0.45);
    }
  }
  if (stage >= 3) {
    ctx.fillStyle = "#c4a46a";
    ctx.fillRect(-2, -1.35, Math.min(stage - 2, 4) * 1.05, 0.12);
  }
  if (stage >= 5) {
    for (let i = 0; i < stage - 4; i++) {
      ctx.fillStyle = i % 2 ? "#e6d3b0" : "#f3e6cf";
      ctx.fillRect(-1.7 + i * 0.7, -1.2, 0.58, 0.95);
    }
  }
  if (stage >= 7) {
    ctx.fillStyle = roofColor(kind);
    ctx.beginPath();
    ctx.moveTo(-2.3, -1.35);
    ctx.lineTo(0, -2.7);
    ctx.lineTo(2.3, -1.35);
    ctx.closePath();
    ctx.fill();
  }
}

function drawWorkShape(ctx: CanvasRenderingContext2D, planet: Planet, work: Work, sx: number, t: number) {
  const y = work.y;
  const dx = wrapDelta(work.x2 - work.x);
  const dy = work.y2 - work.y;
  const kind = work.kind;
  if (kind === "puente" || kind === "acueducto" || kind === "dique") {
    drawDeck(ctx, sx, y, dx, dy, t, kind);
    return;
  }
  if (kind === "camino") {
    if (!work.done) drawRoute(ctx, sx, y, dx, dy, t, GOLD);
    return;
  }
  if (kind === "canal") {
    drawRoute(ctx, sx, y, dx, dy, t, "rgba(110,160,170,0.9)");
    return;
  }
  ctx.save();
  ctx.translate(sx, y);
  const yard = kind === "balsa" || kind === "barco" || kind === "muelle" || kind === "embarcadero" || kind === "faro" || kind === "astillero";
  if (yard && t < 1) drawScaffold(ctx);
  if (kind === "balsa") {
    const len = 2.3 * t;
    for (const log of [
      { y: -0.36, c: BONE },
      { y: 0, c: RUST },
      { y: 0.36, c: BONE },
    ]) {
      ctx.fillStyle = log.c;
      fillRound(ctx, -len / 2, log.y - 0.14, Math.max(0.08, len), 0.28, 0.12);
    }
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.06;
    ctx.beginPath();
    ctx.moveTo(-len * 0.22, -0.48);
    ctx.lineTo(-len * 0.22, 0.48);
    ctx.moveTo(len * 0.22, -0.48);
    ctx.lineTo(len * 0.22, 0.48);
    ctx.stroke();
  } else if (kind === "barco") {
    drawBoatShape(ctx, Math.max(0.08, t));
  } else if (kind === "muelle" || kind === "embarcadero") {
    const dir = waterDir(planet, work.x, work.y);
    const reach = 2.5 * t;
    const px = -dir.y;
    const py = dir.x;
    const count = t > 0.72 ? 6 : t > 0.4 ? 5 : 4;
    ctx.fillStyle = BONE;
    for (let i = 0; i < count; i++) {
      const d = ((i + 0.5) / count) * reach;
      const cx = dir.x * d;
      const cy = dir.y * d;
      const ht = Math.max(0.06, (reach / count) * 0.32);
      const hw = 0.46;
      ctx.beginPath();
      ctx.moveTo(cx - dir.x * ht + px * hw, cy - dir.y * ht + py * hw);
      ctx.lineTo(cx + dir.x * ht + px * hw, cy + dir.y * ht + py * hw);
      ctx.lineTo(cx + dir.x * ht - px * hw, cy + dir.y * ht - py * hw);
      ctx.lineTo(cx - dir.x * ht - px * hw, cy - dir.y * ht - py * hw);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = RUST;
    ctx.lineWidth = 0.08;
    ctx.beginPath();
    ctx.moveTo(px * 0.46, py * 0.46);
    ctx.lineTo(dir.x * reach + px * 0.46, dir.y * reach + py * 0.46);
    ctx.moveTo(-px * 0.46, -py * 0.46);
    ctx.lineTo(dir.x * reach - px * 0.46, dir.y * reach - py * 0.46);
    ctx.stroke();
    if (kind === "embarcadero") {
      ctx.fillStyle = RUST;
      ctx.fillRect(-0.1, -0.85, 0.2, 0.9);
    }
  } else if (kind === "faro") {
    const h = 2.2 * t;
    ctx.fillStyle = BONE;
    ctx.fillRect(-0.18, -h, 0.36, h);
    ctx.fillStyle = INK;
    ctx.fillRect(-0.22, -h * 0.55, 0.44, 0.07);
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.arc(0, -h - 0.16, 0.12 + 0.1 * t, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "astillero") {
    const s = Math.max(0.35, t);
    ctx.strokeStyle = BONE;
    ctx.lineWidth = 0.11;
    ctx.beginPath();
    ctx.moveTo(-1.2 * s, 0.05);
    ctx.quadraticCurveTo(0, 0.95 * s, 1.2 * s, 0.05);
    ctx.moveTo(-1.02 * s, 0.16);
    ctx.quadraticCurveTo(0, 0.72 * s, 1.02 * s, 0.16);
    ctx.moveTo(-0.45 * s, 0.28 * s);
    ctx.lineTo(-0.32 * s, 0.62 * s);
    ctx.moveTo(0, 0.2 * s);
    ctx.lineTo(0, 0.72 * s);
    ctx.moveTo(0.45 * s, 0.28 * s);
    ctx.lineTo(0.32 * s, 0.62 * s);
    ctx.stroke();
    ctx.fillStyle = RUST;
    ctx.fillRect(-1.15 * s - 0.06, -1.05, 0.14, 1.2);
    ctx.fillRect(1.05 * s - 0.06, -1.05, 0.14, 1.2);
  } else if (kind === "granja" || kind === "invernadero") {
    const half = 1.2 + t;
    if (kind === "invernadero") {
      ctx.fillStyle = "rgba(140,180,120,0.35)";
      ctx.beginPath();
      ctx.moveTo(-half + 0.15, -half * 0.15);
      ctx.lineTo(0, -half - 0.2);
      ctx.lineTo(half - 0.15, -half * 0.15);
      ctx.lineTo(half - 0.2, half * 0.72);
      ctx.lineTo(-half + 0.2, half * 0.72);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.strokeStyle = MOSS;
      ctx.lineWidth = 0.08;
      ctx.beginPath();
      for (let i = -1; i <= 1; i++) {
        ctx.moveTo(-half * 0.62, i * half * 0.28);
        ctx.lineTo(half * 0.62, i * half * 0.28);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = RUST;
    ctx.lineWidth = 0.08;
    ctx.strokeRect(-half, -half, half * 2, half * 2);
    ctx.fillStyle = BONE;
    for (const px of [-half, 0, half]) {
      for (const py of [-half, 0, half]) {
        if (px !== -half && px !== half && py !== -half && py !== half) continue;
        ctx.fillRect(px - 0.1, py - 0.46, 0.2, 0.56);
      }
    }
  } else if (kind === "pozo") {
    const r = 0.32 + 0.62 * t;
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(0, 0.04, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = BONE;
    ctx.lineWidth = 0.18 + 0.06 * t;
    ctx.beginPath();
    ctx.arc(0, 0.04, r, 0.4, Math.PI * 2 - 0.15);
    ctx.stroke();
    ctx.fillStyle = RUST;
    ctx.fillRect(-r * 0.75, -r * 1.2, 0.12, r * 0.72);
    ctx.fillRect(r * 0.6, -r * 1.2, 0.12, r * 0.72);
    ctx.fillRect(-r * 0.75, -r * 1.2, r * 1.47, 0.1);
  } else if (kind === "muralla") {
    const h = 0.5 * t;
    const n = 4;
    for (let i = 0; i < n; i++) {
      const bh = h * (i % 2 === 0 ? 1 : 0.82);
      ctx.fillStyle = i % 2 === 0 ? BONE : "#d7cbb6";
      ctx.fillRect(i * 0.7, -bh, 0.6, bh);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.05;
      ctx.strokeRect(i * 0.7, -bh, 0.6, bh);
    }
  } else if (kind === "torre" || kind === "atalaya") {
    const h = 2.4 * t;
    const w = kind === "atalaya" ? 0.62 : 1.05;
    ctx.fillStyle = BONE;
    ctx.fillRect(-w / 2, -h, w, h);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    for (let yy = 0.35; yy < h - 0.08; yy += 0.42) {
      ctx.moveTo(-w / 2, -yy);
      ctx.lineTo(w / 2, -yy);
    }
    ctx.stroke();
    ctx.fillStyle = "#d9d0c2";
    ctx.fillRect(-w / 2 - 0.08, -h - 0.18, w + 0.16, 0.24);
    ctx.fillStyle = INK;
    ctx.fillRect(-0.08, -Math.min(h * 0.45, h - 0.2), 0.16, Math.min(0.28, h * 0.25));
    if (kind === "atalaya") {
      ctx.fillStyle = GOLD;
      ctx.beginPath();
      ctx.moveTo(0, -h - 0.55);
      ctx.lineTo(0.22, -h - 0.1);
      ctx.lineTo(-0.22, -h - 0.1);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = INK;
      ctx.fillRect(-w * 0.12, -h - 0.18, w * 0.24, 0.16);
    }
  } else {
    drawCivic(ctx, kind, t);
  }
  ctx.restore();
}

function drawPlanetView(
  ctx: CanvasRenderingContext2D,
  art: Art,
  world: World,
  cam: Cam,
  vw: number,
  vh: number,
  anim: number,
  still: boolean,
  dpr: number,
  mark: { kind: "person" | "fauna"; id: number } | null = null,
) {
  const planet = world.planets[world.focusPlanet];
  if (!planet) return;
  const surf = ensureSurface(art, planet, world);
  ctx.imageSmoothingEnabled = true;
  ctx.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, dpr * (vw / 2 - cam.x * cam.zoom), dpr * (vh / 2 - cam.y * cam.zoom));
  stepFx(anim);
  if (shake > 0.004) ctx.translate(Math.sin(anim * 86) * shake, Math.cos(anim * 71) * shake * 0.6);
  retainChunks(planet.seed, planet.kind, cam.x, cam.y, 5);
  const view = Math.max(vw, vh) / cam.zoom + 6;
  const bodies: Body[] = [];
  const y0 = Math.floor(cam.y - view);
  const y1 = Math.ceil(cam.y + view) + 2;
  const x0 = Math.floor(cam.x - view);
  const x1 = Math.ceil(cam.x + view);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      bodies.push({
        y: y + 0.01,
        paint: () => drawColumn(ctx, art, planet, x, y, x, anim),
      });
    }
  }
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const tile = columnAt(planet.seed, planet.kind, x, y).tile;
      const forest = tile === FOREST || tile === SWAMP;
      const flesh = tile === FLESH || (planet.kind === "carne" && tile !== DEEP && tile !== SHALLOW);
      const crystal = tile === CRYSTAL || (planet.kind === "cristal" && tile === ROCK);
      const snowTree = tile === SNOW && hash(x, y, planet.seed + 9) < 0.08;
      const earthTree = planet.kind === "tierra" && (forest || snowTree);
      if (!earthTree && !flesh && !crystal && !snowTree && !(forest && planet.kind !== "tierra")) continue;
      if (!snowTree && hash(x, y, planet.seed) > (forest ? 0.55 : 0.72)) continue;
      const sx = x + 0.5;
      const salt = hash(x, y, planet.seed + 3) * 40;
      bodies.push({
        y: y + 0.2,
        paint: () => {
          const rot = wind(anim, salt);
          const roll = hash(x, y, planet.seed + 6);
          let kind: GroveKind = "roble";
          if (snowTree || planet.kind === "hielo") kind = "nieve";
          else if (flesh) kind = "carne";
          else if (crystal) kind = "cristal";
          else if (planet.kind === "desierto") kind = "seco";
          else if (planet.kind === "jungla") kind = "palma";
          ctx.save();
          ctx.translate(sx, y + 0.95 - columnRise(planet, x, y));
          ctx.fillStyle = "rgba(12,10,8,0.22)";
          ctx.beginPath();
          ctx.ellipse(0, 0.02, 0.42, 0.12, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.rotate(rot);
          drawTreeArt(ctx, art, kind, roll);
          ctx.restore();
        },
      });
    }
  }
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const tile = columnAt(planet.seed, planet.kind, x, y).tile;
      if (tile !== ROCK && tile !== SNOW) continue;
      const cave = tile === ROCK && hash(x, y, planet.seed + 11) < 0.08;
      if (!cave) continue;
      const sx = x + 0.5;
      const gy = y + 0.78 - columnRise(planet, x, y);
      bodies.push({
        y: y + 0.25,
        paint: () => {
          ctx.fillStyle = "#14110e";
          ctx.fillRect(sx - 0.28, gy - 0.42, 0.56, 0.46);
          const flick = 0.45 + Math.sin(anim * 7 + x) * 0.22;
          ctx.fillStyle = `rgba(226,140,60,${flick})`;
          ctx.fillRect(sx - 0.08, gy - 0.22, 0.16, 0.22);
        },
      });
    }
  }
  for (const site of planet.sites) {
    const sx = cam.x + wrapDelta(site.x - cam.x);
    if (Math.abs(sx - cam.x) > view || Math.abs(site.y - cam.y) > view) continue;
    const ground = site.y - columnRise(planet, site.x, site.y);
    const level = clamp(site.level, 0, 3);
    if (level >= 2) {
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const px = sx + Math.cos(a) * 1.5;
        const py = ground + Math.sin(a) * 1.5;
        bodies.push({
          y: site.y,
          paint: () => {
            ctx.fillStyle = "#5a3d28";
            ctx.beginPath();
            ctx.roundRect(px - 0.05, py - 0.62, 0.1, 0.62, 0.04);
            ctx.fill();
            ctx.fillStyle = "#7a5438";
            ctx.beginPath();
            ctx.moveTo(px - 0.07, py - 0.55);
            ctx.lineTo(px, py - 0.74);
            ctx.lineTo(px + 0.07, py - 0.55);
            ctx.fill();
          },
        });
      }
    }
    bodies.push({
      y: site.y + 0.05,
      paint: () => {
        ctx.save();
        ctx.translate(sx, ground);
        const near = Math.hypot(cam.x - site.x, cam.y - site.y);
        const roof = cam.zoom >= 16 && near < 3.4 ? 0.28 : 1;
        if (art.actors.houses) {
          ctx.globalAlpha *= roof;
          paintActor(ctx, art.actors.houses, Math.min(3, level), 1.85 + level * 0.4);
        } else drawHouse(ctx, level, 0.5 + Math.sin(anim * 8 + site.civId) * 0.5, roof);
        ctx.restore();
        if (roof > 0.6 && level >= 1) {
          const puff = (anim * 0.35 + site.civId) % 1;
          ctx.fillStyle = `rgba(232,228,220,${(1 - puff) * 0.4})`;
          ctx.beginPath();
          ctx.arc(sx + 0.42, ground - (1.7 + level * 0.28) - puff * 0.7, 0.07 + puff * 0.1, 0, Math.PI * 2);
          ctx.fill();
        }
      },
    });
    if (level >= 3) {
      for (const [ox, oy] of [
        [1.15, 0.25],
        [-1.05, 0.5],
      ] as const) {
        bodies.push({
          y: site.y + oy,
          paint: () => {
            ctx.save();
            ctx.translate(sx + ox, ground + oy);
            if (art.actors.houses) paintActor(ctx, art.actors.houses, 0, 1.15);
            else {
              ctx.scale(0.55, 0.55);
              drawHouse(ctx, 0, 0.2);
            }
            ctx.restore();
          },
        });
      }
    }
  }
  for (const work of world.works) {
    if (work.planet !== planet.id) continue;
    if (work.kind === "camino" && work.done) continue;
    const t = work.done ? 1 : Math.max(0.08, work.progress / Math.max(1, work.need));
    const sx = cam.x + wrapDelta(work.x - cam.x);
    const dx = wrapDelta(work.x2 - work.x);
    const dy = work.y2 - work.y;
    const x1 = sx + dx * t;
    const y1 = work.y + dy * t;
    const pad = 4;
    if (
      Math.max(sx, x1) < cam.x - view - pad ||
      Math.min(sx, x1) > cam.x + view + pad ||
      Math.max(work.y, y1) < cam.y - view - pad ||
      Math.min(work.y, y1) > cam.y + view + pad
    ) {
      continue;
    }
    bodies.push({
      y: (work.y + y1) / 2,
      paint: () => {
        ctx.save();
        ctx.translate(0, -columnRise(planet, work.x, work.y));
        drawWorkShape(ctx, planet, work, sx, t);
        ctx.restore();
      },
    });
  }
  for (const tree of world.timber ?? []) {
    if (tree.planet !== planet.id || tree.carriedBy != null) continue;
    if (Math.abs(wrapDelta(tree.x - cam.x)) > view || Math.abs(tree.y - cam.y) > view) continue;
    const sx = cam.x + wrapDelta(tree.x - cam.x);
    const vis = treeVis.get(tree.id) ?? { ang: 0, burst: false };
    const target = tree.kind === "tronco" ? 1.48 : (tree.fall / 8) * 1.2;
    vis.ang += (target - vis.ang) * 0.14;
    if (!vis.burst && (tree.kind === "tronco" || vis.ang > 1.05)) {
      vis.burst = true;
      kick(0.16);
      burst(planet.id, sx, tree.y - 1.2, "leaf", 7, 1);
      burst(planet.id, sx, tree.y, "chip", 4, 1);
      motes.push({ planet: planet.id, x: sx, y: tree.y, vx: 0, vy: 0, life: 0.35, max: 0.35, kind: "ring" });
    }
    if (tree.kind === "arbol" && tree.fall === 0) vis.burst = false;
    treeVis.set(tree.id, vis);
    const ang = vis.ang;
    bodies.push({
      y: tree.y,
      paint: () => {
        ctx.save();
        const form = tree.form ?? "roble";
        const col = form === "pino" ? 1 : form === "palma" ? 2 : form === "seco" ? 3 : 0;
        const tall = col === 1 ? 4.4 : col === 2 ? 3.6 : col === 3 ? 3 : 3.8;
        const wide = col === 1 ? 2.1 : col === 2 ? 3 : 2.6;
        const sheet = art.sheets.trees;
        ctx.translate(sx, tree.y + 0.05 - columnRise(planet, tree.x, tree.y));
        if (sheet) {
          const lean = tree.kind === "tronco" ? Math.min(ang, 1.5) : ang + wind(anim, tree.id * 0.17);
          ctx.rotate(lean);
          if (tree.kind === "tronco") ctx.translate(tall * 0.15, 0);
          drawFoliage(ctx, sheet, col, 4, 1, 0, 0, wide, tall, 0);
        } else {
          ctx.scale(tree.kind === "tronco" ? tall * 0.2 : tall * 0.35, tree.kind === "tronco" ? tall * 0.2 : tall * 0.35);
          ctx.rotate(ang);
          ctx.fillStyle = "#5a3a22";
          ctx.fillRect(-0.16, -3.1, 0.32, 3.1);
        }
        ctx.restore();
      },
    });
  }
  for (const p of world.people) {
    if (!p.alive || p.planet !== planet.id) continue;
    if (Math.abs(p.x - cam.x) > view || Math.abs(p.y - cam.y) > view) continue;
    const pos = chase(p.id, p.x, p.y, anim);
    const sx = pos.x;
    if (p.heldBy != null) continue;
    const m = sample(p.id, pos.x, pos.y, anim, still);
    const moving = m.speed > 0.22;
    const young = p.role !== "alien" && (p.age ?? 500) < CHILD_DAYS;
    const baby = p.role !== "alien" && (p.age ?? 500) < BABY_DAYS;
    const hauling = p.carryId != null;
    const treeChop = !hauling && p.task === "tala" && !moving;
    const fighting = !hauling && !treeChop && (p.swing ?? 0) > 0;
    const building = !hauling && !moving && p.task === "obra";
    const crouching = !hauling && !moving && !building && (p.task === "pesca" || p.task === "siembra" || p.task === "acarreo" || p.task === "oficio");
    const down = (p.reel ?? 0) > 0 && p.role !== "alien";
    const fall = easeFall(p.id, down);
    if (fall.landed) {
      kick(0.14);
      burst(planet.id, sx, pos.y, "dust", 5, p.facing);
      motes.push({ planet: planet.id, x: sx, y: pos.y, vx: 0, vy: 0, life: 0.28, max: 0.28, kind: "ring" });
    }
    const ground = columnRise(planet, pos.x, pos.y);
    if (m.rise < 0) m.rise = ground;
    else if (!still) {
      const d = ground - m.rise;
      if (d < -0.5) m.hop = Math.min(m.hop, -0.34);
      else if (d > 0.5) m.hop = Math.max(m.hop, 0.26);
      m.rise = ground;
    }
    if (!still) {
      if (m.face !== 0 && m.face !== p.facing) m.turn = 0.28;
      m.face = p.facing || 1;
      if (m.hop > 0) m.hop = Math.max(0, m.hop - m.dt);
      else if (m.hop < 0) m.hop = Math.min(0, m.hop + m.dt);
      if (m.turn > 0) m.turn = Math.max(0, m.turn - m.dt);
    }
    if (treeChop || fighting) m.act += m.dt * (fighting ? 1.8 : 1.35);
    else if (building || crouching) m.act += m.dt * 0.9;
    const breath = Math.sin(anim * 1.7 + p.id * 0.7);
    let act: FolkAct = "idle";
    let phase = breath;
    if (fall.v > 0.06) {
      act = "fall";
      phase = fall.v;
    } else if (treeChop) {
      act = "chop";
      phase = m.act;
      const hit = Math.sin(m.act * 2) < -0.2;
      if (hit && m.lastAct !== 1) {
        kick(0.11);
        burst(planet.id, sx + p.facing * 0.4, pos.y - 0.2, "chip", 5, p.facing);
        burst(planet.id, sx + p.facing * 0.3, pos.y - 0.4, "spark", 3, p.facing);
        m.lastAct = 1;
      } else if (!hit) m.lastAct = 0;
    } else if (fighting) {
      act = "fight";
      phase = m.act;
    } else if ((p.reel ?? 0) > 0) {
      act = "guard";
      phase = breath;
    } else if (building) {
      act = "build";
      phase = m.act;
      m.lastAct = -1;
    } else if (crouching) {
      act = "crouch";
      phase = m.act;
      m.lastAct = -1;
    } else if (m.hop > 0.02 && moving) {
      act = "climb";
      phase = m.phase;
    } else if (m.hop < -0.02) {
      act = "jump";
      const t = 1 - Math.min(1, Math.abs(m.hop) / 0.34);
      phase = Math.sin(t * Math.PI);
    } else if (hauling) {
      act = "haul";
      phase = moving ? m.phase : breath;
      m.lastAct = -1;
    } else if (moving && m.turn > 0.04) {
      act = "turn";
      phase = m.phase;
    } else if (moving && (m.speed > 0.85 || p.task === "explora" || p.task === "caza" || p.task === "emboscada" || (p.dread ?? 0) > 68)) {
      act = "run";
      phase = m.phase;
      const stepMark = Math.floor(m.phase / Math.PI);
      if (!baby && m.lastWalk !== stepMark) burst(planet.id, sx - p.facing * 0.2, pos.y - m.rise, "dust", 2, -p.facing);
      m.lastWalk = stepMark;
      m.lastAct = -1;
    } else if (moving) {
      act = "walk";
      phase = m.phase;
      const stepMark = Math.floor(m.phase / Math.PI);
      if (!baby && m.lastWalk !== stepMark) burst(planet.id, sx - p.facing * 0.2, pos.y - m.rise, "dust", 1, -p.facing);
      m.lastWalk = stepMark;
      m.lastAct = -1;
    } else m.lastAct = -1;
    const feet = pos.y - ground;
    const alien = p.role === "alien";
    const folkScale = baby ? 0.5 : young ? 0.78 : 1.18;
    const pyy = Math.floor(pos.y);
    const water = !baby && blocked(columnAt(planet.seed, planet.kind, pos.x, pos.y).tile) && !(pyy >= 0 && pyy < H && (planet.span[idx(pos.x, pos.y)] ?? 0));
    const victim = p.task === "carga" ? world.people.find((o) => o.alive && o.heldBy === p.id) : undefined;
    const strike = (treeChop && Math.sin(m.act * 2) < -0.2) || (fighting && Math.sin(m.act * 3) > 0.55);
    bodies.push({
      y: pos.y + 0.45,
      paint: () => {
        const hiding = p.task === "emboscada" && (p.swing ?? 0) <= 0;
        if (hiding) ctx.globalAlpha = 0.82;
        const py = feet;
        if (water) {
          ctx.save();
          ctx.translate(sx, py + Math.sin(anim * 2.2 + p.id) * 0.04);
          if (p.facing < 0) ctx.scale(-1, 1);
          if (art.actors.boat) paintActor(ctx, art.actors.boat, Math.floor((anim * 0.7 + p.id) % 4), 1.7);
          else {
            ctx.rotate(Math.sin(anim * 1.6 + p.id) * 0.04);
            drawBoatShape(ctx, 1);
          }
          ctx.restore();
        }
        if ((p.wounds?.length ?? 0) > 0 || (p.reel ?? 0) > 0) {
          ctx.fillStyle = "rgba(92,14,12,0.8)";
          ctx.beginPath();
          ctx.ellipse(sx, py + 0.02, 0.35 + (p.wounds?.length ?? 0) * 0.1, 0.1, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.save();
        ctx.translate(sx, py - (act === "walk" || act === "run" ? 0 : Math.sin(anim * 1.4 + p.id) * 0.04));
        if (p.facing < 0) ctx.scale(-1, 1);
        if (alien) drawCreature(ctx, "alien", planet.kind, p.id, phase, "camina", 1.15);
        else {
          const posed = act === "chop" || act === "fight" || act === "build" || act === "crouch" || (act === "haul" && !moving);
          const sheet =
            young && art.actors.child
              ? art.actors.child
              : posed && art.actors.work
                ? art.actors.work
                : p.id % 2 && art.actors.woman
                  ? art.actors.woman
                  : art.actors.folk;
          const frame = posed
            ? act === "crouch"
              ? 2
              : act === "haul"
                ? 3
                : act === "build"
                  ? Math.sin(phase) > 0
                    ? 0
                    : 2
                  : Math.sin(phase * 2) > 0
                    ? 0
                    : 1
            : actorFrame(phase, act === "walk" || act === "run" || act === "haul" || act === "climb");
          const tall = baby ? 1.05 : young ? 1.35 : 1.85;
          if (sheet) paintActor(ctx, sheet, frame, tall, ((p.id * 37) % 28) - 14);
          else drawFolk(ctx, p.id, p.role, planet.kind, phase, hiding ? "idle" : act, folkScale, p.wounds ?? [], !!p.blind, folkLook(p));
        }
        ctx.restore();
        if (strike) slash(ctx, sx + p.facing * 0.2, py, p.facing, 0.8);
        if (victim) {
          ctx.save();
          ctx.translate(sx + p.facing * 0.28, py - 0.85);
          if (p.facing < 0) ctx.scale(-1, 1);
          drawFolk(ctx, victim.id, victim.role, planet.kind, breath, "fall", 0.7, victim.wounds ?? [], !!victim.blind, folkLook(victim));
          ctx.restore();
        }
        if (hiding) {
          ctx.globalAlpha = 0.92;
          const leaf = planet.kind === "desierto" ? "#c4a46a" : planet.kind === "hielo" ? "#d5e2ea" : planet.kind === "lava" ? "#5a4638" : "#2f6a32";
          ctx.fillStyle = leaf;
          ctx.fillRect(sx - 0.45, py - 1.15, 0.4, 0.32);
          ctx.fillRect(sx - 0.1, py - 1.35, 0.48, 0.36);
          ctx.fillRect(sx + 0.15, py - 1.05, 0.36, 0.28);
        }
        ctx.globalAlpha = 1;
      },
    });
  }
  for (const f of world.fauna) {
    if (!f.alive || f.planet !== planet.id) continue;
    if (Math.abs(f.x - cam.x) > view || Math.abs(f.y - cam.y) > view) continue;
    const pos = chase(10_000 + f.id, f.x, f.y, anim);
    const sx = pos.x;
    const fm = sample(10_000 + f.id, pos.x, pos.y, anim, still);
    if (f.kind === "ave" || f.mood === "come") fm.phase += fm.dt * (f.kind === "ave" ? 3.4 : 1.6);
    const alert = f.mood === "alerta";
    const breath = Math.sin(anim * 1.5 + f.id);
    const fly = f.kind === "ave" && !still ? 0.55 + Math.abs(Math.sin(fm.phase * 3.1)) * 0.4 : 0;
    const bulk = f.kind === "cazador" ? 1.15 : f.kind === "mastin" ? 1.05 : f.kind === "perro" ? 0.9 : f.kind === "ave" ? 1.05 : f.kind === "presa" ? 1 : 1.05;
    const stepMark = Math.floor(fm.phase / Math.PI);
    const ground = columnRise(planet, pos.x, pos.y);
    if (fm.rise < 0) fm.rise = ground;
    else if (!still) {
      const d = ground - fm.rise;
      if (d < -0.5) fm.hop = Math.min(fm.hop, -0.34);
      else if (d > 0.5) fm.hop = Math.max(fm.hop, 0.26);
      fm.rise = ground;
    }
    const feet = pos.y - ground;
    if (f.kind !== "ave" && f.mood !== "alerta" && f.mood !== "come" && fm.lastWalk !== stepMark) burst(planet.id, sx, feet, "dust", 1, -f.facing);
    fm.lastWalk = stepMark;
    bodies.push({
      y: pos.y + 0.45,
      paint: () => {
        const gy = feet - fly;
        const air = fm.hop < -0.02 ? Math.sin((1 - Math.min(1, Math.abs(fm.hop) / 0.34)) * Math.PI) * 0.28 : 0;
        const gait =
          air > 0.02 ? "salta" : f.mood === "come" ? "come" : f.mood === "alerta" ? "alerta" : f.mood === "huye" ? "corre" : fm.speed > 0.75 ? "corre" : fm.speed > 0.2 ? "camina" : "quieto";
        if (fly > 0.2) {
          ctx.fillStyle = "rgba(8,6,4,0.28)";
          ctx.beginPath();
          ctx.ellipse(sx, feet + 0.02, 0.22, 0.07, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.save();
        ctx.translate(sx, gy);
        if (f.facing < 0) ctx.scale(-1, 1);
        const sheet = f.kind === "presa" ? art.actors.deer : f.kind === "ave" ? art.actors.bird : f.kind === "cazador" || f.kind === "mastin" || f.kind === "perro" ? art.actors.wolf : null;
        const moving = gait === "camina" || gait === "corre" || f.kind === "ave";
        const tall = f.kind === "perro" ? 1.15 : f.kind === "mastin" ? 1.45 : f.kind === "cazador" ? 1.7 : f.kind === "ave" ? 0.9 : 1.55;
        if (sheet) paintActor(ctx, sheet, actorFrame(fm.phase, moving), tall * bulk, f.kind === "presa" ? ((f.id * 19) % 24) - 12 : 0);
        else drawCreature(ctx, f.kind, planet.kind, f.id, fm.phase, gait, bulk, fly > 0.2 ? 0 : air);
        ctx.restore();
        if (alert) {
          ctx.save();
          ctx.translate(sx, gy - 1.15 * bulk);
          ctx.rotate(breath * 0.4);
          ctx.fillStyle = BONE;
          ctx.fillRect(-0.08, -0.45, 0.16, 0.4);
          ctx.fillRect(-0.2, -0.55, 0.4, 0.14);
          ctx.restore();
        }
      },
    });
  }
  bodies.sort((a, b) => a.y - b.y);
  for (const body of bodies) body.paint();
  drawMotes(ctx, planet.id);
  const hour = ((world.day % 24) + 24) % 24;
  const night = hour >= 20 || hour < 6;
  const dusk = hour === 19 || hour === 6 || hour === 7;
  if (!night) {
    const morning = hour >= 6 && hour <= 9;
    const afternoon = hour >= 16 && hour <= 18;
    if (morning || afternoon) {
      ctx.save();
      ctx.fillStyle = morning ? "rgba(255,186,110,0.13)" : "rgba(255,132,64,0.16)";
      ctx.fillRect(cam.x - view - 4, cam.y - view - 4, view * 2 + 8, view * 2 + 8);
      ctx.restore();
    }
  }
  if (night || dusk) {
    const darkness = night ? 0.52 : 0.22;
    ctx.save();
    ctx.fillStyle = `rgba(5,8,18,${darkness})`;
    ctx.fillRect(cam.x - view - 4, cam.y - view - 4, view * 2 + 8, view * 2 + 8);
    ctx.globalCompositeOperation = "destination-out";
    const glow = (x: number, y: number, r: number) => {
      const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
      g.addColorStop(0, "rgba(0,0,0,0.95)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const site of planet.sites) {
      const civ = world.civs.find((c) => c.id === site.civId);
      const starved = (civ?.wood ?? 0) <= 0;
      const lx = cam.x + wrapDelta(site.x - cam.x);
      glow(lx, site.y - columnRise(planet, site.x, site.y), starved ? (night ? 3.2 : 2.2) : night ? 8.5 : 5);
    }
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (columnAt(planet.seed, planet.kind, x, y).tile !== ROCK) continue;
        if (hash(x, y, planet.seed + 11) >= 0.08) continue;
        const sx = x + 0.5;
        glow(sx, y + 0.15, night ? 2.6 : 1.4);
      }
    }
    for (const p of world.people) {
      if (!p.alive || p.planet !== planet.id) continue;
      if (Math.abs(p.x - cam.x) > view) continue;
      const lx = p.x;
      glow(lx, p.y - columnRise(planet, p.x, p.y), (p.dread ?? 0) > 60 ? 2.4 : 1.6);
    }
    ctx.restore();
  }
  for (const site of planet.sites) {
    const civ = world.civs.find((c) => c.id === site.civId);
    if ((civ?.wood ?? 0) <= 0) continue;
    const lx = cam.x + wrapDelta(site.x - cam.x);
    if (Math.abs(lx - cam.x) > view || Math.abs(site.y - cam.y) > view) continue;
    const flick = anim * 9 + site.civId * 1.7;
    const h1 = 0.95 + Math.sin(flick) * 0.22;
    ctx.save();
    ctx.translate(lx, site.y - columnRise(planet, site.x, site.y) - 0.05);
    ctx.fillStyle = "#c2410c";
    ctx.beginPath();
    ctx.moveTo(-0.22, 0.05);
    ctx.quadraticCurveTo(-0.08 + Math.sin(flick) * 0.06, -h1 * 0.55, 0.02, -h1);
    ctx.quadraticCurveTo(0.16, -h1 * 0.4, 0.24, 0.05);
    ctx.fill();
    ctx.fillStyle = "#f6d36b";
    ctx.beginPath();
    ctx.ellipse(0.02, -h1 * 0.38, 0.08, 0.22 + Math.sin(flick * 1.4) * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = "600 12px Outfit, sans-serif";
  ctx.textAlign = "center";
  for (const floater of world.floaters) {
    if (floater.planet !== planet.id) continue;
    const sx = vw / 2 + wrapDelta(floater.x - cam.x) * cam.zoom;
    const sy = vh / 2 + (floater.y - cam.y) * cam.zoom - 22;
    ctx.globalAlpha = clamp(floater.life / 2.6, 0, 1);
    ctx.fillStyle = BONE;
    ctx.fillText(floater.text, sx, sy);
  }
  ctx.globalAlpha = 1;
  if (mark) {
    const actor =
      mark.kind === "person"
        ? world.people.find((p) => p.id === mark.id && p.alive && p.planet === planet.id)
        : world.fauna.find((f) => f.id === mark.id && f.alive && f.planet === planet.id);
    if (actor) {
      const sx = vw / 2 + wrapDelta(actor.x - cam.x) * cam.zoom;
      const gy = actor.y - columnRise(planet, actor.x, actor.y);
      const sy = vh / 2 + (gy - cam.y) * cam.zoom;
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy - 6, 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = GOLD;
      ctx.font = "600 13px Fraunces, serif";
      ctx.textAlign = "center";
      const label = actor.name.split(" ")[0] ?? actor.name;
      ctx.fillText(label, sx, sy - 28);
    }
  }
  const miniW = Math.min(vw < 700 ? 84 : 132, vw * 0.26);
  const miniH = miniW * (H / W);
  const mx = 12;
  const my = Math.max(86, vh * 0.11);
  ctx.fillStyle = INK;
  ctx.fillRect(mx - 3, my - 3, miniW + 6, miniH + 6);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(surf, mx, my, miniW, miniH);
  const halfW = vw / cam.zoom / 2;
  const halfH = vh / cam.zoom / 2;
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1;
  const left = wrap(cam.x - halfW);
  const stroke = (x0: number, w0: number) => {
    ctx.strokeRect(mx + (x0 / W) * miniW, my + ((cam.y - halfH) / H) * miniH, Math.max(2, (w0 / W) * miniW), Math.max(2, (halfH * 2 * miniH) / H));
  };
  if (left + halfW * 2 <= W) stroke(left, halfW * 2);
  else {
    stroke(left, W - left);
    stroke(0, left + halfW * 2 - W);
  }
  ctx.fillStyle = GOLD;
  for (const site of planet.sites) ctx.fillRect(mx + (site.x / W) * miniW - 1.5, my + (site.y / H) * miniH - 1.5, 3, 3);
}

function globeOf(art: Art, planet: Planet, world: World, rot: number) {
  const key = surfaceKey(world, planet);
  const prev = globes.get(planet);
  if (prev && prev.key === key && Math.abs(wrapDelta(prev.rot - rot, Math.PI * 2)) < 0.14) return prev.canvas;
  const S = 64;
  const canvas = prev?.canvas ?? document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const g = canvas.getContext("2d");
  if (!g) return canvas;
  const out = g.createImageData(S, S);
  const era = maxEra(world, planet.id);
  for (let py = 0; py < S; py++) {
    for (let px = 0; px < S; px++) {
      const nx = ((px + 0.5) / S) * 2 - 1;
      const ny = ((py + 0.5) / S) * 2 - 1;
      const r2 = nx * nx + ny * ny;
      if (r2 > 1) continue;
      const nz = Math.sqrt(1 - r2);
      const lat = Math.asin(clamp(-ny, -1, 1));
      const lon = Math.atan2(nx, nz) + rot;
      const u = (((lon / (Math.PI * 2)) % 1) + 1) % 1;
      const v = clamp(0.5 - lat / Math.PI, 0, 0.999);
      const x = Math.min(W - 1, (u * W) | 0);
      const y = Math.min(H - 1, (v * H) | 0);
      let [r, gg, b] = tileColor(art, planet, world, x, y);
      const shade = clamp(0.26 + 0.9 * (nx * -0.35 + -ny * 0.48 + nz * 0.8), 0.16, 1.12);
      const landish = r + gg > b + 24;
      if (era >= 6 && shade < 0.4 && landish && hash(px, py, planet.id + 9) < 0.045) {
        r = 226;
        gg = 177;
        b = 90;
      } else {
        r = Math.min(255, r * shade);
        gg = Math.min(255, gg * shade);
        b = Math.min(255, b * shade);
      }
      const di = (py * S + px) * 4;
      out.data[di] = r;
      out.data[di + 1] = gg;
      out.data[di + 2] = b;
      out.data[di + 3] = 255;
    }
  }
  g.putImageData(out, 0, 0);
  globes.set(planet, { key, rot, canvas });
  return canvas;
}

let starSeed = -1;
let stars: { x: number; y: number; a: number }[] = [];

function starfield(seed: number) {
  if (starSeed === seed && stars.length) return;
  starSeed = seed;
  let s = seed >>> 0 || 1;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  stars = Array.from({ length: 90 }, () => ({ x: rnd(), y: rnd(), a: 0.25 + rnd() * 0.75 }));
}

export function layoutPlanets(world: World, vw: number, vh: number) {
  const base = Math.min(vw, vh) * 0.46;
  const clock = world.day + (world.frac ?? 0);
  return world.planets.map((p) => {
    const a = world.angle + p.phase + clock * p.speed * 42;
    const rad = base * (0.26 + p.orbit * 0.74);
    return {
      id: p.id,
      x: vw / 2 + Math.cos(a) * rad,
      y: vh / 2 + Math.sin(a) * rad * 0.62,
      r: (p.kind === "tierra" ? 0.22 : 0.17) * base,
    };
  });
}

function drawGlobePlanet(ctx: CanvasRenderingContext2D, art: Art, planet: Planet, world: World, x: number, y: number, s: number, anim: number) {
  const clock = world.day + (world.frac ?? 0);
  const rot = planet.phase + clock * planet.speed * 9 + anim * 0.22;
  const img = globeOf(art, planet, world, rot);
  const air =
    planet.kind === "lava"
      ? "rgba(255,120,48,0.35)"
      : planet.kind === "hielo"
        ? "rgba(210,230,245,0.4)"
        : planet.kind === "oceano"
          ? "rgba(120,190,220,0.38)"
          : planet.kind === "cristal"
            ? "rgba(150,230,220,0.32)"
            : planet.kind === "jungla"
              ? "rgba(90,150,70,0.28)"
              : "rgba(160,200,230,0.28)";
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.ellipse(s * 0.08, s * 0.78, s * 0.9, s * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = air;
  ctx.beginPath();
  ctx.arc(0, 0, s * 1.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, s, 0, Math.PI * 2);
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, -s, -s, s * 2, s * 2);
  const shade = ctx.createLinearGradient(-s, -s * 0.2, s, s * 0.2);
  shade.addColorStop(0, "rgba(4,8,18,0.62)");
  shade.addColorStop(0.42, "rgba(4,8,18,0)");
  shade.addColorStop(1, "rgba(255,214,150,0.16)");
  ctx.fillStyle = shade;
  ctx.fillRect(-s, -s, s * 2, s * 2);
  const glint = ctx.createRadialGradient(-s * 0.35, -s * 0.38, s * 0.05, -s * 0.2, -s * 0.2, s * 0.7);
  glint.addColorStop(0, "rgba(255,255,255,0.28)");
  glint.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glint;
  ctx.fillRect(-s, -s, s * 2, s * 2);
  ctx.restore();
  ctx.imageSmoothingEnabled = false;
  if (planet.kind === "hielo") {
    ctx.strokeStyle = "rgba(236,246,252,0.8)";
    ctx.lineWidth = Math.max(2, s * 0.07);
    ctx.beginPath();
    ctx.ellipse(0, s * 0.08, s * 1.55, s * 0.28, -0.4 + Math.sin(anim * 0.3) * 0.02, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (planet.kind === "lava") {
    ctx.strokeStyle = `rgba(255,140,40,${0.35 + Math.sin(anim * 2) * 0.15})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, s * 1.04, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCubicPlanet(ctx: CanvasRenderingContext2D, art: Art, planet: Planet, world: World, x: number, y: number, s: number) {
  const cols = s > 46 ? 15 : 11;
  const rows = cols;
  const hw = (s * 1.35) / cols;
  const hh = hw * 0.5;
  const rise = s * 0.042;
  const spin = (((world.angle * 0.35 + planet.phase) / (Math.PI * 2)) % 1 + 1) % 1;
  ctx.save();
  ctx.translate(x, y + s * 0.08);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(0, s * 0.55, s * 0.95, s * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  const air =
    planet.kind === "lava"
      ? "rgba(196,92,38,0.18)"
      : planet.kind === "hielo"
        ? "rgba(186,214,230,0.2)"
        : planet.kind === "cristal"
          ? "rgba(126,200,195,0.16)"
          : planet.kind === "carne"
            ? "rgba(142,47,42,0.14)"
            : planet.kind === "jungla"
              ? "rgba(80,120,60,0.14)"
              : "rgba(140,180,210,0.12)";
  ctx.fillStyle = air;
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.05, s * 1.15, s * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();
  if (planet.kind === "hielo") {
    ctx.strokeStyle = "rgba(214,232,240,0.7)";
    ctx.lineWidth = Math.max(2, s * 0.06);
    ctx.beginPath();
    ctx.ellipse(0, s * 0.02, s * 1.55, s * 0.32, -0.35, Math.PI * 0.05, Math.PI * 0.95);
    ctx.stroke();
  }
  const reach = planet.kind === "oceano" ? 0.46 : planet.kind === "carne" ? 0.4 : 0.44;
  type Cube = { i: number; j: number; h: number; top: [number, number, number]; wet: boolean; hot: boolean; spire: boolean };
  const cubes: Cube[] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const u = (i + 0.5) / cols - 0.5;
      const v = (j + 0.5) / rows - 0.5;
      const lump = planet.kind === "carne" ? (hash(i, j, planet.seed + 3) - 0.5) * 0.16 : 0;
      if (u * u + v * v > reach * reach + lump) continue;
      const lon = (u + 0.5 + spin) % 1;
      const lat = clamp(v + 0.5, 0, 0.999);
      const tx = Math.min(W - 1, (lon * W) | 0);
      const ty = Math.min(H - 1, (lat * H) | 0);
      const tile = planet.tiles[ty * W + tx] ?? 0;
      let h = blocksAt(planet, tx, ty);
      if (planet.kind === "desierto") h = Math.max(1, h - 2);
      if (planet.kind === "oceano" && (tile === DEEP || tile === SHALLOW)) h = 1;
      if (planet.kind === "cristal" && (tile === CRYSTAL || tile === ROCK)) h += 3;
      if (planet.kind === "lava" && tile === LAVA) h += 1;
      cubes.push({
        i,
        j,
        h,
        top: tileColor(art, planet, world, tx, ty),
        wet: tile === DEEP || tile === SHALLOW || tile === LAKE,
        hot: tile === LAVA,
        spire: planet.kind === "cristal" && h >= 8 && hash(i, j, planet.seed) > 0.55,
      });
    }
  }
  cubes.sort((a, b) => a.i + a.j - (b.i + b.j) || a.i - b.i);
  const paint = (rgb: [number, number, number], k: number) => {
    ctx.fillStyle = `rgb(${Math.min(255, rgb[0] * k) | 0},${Math.min(255, rgb[1] * k) | 0},${Math.min(255, rgb[2] * k) | 0})`;
  };
  for (const c of cubes) {
    const bx = (c.i - c.j) * hw;
    const by = (c.i + c.j - rows) * hh;
    const topY = by - c.h * rise;
    ctx.beginPath();
    ctx.moveTo(bx - hw, topY);
    ctx.lineTo(bx, topY + hh);
    ctx.lineTo(bx, by + hh);
    ctx.lineTo(bx - hw, by);
    ctx.closePath();
    paint(c.top, c.wet ? 0.45 : 0.52);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(bx + hw, topY);
    ctx.lineTo(bx, topY + hh);
    ctx.lineTo(bx, by + hh);
    ctx.lineTo(bx + hw, by);
    ctx.closePath();
    paint(c.top, c.wet ? 0.62 : 0.74);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(bx, topY - hh);
    ctx.lineTo(bx + hw, topY);
    ctx.lineTo(bx, topY + hh);
    ctx.lineTo(bx - hw, topY);
    ctx.closePath();
    paint(c.top, c.hot ? 1.25 : 1.05);
    ctx.fill();
    if (c.wet) {
      ctx.fillStyle = "rgba(220,245,255,0.28)";
      ctx.fill();
    }
    if (c.spire) {
      ctx.beginPath();
      ctx.moveTo(bx, topY - hh - rise * 2.4);
      ctx.lineTo(bx + hw * 0.45, topY - hh * 0.2);
      ctx.lineTo(bx - hw * 0.45, topY - hh * 0.2);
      ctx.closePath();
      paint(c.top, 1.3);
      ctx.fill();
    }
  }
  if (planet.kind === "hielo") {
    ctx.strokeStyle = "rgba(236,246,252,0.85)";
    ctx.lineWidth = Math.max(1.5, s * 0.045);
    ctx.beginPath();
    ctx.ellipse(0, s * 0.02, s * 1.55, s * 0.32, -0.35, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSystem(ctx: CanvasRenderingContext2D, art: Art, world: World, vw: number, vh: number, anim: number) {
  starfield(world.seed);
  ctx.fillStyle = BONE;
  for (const star of stars) {
    ctx.globalAlpha = star.a;
    ctx.fillRect(star.x * vw, star.y * vh, 1.5, 1.5);
  }
  ctx.globalAlpha = 1;
  const base = Math.min(vw, vh) * 0.46;
  ctx.strokeStyle = "#3a322a";
  ctx.lineWidth = 1;
  for (const p of world.planets) {
    const rad = base * (0.26 + p.orbit * 0.74);
    ctx.beginPath();
    ctx.ellipse(vw / 2, vh / 2, rad, rad * 0.62, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  const sun = Math.max(16, base * 0.07);
  const glow = ctx.createRadialGradient(vw / 2, vh / 2, 2, vw / 2, vh / 2, sun * 2.6);
  glow.addColorStop(0, GOLD);
  glow.addColorStop(1, "rgba(226,177,90,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(vw / 2, vh / 2, sun * 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f0d7a0";
  ctx.beginPath();
  ctx.arc(vw / 2, vh / 2, sun, 0, Math.PI * 2);
  ctx.fill();
  ctx.textAlign = "center";
  ctx.font = "600 13px Fraunces, serif";
  ctx.imageSmoothingEnabled = false;
  for (const spot of layoutPlanets(world, vw, vh)) {
    const planet = world.planets[spot.id];
    if (!planet) continue;
    drawGlobePlanet(ctx, art, planet, world, spot.x, spot.y, spot.r, anim);
    if (planet.id === world.focusPlanet) {
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(spot.x, spot.y - spot.r * 0.72);
      ctx.lineTo(spot.x + spot.r * 1.22, spot.y);
      ctx.lineTo(spot.x, spot.y + spot.r * 0.72);
      ctx.lineTo(spot.x - spot.r * 1.22, spot.y);
      ctx.closePath();
      ctx.stroke();
    }
    ctx.fillStyle = BONE;
    ctx.fillText(planet.name, spot.x, spot.y + spot.r + 22);
  }
}

export type Room = { x: number; y: number; civId: number };

function drawInterior(
  ctx: CanvasRenderingContext2D,
  art: Art,
  world: World,
  room: Room,
  vw: number,
  vh: number,
  anim: number,
  still: boolean,
  dpr: number,
) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#1a140f";
  ctx.fillRect(0, 0, vw, vh);
  const floorT = 78;
  const floorB = vh - 28;
  ctx.fillStyle = "#6a4b32";
  ctx.fillRect(18, floorT, vw - 36, floorB - floorT);
  const boards = 5;
  for (let i = 0; i < boards; i++) {
    const y = floorT + 8 + i * ((floorB - floorT - 16) / boards);
    ctx.fillStyle = i % 2 ? "#5a3e2a" : "#7a5640";
    ctx.fillRect(28, y, vw - 56, (floorB - floorT) / boards - 6);
  }
  ctx.fillStyle = "#2c241c";
  ctx.fillRect(18, floorT, vw - 36, 16);
  ctx.fillRect(18, floorB - 14, vw - 36, 14);
  ctx.fillRect(18, floorT, 10, floorB - floorT);
  ctx.fillRect(vw - 28, floorT, 10, floorB - floorT);
  const civ = world.civs.find((c) => c.id === room.civId);
  const site = world.planets[world.focusPlanet]?.sites.find((s) => s.civId === room.civId && Math.hypot(wrapDelta(s.x - room.x), s.y - room.y) < 2);
  ctx.fillStyle = BONE;
  ctx.font = "600 18px Fraunces, serif";
  ctx.textAlign = "center";
  ctx.fillText(civ ? `Dentro de ${civ.name}` : "Dentro", vw / 2, 48);
  ctx.save();
  ctx.translate(vw * 0.22, floorB - 70);
  ctx.fillStyle = "#3a2418";
  ctx.beginPath();
  ctx.arc(0, 10, 22, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = "#c45c26";
  ctx.beginPath();
  ctx.moveTo(-6, 8);
  ctx.lineTo(0, -14);
  ctx.lineTo(6, 8);
  ctx.fill();
  ctx.fillStyle = "#e6b15a";
  ctx.beginPath();
  ctx.moveTo(-3, 6);
  ctx.lineTo(0, -6);
  ctx.lineTo(3, 6);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = "#8a5a32";
  ctx.fillRect(vw * 0.62, floorB - 78, 70, 22);
  ctx.fillStyle = "#6b4428";
  ctx.fillRect(vw * 0.62, floorB - 88, 70, 12);
  const decor = site?.decor?.length ? site.decor : ["un fuego bajo", "suelo de tierra apisonada"];
  ctx.font = "12px Outfit, sans-serif";
  ctx.textAlign = "left";
  decor.slice(0, 4).forEach((line, i) => {
    ctx.fillStyle = "#f0e2c8";
    ctx.fillText(line, 36, floorT + 36 + i * 16);
  });
  const folks = world.people.filter(
    (p) => p.alive && p.civId === room.civId && p.planet === world.focusPlanet && Math.hypot(wrapDelta(p.x - room.x), p.y - room.y) < 14,
  );
  const shown = folks.slice(0, 6);
  shown.forEach((p, i) => {
    const x = 56 + i * Math.max(52, (vw - 80) / Math.max(shown.length, 1));
    const y = floorB - 36;
    const gather = p.task === "caza" || p.task === "pesca" || p.task === "siembra" || p.task === "oficio";
    ctx.setTransform(dpr * 28, 0, 0, dpr * 28, dpr * x, dpr * y);
    const baby = p.role !== "alien" && (p.age ?? 500) < BABY_DAYS;
    const young = p.role !== "alien" && (p.age ?? 500) < CHILD_DAYS;
    const working = gather;
    const sheet =
      p.role === "alien"
        ? null
        : young && art.actors.child
          ? art.actors.child
          : working && art.actors.work
            ? art.actors.work
            : p.id % 2 && art.actors.woman
              ? art.actors.woman
              : art.actors.folk;
    if (p.facing < 0) ctx.scale(-1, 1);
    if (p.role === "alien") drawCreature(ctx, "alien", world.planets[world.focusPlanet]?.kind ?? "tierra", p.id, anim, "camina", 1);
    else if (sheet) paintActor(ctx, sheet, working ? 2 : actorFrame(anim * 1.4 + p.id, !still && !working), baby ? 0.85 : young ? 1.05 : 1.45, ((p.id * 37) % 28) - 14);
    else drawFolk(ctx, p.id, p.role, world.planets[world.focusPlanet]?.kind ?? "tierra", anim + p.id, gather ? "work" : "idle", baby ? 0.45 : young ? 0.7 : 1, p.wounds ?? [], !!p.blind, folkLook(p));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = BONE;
    ctx.font = "11px Outfit, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(p.name.split(" ")[0] ?? p.name, x, y + 18);
  });
  if (shown.length === 0) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#c4b59a";
    ctx.textAlign = "center";
    ctx.fillText("Ahora mismo no hay nadie bajo este techo.", vw / 2, floorB - 48);
  }
}

export function draw(
  ctx: CanvasRenderingContext2D,
  art: Art,
  world: World,
  cam: Cam,
  screen: Screen,
  vw: number,
  vh: number,
  anim: number,
  still: boolean,
  dpr: number,
  interior: Room | null = null,
  mark: { kind: "person" | "fauna"; id: number } | null = null,
) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, vw, vh);
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, vw, vh);
  if (screen === "planeta" && interior) drawInterior(ctx, art, world, interior, vw, vh, anim, still, dpr);
  else if (screen === "planeta") drawPlanetView(ctx, art, world, cam, vw, vh, anim, still, dpr, mark);
  else drawSystem(ctx, art, world, vw, vh, anim);
}

export function hitPlanet(world: World, vw: number, vh: number, px: number, py: number) {
  let best: number | null = null;
  let bestD = 1e9;
  for (const spot of layoutPlanets(world, vw, vh)) {
    const d = Math.hypot(px - spot.x, py - spot.y);
    if (d < spot.r + 10 && d < bestD) {
      best = spot.id;
      bestD = d;
    }
  }
  return best;
}

export function hitActor(world: World, cam: Cam, vw: number, vh: number, px: number, py: number) {
  const planet = world.planets[world.focusPlanet];
  if (!planet) return null;
  const x = cam.x + (px - vw / 2) / cam.zoom;
  const y = cam.y + (py - vh / 2) / cam.zoom;
  let person: Person | null = null;
  let best = 2.3;
  for (const p of world.people) {
    if (!p.alive || p.planet !== planet.id) continue;
    const d = Math.hypot(wrapDelta(p.x - x), p.y - columnRise(planet, p.x, p.y) - y);
    if (d < best) {
      best = d;
      person = p;
    }
  }
  if (person) return { person: person.id, civ: person.civId, fauna: null as number | null };
  let fauna: Fauna | null = null;
  let fb = 2.2;
  for (const f of world.fauna) {
    if (!f.alive || f.planet !== planet.id) continue;
    const d = Math.hypot(wrapDelta(f.x - x), f.y - columnRise(planet, f.x, f.y) - y);
    if (d < fb) {
      fb = d;
      fauna = f;
    }
  }
  if (fauna) return { person: null as number | null, civ: null as number | null, fauna: fauna.id };
  for (const site of planet.sites) {
    if (Math.hypot(wrapDelta(site.x - x), site.y - columnRise(planet, site.x, site.y) - y) < 2.2) return { person: null as number | null, civ: site.civId, fauna: null as number | null };
  }
  return null;
}

export function focusSite(world: World) {
  const planet = world.planets[world.focusPlanet];
  const site = planet?.sites.find((s) => s.civId === world.focusCiv) ?? planet?.sites[0];
  return site ? { x: site.x, y: site.y } : { x: W / 2, y: H / 2 };
}
