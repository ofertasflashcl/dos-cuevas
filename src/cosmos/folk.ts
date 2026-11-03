import type { Kind } from "./names";

type RGB = { r: number; g: number; b: number };

export type FolkAct = "idle" | "walk" | "run" | "chop" | "work" | "build" | "crouch" | "fight" | "guard" | "haul" | "fall" | "turn" | "jump" | "climb";

function unit(id: number, salt: number) {
  let n = Math.imul((id | 0) ^ Math.imul((salt + 1) | 0, 0x9e3779b1), 0x85ebca6b) >>> 0;
  n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
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

function put(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  if (!(w > 0.004) || !(h > 0.004)) return;
  const radius = Math.min(w, h) * 0.32;
  ctx.beginPath();
  ctx.roundRect(x, -(y + h), w, h, radius);
  ctx.fillStyle = color;
  ctx.fill();
  if (Math.min(w, h) < 0.05) return;
  ctx.lineWidth = Math.min(0.035, Math.min(w, h) * 0.1);
  ctx.strokeStyle = "rgba(22,12,8,0.88)";
  ctx.stroke();
}

function hatch(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, -(y + h), w, h);
  ctx.clip();
  ctx.strokeStyle = "rgba(28,16,10,0.28)";
  ctx.lineWidth = 0.012;
  for (let i = 0; i < 4; i++) {
    const yy = -(y + h * (0.22 + i * 0.18));
    ctx.beginPath();
    ctx.moveTo(x + w * 0.12, yy);
    ctx.lineTo(x + w * 0.9, yy - h * 0.14);
    ctx.stroke();
  }
  ctx.restore();
}

function stepOf(phase: number, offset: number) {
  let t = (phase + offset) % (Math.PI * 2);
  if (t < 0) t += Math.PI * 2;
  const keys = [
    { x: 0.5, y: 0 },
    { x: 0.06, y: 0 },
    { x: -0.46, y: 0.06 },
    { x: -0.08, y: 0.78 },
    { x: 0.24, y: 1 },
  ];
  const n = keys.length;
  const scaled = (t / (Math.PI * 2)) * n;
  const i = Math.floor(scaled) % n;
  const raw = scaled - Math.floor(scaled);
  const f = raw * raw * (3 - 2 * raw);
  const a = keys[i]!;
  const b = keys[(i + 1) % n]!;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
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

function skinOf(id: number, planet: Kind): RGB {
  const row = [
    rgb(214, 164, 122),
    rgb(186, 124, 86),
    rgb(232, 196, 160),
    rgb(120, 74, 48),
    rgb(168, 102, 68),
    rgb(96, 58, 40),
  ];
  let skin = row[Math.floor(unit(id, 1) * row.length) % row.length] ?? rgb(186, 124, 86);
  if (planet === "hielo") skin = mix(skin, rgb(232, 220, 214), 0.45);
  else if (planet === "desierto") skin = mix(skin, rgb(196, 140, 88), 0.35);
  else if (planet === "lava") skin = mix(rgb(72, 48, 40), skin, 0.35);
  else if (planet === "cristal") skin = mix(skin, rgb(186, 220, 214), 0.4);
  else if (planet === "carne") skin = mix(skin, rgb(150, 64, 58), 0.45);
  else if (planet === "oceano") skin = mix(skin, rgb(150, 120, 96), 0.25);
  return skin;
}

const HAIR = [rgb(36, 24, 16), rgb(110, 68, 36), rgb(214, 176, 92), rgb(18, 16, 16), rgb(148, 42, 28), rgb(196, 190, 182)];
const CLOTH = [rgb(62, 96, 58), rgb(150, 78, 42), rgb(48, 82, 112), rgb(176, 146, 72), rgb(102, 36, 52), rgb(110, 74, 46)];

export type FolkLook = { hair: number; cloth: number; mark: number };

export function drawFolk(
  ctx: CanvasRenderingContext2D,
  id: number,
  role: string,
  planet: Kind,
  phase: number,
  act: FolkAct,
  scale: number,
  wounds: readonly string[],
  blind: boolean,
  look?: FolkLook,
) {
  const skin = skinOf(id, planet);
  const hair = HAIR[(look?.hair ?? Math.abs(id)) % HAIR.length] ?? HAIR[0];
  const cloth = CLOTH[(look?.cloth ?? Math.abs(id * 3)) % CLOTH.length] ?? CLOTH[0];
  const scar = (look?.mark ?? Math.abs(id)) % 5;
  const legMiss = wounds.includes("pierna");
  const armMiss = wounds.includes("brazo") || wounds.includes("mano");
  const eyeMiss = wounds.includes("ojo") || blind;
  const moving = act === "walk" || act === "haul" || act === "run" || act === "climb";
  const glance = (act === "idle" ? phase * 0.08 : act === "turn" ? 0.16 : act === "work" ? -0.04 : 0) + Math.sin(phase * 0.62 + 0.9) * 0.045;
  const bob = act === "run" ? Math.sin(phase) ** 2 * 0.04 : moving ? Math.sin(phase) ** 2 * 0.03 : act === "idle" ? Math.sin(phase) * 0.012 : 0;
  const lean =
    act === "fall"
      ? Math.min(0.85, Math.max(0, phase))
      : act === "chop"
        ? -0.06 + ((Math.sin(phase * 2) + 1) / 2) * 0.16
        : act === "run"
          ? 0.1
          : act === "guard"
            ? -0.08
            : act === "fight"
              ? 0.08
              : act === "haul"
                ? 0.08
                : legMiss
                  ? 0.05
                  : 0;
  const stride = act === "run" ? 0.28 : act === "haul" ? 0.14 : act === "climb" ? 0.1 : moving ? 0.2 : act === "fight" || act === "guard" ? 0.06 : 0;
  const lift = act === "run" ? 0.13 : act === "climb" ? 0.12 : moving ? 0.09 : 0;
  const hipDrop = act === "crouch" || act === "build" ? 0.2 : act === "fall" ? 0.16 : act === "guard" ? 0.05 : 0;
  const left = stepOf(phase, 0);
  const right = stepOf(phase, Math.PI);
  const legH = 0.58;
  const bodyH = 0.46;
  const bodyW = 0.34;
  const head = 0.26;

  ctx.save();
  const pulse = act === "idle" ? Math.sin(phase) : moving ? Math.sin(phase) ** 2 : act === "jump" ? 0.5 : 0;
  const sy = act === "idle" ? 1 + pulse * 0.07 : moving ? 1 - pulse * 0.09 : 1;
  const sx = 2 - sy;
  ctx.scale(scale * sx, scale * sy);
  ctx.rotate(lean);

  const air = act === "jump" ? Math.max(0, Math.min(1, phase)) * 0.32 : 0;
  const weight = act === "turn" ? 0.1 : moving ? -left.x * stride * 0.45 : act === "chop" ? 0.06 : 0;
  const hip = legH - hipDrop;
  const chest = hip + bob;
  put(ctx, -0.16 + weight, -0.02, 0.32, 0.03, "rgba(10,8,6,0.28)");
  if (air) ctx.translate(0, -air);

  const drawLeg = (far: boolean, foot: { x: number; y: number }, missing: boolean) => {
    const wide = act === "fight" || act === "guard" ? 0.05 : 0;
    const z = (far ? -0.06 : 0.06) + (far ? -wide : wide);
    const hipX = z + weight;
    const hipY = hip;
    let footX = z + foot.x * stride * (missing ? 0.2 : 1) + weight * 0.2;
    let footY = missing ? hip * 0.35 : foot.y * lift;
    if (act === "jump") footY = 0.05;
    if (act === "crouch" || act === "build" || act === "guard" || act === "chop" || act === "fight") footY = 0;
    footY = Math.max(0, footY);
    const col = css(far ? shade(cloth, -0.28) : cloth);
    const span = Math.max(0.08, hipY - footY);
    const swing = Math.max(0, footY);
    let kneeX = (hipX + footX) * 0.5 + Math.min(0.08, span * 0.2) + swing * 0.9;
    let kneeY = footY + span * (swing > 0.02 ? 0.62 : 0.44);
    if (act === "crouch" || act === "build") {
      kneeX = hipX + 0.1;
      kneeY = footY + span * 0.58;
    }
    kneeY = Math.min(hipY - 0.05, Math.max(footY + 0.05, kneeY));
    const thick = far ? 0.055 : 0.068;
    if (missing) {
      bone(ctx, hipX, hipY * 0.72, hipX + 0.04, hipY * 0.38, thick, col);
      return;
    }
    bone(ctx, hipX, hipY, kneeX, kneeY, thick, col);
    bone(ctx, kneeX, kneeY, footX, footY, thick * 0.82, col);
    put(ctx, footX - thick * 0.7, footY, thick * 1.5, 0.035, css(shade(cloth, -0.4)));
  };
  drawLeg(true, left, false);
  drawLeg(false, right, legMiss);

  put(ctx, -bodyW / 2 + weight, chest, bodyW, bodyH, css(cloth));
  hatch(ctx, -bodyW / 2 + weight, chest, bodyW, bodyH);
  put(ctx, -bodyW / 2 + 0.04 + weight, chest, bodyW - 0.08, bodyH * 0.28, css(shade(cloth, 0.18)));
  if (role === "lider") put(ctx, -bodyW / 2 + weight, chest + bodyH - 0.06, bodyW, 0.06, "#e2b15a");
  if (role === "guardia") put(ctx, -bodyW / 2 + weight, chest + bodyH * 0.42, bodyW, 0.06, "#2a2420");

  const drawArm = (far: boolean, off: number, missing: boolean) => {
    const z = far ? -0.12 : 0.1;
    const step = stepOf(phase, off);
    let handX = z + (moving ? -step.x * stride * 0.85 : 0);
    let handY = chest + bodyH * 0.55 - (moving ? step.y * lift : 0);
    if (act === "chop") {
      const s = (Math.sin(phase * 2) + 1) / 2;
      handX = 0.34 - s * 0.36;
      handY = chest + 0.06 + s * 0.4;
    } else if (act === "build") {
      const s = (Math.sin(phase * 2.2) + 1) / 2;
      if (far) {
        handX = 0.16;
        handY = hip + 0.1;
      } else {
        handX = 0.22;
        handY = hip + 0.14 + s * 0.36;
      }
    } else if (act === "crouch" || act === "work") {
      handX = 0.16 + (far ? -0.04 : 0.06);
      handY = Math.max(0.16, hip * 0.55);
    } else if (act === "fight") {
      const jab = (Math.sin(phase * 3) + 1) / 2;
      if (!far) {
        handX = 0.1 + jab * 0.38;
        handY = chest + bodyH * 0.42;
      } else {
        handX = 0.05;
        handY = chest + bodyH * 0.78;
      }
    } else if (act === "guard") {
      handX = far ? 0.02 : 0.12;
      handY = chest + bodyH * 0.72;
    } else if (act === "climb") {
      const reach = (Math.sin(phase + (far ? Math.PI : 0)) + 1) / 2;
      handX = 0.06;
      handY = chest + bodyH * (0.55 + reach * 0.35);
    } else if (act === "jump") {
      handX = z;
      handY = chest + bodyH * 0.7;
    } else if (act === "turn") {
      handX = z + (far ? -0.12 : 0.18);
      handY = chest + bodyH * 0.45;
    } else if (act === "idle" && !far && phase > 0.35) {
      handX = role === "guardia" ? 0.08 : 0.02;
      handY = chest + bodyH * (role === "guardia" ? 0.9 : 0.95);
    } else if (act === "haul") {
      handX = 0.22;
      handY = chest + bodyH * 0.45;
    }
    const col = css(far ? shade(skin, -0.12) : skin);
    const shoulderX = z + weight + (act === "turn" ? (far ? -0.06 : 0.08) : 0);
    const shoulderY = chest + bodyH * 0.78;
    if (missing && !far) {
      bone(ctx, shoulderX, shoulderY, shoulderX + 0.08, shoulderY - 0.16, 0.05, col);
      return;
    }
    const elbowX = (shoulderX + handX) * 0.5 + (act === "guard" ? -0.02 : 0.03);
    const elbowY = (shoulderY + handY) * 0.5 - 0.02;
    bone(ctx, shoulderX, shoulderY, elbowX, elbowY, far ? 0.04 : 0.05, col);
    bone(ctx, elbowX, elbowY, handX, handY, far ? 0.035 : 0.042, col);
    if (act === "chop" && !far) {
      const s = (Math.sin(phase * 2) + 1) / 2;
      bone(ctx, handX, handY, handX + 0.08 - s * 0.04, handY + 0.05 + (1 - s) * 0.12, 0.03, "#5c4030");
      put(ctx, handX + 0.02, handY + (1 - s) * 0.12, 0.16, 0.05, "#b7bcc2");
    }
    if (act === "build" && !far) {
      const s = (Math.sin(phase * 2.2) + 1) / 2;
      bone(ctx, handX, handY, handX + 0.02, handY + 0.08 + s * 0.12, 0.028, "#6a5340");
      put(ctx, handX - 0.05, handY + 0.08 + s * 0.1, 0.14, 0.045, "#8d9096");
    }
    if (act === "haul" && !far) put(ctx, 0.12, chest + 0.22, 0.28, 0.16, "#6b4a2c");
    if (act === "fight" && !far && Math.sin(phase * 3) > 0.65) put(ctx, handX + 0.08, handY, 0.1, 0.08, css(shade(skin, 0.15)));
  };
  drawArm(true, Math.PI, false);
  drawArm(false, 0, armMiss);

  const neckY = chest + bodyH;
  const headY = neckY + (act === "work" || act === "crouch" || act === "build" ? -0.06 : 0) + (act === "fall" ? -0.06 : 0) + (act === "guard" ? 0.04 : 0) + (act === "climb" ? 0.06 : 0);
  put(ctx, -0.04, neckY - 0.02, 0.08, 0.08, css(shade(skin, -0.08)));
  put(ctx, -head / 2 + glance, headY, head, head * 0.92, css(skin));
  put(ctx, -head / 2 + 0.02 + glance, headY + head * 0.55, head - 0.04, head * 0.38, css(hair));
  if (role === "ladron") put(ctx, -head / 2 - 0.02 + glance, headY + head * 0.35, head + 0.04, head * 0.5, css(shade(cloth, -0.35)));
  if (scar > 0) put(ctx, glance + 0.02, headY + head * 0.28, 0.1, 0.035, "#6e2c28");
  const blink = Math.sin(phase * 0.37 + id * 0.2) > 0.96;
  const eye = blind ? "#1a120e" : "#1c140e";
  if (blink && !eyeMiss) {
    put(ctx, -0.04 + glance, headY + head * 0.4, 0.16, 0.02, eye);
  } else {
    if (!eyeMiss || !blind) put(ctx, head * 0.08 + glance, headY + head * 0.38, 0.045, 0.045, eye);
    if (!eyeMiss) put(ctx, -0.02 + glance, headY + head * 0.38, 0.04, 0.04, eye);
    else put(ctx, -0.03 + glance, headY + head * 0.36, 0.06, 0.05, "#5a1a16");
  }

  ctx.restore();
}

export type GroveKind = "roble" | "pino" | "palma" | "seco" | "carne" | "cristal" | "nieve";

export function drawGrove(ctx: CanvasRenderingContext2D, kind: GroveKind, salt: number) {
  const h = kind === "pino" || kind === "palma" ? 2.6 : kind === "seco" ? 1.7 : kind === "nieve" ? 2.3 : 2.15;
  const trunk = kind === "carne" ? "#6a3030" : kind === "cristal" ? "#7ec8c3" : kind === "seco" ? "#8a6a42" : "#5a3a22";
  const leaf =
    kind === "pino" || kind === "nieve"
      ? "#2d5a34"
      : kind === "palma"
        ? "#3d7a3a"
        : kind === "seco"
          ? "#8a7048"
          : kind === "carne"
            ? "#8e2f2a"
            : kind === "cristal"
              ? "#b7ece8"
              : salt > 0.5
                ? "#3d6a32"
                : "#4e7a3c";
  const snow = kind === "nieve";
  put(ctx, -0.08, 0, 0.16, h * 0.42, trunk);
  if (kind === "palma") {
    put(ctx, -0.06, h * 0.42, 0.12, h * 0.38, trunk);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      put(ctx, Math.cos(a) * 0.35 - 0.08, h * 0.72 + Math.sin(a) * 0.08, 0.42, 0.08, leaf);
    }
    return;
  }
  if (kind === "pino" || kind === "nieve") {
    put(ctx, -0.55, h * 0.28, 1.1, 0.36, snow ? "#e7eef2" : leaf);
    put(ctx, -0.4, h * 0.5, 0.8, 0.34, leaf);
    put(ctx, -0.24, h * 0.72, 0.48, 0.32, snow ? "#f4f7f8" : "#3f8a48");
    return;
  }
  if (kind === "seco") {
    put(ctx, -0.05, h * 0.42, 0.1, h * 0.28, trunk);
    put(ctx, 0.02, h * 0.62, 0.36, 0.06, trunk);
    put(ctx, -0.34, h * 0.5, 0.32, 0.06, trunk);
    return;
  }
  const blobs = kind === "cristal" ? 4 : 3;
  for (let i = 0; i < blobs; i++) {
    const w = 0.7 + ((salt * 10 + i) % 1) * 0.35;
    put(ctx, -w / 2 + (i - 1) * 0.12, h * (0.32 + i * 0.12), w, 0.48, i === blobs - 1 && snow ? "#e7eef2" : leaf);
  }
}

export function drawHouse(ctx: CanvasRenderingContext2D, level: number, pulse: number, roof = 1) {
  const w = 1.5 + level * 0.35;
  const h = 1.15 + level * 0.38;
  put(ctx, -w / 2, 0, w, h * 0.72, level >= 2 ? "#8a8478" : "#7a5438");
  put(ctx, -0.16, 0, 0.32, 0.62, "#3f2918");
  put(ctx, -0.04, 0.28, 0.08, 0.16, `rgba(255,176,70,${0.45 + pulse * 0.35})`);
  if (level >= 1) {
    put(ctx, w * 0.22, h * 0.42, 0.22, 0.18, "#1a140f");
    put(ctx, -w * 0.38, h * 0.42, 0.22, 0.18, "#1a140f");
  }
  ctx.save();
  ctx.globalAlpha *= roof;
  put(ctx, -w / 2, h * 0.72, w, h * 0.38, level >= 3 ? "#6e675f" : "#6a442c");
  put(ctx, -w / 2 - 0.08, h, w + 0.16, 0.16, "#4a3424");
  if (level >= 3) put(ctx, -0.08, h + 0.16, 0.16, 0.42, "#5c4030");
  if (level >= 4) {
    put(ctx, -w * 0.55, h * 0.15, w * 1.1, h * 0.22, "#d7c49a");
    put(ctx, -0.22, h + 0.45, 0.44, 0.7, "#4a3428");
  }
  if (level >= 5) {
    put(ctx, -0.1, h + 1.05, 0.2, 1.15, "#e2d2a8");
    put(ctx, -0.28, h + 2.05, 0.56, 0.16, "#c4a15a");
  }
  ctx.restore();
}
