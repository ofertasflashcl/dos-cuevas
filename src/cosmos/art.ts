const SHEETS = ["terrain", "people", "fauna", "buildings", "props", "kin", "acts", "life", "trees", "rock"] as const;

export type SheetName = (typeof SHEETS)[number];

export type Art = {
  sheets: Record<SheetName, HTMLImageElement | null>;
  palette: string[];
  actors: {
    folk: HTMLImageElement | null;
    woman: HTMLImageElement | null;
    child: HTMLImageElement | null;
    work: HTMLImageElement | null;
    deer: HTMLImageElement | null;
    wolf: HTMLImageElement | null;
    houses: HTMLImageElement | null;
    bird: HTMLImageElement | null;
    boat: HTMLImageElement | null;
  };
};

const FALLBACK = [
  "#1a3a52",
  "#2f6d86",
  "#c4a46a",
  "#6f8f5e",
  "#3d5c38",
  "#8a6a45",
  "#6e675f",
  "#e7eef2",
  "#c45c26",
  "#7ec8c3",
  "#8e2f2a",
  "#4a5a32",
  "#b7a15a",
  "#7a7268",
  "#9a9286",
  "#8aa0b0",
];

function loadImage(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 0 ? img : null);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function cellAverage(img: HTMLImageElement, index: number, cols: number) {
  const cw = img.width / cols;
  const ch = img.height / cols;
  const col = index % cols;
  const row = Math.floor(index / cols);
  const canvas = document.createElement("canvas");
  const size = 8;
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext("2d");
  if (!g) return FALLBACK[index] ?? "#6f8f5e";
  const inset = 0.25;
  g.drawImage(
    img,
    cw * (col + inset),
    ch * (row + inset),
    cw * (1 - inset * 2),
    ch * (1 - inset * 2),
    0,
    0,
    size,
    size,
  );
  const data = g.getImageData(0, 0, size, size).data;
  let r = 0;
  let gg = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] ?? 0;
    if (a < 40) continue;
    r += data[i] ?? 0;
    gg += data[i + 1] ?? 0;
    b += data[i + 2] ?? 0;
    n++;
  }
  if (!n) return FALLBACK[index] ?? "#6f8f5e";
  const hex = (v: number) => Math.round(v).toString(16).padStart(2, "0");
  return `#${hex(r / n)}${hex(gg / n)}${hex(b / n)}`;
}

export async function loadArt(): Promise<Art> {
  const loaded = await Promise.all(SHEETS.map((name) => loadImage(`/cosmos/${name}.png?v=7`)));
  const [folk, woman, child, work, deer, wolf, houses, bird, boat] = await Promise.all([
    loadImage("/cosmos/folk-walk.png?v=10"),
    loadImage("/cosmos/woman-walk.png?v=10"),
    loadImage("/cosmos/child-walk.png?v=10"),
    loadImage("/cosmos/work.png?v=10"),
    loadImage("/cosmos/deer-walk.png?v=10"),
    loadImage("/cosmos/wolf-walk.png?v=10"),
    loadImage("/cosmos/houses.png?v=10"),
    loadImage("/cosmos/bird-fly.png?v=10"),
    loadImage("/cosmos/boat.png?v=10"),
  ]);
  const sheets = {
    terrain: loaded[0] ?? null,
    people: loaded[1] ?? null,
    fauna: loaded[2] ?? null,
    buildings: loaded[3] ?? null,
    props: loaded[4] ?? null,
    kin: loaded[5] ?? null,
    acts: loaded[6] ?? null,
    life: loaded[7] ?? null,
    trees: loaded[8] ?? null,
    rock: loaded[9] ?? null,
  };
  const palette = FALLBACK.slice();
  if (sheets.terrain) {
    for (let i = 0; i < 16; i++) palette[i] = cellAverage(sheets.terrain, i, 4);
  }
  return { sheets, palette, actors: { folk, woman, child, work, deer, wolf, houses, bird, boat } };
}

export function cellOf(img: HTMLImageElement, index: number, cols: number, inset: number, rows = cols) {
  const cw = img.width / cols;
  const ch = img.height / rows;
  const col = index % cols;
  const row = Math.floor(index / cols);
  return {
    sx: col * cw + inset,
    sy: row * ch + inset,
    sw: Math.max(1, cw - inset * 2),
    sh: Math.max(1, ch - inset * 2),
  };
}
