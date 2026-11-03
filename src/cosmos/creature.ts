import type { Kind } from "./names";
import type { FaunaKind } from "./types";

type RGB = { r: number; g: number; b: number };
type Gait = "trot" | "bound" | "stalk" | "scuttle" | "flap" | "tripod";

type Profile = {
  gait: Gait;
  bodyL: number;
  bodyH: number;
  legH: number;
  legT: number;
  head: number;
  snout: number;
  tail: number;
  neck: number;
  ears: number;
  earDrop: number;
  beak: number;
  wing: number;
  hunch: number;
  stride: number;
  lift: number;
  legs: number;
  horn: number;
  mane: number;
  antler: number;
  jowl: number;
  spots: number;
  stripes: number;
  socks: boolean;
  tailUp: number;
};

type Slot = { u: number; far: boolean; off: number };

const TAU = Math.PI * 2;

function unit(id: number, salt: number) {
  let n = Math.imul((id | 0) ^ Math.imul((salt + 1) | 0, 0x9e3779b1), 0x85ebca6b) >>> 0;
  n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function vary(id: number, salt: number, lo: number, hi: number) {
  return lo + unit(id, salt) * (hi - lo);
}

function clamp8(n: number) {
  return n < 0 ? 0 : n > 255 ? 255 : Math.round(n);
}

function rgb(r: number, g: number, b: number): RGB {
  return { r, g, b };
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return rgb(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
}

function shade(c: RGB, t: number) {
  return t >= 0 ? mix(c, rgb(255, 255, 255), t) : mix(c, rgb(0, 0, 0), -t);
}

function css(c: RGB) {
  return `rgb(${clamp8(c.r)},${clamp8(c.g)},${clamp8(c.b)})`;
}

function rgba(c: RGB, a: number) {
  return `rgba(${clamp8(c.r)},${clamp8(c.g)},${clamp8(c.b)},${a})`;
}

function wrapPhase(phase: number) {
  let t = phase % (Math.PI * 2);
  if (t < 0) t += Math.PI * 2;
  return t;
}

function put(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  if (!(w > 0) || !(h > 0)) return;
  const radius = Math.min(w, h) * 0.35;
  ctx.beginPath();
  ctx.roundRect(x, -(y + h), w, h, radius);
  ctx.fillStyle = color;
  ctx.fill();
  if (Math.min(w, h) < 0.04) return;
  ctx.lineWidth = Math.min(0.03, Math.min(w, h) * 0.1);
  ctx.strokeStyle = "rgba(22,12,8,0.88)";
  ctx.stroke();
}

function pick(id: number, salt: number, rows: RGB[]) {
  const row = rows[Math.floor(unit(id, salt) * rows.length) % rows.length] ?? rows[0] ?? rgb(80, 60, 40);
  return shade(row, (unit(id, salt + 7) - 0.5) * 0.22);
}

function baseCoat(fauna: FaunaKind, id: number) {
  if (fauna === "ave" || fauna === "carroña") {
    return pick(id, 1, [rgb(42, 36, 32), rgb(72, 64, 58), rgb(28, 30, 34), rgb(120, 108, 96), rgb(54, 48, 44), rgb(90, 78, 66)]);
  }
  if (fauna === "alien") {
    return pick(id, 1, [rgb(70, 78, 64), rgb(48, 44, 52), rgb(96, 84, 70), rgb(40, 52, 48), rgb(88, 72, 60), rgb(60, 58, 50)]);
  }
  if (fauna === "presa") {
    return pick(id, 1, [rgb(150, 112, 70), rgb(120, 84, 48), rgb(176, 148, 102), rgb(98, 70, 42), rgb(138, 100, 64), rgb(186, 160, 122)]);
  }
  return pick(id, 1, [rgb(92, 62, 38), rgb(48, 40, 34), rgb(132, 108, 78), rgb(70, 72, 76), rgb(116, 74, 44), rgb(36, 32, 30), rgb(168, 146, 114), rgb(84, 70, 56)]);
}

function coat(fauna: FaunaKind, planet: Kind, id: number) {
  let main = baseCoat(fauna, id);
  if (planet === "desierto") main = mix(main, rgb(198, 156, 98), 0.7);
  else if (planet === "hielo") main = mix(mix(main, rgb(214, 224, 232), 0.82), rgb(248, 250, 252), 0.28);
  else if (planet === "jungla") main = mix(main, rgb(42, 96, 46), 0.74);
  else if (planet === "lava") main = rgb(18 + unit(id, 4) * 22, 14 + unit(id, 5) * 8, 12 + unit(id, 6) * 6);
  else if (planet === "cristal") main = mix(rgb(28, 150, 172), rgb(150, 236, 232), unit(id, 4) * 0.55);
  else if (planet === "carne") main = rgb(128 + unit(id, 4) * 70, 18 + unit(id, 5) * 36, 28 + unit(id, 6) * 24);
  else if (planet === "oceano") main = mix(main, rgb(28, 64, 88), 0.78);
  const belly = planet === "carne" ? shade(main, 0.12) : planet === "hielo" ? shade(main, 0.16) : shade(main, 0.26);
  const accent =
    planet === "lava"
      ? rgb(255, 128 + unit(id, 8) * 80, 28)
      : planet === "cristal"
        ? rgb(214, 255, 252)
        : planet === "carne"
          ? rgb(196, 64, 72)
          : shade(main, 0.38);
  return {
    main,
    dark: shade(main, planet === "lava" ? -0.18 : -0.3),
    light: shade(main, planet === "lava" ? 0.08 : 0.2),
    belly,
    accent,
    beak: planet === "cristal" ? rgb(186, 236, 230) : planet === "carne" ? rgb(120, 36, 40) : mix(rgb(168, 132, 72), main, planet === "tierra" ? 0.25 : 0.45),
    eye: planet === "lava" ? rgb(255, 150, 40) : planet === "cristal" ? rgb(230, 255, 255) : rgb(16, 14, 12),
  };
}

function scalePair(id: number, salt: number, lo: number, hi: number, base: number) {
  return base * vary(id, salt, lo, hi);
}

function profile(fauna: FaunaKind, id: number, planet: Kind): Profile {
  const slim = planet === "oceano";
  const low = slim ? 0.7 : 1;
  const long = slim ? 1.16 : 1;
  const flat = slim ? 0.74 : 1;
  let gait: Gait = "trot";
  let bodyL = 0.5;
  let bodyH = 0.22;
  let legH = 0.28;
  let legT = 0.07;
  let head = 0.16;
  let snout = 0.1;
  let tail = 0.16;
  let neck = 0.06;
  let ears = 0.06;
  let earDrop = 0;
  let beak = 0;
  let wing = 0;
  let hunch = 0;
  let stride = 0.18;
  let lift = 0.08;
  let legs = 4;
  let horn = 0;
  let mane = 0;
  let antler = 0;
  let jowl = 0;
  if (fauna === "perro") {
    bodyL = 0.36;
    bodyH = 0.15;
    legH = 0.15;
    legT = 0.045;
    head = 0.12;
    snout = 0.07;
    tail = 0.12;
    ears = 0.05;
    earDrop = unit(id, 11) > 0.45 ? 0.85 : 0;
    stride = 0.08;
    lift = 0.035;
  } else if (fauna === "mastin") {
    bodyL = 0.54;
    bodyH = 0.24;
    legH = 0.26;
    legT = 0.075;
    head = 0.18;
    snout = 0.08;
    tail = 0.16;
    neck = 0.06;
    ears = 0.07;
    earDrop = 0.9;
    stride = 0.1;
    lift = 0.04;
    jowl = 0.05;
    mane = 0.04;
  } else if (fauna === "presa") {
    gait = unit(id, 12) > 0.46 ? "bound" : "trot";
    bodyL = 0.62;
    bodyH = 0.24;
    legH = 0.26;
    legT = 0.05;
    head = 0.12;
    snout = 0.08;
    tail = 0.07;
    neck = 0.1;
    ears = 0.05;
    stride = gait === "bound" ? 0.1 : 0.09;
    lift = gait === "bound" ? 0.06 : 0.045;
    antler = unit(id, 13) > 0.52 ? 0.1 : 0;
  } else if (fauna === "cazador") {
    gait = "stalk";
    bodyL = 0.72;
    bodyH = 0.28;
    legH = 0.24;
    legT = 0.06;
    head = 0.15;
    snout = 0.12;
    tail = 0.28;
    neck = 0.06;
    ears = 0.07;
    stride = 0.1;
    lift = 0.05;
    mane = 0.05;
  } else if (fauna === "carroña") {
    gait = "scuttle";
    bodyL = 0.42;
    bodyH = 0.18;
    legH = 0.13;
    legT = 0.04;
    head = 0.1;
    snout = 0;
    tail = 0.08;
    neck = 0.06;
    ears = 0;
    beak = 0.15;
    hunch = 0.55;
    stride = 0.05;
    lift = 0.03;
    legs = 2;
  } else if (fauna === "ave") {
    gait = "flap";
    bodyL = 0.24;
    bodyH = 0.11;
    legH = 0.08;
    legT = 0.03;
    head = 0.08;
    snout = 0;
    tail = 0.09;
    ears = 0;
    beak = 0.06;
    wing = 0.34;
    stride = 0.03;
    lift = 0.02;
    legs = 2;
  } else {
    gait = "tripod";
    legs = 4 + ((unit(id, 15) * 3) | 0);
    bodyL = 0.5;
    bodyH = 0.22;
    legH = 0.2;
    legT = 0.046;
    head = 0.15;
    snout = 0.04;
    tail = 0;
    neck = 0.04;
    ears = 0;
    stride = 0.06;
    lift = 0.05;
    if (unit(id, 16) > 0.5) horn = 0.1;
    else tail = 0.16;
  }
  const p: Profile = {
    gait,
    bodyL: scalePair(id, 20, 0.9, 1.12, bodyL * long),
    bodyH: scalePair(id, 21, 0.9, 1.1, bodyH * flat),
    legH: scalePair(id, 22, 0.96, 1.04, legH * low),
    legT: scalePair(id, 23, 0.84, 1.22, legT * (slim ? 0.9 : 1)),
    head: scalePair(id, 24, 0.8, 1.2, head * (slim ? 0.92 : 1)),
    snout: scalePair(id, 25, 0.7, 1.35, snout),
    tail: tail > 0 ? scalePair(id, 26, 0.68, 1.28, tail * (slim ? 0.85 : 1)) : 0,
    neck: neck * vary(id, 27, 0.85, 1.15),
    ears: ears * vary(id, 28, 0.7, 1.3),
    earDrop,
    beak: beak * vary(id, 29, 0.85, 1.2),
    wing: wing * vary(id, 30, 0.88, 1.16),
    hunch,
    stride,
    lift: lift * (slim ? 0.85 : 1),
    legs,
    horn,
    mane: mane * vary(id, 31, 0.45, 1.15),
    antler,
    jowl: jowl * vary(id, 32, 0.6, 1.2),
    spots: unit(id, 33) > 0.58 ? 1 + ((unit(id, 34) * 3) | 0) : 0,
    stripes: unit(id, 35) > 0.74 ? 2 + ((unit(id, 36) * 2) | 0) : 0,
    socks: unit(id, 37) > 0.62,
    tailUp: vary(id, 38, 0.05, 0.55),
  };
  if (fauna === "cazador") {
    const length = p.tail + p.bodyL + p.snout * 0.65;
    const height = p.legH + p.bodyH + p.ears * 0.35;
    const fit = Math.min(1.6 / Math.max(0.2, length), 1.1 / Math.max(0.2, height));
    if (fit < 1) {
      p.bodyL *= fit;
      p.bodyH *= fit;
      p.legH *= fit;
      p.legT *= fit;
      p.head *= fit;
      p.snout *= fit;
      p.tail *= fit;
      p.neck *= fit;
      p.ears *= fit;
      p.stride *= fit;
      p.lift *= fit;
      p.mane *= fit;
    }
  }
  return p;
}

function slots(p: Profile): Slot[] {
  if (p.gait === "bound") {
    return [
      { u: 0.8, far: true, off: 0 },
      { u: 0.8, far: false, off: 0 },
      { u: 0.2, far: true, off: Math.PI },
      { u: 0.2, far: false, off: Math.PI },
    ];
  }
  if (p.gait === "scuttle" || p.gait === "flap") {
    return [
      { u: 0.44, far: true, off: 0 },
      { u: 0.6, far: false, off: Math.PI },
    ];
  }
  if (p.legs >= 6) {
    return [
      { u: 0.84, far: true, off: 0 },
      { u: 0.84, far: false, off: Math.PI },
      { u: 0.52, far: true, off: Math.PI },
      { u: 0.52, far: false, off: 0 },
      { u: 0.18, far: true, off: 0 },
      { u: 0.18, far: false, off: Math.PI },
    ];
  }
  if (p.legs === 5) {
    return [
      { u: 0.84, far: true, off: 0 },
      { u: 0.84, far: false, off: Math.PI },
      { u: 0.5, far: false, off: 0 },
      { u: 0.18, far: true, off: Math.PI },
      { u: 0.18, far: false, off: 0 },
    ];
  }
  return [
    { u: 0.82, far: true, off: 0 },
    { u: 0.82, far: false, off: Math.PI },
    { u: 0.18, far: true, off: Math.PI },
    { u: 0.18, far: false, off: 0 },
  ];
}

function blend(keys: { x: number; y: number }[], u: number) {
  const n = keys.length;
  const x = ((u % 1) + 1) % 1;
  const scaled = x * n;
  const i = Math.floor(scaled) % n;
  const raw = scaled - Math.floor(scaled);
  const f = raw * raw * (3 - 2 * raw);
  const a = keys[i]!;
  const b = keys[(i + 1) % n]!;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

const WALK_KEYS = [
  { x: 0.46, y: 0 },
  { x: 0.08, y: 0 },
  { x: -0.42, y: 0.04 },
  { x: -0.12, y: 0.72 },
  { x: 0.22, y: 1 },
];

const RUN_KEYS = [
  { x: 0.62, y: 0.2 },
  { x: 0.05, y: 0.85 },
  { x: -0.36, y: 0.28 },
  { x: 0.08, y: 0.95 },
  { x: 0.48, y: 0.55 },
];

function stepOf(phase: number, offset: number, run = false) {
  let t = (phase + offset) % (Math.PI * 2);
  if (t < 0) t += Math.PI * 2;
  return blend(run ? RUN_KEYS : WALK_KEYS, t / (Math.PI * 2));
}

function bone(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, thick: number, color: string) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 0.008) return;
  ctx.save();
  ctx.translate(x0, -y0);
  ctx.rotate(Math.atan2(-dy, dx));
  ctx.fillStyle = color;
  ctx.fillRect(0, -thick / 2, len, thick);
  ctx.restore();
}

function drawLeg(
  ctx: CanvasRenderingContext2D,
  hipX: number,
  hipY: number,
  footX: number,
  footY: number,
  thick: number,
  upper: string,
  lower: string,
  paw: string,
) {
  const fy = Math.max(0.015, footY);
  const swing = Math.max(0, footY - 0.02);
  const kneeX = (hipX + footX) * 0.5 + Math.max(0.02, thick * 0.45) + swing * 1.15;
  const kneeY = fy + Math.max(0.04, hipY - fy) * (swing > 0.04 ? 0.62 : 0.42);
  bone(ctx, hipX, hipY, kneeX, kneeY, thick, upper);
  bone(ctx, kneeX, kneeY, footX, fy, thick * 0.82, lower);
  put(ctx, footX - thick * 0.7, fy, thick * 1.4, Math.max(0.016, thick * 0.28), paw);
}

function drawWing(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, thick: number, flap: number, color: string, tip: string) {
  ctx.save();
  ctx.translate(x, -y);
  ctx.rotate(-flap * 1.15);
  ctx.fillStyle = color;
  ctx.fillRect(0, -thick * 0.45, len * 0.55, thick * 0.9);
  ctx.translate(len * 0.52, 0);
  ctx.rotate(flap * 0.45);
  ctx.fillStyle = tip;
  ctx.fillRect(0, -thick * 0.35, len * 0.48, thick * 0.7);
  ctx.restore();
}

function drawTail(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, thick: number, sway: number, up: number, color: string, tip: string) {
  const segs = 3;
  for (let i = 0; i < segs; i++) {
    const k = (i + 1) / segs;
    const segW = len / segs;
    const h = thick * (1.05 - k * 0.4);
    put(ctx, x - k * len + sway * k, y + up * k * len - h * 0.15, segW * 1.08, h, i === segs - 1 ? tip : color);
  }
}

export function drawCreature(
  ctx: CanvasRenderingContext2D,
  fauna: FaunaKind,
  planet: Kind,
  id: number,
  phase: number,
  mood: string,
  scale: number,
  air = 0,
): void {
  const spec = profile(fauna, id, planet);
  const ink = coat(fauna, planet, id);
  const eating = mood === "come" || mood === "alcanza";
  const alert = mood === "alerta";
  const fleeing = mood === "huye" || mood === "corre";
  const jumping = mood === "salta" || air > 0.02;
  const idle = mood === "quieto";
  const moving = !eating && !alert && !jumping && !idle;
  const stepping = moving;
  const run = fleeing;
  const t = wrapPhase(phase);
  const breath = Math.sin(t * 0.5) * spec.bodyH * 0.045;
  const plant = stepping ? (stepOf(phase, 0, run).y + stepOf(phase, Math.PI, run).y) * 0.5 : 0;
  const bob = stepping ? (0.03 - plant * 0.05) * spec.bodyH : breath;
  let travel = stepping ? spec.stride * (run ? 1.35 : 1) : eating ? spec.stride * 0.35 : 0;
  const cap = spec.legH * (run ? 0.48 : 0.32);
  if (travel > cap) travel = cap;
  const lift = jumping ? spec.legH * 0.28 : stepping ? Math.min(spec.legH * (run ? 0.42 : 0.26), spec.lift * (run ? 1.4 : 1)) : eating ? spec.legH * 0.12 : 0;
  const lean = run ? spec.bodyL * 0.08 : eating ? spec.bodyL * 0.04 : 0;
  const bodyL = spec.bodyL;
  const bodyH = spec.bodyH;
  const torsoX = -bodyL * 0.42 + lean * 0.28 + (idle ? Math.sin(t * 0.7) * bodyL * 0.04 : 0);
  const torsoY = spec.legH + bob;
  const depth = Math.max(0.035, spec.legT * 0.85);
  const paw = spec.socks ? css(shade(ink.belly, 0.2)) : css(ink.dark);
  const list = slots(spec);
  const flap = blend(
    [
      { x: -0.35, y: 0 },
      { x: 0.15, y: 0 },
      { x: 1.05, y: 0 },
      { x: 0.2, y: 0 },
    ],
    (eating ? t * 0.35 : t) / (Math.PI * 2),
  ).x;
  const twitch = alert ? Math.sin(t * 2) : 0;
  const sway = (stepping ? Math.sin(t) * spec.tail * 0.18 : Math.sin(t * 0.6) * spec.tail * 0.1);

  const flying = spec.gait === "flap" && !eating;
  ctx.save();
  ctx.scale(scale, scale);
  const squashY = stepping ? 0.9 + plant * 0.2 : 1 + Math.sin(t * 0.5) * 0.045;
  ctx.scale(2 - squashY, squashY);

  if (!flying && air < 0.02) put(ctx, torsoX + bodyL * 0.08, 0, bodyL * 0.84, 0.02, "rgba(14,12,10,0.28)");
  if (air > 0.02) ctx.translate(0, -air);

  if (spec.tail > 0) {
    drawTail(ctx, torsoX + bodyL * 0.08, torsoY + bodyH * (0.35 + spec.hunch * 0.15), spec.tail, spec.legT * 0.9, sway, spec.tailUp, css(ink.dark), css(ink.light));
  }

  if (spec.wing > 0) {
    drawWing(ctx, torsoX + bodyL * 0.48, torsoY + bodyH * 0.62, spec.wing, spec.legT * 1.15, flap, css(ink.dark), css(ink.main));
  }

  const drawFeet = (far: boolean) => {
    for (const slot of list) {
      if (slot.far !== far) continue;
      const z = far ? -depth : depth * 0.65;
      const hipX = torsoX + slot.u * bodyL;
      const foot = stepOf(phase, slot.off, run);
      const reach = eating && !slot.far && slot.u > 0.7;
      const peck = eating ? (Math.sin(t * 2) * 0.5 + 0.5) : 0;
      drawLeg(
        ctx,
        hipX + z * 0.25,
        torsoY,
        hipX + z + foot.x * travel + (reach ? 0.16 * peck : 0),
        jumping ? spec.legH * 0.22 : reach ? peck * lift : foot.y * lift,
        spec.legT * (far ? 0.9 : 1),
        css(far ? ink.dark : shade(ink.main, -0.12)),
        css(far ? shade(ink.main, -0.18) : ink.main),
        paw,
      );
    }
  };

  drawFeet(true);

  put(ctx, torsoX, torsoY, bodyL, bodyH, css(ink.main));
  put(ctx, torsoX + bodyL * 0.08, torsoY, bodyL * 0.78, bodyH * 0.38, css(ink.belly));

  if (planet === "carne") {
    const lumps = 3 + ((unit(id, 44) * 2) | 0);
    for (let i = 0; i < lumps; i++) {
      const along = unit(id, 50 + i);
      const lw = bodyL * (0.12 + unit(id, 70 + i) * 0.1);
      const lh = bodyH * (0.2 + unit(id, 80 + i) * 0.16);
      const lx = torsoX + along * (bodyL - lw * 0.4) - lw * 0.15;
      const ly = i % 2 === 0 ? torsoY + bodyH * 0.72 : torsoY - lh * 0.35;
      put(ctx, lx, ly, lw, lh, css(shade(ink.main, i % 2 ? 0.1 : -0.16)));
    }
  }

  if (spec.mane > 0) {
    put(ctx, torsoX + bodyL * 0.58 + lean * 0.2, torsoY + bodyH * 0.62, bodyL * 0.28, spec.mane + bodyH * 0.18, css(ink.dark));
  }
  if (spec.hunch > 0) {
    put(ctx, torsoX + bodyL * 0.08, torsoY + bodyH * 0.72, bodyL * 0.34, bodyH * 0.28, css(ink.dark));
    put(ctx, torsoX + bodyL * 0.55, torsoY + bodyH * 0.08, bodyL * 0.32, bodyH * 0.55, css(shade(ink.main, -0.08)));
  }

  if (spec.stripes > 0) {
    for (let i = 0; i < spec.stripes; i++) {
      const sx = torsoX + bodyL * (0.18 + (i / spec.stripes) * 0.62);
      put(ctx, sx, torsoY + bodyH * 0.15, Math.max(0.02, bodyL * 0.06), bodyH * 0.72, css(ink.dark));
    }
  }
  for (let i = 0; i < spec.spots; i++) {
    put(
      ctx,
      torsoX + bodyL * (0.12 + unit(id, 90 + i) * 0.7),
      torsoY + bodyH * (0.2 + unit(id, 100 + i) * 0.5),
      bodyL * (0.08 + unit(id, 110 + i) * 0.08),
      bodyH * (0.16 + unit(id, 120 + i) * 0.16),
      css(unit(id, 130 + i) > 0.5 ? ink.dark : ink.light),
    );
  }

  if (planet === "cristal") {
    const facets = 3 + ((unit(id, 45) * 2) | 0);
    for (let i = 0; i < facets; i++) {
      put(
        ctx,
        torsoX + bodyL * (0.1 + unit(id, 140 + i) * 0.7),
        torsoY + bodyH * (0.18 + unit(id, 150 + i) * 0.55),
        bodyL * (0.1 + unit(id, 160 + i) * 0.12),
        bodyH * (0.16 + unit(id, 170 + i) * 0.2),
        css(i % 2 ? ink.accent : ink.light),
      );
    }
  }

  if (planet === "lava") {
    const cracks = 4 + ((unit(id, 46) * 3) | 0);
    for (let i = 0; i < cracks; i++) {
      const glow = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 2 + unit(id, 180 + i) * TAU));
      const crack = mix(rgb(90, 28, 8), ink.accent, glow);
      const vertical = unit(id, 190 + i) > 0.45;
      put(
        ctx,
        torsoX + bodyL * (0.12 + unit(id, 200 + i) * 0.7),
        torsoY + bodyH * (0.2 + unit(id, 210 + i) * 0.55),
        vertical ? Math.max(0.018, bodyL * 0.035) : bodyL * (0.1 + unit(id, 220 + i) * 0.12),
        vertical ? bodyH * (0.18 + unit(id, 230 + i) * 0.28) : Math.max(0.018, bodyH * 0.07),
        rgba(crack, 0.55 + glow * 0.45),
      );
    }
  }

  const neckX = torsoX + bodyL * 0.72 + lean * 0.35;
  const neckY = torsoY + bodyH * (spec.hunch > 0 ? 0.35 : 0.62);
  let headW = spec.head;
  let headH = spec.head * (fauna === "ave" || fauna === "carroña" ? 0.85 : 0.92);
  let headX = neckX + spec.neck * 0.85 + lean * 0.55;
  let headY = neckY + spec.neck * (spec.hunch > 0 ? -0.15 : 0.45);
  if (fauna === "cazador" && !eating && !alert) headX += bodyL * 0.04;
  if (spec.hunch > 0) {
    headY -= bodyH * spec.hunch * 0.85;
    headX += bodyL * 0.06;
  }
  if (eating) {
    const peck = Math.sin(t * 2) * 0.5 + 0.5;
    headY -= Math.min(spec.legH * 0.45, bodyH * 0.55) * (0.45 + peck * 0.55);
    headX += headW * (0.12 + peck * 0.28);
  } else if (alert) {
    headY += bodyH * 0.32;
  }
  put(ctx, neckX, Math.min(neckY, headY), Math.max(spec.legT, headX - neckX), Math.max(spec.legT * 0.8, Math.abs(headY - neckY) + headH * 0.35), css(shade(ink.main, -0.06)));
  put(ctx, headX, headY, headW, headH, css(ink.main));
  const faceX = Math.sin(t * 0.75 + 1.1) * headW * 0.07;
  const faceY = Math.cos(t * 0.55) * headH * 0.05;
  if (spec.snout > 0) {
    const snoutH = headH * (fauna === "cazador" ? 0.42 : 0.5);
    put(ctx, headX + headW * 0.62 + faceX, headY + headH * 0.12 + faceY, spec.snout, snoutH, css(ink.light));
    put(ctx, headX + headW * 0.62 + spec.snout * 0.72 + faceX, headY + headH * 0.16 + faceY, Math.max(0.02, spec.snout * 0.22), snoutH * 0.45, css(ink.dark));
  }
  if (spec.jowl > 0) put(ctx, headX + headW * 0.45, headY - spec.jowl * 0.2, headW * 0.5, spec.jowl, css(ink.belly));
  if (spec.beak > 0) {
    put(ctx, headX + headW * 0.7, headY + headH * 0.28, spec.beak, headH * 0.28, css(ink.beak));
    put(ctx, headX + headW * 0.7, headY + headH * 0.18, spec.beak * 0.72, headH * 0.16, css(shade(ink.beak, -0.15)));
  }
  put(ctx, headX + headW * 0.62 + faceX, headY + headH * 0.52 + faceY, Math.max(0.025, headW * 0.16), Math.max(0.025, headH * 0.16), css(ink.eye));
  if (headW > 0.12) put(ctx, headX + headW * 0.66 + faceX, headY + headH * 0.58 + faceY, headW * 0.06, headH * 0.06, css(ink.accent));

  if (spec.ears > 0) {
    const flop = spec.earDrop * (moving ? Math.sin(t * 2) * spec.ears * 0.45 : 0);
    const earX = headX + headW * 0.18 + (alert ? twitch * spec.ears * 0.45 : 0);
    if (spec.earDrop > 0.4) {
      put(ctx, earX, headY + headH * 0.35 - spec.ears * 0.2 + flop, spec.legT * 0.7, spec.ears, css(ink.dark));
      put(ctx, earX + headW * 0.28, headY + headH * 0.42 - flop, spec.legT * 0.65, spec.ears * 0.85, css(ink.main));
    } else {
      put(ctx, earX, headY + headH * 0.78, spec.legT * 0.55, spec.ears, css(ink.dark));
      put(ctx, earX + headW * 0.34, headY + headH * 0.74 + twitch * spec.ears * 0.25, spec.legT * 0.5, spec.ears * 0.92, css(ink.main));
    }
  } else if (spec.horn > 0) {
    const hx = headX + headW * 0.28 + twitch * 0.04;
    put(ctx, hx, headY + headH * 0.8, spec.legT * 0.7, spec.horn, css(ink.accent));
    put(ctx, hx + spec.horn * 0.15, headY + headH * 0.8 + spec.horn * 0.62, spec.horn * 0.45, spec.legT * 0.55, css(ink.light));
  } else {
    const crest = spec.beak > 0 ? headH * 0.7 : spec.head * 0.45;
    put(ctx, headX + headW * 0.2 + twitch * 0.05, headY + headH * 0.82, spec.legT * 0.45, crest, css(ink.accent));
    put(ctx, headX + headW * 0.38, headY + headH * 0.78 + twitch * 0.03, spec.legT * 0.4, crest * 0.72, css(ink.light));
  }

  if (spec.antler > 0) {
    put(ctx, headX + headW * 0.15, headY + headH * 0.85, spec.legT * 0.4, spec.antler, css(ink.beak));
    put(ctx, headX + headW * 0.42 + twitch * 0.03, headY + headH * 0.85, spec.legT * 0.4, spec.antler * 0.85, css(ink.beak));
    put(ctx, headX + headW * 0.02, headY + headH * 0.85 + spec.antler * 0.55, spec.antler * 0.45, spec.legT * 0.35, css(shade(ink.beak, -0.1)));
  }

  if (spec.wing > 0) {
    drawWing(ctx, torsoX + bodyL * 0.56, torsoY + bodyH * 0.48, spec.wing * 1.05, spec.legT * 1.25, flap, css(ink.main), css(ink.light));
  }

  drawFeet(false);

  if (planet === "lava") {
    const glow = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 2));
    put(ctx, headX + headW * 0.62, headY + headH * 0.52, Math.max(0.025, headW * 0.16), Math.max(0.025, headH * 0.16), rgba(ink.accent, 0.45 + glow * 0.55));
  }

  ctx.restore();
}
