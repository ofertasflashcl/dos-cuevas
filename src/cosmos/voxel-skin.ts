type RGB = readonly [number, number, number];

type Base = { top: RGB; side: RGB; lip: RGB };

/** Cooler crust, then a hotter cap. Salt picks; nothing here is animated. */
const LAVA_HOT: RGB = [240, 154, 68];

const BASE: readonly Base[] = [
  /* 0 deep    */ { top: [46, 122, 154], side: [18, 48, 72], lip: [8, 24, 40] },
  /* 1 shallow */ { top: [90, 168, 188], side: [42, 100, 124], lip: [20, 56, 72] },
  /* 2 sand    */ { top: [224, 192, 128], side: [160, 120, 68], lip: [92, 66, 36] },
  /* 3 grass   */ { top: [126, 162, 76], side: [122, 84, 48], lip: [62, 40, 20] },
  /* 4 forest  */ { top: [60, 106, 58], side: [90, 60, 34], lip: [44, 28, 16] },
  /* 5 dirt    */ { top: [176, 132, 80], side: [122, 78, 44], lip: [64, 36, 20] },
  /* 6 rock    */ { top: [154, 148, 138], side: [94, 96, 108], lip: [50, 52, 60] },
  /* 7 snow    */ { top: [232, 238, 242], side: [108, 124, 140], lip: [58, 70, 84] },
  /* 8 lava    */ { top: [212, 98, 40], side: [92, 36, 24], lip: [46, 16, 12] },
  /* 9 crystal */ { top: [90, 216, 208], side: [46, 104, 116], lip: [22, 52, 60] },
  /* 10 flesh  */ { top: [196, 90, 78], side: [114, 40, 50], lip: [58, 20, 28] },
  /* 11 swamp  */ { top: [98, 120, 60], side: [74, 60, 36], lip: [38, 30, 16] },
  /* 12 lake   */ { top: [74, 154, 164], side: [30, 86, 100], lip: [14, 48, 60] },
];

const DIRT = 5;

function clamp01(n: number) {
  if (!(n > 0)) return 0;
  if (n >= 1) return 1;
  return n;
}

/** Per channel stays inside ±12. Shared offset keeps lip darker than side. */
function sway(salt: number): RGB {
  const s = clamp01(salt);
  const u = s * 2 - 1;
  const v = ((s * 7) % 1) * 2 - 1;
  return [u * 3 + v * 1.5, u * 3 - v, u * 2 - v];
}

function byte(n: number) {
  const v = Math.round(n);
  if (v <= 0) return 0;
  if (v >= 255) return 255;
  return v;
}

function hex(rgb: RGB, off: RGB) {
  const r = byte(rgb[0] + off[0]);
  const g = byte(rgb[1] + off[1]);
  const b = byte(rgb[2] + off[2]);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

export function columnColors(tile: number, salt: number): { top: string; side: string; lip: string } {
  const id = tile | 0;
  const base = BASE[id] ?? BASE[DIRT]!;
  const off = sway(salt);
  const top = id === 8 && salt >= 0.5 ? LAVA_HOT : base.top;
  return { top: hex(top, off), side: hex(base.side, off), lip: hex(base.lip, off) };
}

export function skinOf(tile: number, salt: number, face: "top" | "side" | "lip"): string {
  return columnColors(tile, salt)[face];
}
