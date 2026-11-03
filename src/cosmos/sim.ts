import {
  DEEP,
  FLESH,
  H,
  LAKE,
  LAVA,
  SHALLOW,
  SNOW,
  W,
  blocked,
  clamp,
  dist,
  idx,
  wrap,
  wrapDelta,
} from "./geo";
import { columnAt } from "./chunks";
import { civName, eraName, personName, siteLevel, type Kind } from "./names";
import { generatePlanet } from "./planet";
import type { Civ, Fauna, FaunaKind, Floater, Law, Log, Needs, Person, Planet, Plot, Role, Task, Timber, Tone, Work, WorkKind, World } from "./types";
import { BABY_DAYS, CHILD_DAYS } from "./types";

const KEY = "dos-cuevas-cosmos-v1";

export function stageOf(p: Person): "bebe" | "nino" | "adulto" {
  if (p.role === "alien") return "adulto";
  const age = p.age ?? 480;
  if (age < BABY_DAYS) return "bebe";
  if (age < CHILD_DAYS) return "nino";
  return "adulto";
}

const BEAST_NAMES: Record<FaunaKind, string[]> = {
  presa: ["Cierva", "Ciervo", "Liebre", "Cabra"],
  cazador: ["Loba", "Lobo", "Lobo negro"],
  ave: ["Cuervo", "Gaviota", "Búho"],
  alien: ["Cosa", "Larva", "Nudo"],
  perro: ["Can", "Perra", "Cachorro"],
  mastin: ["Mastín", "Guardián", "Perro grande"],
  carroña: ["Buitre", "Hiena", "Zopilote"],
};

export function beastName(kind: FaunaKind, id: number) {
  const bag = BEAST_NAMES[kind];
  return bag[Math.abs(id) % bag.length] ?? "Bestia";
}

export function looks(p: Person) {
  const jobs = ["cazador", "tejedor", "albañil", "pescador", "curandero", "guardia"] as const;
  return {
    job: p.job || jobs[Math.abs(p.id) % jobs.length] || "cazador",
    hair: p.hair ?? Math.abs(p.id) % 6,
    cloth: p.cloth ?? Math.abs(p.id * 3) % 6,
    mark: p.mark ?? Math.abs(p.id) % 5,
  };
}

const DECOR = ["una piel en la pared", "un banco de madera", "lanzas cruzadas", "un tapiz", "un cuenco", "marcas de tatuaje", "un telar", "flores secas", "ropa tendida", "un cráneo pintado"];

export function beastLine(kind: FaunaKind) {
  if (kind === "presa") return "Huele a gente y se aparta. Come lo que el suelo da.";
  if (kind === "perro") return "Es chico. Sigue a la gente y huye del lobo.";
  if (kind === "mastin") return "Es grande. Se planta entre la gente y lo que muerde.";
  if (kind === "cazador") return "El lobo es más alto que un hombre agachado. Si tiene hambre, abre.";
  if (kind === "carroña") return "Espera a que algo deje de moverse. A veces no espera tanto.";
  if (kind === "ave") return "El suelo no le importa. Cruza agua y techos.";
  return "No es de este mundo y no pide permiso.";
}

export function isNight(day: number) {
  const h = ((day % 24) + 24) % 24;
  return h >= 20 || h < 6;
}

export function makeRng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function say(
  world: World,
  text: string,
  planet: number,
  people: number[],
  tone: Tone,
  quiet: boolean,
  ping?: World["ping"],
) {
  world.logs.unshift({ day: world.day, text, planet, people, tone });
  if (world.logs.length > 70) world.logs.length = 70;
  if (!quiet && ping) world.ping = ping;
}

function floatAt(world: World, planet: number, x: number, y: number, text: string) {
  world.floaters.unshift({ planet, x, y, text, life: 2.6 });
  if (world.floaters.length > 8) world.floaters.pop();
}

function lawFor(kind: Kind, index: number): Law {
  if (kind === "tierra" && index === 0) return "clan";
  if (kind === "tierra" && index === 1) return "consejo";
  if (kind === "tierra") return "mercado";
  if (kind === "desierto" || kind === "carne") return "tirano";
  if (kind === "cristal") return "colmena";
  if (kind === "lava") return "mercado";
  if (kind === "oceano") return "consejo";
  return "clan";
}

function headStart(kind: Kind) {
  if (kind === "cristal") return 5;
  if (kind === "lava") return 3;
  if (kind === "carne") return 2;
  return 0;
}

const FAUNA_PLAN: Record<Kind, [FaunaKind, number][]> = {
  tierra: [["presa", 8], ["perro", 5], ["mastin", 2], ["cazador", 4], ["carroña", 3], ["ave", 5]],
  desierto: [["presa", 3], ["carroña", 3], ["cazador", 2]],
  hielo: [["presa", 3], ["cazador", 3], ["perro", 2]],
  jungla: [["presa", 7], ["cazador", 4], ["ave", 4], ["carroña", 3]],
  lava: [["cazador", 3], ["carroña", 2]],
  cristal: [["alien", 3], ["ave", 2]],
  carne: [["alien", 4], ["carroña", 3], ["cazador", 2]],
  oceano: [["ave", 5], ["presa", 2]],
};

function placeNear(tiles: Uint8Array, x: number, y: number, rng: () => number, alien = false) {
  for (let k = 0; k < 16; k++) {
    const a = rng() * Math.PI * 2;
    const r = rng() * 3.2;
    const nx = wrap(x + Math.cos(a) * r);
    const ny = clamp(y + Math.sin(a) * r, 1, H - 2);
    if (!blocked(tiles[idx(nx, ny)] ?? 0, alien)) return { x: nx, y: ny };
  }
  return { x, y };
}

export function generate(seed: number): World {
  const rng = makeRng(seed || 1);
  const exotic: Kind[] = ["desierto", "hielo", "jungla", "lava", "cristal", "carne", "oceano"];
  for (let i = exotic.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    const tmp = exotic[i]!;
    exotic[i] = exotic[j]!;
    exotic[j] = tmp;
  }
  const kinds: Kind[] = [exotic[0]!, exotic[1]!, "tierra", exotic[2]!, exotic[3]!, exotic[4]!, exotic[5]!, exotic[6]!];
  const names = ["Cendra", "Velo", "Tierra", "Bruma", "Óseo", "Nacre", "Umbral", "Marea"];
  const orbits = [0.3, 0.42, 0.54, 0.66, 0.76, 0.86, 0.93, 1];
  const speeds = [0.011, 0.0085, 0.0064, 0.005, 0.004, 0.0033, 0.0028, 0.0022];
  const used = new Set<string>();
  const civUsed = new Set<string>(["Dos Cuevas", "Sal de la Orilla", "Hijos del Río"]);
  let uid = 1;
  const planets: Planet[] = [];
  const civs: Civ[] = [];
  const people: Person[] = [];
  const fauna: Fauna[] = [];
  const timber: Timber[] = [];
  const earthNames = ["Dos Cuevas", "Sal de la Orilla", "Hijos del Río"];

  for (let i = 0; i < 8; i++) {
    const kind = kinds[i]!;
    const count = kind === "tierra" ? 3 : kind === "oceano" ? 1 : 2;
    const gen = generatePlanet(kind, (seed + i * 9973) >>> 0, count, rng);
    const planet: Planet = {
      id: i,
      name: names[i]!,
      kind,
      seed: (seed + i * 9973) >>> 0,
      orbit: orbits[i]!,
      speed: speeds[i]!,
      phase: rng() * Math.PI * 2,
      tiles: gen.tiles,
      farm: gen.farm,
      road: gen.road,
      span: new Uint8Array(W * H),
      stamp: 0,
      sites: [],
    };
    gen.spots.forEach((spot, index) => {
      const era = headStart(kind);
      const id = uid++;
      const name = kind === "tierra" ? earthNames[index] ?? civName(rng, civUsed) : civName(rng, civUsed);
      const civ: Civ = {
        id,
        planet: i,
        name,
        kind,
        era,
        law: lawFor(kind, index),
        pop: 18 + era * 10,
        food: 30 + era * 4,
        order: 56,
        fear: kind === "carne" ? 22 : 12,
        knowledge: era * 6,
        wood: 4,
        leaderId: 0,
        relations: {},
        beyond: 0,
      };
      civs.push(civ);
      planet.sites.push({ x: spot.x + 0.5, y: spot.y + 0.5, civId: id, level: siteLevel(era) });
      const roles: Role[] = ["lider", "guardia", "guardia", "ladron", "ciudadano", "ciudadano", "ciudadano", "ciudadano"];
      for (const role of roles) {
        const at = placeNear(gen.tiles, spot.x + 0.5, spot.y + 0.5, rng);
        const person: Person = {
          id: uid++,
          name: personName(rng, used),
          civId: id,
          planet: i,
          role,
          x: at.x,
          y: at.y,
          hx: spot.x + 0.5,
          hy: spot.y + 0.5,
          tx: spot.x + 0.5,
          ty: spot.y + 0.5,
          hp: role === "lider" ? 120 : 100,
          wealth: role === "lider" ? 12 : 2 + ((rng() * 6) | 0),
          loyalty: role === "lider" ? 70 : 40 + ((rng() * 30) | 0),
          alive: true,
          heldBy: null,
          held: 0,
          facing: 1,
          task: "nada",
          taskLeft: 0,
          workId: 0,
          age: 420 + ((rng() * 260) | 0),
          motherId: null,
          fatherId: null,
        };
        if (role === "lider") civ.leaderId = person.id;
        people.push(person);
      }
      const grown = people.filter((p) => p.civId === id);
      const mother = grown[0];
      const father = grown[1] ?? grown[0];
      if (mother && father) {
        for (const age of [4, 96]) {
          const at = placeNear(gen.tiles, spot.x + 0.5, spot.y + 0.5, rng);
          people.push({
            id: uid++,
            name: personName(rng, used),
            civId: id,
            planet: i,
            role: "ciudadano",
            x: at.x,
            y: at.y,
            hx: spot.x + 0.5,
            hy: spot.y + 0.5,
            tx: mother.x,
            ty: mother.y,
            hp: age < BABY_DAYS ? 40 : 70,
            wealth: 0,
            loyalty: 60,
            alive: true,
            heldBy: null,
            held: 0,
            facing: 1,
            task: age < BABY_DAYS ? "gatea" : "sigue",
            taskLeft: 6,
            workId: 0,
            age,
            motherId: mother.id,
            fatherId: father.id,
          });
        }
      }
    });
    const pool: { x: number; y: number }[] = [];
    for (let n = 0; n < 80; n++) {
      const x = rng() * W;
      const y = rng() * H;
      if (!blocked(gen.tiles[idx(x, y)] ?? 0)) pool.push({ x, y });
    }
    for (const [fk, n] of FAUNA_PLAN[kind]) {
      for (let k = 0; k < n; k++) {
        const at = pool[(rng() * pool.length) | 0];
        if (!at) continue;
        fauna.push({
          id: uid++,
          planet: i,
          kind: fk,
          x: at.x,
          y: at.y,
          hp: fk === "cazador" || fk === "alien" ? 58 : fk === "mastin" ? 40 : fk === "carroña" ? 30 : 22,
          alive: true,
          facing: 1,
          tx: at.x,
          ty: at.y,
          name: beastName(fk, uid),
        });
      }
    }
    let planted = 0;
    for (let n = 0; n < 500 && planted < 16; n++) {
      const x = (rng() * W) | 0;
      const y = (rng() * H) | 0;
      const tile = gen.tiles[idx(x, y)] ?? 0;
      const ok =
        kind === "lava" ? tile === 6 || tile === 8 :
        kind === "hielo" ? tile === 7 || tile === 6 :
        kind === "cristal" ? tile === 9 || tile === 6 :
        kind === "carne" ? tile === 10 || tile === 5 :
        kind === "desierto" ? tile === 5 || tile === 6 :
        tile === 4 || tile === 11 || tile === 3;
      if (!ok) continue;
      if (timber.some((t) => t.planet === i && dist(t.x, t.y, x, y) < 8)) continue;
      const form = tile === 6 || kind === "desierto" ? "seco" : kind === "hielo" ? "pino" : kind === "jungla" && rng() < 0.45 ? "palma" : rng() < 0.5 ? "pino" : "roble";
      timber.push({ id: uid++, planet: i, x: x + 0.5, y: y + 0.5, kind: "arbol", fall: 0, carriedBy: null, civId: -1, form });
      planted++;
    }
    planets.push(planet);
  }
  for (const a of civs) {
    for (const b of civs) {
      if (a.id !== b.id && a.planet === b.planet) a.relations[b.id] = 8;
    }
  }
  const home = civs.find((c) => c.name === "Dos Cuevas") ?? civs[0]!;
  const world: World = {
    seed,
    day: 0,
    attention: 3,
    visited: 0,
    coached: false,
    angle: -0.4,
    planets,
    civs,
    people,
    fauna,
    plots: [],
    works: [],
    timber,
    logs: [],
    floaters: [],
    shields: {},
    uid,
    focusPlanet: home.planet,
    focusCiv: home.id,
    ping: null,
  };
  for (const civ of civs) {
    const need = chooseWork(world, civ);
    if (need) beginWork(world, civ, need.kind, need.reason);
  }
  return world;
}

function civById(world: World, id: number) {
  return world.civs.find((c) => c.id === id);
}

function personById(world: World, id: number) {
  return world.people.find((p) => p.id === id);
}

function members(world: World, civId: number, pred?: (p: Person) => boolean) {
  return world.people.filter((p) => p.alive && p.civId === civId && p.role !== "alien" && (!pred || pred(p)));
}

function pick<T>(arr: T[]) {
  if (!arr.length) return undefined;
  return arr[(Math.random() * arr.length) | 0];
}

function rel(world: World, a: number, b: number) {
  return civById(world, a)?.relations[b] ?? 0;
}

function shiftRel(world: World, a: number, b: number, d: number) {
  const ca = civById(world, a);
  const cb = civById(world, b);
  if (!ca || !cb || a === b) return;
  ca.relations[b] = clamp((ca.relations[b] ?? 0) + d, -100, 100);
  cb.relations[a] = clamp((cb.relations[a] ?? 0) + d, -100, 100);
}

function elect(world: World, civ: Civ) {
  const pool = members(world, civ.id, (p) => p.role === "ciudadano" || p.role === "guardia" || p.role === "lider");
  if (!pool.length) return;
  pool.sort((a, b) => b.loyalty - a.loyalty);
  const next = pool[0]!;
  for (const p of pool) if (p.role === "lider" && p.id !== next.id) p.role = "ciudadano";
  next.role = "lider";
  civ.leaderId = next.id;
}

let deathsToday = 0;
let maimsToday = 0;

const WOUNDS = ["dedos", "ojo", "mano", "brazo", "pierna"] as const;

function woundText(part: (typeof WOUNDS)[number], name: string, by: string) {
  if (part === "ojo") return `${by} le saca un ojo a ${name}. El grito se corta a la mitad.`;
  if (part === "dedos") return `${by} le arranca los dedos a ${name}. Quedan en el barro.`;
  if (part === "mano") return `${by} le corta la mano a ${name}. La sangre no encuentra por dónde salir.`;
  if (part === "brazo") return `${by} le arranca el brazo a ${name}. El muñón no cierra.`;
  return `${by} le destroza la pierna a ${name}. Desde hoy arrastra lo que queda.`;
}

let recentLines: string[] = [];

function vary(lines: string[]) {
  const fresh = lines.find((line) => !recentLines.includes(line)) ?? lines[0]!;
  recentLines = [fresh, ...recentLines].slice(0, 24);
  return fresh;
}

function maim(world: World, target: Person, part: (typeof WOUNDS)[number], by: string, quiet: boolean, killer: Person | null) {
  if (!target.alive || stageOf(target) === "bebe") return;
  if (maimsToday > 4) return;
  const wounds = target.wounds ?? [];
  if (part === "ojo" && wounds.includes("ojo")) {
    target.hp -= target.blind ? 8 : 14;
    target.reel = 5;
    target.dread = Math.min(100, (target.dread ?? 0) + 20);
    if (!target.blind) {
      target.blind = true;
      maimsToday++;
      say(world, vary([
        `${by} le apaga el otro ojo a ${target.name}. Queda ciego. No se muere de eso.`,
        `${target.name} ya no ve. ${by} se llevó el segundo ojo y el cuerpo sigue.`,
      ]), target.planet, [target.id], "sangre", quiet, "hit");
      floatAt(world, target.planet, target.x, target.y, "ciego");
    }
    if (target.hp <= 0) kill(world, target, killer, "se desangró", quiet);
    return;
  }
  if (wounds.includes(part) || wounds.length >= 3) {
    kill(world, target, killer, wounds.length ? `la herida del ${wounds[wounds.length - 1]}` : "ya no le quedaba cuerpo", quiet);
    return;
  }
  maimsToday++;
  target.wounds = [...wounds, part];
  target.hp -= 24;
  target.reel = 5;
  target.dread = Math.min(100, (target.dread ?? 0) + 36);
  const civ = civById(world, target.civId);
  if (civ) civ.fear = clamp(civ.fear + 10, 0, 100);
  say(world, woundText(part, target.name, by), target.planet, [target.id], "sangre", quiet, "hit");
  floatAt(world, target.planet, target.x, target.y, part);
  if (target.hp <= 0) kill(world, target, killer, "Se desangra en el sitio.", quiet);
}

function kill(world: World, target: Person, killer: Person | null, why: string, quiet: boolean) {
  if (!target.alive) return;
  target.alive = false;
  target.hp = 0;
  target.heldBy = null;
  const civ = civById(world, target.civId);
  if (civ && civ.leaderId === target.id) {
    target.role = "ciudadano";
    elect(world, civ);
    civ.order = clamp(civ.order - 14, 0, 100);
    civ.fear = clamp(civ.fear + 16, 0, 100);
  }
  if (killer && killer.civId !== target.civId && killer.role !== "alien") shiftRel(world, killer.civId, target.civId, -24);
  if (killer && killer.role === "alien" && civ) civ.fear = clamp(civ.fear + 8, 0, 100);
  deathsToday++;
  if (deathsToday <= 3) {
    const who = killer ? killer.name : "El mundo";
    const wound = target.wounds?.[target.wounds.length - 1];
    const causa = wound ? `por la herida del ${wound}` : why;
    const raw = why.startsWith("Le ")
      ? why
      : vary([
          `Murió ${target.name}, ${causa}.`,
          `${target.name} no vio otro amanecer: ${causa}.`,
          `Se apagó ${target.name}. ${who} lo deja en ${causa}.`,
        ]);
    say(world, raw, target.planet, [target.id, killer?.id ?? -1].filter((id) => id >= 0), "sangre", quiet, "hit");
    floatAt(world, target.planet, target.x, target.y, "muerte");
  }
  if (target.role === "alien" || (killer && killer.role === "alien")) {
    const left = world.people.some((p) => p.alive && p.role === "alien" && p.planet === target.planet);
    if (!left) {
      const planet = world.planets[target.planet];
      say(world, `La flota se rompe sobre ${planet?.name ?? "el mundo"}.`, target.planet, [], "oro", quiet, "spin");
    }
  }
}

function raiseEra(world: World, civ: Civ, quiet: boolean) {
  if (civ.era >= 9) return;
  const prev = eraName(civ.kind, civ.era);
  civ.era++;
  civ.knowledge = Math.max(4, civ.knowledge * 0.35);
  const planet = world.planets[civ.planet];
  if (planet) {
    for (const site of planet.sites) {
      if (site.civId === civ.id) site.level = Math.max(site.level, siteLevel(civ.era));
    }
    planet.stamp++;
  }
  say(world, `${civ.name} deja atrás ${prev}. Ahora es ${eraName(civ.kind, civ.era)}.`, civ.planet, [civ.leaderId], "oro", quiet, "era");
  const site = planet?.sites.find((s) => s.civId === civ.id);
  if (site) floatAt(world, civ.planet, site.x, site.y, eraName(civ.kind, civ.era));
}

function openTile(planet: Planet, x: number, y: number, alien: boolean, sail: boolean) {
  const yy = Math.floor(y);
  if (yy >= 0 && yy < H) {
    const i = idx(x, yy);
    if ((planet.span[i] ?? 0) > 0) return true;
  }
  const tile = columnAt(planet.seed, planet.kind, x, y).tile;
  if (sail && (tile === DEEP || tile === SHALLOW || tile === LAKE)) return true;
  return !blocked(tile, alien);
}

function shore(planet: Planet, x: number, y: number) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const ny = y + dy;
      if (ny < 1 || ny >= H - 1) continue;
      if (blocked(planet.tiles[idx(x + dx, ny)] ?? 0)) return true;
    }
  }
  return false;
}

function walkFrom(planet: Planet, x: number, y: number, min: number, max: number) {
  for (let k = 0; k < 24; k++) {
    const a = Math.random() * Math.PI * 2;
    const r = min + Math.random() * Math.max(0.5, max - min);
    const nx = wrap(x + Math.cos(a) * r);
    const ny = clamp(y + Math.sin(a) * r, 2, H - 3);
    if (!blocked(planet.tiles[idx(nx, ny)] ?? 0)) return { x: nx, y: ny };
  }
  return { x, y };
}

function farLand(planet: Planet, x: number, y: number, min: number, sail: boolean) {
  let best: { x: number; y: number } | null = null;
  let bestD = min;
  for (let i = 0; i < 28; i++) {
    const nx = Math.random() * W;
    const ny = 2 + Math.random() * (H - 4);
    const tile = planet.tiles[idx(nx, ny)] ?? 0;
    const water = blocked(tile);
    if (water && !sail) continue;
    if (!water || sail) {
      const d = dist(x, y, nx, ny);
      if (d > bestD) {
        bestD = d;
        best = { x: nx, y: ny };
      }
    }
  }
  return best;
}

function coastNear(planet: Planet, x: number, y: number) {
  for (let r = 1; r <= 16; r++) {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2 + r;
      const nx = wrap(x + Math.cos(a) * r);
      const ny = clamp(y + Math.sin(a) * r, 2, H - 3);
      if (blocked(planet.tiles[idx(nx, ny)] ?? 0)) continue;
      if (shore(planet, nx, ny)) return { x: nx, y: ny };
    }
  }
  return null;
}

function findGap(planet: Planet, x: number, y: number) {
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    let waterAt = -1;
    let landAgain: { x: number; y: number } | null = null;
    for (let s = 1; s <= 14; s++) {
      const nx = wrap(x + Math.cos(a) * s);
      const ny = clamp(y + Math.sin(a) * s, 1, H - 2);
      const wet = blocked(planet.tiles[idx(nx, ny)] ?? 0);
      if (waterAt < 0 && wet) waterAt = s;
      if (waterAt > 0 && !wet && s - waterAt >= 2 && s - waterAt <= 8) {
        landAgain = { x: nx, y: ny };
        break;
      }
      if (waterAt > 0 && !wet && s - waterAt < 2) waterAt = -1;
    }
    if (waterAt > 0 && landAgain) return { x, y, x2: landAgain.x, y2: landAgain.y };
  }
  return null;
}

function freshWaterNear(planet: Planet, x: number, y: number, radius: number) {
  for (let dy = -radius; dy <= radius; dy++) {
    const ny = y + dy;
    if (ny < 0 || ny >= H) continue;
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = wrap(x + dx);
      if (dist(x, y, nx, ny) > radius) continue;
      const t = planet.tiles[idx(nx, ny)] ?? 0;
      if (t === SHALLOW || t === LAKE) return true;
    }
  }
  return false;
}

function shoreWithin(planet: Planet, x: number, y: number, radius: number) {
  for (let dy = -radius; dy <= radius; dy++) {
    const ny = y + dy;
    if (ny < 1 || ny >= H - 1) continue;
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = wrap(x + dx);
      if (blocked(planet.tiles[idx(nx, ny)] ?? 0)) continue;
      if (shore(planet, nx, ny)) return true;
    }
  }
  return false;
}

function puenteNear(world: World, planetId: number, x: number, y: number) {
  return world.works.some((w) => w.planet === planetId && w.kind === "puente" && dist(w.x, w.y, x, y) <= 8);
}

export const WORK_NAME: Record<WorkKind, string> = {
  puente: "un puente",
  camino: "un camino",
  granja: "una granja",
  pozo: "un pozo",
  barco: "un barco",
  balsa: "una balsa",
  muelle: "un muelle",
  muralla: "una muralla",
  atalaya: "una atalaya",
  taller: "un taller",
  molino: "un molino",
  horno: "un horno",
  santuario: "un santuario",
  mercado: "un mercado",
  escuela: "una escuela",
  hospital: "un hospital",
  faro: "un faro",
  acueducto: "un acueducto",
  mina: "una mina",
  dique: "un dique",
  presa: "una presa",
  invernadero: "un invernadero",
  torre: "una torre",
  astillero: "un astillero",
  canal: "un canal",
  embarcadero: "un embarcadero",
  mapa: "un mapa de la orilla",
  granero: "un granero",
  palacio: "un palacio",
  calzada: "una calzada",
  coloso: "un coloso",
};

const WORK_DONE: Record<WorkKind, (who: string, civ: string) => string> = {
  puente: (n, c) => `${n} termina un puente. En ${c} ya cruzan donde antes se ahogaban.`,
  camino: (n, c) => `${n} apisona un camino. ${c} deja de perderse entre su propia casa.`,
  granja: (n, c) => `${n} cierra el cerco de una granja. ${c} tendrá grano que no depende de la suerte.`,
  pozo: (n, c) => `${n} llega al agua. ${c} bebe sin bajar al río.`,
  barco: (n, c) => `${n} bota un barco. El agua deja de ser un muro para ${c}.`,
  balsa: (n, c) => `${n} ata una balsa. Alguien de ${c} podrá cruzar.`,
  muelle: (n, c) => `${n} clava un muelle. Las barcas de ${c} tienen donde dormir.`,
  muralla: (n, c) => `${n} cierra una muralla. ${c} duerme con un ojo menos abierto.`,
  atalaya: (n, c) => `${n} sube una atalaya. Desde arriba se ve quién viene.`,
  taller: (n, c) => `${n} abre un taller. En ${c} las manos ya no trabajan solo en el suelo.`,
  molino: (n, c) => `${n} echa a andar un molino. El grano se parte solo.`,
  horno: (n, c) => `${n} enciende un horno que no es una hoguera.`,
  santuario: (n, c) => `${n} deja un santuario. ${c} tiene un sitio para el miedo.`,
  mercado: (n, c) => `${n} tiende un mercado. Lo que sobra cambia de manos.`,
  escuela: (n, c) => `${n} abre una escuela. Un niño de ${c} aprende a contar más de diez.`,
  hospital: (n, c) => `${n} limpia una sala. En ${c} la fiebre ya no se atiende en el suelo.`,
  faro: (n, c) => `${n} enciende un faro. De noche la orilla tiene un ojo.`,
  acueducto: (n, c) => `${n} termina un acueducto. El agua llega sin que nadie la cargue.`,
  mina: (n, c) => `${n} abre una mina. Sale piedra que corta y un poco de metal.`,
  dique: (n, c) => `${n} cierra un dique. El río de ${c} obedece un poco.`,
  presa: (n, c) => `${n} levanta una presa. Hay agua guardada para el mes malo.`,
  invernadero: (n, c) => `${n} cierra un invernadero. Crece lo que el clima no quería.`,
  torre: (n, c) => `${n} corona una torre. El pueblo cabe en la mirada de uno.`,
  astillero: (n, c) => `${n} abre un astillero. La siguiente nave no será la última.`,
  canal: (n, c) => `${n} abre un canal. Una barca entra donde antes había que caminar.`,
  embarcadero: (n, c) => `${n} tiende un embarcadero. Ya se puede partir sin mojarse hasta el pecho.`,
  mapa: (n, c) => `${n} dibuja la orilla. ${c} por fin sabe qué hay detrás del cerro.`,
  granero: (n, c) => `${n} cierra un granero. ${c} puede aguantar un invierno largo.`,
  palacio: (n, c) => `${n} termina un palacio. Desde el cerro se ve el techo de ${c}.`,
  calzada: (n, c) => `${n} termina una calzada. ${c} ya no camina por el barro entre sus fuegos.`,
  coloso: (n, c) => `${n} corona un coloso. La obra llevó años. ${c} queda marcado en el horizonte.`,
};

function hulls(world: World, civId: number) {
  let n = 0;
  for (const w of world.works) {
    if (!w.done || w.civId !== civId) continue;
    if (w.kind === "barco" || w.kind === "balsa" || w.kind === "astillero" || w.kind === "muelle") n++;
  }
  return n;
}

function crewOf(world: World, workId: number) {
  let n = 0;
  for (const p of world.people) if (p.alive && p.task === "obra" && p.workId === workId) n++;
  return n;
}

function stampLine(planet: Planet, x: number, y: number, x2: number, y2: number, mode: "span" | "road") {
  const dx = wrapDelta(x2 - x);
  const dy = y2 - y;
  const steps = Math.max(2, Math.ceil(Math.hypot(dx, dy)));
  for (let s = 0; s <= steps; s++) {
    const px = wrap(x + (dx * s) / steps);
    const py = clamp(y + (dy * s) / steps, 1, H - 2);
    for (let oy = -1; oy <= 1; oy++) {
      const yy = py + oy;
      if (yy < 0 || yy >= H) continue;
      const i = idx(px, yy);
      if (mode === "span") planet.span[i] = 1;
      else if (!blocked(planet.tiles[i] ?? 0)) planet.road[i] = 1;
    }
  }
  planet.stamp++;
}

function paintDisk(planet: Planet, x: number, y: number, mode: "farm" | "road", reach = 10) {
  const rad = Math.ceil(Math.sqrt(reach));
  for (let dy = -rad; dy <= rad; dy++) {
    for (let dx = -rad; dx <= rad; dx++) {
      if (dx * dx + dy * dy > reach) continue;
      const xx = wrap(x + dx);
      const yy = y + dy;
      if (yy < 0 || yy >= H) continue;
      const i = idx(xx, yy);
      if (blocked(planet.tiles[i] ?? 0)) continue;
      if (mode === "farm") planet.farm[i] = 1;
      else planet.road[i] = 1;
    }
  }
  planet.stamp++;
}

function beginWork(world: World, civ: Civ, kind: WorkKind, reason?: string, quiet = false) {
  const planet = world.planets[civ.planet];
  if (!planet) return false;
  const active = world.works.filter((w) => w.civId === civ.id && !w.done).length;
  const finished = world.works.filter((w) => w.civId === civ.id && w.done).length;
  if (active >= (finished >= 5 ? 3 : 2)) return false;
  const doneSame = world.works.filter((w) => w.civId === civ.id && w.done && w.kind === kind).length;
  const repeat = kind === "granja" || kind === "camino" || kind === "puente" || kind === "torre" || kind === "atalaya" || kind === "granero" || kind === "calzada";
  if ((kind === "coloso" || kind === "palacio") && doneSame > 0) return false;
  if (doneSame > 0 && !repeat) return false;
  if ((kind === "granero" || kind === "calzada") && doneSame >= 2) return false;
  if (doneSame >= 4) return false;
  const site = planet.sites.find((s) => s.civId === civ.id) ?? planet.sites[0];
  if (!site) return false;
  let x = site.x;
  let y = site.y;
  let x2 = site.x;
  let y2 = site.y;
  if (kind === "puente" || kind === "dique" || kind === "acueducto") {
    const gap = findGap(planet, site.x, site.y);
    if (!gap) return false;
    x = gap.x;
    y = gap.y;
    x2 = gap.x2;
    y2 = gap.y2;
  } else if (kind === "camino" || kind === "canal" || kind === "calzada") {
    const other = planet.sites.find((s) => s.civId !== civ.id || (s.x !== site.x && dist(s.x, s.y, site.x, site.y) > 6));
    const dest = other ?? walkFrom(planet, site.x, site.y, kind === "calzada" ? 14 : 8, kind === "calzada" ? 26 : 18);
    x = site.x;
    y = site.y;
    x2 = dest.x;
    y2 = dest.y;
  } else if (kind === "barco" || kind === "balsa" || kind === "muelle" || kind === "faro" || kind === "embarcadero" || kind === "astillero") {
    const c = coastNear(planet, site.x, site.y);
    if (!c) return false;
    x = c.x;
    y = c.y;
    x2 = c.x;
    y2 = c.y;
  } else {
    const at = walkFrom(planet, site.x, site.y, 4, kind === "granja" || kind === "invernadero" ? 7 : 11);
    if (dist(at.x, at.y, site.x, site.y) < 2) return false;
    x = at.x;
    y = at.y;
    x2 = site.x;
    y2 = site.y;
  }
  const need =
    kind === "coloso" ? 48 : kind === "palacio" ? 30 : kind === "calzada" ? 22 : kind === "granero" ? 16 : kind === "puente" || kind === "acueducto" || kind === "astillero" ? 12 : kind === "camino" || kind === "canal" || kind === "muralla" ? 9 : 7;
  world.works.push({
    id: world.uid++,
    planet: planet.id,
    civId: civ.id,
    kind,
    x,
    y,
    x2,
    y2,
    progress: 0,
    need,
    done: false,
    reason,
  });
  const done = world.works.filter((w) => w.civId === civ.id && w.done);
  if (done.length > 16) world.works = world.works.filter((w) => w !== done[0]);
  if (reason) say(world, reason, planet.id, [civ.leaderId], "voz", quiet);
  return true;
}

function applyWork(world: World, work: Work, silent: boolean, who: Person | null) {
  const planet = world.planets[work.planet];
  const civ = civById(world, work.civId);
  if (!planet || !civ) return;
  if (work.kind === "puente" || work.kind === "dique" || work.kind === "acueducto" || work.kind === "canal") stampLine(planet, work.x, work.y, work.x2, work.y2, "span");
  else if (work.kind === "camino" || work.kind === "calzada") stampLine(planet, work.x, work.y, work.x2, work.y2, "road");
  else if (work.kind === "granja" || work.kind === "invernadero") paintDisk(planet, work.x, work.y, "farm");
  else if (work.kind === "granero") paintDisk(planet, work.x, work.y, "farm", 28);
  else if (work.kind === "muralla" || work.kind === "torre" || work.kind === "palacio" || work.kind === "coloso") {
    const site = planet.sites.find((s) => s.civId === civ.id);
    if (site && work.kind === "muralla") site.level = Math.min(5, Math.max(site.level, 2));
    if (site && work.kind === "palacio") site.level = Math.min(5, Math.max(site.level, 4));
    if (site && work.kind === "coloso") site.level = 5;
    planet.stamp++;
  } else if (work.kind === "barco" || work.kind === "balsa" || work.kind === "muelle" || work.kind === "embarcadero" || work.kind === "astillero" || work.kind === "faro") {
    planet.span[idx(work.x, work.y)] = 2;
    planet.stamp++;
  }
  work.done = true;
  const spent = Math.min(civ.wood ?? 0, 3);
  civ.wood = (civ.wood ?? 0) - spent;
  if (silent) return;
  else if (work.kind === "granja" || work.kind === "invernadero" || work.kind === "granero") civ.food = Math.min(260, civ.food + (work.kind === "granero" ? 36 : 18));
  else if (work.kind === "muralla" || work.kind === "torre" || work.kind === "palacio" || work.kind === "coloso") civ.order = clamp(civ.order + (work.kind === "coloso" ? 14 : 8), 0, 100);
  else if (work.kind === "pozo" || work.kind === "presa" || work.kind === "hospital") {
    civ.fear = clamp(civ.fear - 8, 0, 100);
    civ.food = Math.min(220, civ.food + 6);
    for (const m of members(world, civ.id)) m.hp = Math.min(120, m.hp + 8);
  } else if (work.kind === "escuela" || work.kind === "mapa") civ.knowledge = Math.min(48, civ.knowledge + 6);
  else if (work.kind === "mercado" || work.kind === "taller" || work.kind === "horno" || work.kind === "mina" || work.kind === "molino") {
    civ.food = Math.min(220, civ.food + 8);
    for (const m of members(world, civ.id)) m.wealth += 1;
  } else if (work.kind !== "camino" && work.kind !== "puente") {
    civ.order = clamp(civ.order + 4, 0, 100);
    civ.fear = clamp(civ.fear - 3, 0, 100);
  }
  const name = who?.name ?? civ.name;
  say(world, WORK_DONE[work.kind](name, civ.name), planet.id, who ? [who.id] : [civ.leaderId], "oro", false, "era");
  floatAt(world, planet.id, work.x, work.y, WORK_NAME[work.kind].replace(/^un |^una /, ""));
}

function civicReason(kind: WorkKind, name: string) {
  switch (kind) {
    case "taller":
      return `Ya comen en ${name}. Abren un taller: las manos dejan de trabajar solo en el suelo.`;
    case "molino":
      return `Ya comen en ${name}. El grano ya no se muele a mano.`;
    case "escuela":
      return `Ya comen en ${name}. Ahora un niño va a aprender a contar.`;
    case "muralla":
      return `Ya comen en ${name}. Cierran una muralla para dormir con un ojo menos abierto.`;
    case "mercado":
      return `Ya comen en ${name}. Lo que sobra cambia de manos en un mercado.`;
    case "horno":
      return `Ya comen en ${name}. Encienden un horno que no es una hoguera.`;
    case "hospital":
      return `Ya comen en ${name}. La fiebre ya no se atiende en el suelo.`;
    case "faro":
      return `Ya comen en ${name}. De noche la orilla necesita un faro.`;
    case "mina":
      return `Ya comen en ${name}. Abren una mina para sacar piedra que corta.`;
    case "astillero":
      return `Ya comen en ${name}. La siguiente nave no será la última.`;
    case "granero":
      return `Ya comen en ${name}. Levantan un granero para el invierno largo.`;
    case "palacio":
      return `El fuego de ${name} quiere un techo que se vea desde el cerro.`;
    case "calzada":
      return `Los fuegos de ${name} quedan lejos. Empiezan una calzada.`;
    case "coloso":
      return `${name} empieza una obra que va a durar años.`;
    default:
      return null;
  }
}

function chooseWork(world: World, civ: Civ): { kind: WorkKind; reason: string } | null {
  const planet = world.planets[civ.planet];
  if (!planet) return null;
  const site = planet.sites.find((s) => s.civId === civ.id);
  if (!site) return null;
  const unfinished = (k: WorkKind) => world.works.some((w) => w.civId === civ.id && w.kind === k && !w.done);
  const exists = (k: WorkKind) => world.works.some((w) => w.civId === civ.id && w.kind === k);
  if (findGap(planet, site.x, site.y) && !puenteNear(world, planet.id, site.x, site.y)) {
    return { kind: "puente", reason: `El agua parte el paso de ${civ.name}. Empiezan un puente.` };
  }
  const own = planet.sites.filter((s) => s.civId === civ.id);
  let apart = false;
  for (let i = 0; i < own.length && !apart; i++) {
    for (let j = i + 1; j < own.length; j++) {
      if (dist(own[i]!.x, own[i]!.y, own[j]!.x, own[j]!.y) > 8) {
        apart = true;
        break;
      }
    }
  }
  if (own.length >= 2 && apart && !unfinished("camino")) {
    return { kind: "camino", reason: `Dos fuegos de ${civ.name} no se alcanzan. Abren un camino.` };
  }
  if (civ.food < 22 && !unfinished("granja")) {
    return { kind: "granja", reason: `En ${civ.name} el grano no alcanza. Abren la tierra.` };
  }
  const boats = hulls(world, civ.id);
  if (boats === 0 && coastNear(planet, site.x, site.y)) {
    return { kind: civ.era >= 4 ? "barco" : "balsa", reason: `Desde la orilla de ${civ.name} se ve agua que no se puede cruzar a pie.` };
  }
  if (!exists("pozo") && planet.kind !== "oceano" && !freshWaterNear(planet, site.x, site.y, 7)) {
    return { kind: "pozo", reason: `${civ.name} no tiene agua al lado del fuego. Cavan un pozo.` };
  }
  if (boats > 0 && !exists("muelle") && coastNear(planet, site.x, site.y)) {
    return { kind: "muelle", reason: `Las barcas de ${civ.name} no tienen donde amarrar.` };
  }
  if (civ.era >= 2 && civ.food >= 16) {
    const finished = world.works.filter((w) => w.civId === civ.id && w.done).length;
    if (finished >= 2 && civ.food >= 28 && !unfinished("granero")) {
      return { kind: "granero", reason: `En ${civ.name} sobra grano un día y falta al siguiente. Levantan un granero.` };
    }
    let far = false;
    for (let i = 0; i < own.length && !far; i++) {
      for (let j = i + 1; j < own.length; j++) {
        if (dist(own[i]!.x, own[i]!.y, own[j]!.x, own[j]!.y) > 14) far = true;
      }
    }
    if (far && !unfinished("calzada") && !exists("calzada")) {
      return { kind: "calzada", reason: `Los fuegos de ${civ.name} quedan a más de un día. Empiezan una calzada.` };
    }
    if (finished >= 3 && civ.era >= 3 && civ.food >= 20 && !exists("palacio")) {
      return { kind: "palacio", reason: `El fuego de ${civ.name} quiere un techo que se vea desde el cerro.` };
    }
    if (finished >= 6 && civ.era >= 4 && civ.food >= 30 && !exists("coloso")) {
      return { kind: "coloso", reason: `${civ.name} ya no cabe en casas. Empiezan una obra que va a durar años.` };
    }
    const civic: WorkKind[] = ["taller", "molino", "escuela", "muralla", "mercado", "horno", "hospital", "faro", "mina", "astillero"];
    for (const kind of civic) {
      if (exists(kind)) continue;
      const reason = civicReason(kind, civ.name);
      if (reason) return { kind, reason };
    }
  }
  return null;
}

function foundCamp(world: World, p: Person, quiet: boolean) {
  const planet = world.planets[p.planet];
  const civ = civById(world, p.civId);
  if (!planet || !civ) return false;
  if (planet.sites.filter((s) => s.civId === civ.id).length >= 4) return false;
  if (planet.sites.length >= 12) return false;
  let near = 999;
  for (const s of planet.sites) near = Math.min(near, dist(p.x, p.y, s.x, s.y));
  if (near < 8) return false;
  if (blocked(planet.tiles[idx(p.x, p.y)] ?? 0)) return false;
  planet.sites.push({ x: p.x, y: p.y, civId: civ.id, level: 0 });
  planet.stamp++;
  p.hx = p.x;
  p.hy = p.y;
  say(world, `${p.name} clava un campamento. ${civ.name} ya no cabe en un solo fuego.`, planet.id, [p.id], "oro", quiet, "era");
  floatAt(world, planet.id, p.x, p.y, "campamento");
  return true;
}

const SEES = ["un manantial", "huellas que no son de gente", "fruta amarga", "piedra que parte bien", "un nido vacío", "sal en la roca", "carbón", "arcilla", "un esqueleto de bestia", "un silencio raro", "una cueva chica", "restos de una hoguera ajena", "barro negro", "un árbol hueco"];

function humanAct(world: World, p: Person, quiet: boolean) {
  const civ = civById(world, p.civId);
  const planet = world.planets[p.planet];
  if (!civ || !planet || stageOf(p) !== "adulto") return;
  const home = planet.sites.find((s) => s.civId === civ.id && dist(s.x, s.y, p.x, p.y) < 8);
  if (home && Math.random() < 0.4) {
    home.decor = home.decor ?? [];
    const piece = DECOR[(p.id + home.decor.length) % DECOR.length] ?? DECOR[0];
    if (piece && home.decor.length < 10 && !home.decor.includes(piece)) home.decor.push(piece);
  }
  const other = nearest(world, p, (o) => o.civId === p.civId, 8);
  const lines: ((n: string) => string)[] = [
    (n) => `${n} cose un cuero junto al fuego.`,
    (n) => `${n} afila una piedra hasta que corta.`,
    (n) => `${n} cuenta una historia y alguien llora.`,
    (n) => `${n} cuece pan y lo parte.`,
    (n) => `${n} discute un linde y al final cede un paso.`,
    (n) => `${n} enseña a un niño a no meter la mano en la brasa.`,
    (n) => `${n} entierra a alguien que nadie nombra en voz alta.`,
    (n) => `${n} escribe un nombre en una tabla.`,
    (n) => `${n} mide un campo con los pies.`,
    (n) => `${n} forja un clavo y lo guarda como si fuera pan.`,
    (n) => `${n} cura una herida con agua hervida.`,
    (n) => `${n} dibuja un mapa y se equivoca de río.`,
    (n) => `${n} inventa una polea y se ríe solo.`,
    (n) => `${n} calcula cuándo va a crecer el agua.`,
    (n) => `${n} repara un techo antes de que llueva.`,
    (n) => `${n} corta leña y deja la mitad en casa ajena.`,
    (n) => `${n} teje una red que todavía no sabe pescar.`,
    (n) => `${n} se pierde un rato y vuelve sin decir dónde estuvo.`,
    (n) => `${n} guarda grano donde el ratón no llega.`,
    (n) => `${n} pide perdón y se lo aceptan a medias.`,
    (n) => `${n} miente, y al día siguiente dice la verdad.`,
    (n) => `${n} da de comer a un extraño y no pregunta el nombre.`,
    (n) => `${n} canta hasta que el miedo baja.`,
    (n) => `${n} construye un juguete con lo que sobró de una lanza.`,
    (n) => `${n} tiende un cable, o una cuerda que hace de cable.`,
    (n) => `${n} siembra un árbol que no va a ver grande.`,
    (n) => `${n} saca agua y la reparte antes de beber.`,
    (n) => `${n} sala pescado para la semana que viene.`,
    (n) => `${n} prueba un metal que no debería estar tan caliente.`,
    (n) => `${n} abre una tumba antigua y la vuelve a cerrar.`,
    (n) => `${n} enseña a leer una marca que el mismo inventó.`,
    (n) => `${n} apaga un fuego chico antes de que sea un techo.`,
    (n) => `${n} pastorea lo que todavía no tiene nombre de rebaño.`,
    (n) => `${n} deja una carta para quien todavía no nace.`,
    (n) => `${n} nombra una estrella con el nombre de su madre.`,
    (n) => other ? `${n} discute con ${other.name} y después comparten el pan.` : `${n} discute solo y después se calla.`,
    (n) => other ? `${n} se queda a dormir junto a ${other.name}. No es la primera vez.` : `${n} duerme fuera, mirando la puerta.`,
  ];
  const era = civ.era;
  const pool = lines.filter((_, i) => i <= 8 + era * 3);
  const text = (pool[(Math.random() * pool.length) | 0] ?? lines[0]!)(p.name);
  if (Math.random() < 0.5) civ.food = Math.min(220, civ.food + 1);
  if (Math.random() < 0.3) p.loyalty = clamp(p.loyalty + 2, 0, 100);
  if (Math.random() < 0.2) p.wealth += 1;
  if (text.includes("cura") || text.includes("hospital")) p.hp = Math.min(120, p.hp + 6);
  if (lifeToday < 2) {
    say(world, text, planet.id, [p.id, other?.id ?? -1].filter((id) => id >= 0), "voz", quiet);
    lifeToday++;
    floatAt(world, planet.id, p.x, p.y, "oficio");
  }
}

function wakeNeeds(p: Person, night: boolean) {
  if (!p.needs) p.needs = { hunger: 22, rest: 10, social: 14, safety: p.dread ?? 0, curiosity: 20 };
  const n = p.needs;
  n.hunger = clamp(n.hunger + 1.15, 0, 100);
  n.rest = clamp(n.rest + (night ? 1.6 : 0.4), 0, 100);
  n.social = clamp(n.social + 0.32, 0, 100);
  n.curiosity = clamp(n.curiosity + 0.24, 0, 100);
  n.safety = p.dread ?? n.safety;
}

function easeNeed(p: Person, key: keyof Needs, by: number) {
  const n = p.needs;
  if (!n) return;
  n[key] = clamp(n[key] - by, 0, 100);
}

function remember(p: Person, verb: string) {
  const trace = p.trace ?? [];
  trace.push(verb);
  if (trace.length > 6) trace.splice(0, trace.length - 6);
  p.trace = trace;
}

type Duty = { task: Task; tx: number; ty: number; left: number; workId?: number; score: number; verb: string };

function bestDuty(world: World, p: Person, planet: Planet, civ: Civ, sail: boolean): Duty {
  const n = p.needs ?? { hunger: 30, rest: 10, social: 10, safety: 0, curiosity: 20 };
  const job = looks(p).job;
  const homeD = dist(p.x, p.y, p.hx, p.hy);
  const options: Duty[] = [];
  const push = (d: Duty) => {
    if (d.score > 0) options.push(d);
  };
  push({
    task: "viaje",
    tx: p.hx,
    ty: p.hy,
    left: 12,
    score: (n.safety / 100) * (homeD > 3 ? 1.55 : 0.12) + (n.rest / 100) * (homeD > 2 ? 0.95 : 0.08),
    verb: "volver",
  });
  const beast = world.fauna.find((f) => f.alive && f.planet === planet.id && (f.kind === "presa" || f.kind === "ave") && dist(f.x, f.y, p.x, p.y) < 16);
  if (beast) {
    const near = 1 - dist(beast.x, beast.y, p.x, p.y) / 16;
    push({
      task: "caza",
      tx: beast.x,
      ty: beast.y,
      left: 22,
      score: (n.hunger / 100) * (0.65 + near) * (civ.food < 24 ? 1.25 : 0.72) * (job === "cazador" ? 1.25 : 1),
      verb: "cazar",
    });
  }
  const water = coastNear(planet, p.x, p.y);
  if (water) {
    push({
      task: "pesca",
      tx: water.x,
      ty: water.y,
      left: 16,
      score: (n.hunger / 100) * (job === "pescador" ? 1.2 : 0.5) * (civ.food < 28 ? 1.15 : 0.65),
      verb: "pescar",
    });
  }
  if (planet.farm.some((v) => v > 0)) {
    const at = walkFrom(planet, p.hx, p.hy, 2, 6);
    push({ task: "siembra", tx: at.x, ty: at.y, left: 12, score: (n.hunger / 100) * 0.58 * (civ.food < 30 ? 1.15 : 0.75), verb: "sembrar" });
  }
  const work = world.works.find((w) => !w.done && w.civId === p.civId && w.planet === p.planet && crewOf(world, w.id) < (w.kind === "coloso" || w.kind === "palacio" || w.kind === "calzada" ? 6 : 3));
  if (work) {
    push({
      task: "obra",
      tx: work.x,
      ty: work.y,
      left: 28,
      workId: work.id,
      score: (job === "albañil" ? 0.92 : 0.46) * (1 - n.hunger / 160) * (1 - n.safety / 200),
      verb: "obrar",
    });
  }
  let tree: Timber | null = null;
  let treeD = 18;
  let log: Timber | null = null;
  let logD = 22;
  for (const t of world.timber) {
    if (t.planet !== p.planet) continue;
    const d = dist(t.x, t.y, p.x, p.y);
    if (t.kind === "arbol" && t.fall === 0 && d < treeD) {
      treeD = d;
      tree = t;
    }
    if (t.kind === "tronco" && t.carriedBy == null && d < logD) {
      logD = d;
      log = t;
    }
  }
  if (tree && p.role !== "alien") {
    push({
      task: "tala",
      tx: tree.x,
      ty: tree.y,
      left: 16,
      workId: tree.id,
      score: ((civ.wood ?? 0) < 8 ? 0.78 : 0.32) * (1 - n.hunger / 140) * (1 - n.safety / 180),
      verb: "talar",
    });
    if (job === "cazador" || p.role === "ladron" || p.role === "guardia") {
      push({ task: "emboscada", tx: tree.x, ty: tree.y, left: 14, workId: 0, score: n.hunger < 55 && n.safety < 40 ? 0.22 : 0.05, verb: "esperar" });
    }
  }
  if (log && p.role !== "alien") {
    push({ task: "acarreo", tx: log.x, ty: log.y, left: 20, workId: log.id, score: 0.48 * (1 - n.hunger / 150), verb: "cargar" });
  }
  const other = planet.sites.find((s) => s.civId !== p.civId && dist(s.x, s.y, p.hx, p.hy) > 8);
  if (other) {
    const rel = civ.relations[other.civId] ?? 0;
    push({ task: "viaje", tx: other.x, ty: other.y, left: 26, score: (n.social / 100) * 0.95 * (rel < -15 ? 0.22 : 1), verb: "visitar" });
  }
  const spot = farLand(planet, p.x, p.y, sail ? 10 : 12, sail && n.curiosity > 60);
  if (spot) {
    const sailNow = sail && n.curiosity > 60 && n.hunger < 65;
    push({
      task: sailNow ? "vela" : "explora",
      tx: spot.x,
      ty: spot.y,
      left: sailNow ? 48 : 28,
      score: (n.curiosity / 100) * 0.78 * (n.hunger > 72 ? 0.3 : 1) * (n.safety > 60 ? 0.25 : 1),
      verb: "mirar",
    });
  }
  const at = walkFrom(planet, p.x, p.y, 4, 9);
  push({ task: "oficio", tx: at.x, ty: at.y, left: 12, score: 0.16, verb: "oficio" });
  let best = options[0]!;
  for (const o of options) if (o.score > best.score) best = o;
  const last = p.trace?.[p.trace.length - 1];
  const stick = last ? options.find((o) => o.verb === last && best.score - o.score < 0.08) : undefined;
  return stick ?? best;
}

function giveTask(world: World, p: Person) {
  const planet = world.planets[p.planet];
  const civ = civById(world, p.civId);
  if (!planet || !civ) return;
  if (stageOf(p) === "bebe") return;
  if (stageOf(p) === "nino") {
    const mom = p.motherId != null ? personById(world, p.motherId) : null;
    if (mom && mom.alive && mom.planet === p.planet && Math.random() < 0.7) {
      p.task = "sigue";
      p.tx = mom.x;
      p.ty = mom.y;
      p.taskLeft = 10;
      return;
    }
    p.task = "oficio";
    p.tx = wrap(p.hx + (Math.random() * 4 - 2));
    p.ty = clamp(p.hy + (Math.random() * 4 - 2), 1, H - 2);
    p.taskLeft = 8;
    return;
  }
  const sail = hulls(world, civ.id) > 0;
  const pick = bestDuty(world, p, planet, civ, sail);
  p.task = pick.task;
  p.tx = pick.tx;
  p.ty = pick.ty;
  p.taskLeft = pick.left;
  if (pick.workId != null) p.workId = pick.workId;
  if (pick.task === "acarreo") p.carryId = null;
  remember(p, pick.verb);
}

function arrive(world: World, p: Person, quiet: boolean) {
  const planet = world.planets[p.planet];
  const civ = civById(world, p.civId);
  if (!planet || !civ) {
    p.task = "nada";
    p.taskLeft = 0;
    return;
  }
  if (p.task === "obra") {
    const work = world.works.find((w) => w.id === p.workId);
    if (!work || work.done) {
      p.task = "nada";
      p.taskLeft = 0;
      return;
    }
    work.progress++;
    if (work.progress >= work.need) applyWork(world, work, quiet, p);
    p.taskLeft = work.done ? 0 : 4;
    if (work.done) p.task = "nada";
    easeNeed(p, "rest", -3);
    return;
  }
  if (p.task === "explora" || p.task === "vela" || p.task === "funda") {
    const see = SEES[(Math.random() * SEES.length) | 0];
    const verb = p.task === "vela" ? "atraca" : "llega";
    if (!foundCamp(world, p, quiet) && lifeToday < 2) {
      say(world, `${p.name} ${verb} lejos de casa y encuentra ${see}.`, planet.id, [p.id], "voz", quiet);
      lifeToday++;
      if (Math.random() < 0.4) civ.knowledge = Math.min(48, civ.knowledge + 1);
    }
    if (p.task === "explora" || p.task === "vela") {
      if (hulls(world, civ.id) === 0 && shoreWithin(planet, p.x, p.y, 2)) {
        beginWork(world, civ, civ.era >= 4 ? "barco" : "balsa", `${p.name} volvió de explorar: el agua no deja pasar.`, quiet);
      } else if (findGap(planet, p.x, p.y) && !puenteNear(world, planet.id, p.x, p.y)) {
        beginWork(world, civ, "puente", `${p.name} encontró un corte de agua y lo dijo en voz alta.`, quiet);
      }
    }
    p.task = "viaje";
    p.tx = p.hx;
    p.ty = p.hy;
    p.taskLeft = 22;
    easeNeed(p, "curiosity", 34);
    return;
  }
  if (p.task === "caza") {
    const beast = world.fauna.find((f) => f.alive && f.planet === planet.id && dist(f.x, f.y, p.x, p.y) < 6);
    if (beast && Math.random() < 0.7) {
      beast.alive = false;
      civ.food = Math.min(220, civ.food + 8);
      say(world, `${p.name} cazó lejos del fuego y vuelve con carne.`, planet.id, [p.id], "oro", quiet);
    } else if (lifeToday < 2) {
      p.hp -= 12;
      say(world, `${p.name} siguió un rastro y volvió con las manos vacías.`, planet.id, [p.id], "voz", quiet);
      lifeToday++;
    }
    p.task = "nada";
    p.taskLeft = 0;
    easeNeed(p, "hunger", 36);
    return;
  }
  if (p.task === "pesca") {
    civ.food = Math.min(220, civ.food + 5);
    if (lifeToday < 2) {
      say(world, `${p.name} saca peces. En ${civ.name} el grano deja de ser lo único.`, planet.id, [p.id], "oro", quiet);
      lifeToday++;
    }
    floatAt(world, planet.id, p.x, p.y, "pesca");
    p.task = "nada";
    p.taskLeft = 0;
    easeNeed(p, "hunger", 28);
    return;
  }
  if (p.task === "siembra") {
    if (!blocked(planet.tiles[idx(p.x, p.y)] ?? 0)) {
      const i = idx(p.x, p.y);
      if (!planet.farm[i]) {
        planet.farm[i] = 1;
        planet.stamp++;
      }
    }
    civ.food = Math.min(220, civ.food + 3);
    easeNeed(p, "hunger", 18);
    if (lifeToday < 2) {
      say(world, `${p.name} abre la tierra y deja semilla.`, planet.id, [p.id], "oro", quiet);
      lifeToday++;
    }
    p.task = "nada";
    p.taskLeft = 0;
    return;
  }
  if (p.task === "viaje") {
    const host = world.civs.find((c) => c.planet === planet.id && c.id !== civ.id && planet.sites.some((s) => s.civId === c.id && dist(s.x, s.y, p.x, p.y) < 4));
    if (host && lifeToday < 2) {
      shiftRel(world, civ.id, host.id, 4);
      say(world, `${p.name} llega a ${host.name} con las manos casi vacías y se sienta a hablar.`, planet.id, [p.id], "voz", quiet);
      lifeToday++;
    }
    if (dist(p.x, p.y, p.hx, p.hy) < 3) easeNeed(p, "rest", 30);
    else easeNeed(p, "social", 26);
    p.task = "nada";
    p.taskLeft = 0;
    return;
  }
  if (p.task === "oficio") humanAct(world, p, quiet);
  p.task = "nada";
  p.taskLeft = 0;
}

function steer(world: World, p: Person) {
  const planet = world.planets[p.planet];
  if (!planet) return;
  const sail = p.task === "vela";
  if (!openTile(planet, p.x, p.y, p.role === "alien", sail)) {
    const site = planet.sites.find((s) => s.civId === p.civId) ?? planet.sites[0];
    if (site) {
      p.x = site.x;
      p.y = site.y;
      p.hx = site.x;
      p.hy = site.y;
    }
  }
  if (p.heldBy != null) {
    const cap = personById(world, p.heldBy);
    if (!cap || !cap.alive) {
      p.heldBy = null;
      p.held = 0;
    } else {
      p.task = "nada";
      p.taskLeft = 0;
      p.tx = cap.x;
      p.ty = cap.y;
      return;
    }
  }
  const alien = nearest(world, p, (o) => o.role === "alien", 18);
  if ((p.role === "ciudadano" || p.role === "lider") && alien && dist(p.x, p.y, alien.x, alien.y) < 5) {
    const dx = wrapDelta(p.x - alien.x) || 1;
    p.task = "nada";
    p.taskLeft = 0;
    p.tx = wrap(p.x + Math.sign(dx) * 6);
    p.ty = clamp(p.y + (p.y - alien.y), 1, H - 2);
    return;
  }
  if (p.role === "alien") {
    const prey = nearest(world, p, (o) => o.role !== "alien", 40);
    if (prey) {
      p.tx = prey.x;
      p.ty = prey.y;
    }
    return;
  }
  if (p.role === "guardia" && alien) {
    p.task = "nada";
    p.taskLeft = 0;
    p.tx = alien.x;
    p.ty = alien.y;
    return;
  }
  if (p.role === "ladron" && p.wealth < 12 && p.task === "nada") {
    let rich: Person | null = null;
    let best = 8;
    for (const o of world.people) {
      if (!o.alive || o.planet !== p.planet || o.id === p.id || o.role === "alien") continue;
      if (o.wealth > best && dist(o.x, o.y, p.x, p.y) < 28) {
        best = o.wealth;
        rich = o;
      }
    }
    if (rich && Math.random() < 0.4) {
      p.task = "viaje";
      p.tx = rich.x;
      p.ty = rich.y;
      p.taskLeft = 16;
      return;
    }
  }
  if (p.task !== "nada" && p.taskLeft > 0) return;
  giveTask(world, p);
}

let lifeToday = 0;
const trail = new Map<number, number>();

function stepTo(p: { x: number; y: number; facing: number }, tx: number, ty: number, planet: Planet, speed: number, alien: boolean, sail: boolean) {
  let dx = tx - p.x;
  let dy = ty - p.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.18) return;
  dx /= len;
  dy /= len;
  const nx = p.x + dx * speed;
  const ny = p.y + dy * speed;
  if (openTile(planet, nx, ny, alien, sail)) {
    p.x = nx;
    p.y = ny;
    p.facing = dx >= 0 ? 1 : -1;
    return;
  }
  if (openTile(planet, nx, p.y, alien, sail)) {
    p.x = nx;
    p.facing = dx >= 0 ? 1 : -1;
  } else if (openTile(planet, p.x, ny, alien, sail)) p.y = ny;
  else {
    const sx = p.x - dy * speed;
    const sy = p.y + dx * speed;
    if (openTile(planet, sx, sy, alien, sail)) {
      p.x = sx;
      p.y = sy;
      p.facing = dx >= 0 ? 1 : -1;
    }
  }
}

function nearest(world: World, p: Person, pred: (o: Person) => boolean, max = 999) {
  let best: Person | null = null;
  let bd = max;
  for (const o of world.people) {
    if (!o.alive || o.planet !== p.planet || o.id === p.id || !pred(o)) continue;
    const d = dist(p.x, p.y, o.x, o.y);
    if (d < bd) {
      bd = d;
      best = o;
    }
  }
  return best;
}

function dream(world: World, civ: Civ, quiet: boolean) {
  civ.beyond = world.day;
  const origin = world.planets[civ.planet];
  const dest = world.planets.filter((p) => p.id !== civ.planet)[(Math.random() * 7) | 0];
  if (!origin || !dest) return;
  let spot: { x: number; y: number } | null = null;
  for (let n = 0; n < 40 && !spot; n++) {
    const x = Math.random() * W;
    const y = 4 + Math.random() * (H - 8);
    if (!blocked(dest.tiles[idx(x, y)] ?? 0)) spot = { x, y };
  }
  const who = pick(members(world, civ.id, (p) => p.role !== "lider"));
  if (!spot || !who) {
    say(world, `${civ.name} arma una nave y el viento todavía no la suelta.`, civ.planet, [civ.leaderId], "voz", quiet);
    return;
  }
  if (dest.sites.length < 12) {
    dest.sites.push({ x: spot.x, y: spot.y, civId: civ.id, level: 0 });
    dest.stamp++;
  }
  who.planet = dest.id;
  who.x = spot.x;
  who.y = spot.y;
  who.hx = spot.x;
  who.hy = spot.y;
  who.tx = spot.x;
  who.ty = spot.y;
  who.task = "funda";
  who.taskLeft = 6;
  say(world, `${who.name} deja ${origin.name} en una nave de ${civ.name} y toca tierra en ${dest.name}.`, dest.id, [who.id], "oro", quiet, "spin");
  floatAt(world, dest.id, spot.x, spot.y, "nave");
}

function economy(world: World, civ: Civ, quiet: boolean) {
  const farms = world.works.filter((w) => w.done && w.civId === civ.id && (w.kind === "granja" || w.kind === "invernadero" || w.kind === "molino")).length;
  const fields = 4 + civ.era + farms * 3;
  civ.food = Math.min(220, civ.food + fields * 0.45);
  civ.food -= Math.round(civ.pop) * 0.03;
  civ.pop = Math.max(6, Math.round(civ.pop));
  if (civ.food <= 0) {
    civ.food = 0;
    civ.pop = Math.max(6, civ.pop - 1);
    civ.fear = clamp(civ.fear + 1.2, 0, 100);
  } else if (civ.food > 20 && civ.order > 28 && Math.random() < 0.22) civ.pop = Math.min(900, civ.pop + 1);
  civ.knowledge = Math.min(48, civ.knowledge + 0.12);
  civ.fear = clamp(civ.fear - 0.25, 0, 100);
  if (civ.knowledge > 16 + civ.era * 6 && civ.era < 9 && Math.random() < 0.08) raiseEra(world, civ, quiet);
  if (civ.era >= 8 && world.day - (civ.beyond ?? 0) > 220 && Math.random() < 0.012) dream(world, civ, quiet);
  if (Math.random() < 0.14) {
    const need = chooseWork(world, civ);
    if (need) beginWork(world, civ, need.kind, need.reason, quiet);
  }
}

function weighted(bag: [string, number][]) {
  let total = 0;
  for (const [, w] of bag) if (w > 0) total += w;
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const [k, w] of bag) {
    if (w <= 0) continue;
    r -= w;
    if (r <= 0) return k;
  }
  return bag[0]?.[0] ?? null;
}

function runEvent(world: World, kind: string, civ: Civ, quiet: boolean) {
  const planet = world.planets[civ.planet];
  if (!planet) return;
  const civs = world.civs.filter((c) => c.planet === planet.id);
  if (kind === "robo") {
    const thief = pick(members(world, civ.id, (p) => p.role === "ladron")) ?? pick(members(world, civ.id));
    const victim = pick(world.people.filter((p) => p.alive && p.planet === planet.id && p.role !== "alien" && p.id !== thief?.id));
    if (!thief || !victim) return;
    const n = 1 + ((Math.random() * Math.max(2, victim.wealth)) | 0);
    victim.wealth = Math.max(0, victim.wealth - n);
    thief.wealth += n;
    civ.fear = clamp(civ.fear + 4, 0, 100);
    say(world, `${thief.name} robó ${n} a ${victim.name}. ${victim.name} no duerme.`, planet.id, [thief.id, victim.id], "sangre", quiet);
    floatAt(world, planet.id, victim.x, victim.y, "robo");
  } else if (kind === "secuestro") {
    const actor = pick(members(world, civ.id, (p) => p.role !== "lider"));
    const target = pick(world.people.filter((p) => p.alive && p.planet === planet.id && p.id !== actor?.id && p.role !== "alien" && !p.heldBy));
    if (!actor || !target) return;
    target.heldBy = actor.id;
    target.held = 0;
    civ.fear = clamp(civ.fear + 10, 0, 100);
    if (target.civId !== actor.civId) shiftRel(world, actor.civId, target.civId, -16);
    say(world, `${actor.name} se llevó a ${target.name}. Hay un precio.`, planet.id, [actor.id, target.id], "sangre", quiet, "hit");
    floatAt(world, planet.id, target.x, target.y, "secuestro");
  } else if (kind === "asesinato") {
    const actor = pick(members(world, civ.id, (p) => p.role !== "lider"));
    const target = pick(world.people.filter((p) => p.alive && p.planet === planet.id && p.id !== actor?.id && p.role !== "alien"));
    if (!actor || !target) return;
    civ.order = clamp(civ.order - 8, 0, 100);
    kill(world, target, actor, "Fue de cerca.", quiet);
  } else if (kind === "votacion") {
    const pool = members(world, civ.id);
    if (pool.length < 2) return;
    const scored = pool.map((p) => ({ p, s: p.loyalty + Math.random() * 14 }));
    scored.sort((a, b) => b.s - a.s);
    const next = scored[0]!.p;
    const old = personById(world, civ.leaderId);
    if (old && old.alive && old.id !== next.id) old.role = "ciudadano";
    next.role = "lider";
    civ.leaderId = next.id;
    civ.order = clamp(civ.order + 6, 0, 100);
    civ.fear = clamp(civ.fear - 4, 0, 100);
    say(world, `El consejo de ${civ.name} eligió a ${next.name}.`, planet.id, [next.id, old?.id ?? -1].filter((id) => id >= 0), "voz", quiet, "spin");
    floatAt(world, planet.id, next.x, next.y, "voto");
  } else if (kind === "plan") {
    const actor = pick(members(world, civ.id, (p) => p.role !== "lider"));
    const target = personById(world, civ.leaderId);
    if (!actor || !target || !target.alive || actor.id === target.id) return;
    const kinds = ["atentado", "secuestro", "robo"] as const;
    const plotKind = kinds[(Math.random() * kinds.length) | 0]!;
    const due = world.day + 3 + ((Math.random() * 6) | 0);
    const plot: Plot = { id: world.uid++, due, kind: plotKind, planet: planet.id, actorId: actor.id, targetId: target.id, civId: civ.id };
    world.plots.push(plot);
    const word = plotKind === "atentado" ? "atentado" : plotKind === "secuestro" ? "secuestro" : "robo";
    say(world, `${actor.name} trama un ${word} contra ${target.name}. Faltan ${due - world.day} días.`, planet.id, [actor.id, target.id], "voz", quiet, "spin");
  } else if (kind === "motin") {
    const old = personById(world, civ.leaderId);
    if (old && old.alive) {
      old.role = "exiliado";
      old.loyalty = 8;
    }
    civ.law = civ.law === "tirano" ? "consejo" : civ.law === "consejo" ? "clan" : "consejo";
    civ.fear = 36;
    civ.order = clamp(civ.order - 16, 0, 100);
    elect(world, civ);
    say(world, `${civ.name} echa a ${old?.name ?? "su líder"}. La ley cambia.`, planet.id, [old?.id ?? -1, civ.leaderId].filter((id) => id >= 0), "sangre", quiet, "hit");
  } else if (kind === "peste") {
    civ.pop = Math.max(6, Math.round(civ.pop * 0.84));
    civ.fear = clamp(civ.fear + 12, 0, 100);
    const sick = pick(members(world, civ.id));
    if (sick) {
      sick.hp -= 40;
      if (sick.hp <= 0) kill(world, sick, null, "La fiebre.", quiet);
    }
    say(world, `Una fiebre recorre ${civ.name}.`, planet.id, sick ? [sick.id] : [], "sangre", quiet);
  } else if (kind === "festival") {
    civ.fear = clamp(civ.fear - 10, 0, 100);
    civ.order = clamp(civ.order + 6, 0, 100);
    civ.food = Math.max(0, civ.food - 3);
    say(world, `${civ.name} enciende fuegos. El miedo baja un poco.`, planet.id, [civ.leaderId], "oro", quiet);
  } else if (kind === "comercio") {
    const other = pick(civs.filter((c) => c.id !== civ.id));
    if (!other) return;
    civ.food = Math.min(220, civ.food + 6);
    other.food = Math.max(0, other.food - 3);
    shiftRel(world, civ.id, other.id, 12);
    say(world, `${civ.name} y ${other.name} intercambian grano.`, planet.id, [], "oro", quiet);
  } else if (kind === "caza") {
    const hunter = pick(members(world, civ.id));
    const beast = pick(world.fauna.filter((f) => f.alive && f.planet === planet.id));
    if (!hunter || !beast) return;
    if (Math.random() < 0.62) {
      beast.alive = false;
      civ.food = Math.min(220, civ.food + 7);
      say(world, `${hunter.name} cazó a ${beast.name}. Hay comida.`, planet.id, [hunter.id], "oro", quiet);
    } else {
      hunter.hp -= 34;
      if (hunter.hp <= 0) kill(world, hunter, null, "No volvió de la caza.", quiet);
      else say(world, `${hunter.name} volvió herido de la caza.`, planet.id, [hunter.id], "sangre", quiet);
    }
  } else if (kind === "nacimiento") {
    civ.pop = Math.min(900, civ.pop + 4 + ((Math.random() * 4) | 0));
    const aliveN = members(world, civ.id).length;
    if (aliveN < 12 && world.people.length < 220) {
      const adults = members(world, civ.id).filter((p) => stageOf(p) === "adulto" && p.role !== "alien");
      const mother = pick(adults);
      const father = pick(adults.filter((a) => a.id !== mother?.id)) ?? mother;
      if (!mother) return;
      const at = placeNear(planet.tiles, mother.x, mother.y, Math.random);
      const baby: Person = {
        id: world.uid++,
        name: personName(Math.random, new Set(world.people.map((p) => p.name))),
        civId: civ.id,
        planet: planet.id,
        role: "ciudadano",
        x: at.x,
        y: at.y,
        hx: mother.hx,
        hy: mother.hy,
        tx: mother.x,
        ty: mother.y,
        hp: 40,
        wealth: 0,
        loyalty: 60,
        alive: true,
        heldBy: null,
        held: 0,
        facing: 1,
        task: "gatea",
        taskLeft: 8,
        workId: 0,
        age: 0,
        motherId: mother.id,
        fatherId: father?.id ?? null,
      };
      world.people.push(baby);
      const dad = father && father.id !== mother.id ? ` y ${father.name}` : "";
      say(world, `Nace ${baby.name}, hijo de ${mother.name}${dad}. Gatea junto al fuego.`, planet.id, [baby.id, mother.id, father?.id ?? -1].filter((id) => id >= 0), "voz", quiet);
    } else say(world, `Nace gente en ${civ.name}.`, planet.id, [], "voz", quiet);
  } else if (kind === "descubrimiento") {
    const who = personById(world, civ.leaderId);
    if (civ.era >= 9) {
      const next = chooseWork(world, civ);
      if (next) beginWork(world, civ, next.kind, next.reason, quiet);
      say(world, `${who?.name ?? civ.name} ya no busca una era nueva: busca cómo levantar ${next ? WORK_NAME[next.kind] : "algo que todavía no tiene nombre"}.`, planet.id, [civ.leaderId], "oro", quiet);
    } else if (civ.knowledge < 16 + civ.era * 6) {
      civ.knowledge = Math.min(48, civ.knowledge + 4);
      say(world, `En ${civ.name} alguien entiende una cosa pequeña.`, planet.id, [civ.leaderId], "oro", quiet);
    } else raiseEra(world, civ, quiet);
  } else if (kind === "hambruna") {
    civ.food = Math.max(0, civ.food - 12);
    civ.pop = Math.max(6, civ.pop - 4);
    civ.fear = clamp(civ.fear + 14, 0, 100);
    say(world, `En ${civ.name} el grano no alcanza.`, planet.id, [civ.leaderId], "sangre", quiet);
  } else if (kind === "incendio") {
    const site = planet.sites.find((s) => s.civId === civ.id);
    if (site) site.level = Math.max(0, site.level - 1);
    civ.fear = clamp(civ.fear + 8, 0, 100);
    civ.food = Math.max(0, civ.food - 6);
    say(world, `El fuego se come un techo de ${civ.name}.`, planet.id, [], "sangre", quiet);
    if (site) floatAt(world, planet.id, site.x, site.y, "fuego");
  } else if (kind === "desercion") {
    const other = pick(civs.filter((c) => c.id !== civ.id));
    const p = pick(members(world, civ.id, (x) => x.role !== "lider"));
    if (!other || !p) return;
    p.civId = other.id;
    p.role = "ciudadano";
    p.loyalty = 24;
    const site = planet.sites.find((s) => s.civId === other.id);
    if (site) {
      p.hx = site.x;
      p.hy = site.y;
    }
    shiftRel(world, civ.id, other.id, -8);
    say(world, `${p.name} abandona ${civ.name} y pide techo en ${other.name}.`, planet.id, [p.id], "voz", quiet);
  } else if (kind === "tratado") {
    const other = pick(civs.filter((c) => c.id !== civ.id));
    if (!other) return;
    shiftRel(world, civ.id, other.id, 18);
    civ.fear = clamp(civ.fear - 4, 0, 100);
    other.fear = clamp(other.fear - 4, 0, 100);
    say(world, `${civ.name} y ${other.name} clavan un pacto.`, planet.id, [], "oro", quiet);
  } else if (kind === "eclipse") {
    for (const c of civs) c.fear = clamp(c.fear + 6, 0, 100);
    say(world, `El sol se apaga un instante sobre ${planet.name}.`, planet.id, [], "vacio", quiet);
  } else if (kind === "naufragio") {
    civ.food = Math.max(0, civ.food - 8);
    const p = pick(members(world, civ.id));
    if (p) p.wealth = Math.max(0, p.wealth - 3);
    say(world, `Una balsa de ${civ.name} no llega.`, planet.id, p ? [p.id] : [], "sangre", quiet);
  } else if (kind === "milagro") {
    const leader = personById(world, civ.leaderId);
    if (leader && leader.alive) leader.hp = Math.max(leader.hp, 100);
    civ.fear = clamp(civ.fear - 12, 0, 100);
    civ.order = clamp(civ.order + 8, 0, 100);
    civ.food = Math.min(220, civ.food + 8);
    say(world, `${leader?.name ?? civ.name} debía caer y no. Lo llaman milagro.`, planet.id, leader ? [leader.id] : [], "oro", quiet, "spin");
  }
}

function resolvePlots(world: World, quiet: boolean) {
  const due = world.plots.filter((p) => p.due <= world.day);
  world.plots = world.plots.filter((p) => p.due > world.day);
  for (const plot of due) {
    const actor = personById(world, plot.actorId);
    const target = personById(world, plot.targetId);
    if (!actor || !target || !actor.alive || !target.alive) continue;
    if ((world.shields[target.id] ?? 0) > world.day) {
      say(world, `El ${plot.kind} contra ${target.name} se frustra. Alguien avisó a tiempo.`, plot.planet, [actor.id, target.id], "oro", quiet, "spin");
      continue;
    }
    if (plot.kind === "atentado") {
      target.hp -= 58 * ((world.shields[target.id] ?? 0) > world.day ? 0.2 : 1);
      if (target.hp <= 0) kill(world, target, actor, "El plan se cumple.", quiet);
      else say(world, `El atentado hiere a ${target.name}. Sigue en pie.`, plot.planet, [actor.id, target.id], "sangre", quiet, "hit");
    } else if (plot.kind === "secuestro") {
      target.heldBy = actor.id;
      target.held = 0;
      say(world, `${actor.name} se llevó a ${target.name}. El plan se cumple.`, plot.planet, [actor.id, target.id], "sangre", quiet, "hit");
    } else {
      const n = Math.max(1, Math.round(target.wealth * 0.5));
      target.wealth = Math.max(0, target.wealth - n);
      actor.wealth += n;
      say(world, `${actor.name} robó ${n} a ${target.name}. El plan se cumple.`, plot.planet, [actor.id, target.id], "sangre", quiet);
    }
  }
}

function invade(world: World, quiet: boolean) {
  const ranked = [...world.civs].sort((a, b) => b.era - a.era);
  const hi = ranked[0];
  if (!hi) return;
  const lo = [...world.civs].filter((c) => c.planet !== hi.planet).sort((a, b) => a.era - b.era)[0];
  if (!lo || hi.era - lo.era < 3) return;
  if (Math.random() > 0.07 + (hi.era - lo.era) * 0.02) return;
  const already = world.people.filter((p) => p.alive && p.role === "alien" && p.planet === lo.planet).length;
  if (already >= 3) return;
  const planet = world.planets[lo.planet];
  const site = planet?.sites.find((s) => s.civId === lo.id) ?? planet?.sites[0];
  if (!planet || !site) return;
  const from = world.planets[hi.planet];
  for (let i = 0; i < 3; i++) {
    const at = placeNear(planet.tiles, site.x + 4, site.y, Math.random, true);
    const invader: Person = {
      id: world.uid++,
      name: personName(Math.random, new Set(world.people.map((p) => p.name)), true),
      civId: hi.id,
      planet: lo.planet,
      role: "alien",
      x: at.x,
      y: at.y,
      hx: at.x,
      hy: at.y,
      tx: at.x,
      ty: at.y,
      hp: 80,
      wealth: 0,
      loyalty: 0,
      alive: true,
      heldBy: null,
      held: 0,
      facing: 1,
      task: "nada",
      taskLeft: 0,
      workId: 0,
      age: 400,
      motherId: null,
      fatherId: null,
    };
    world.people.push(invader);
  }
  lo.fear = clamp(lo.fear + 22, 0, 100);
  say(
    world,
    `Una flota de ${hi.name} cruza el vacío desde ${from?.name ?? "lejos"} hacia ${planet.name}. No piden tierra: la toman.`,
    lo.planet,
    [],
    "vacio",
    quiet,
    "era",
  );
  floatAt(world, lo.planet, site.x, site.y, "flota");
}

function combat(world: World, quiet: boolean) {
  for (const planet of world.planets) {
    const group = world.people.filter((p) => p.alive && p.planet === planet.id);
    const hit = new Set<number>();
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]!;
        const b = group[j]!;
        if (!a.alive || !b.alive || hit.has(a.id) || hit.has(b.id)) continue;
        if (dist(a.x, a.y, b.x, b.y) > 0.95) continue;
        const alien = a.role === "alien" || b.role === "alien";
        const war = !alien && rel(world, a.civId, b.civId) < -20;
        if (!alien && !war) continue;
        const ma = (world.shields[a.id] ?? 0) > world.day ? 0.25 : 1;
        const mb = (world.shields[b.id] ?? 0) > world.day ? 0.25 : 1;
        if (a.role === "alien") b.hp -= 18 * mb;
        else if (b.role === "alien") a.hp -= 18 * ma;
        else {
          a.hp -= 12 * ma;
          b.hp -= 12 * mb;
        }
        if (b.role !== "alien" && a.role === "alien") a.hp -= b.role === "guardia" ? 14 : 6;
        if (a.role !== "alien" && b.role === "alien") b.hp -= a.role === "guardia" ? 14 : 6;
        hit.add(a.id);
        hit.add(b.id);
        a.swing = 5;
        b.swing = 5;
        a.reel = 4;
        b.reel = 4;
        if (a.hp > 0 && Math.random() < 0.24) maim(world, a, WOUNDS[(b.id + world.day) % WOUNDS.length]!, b.name, quiet, b);
        if (b.hp > 0 && Math.random() < 0.24) maim(world, b, WOUNDS[(a.id + world.day) % WOUNDS.length]!, a.name, quiet, a);
        if (a.hp <= 0) kill(world, a, b, "Le parte el vientre. No llega a taparse.", quiet);
        if (b.hp <= 0) kill(world, b, a, "Le parte el vientre. No llega a taparse.", quiet);
      }
    }
    for (const beast of world.fauna) {
      if (!beast.alive || beast.planet !== planet.id) continue;
      if (beast.kind === "presa" || beast.kind === "ave" || beast.kind === "perro" || beast.kind === "mastin") continue;
      let prey: Person | null = null;
      let bd = beast.kind === "cazador" ? 1.55 : 1.05;
      for (const p of group) {
        if (!p.alive) continue;
        const d = dist(beast.x, beast.y, p.x, p.y);
        if (d < bd) {
          bd = d;
          prey = p;
        }
      }
      if (!prey) continue;
      if (beast.kind === "carroña" && prey.hp > 42 && !(prey.wounds?.length)) continue;
      const mul = (world.shields[prey.id] ?? 0) > world.day ? 0.25 : 1;
      prey.hp -= (beast.kind === "cazador" ? 22 : 12) * mul;
      prey.reel = 4;
      if (prey.alive && prey.hp > 0 && beast.kind === "cazador" && Math.random() < 0.45) maim(world, prey, WOUNDS[(beast.id + world.day) % WOUNDS.length]!, beast.name, quiet, null);
      if (prey.alive && prey.hp > 0 && beast.kind === "carroña" && Math.random() < 0.55) maim(world, prey, "ojo", beast.name, quiet, null);
      if (prey.role === "guardia" || prey.role === "lider") beast.hp -= 10;
      if (prey.hp <= 0) kill(world, prey, null, beast.kind === "cazador" ? "Le abre la garganta. La sangre sale a golpes." : beast.kind === "carroña" ? "Le vacía la cara antes de que deje de moverse." : "El cuerpo queda abierto.", quiet);
      if (beast.hp <= 0) {
        beast.alive = false;
        const civ = civById(world, prey.civId);
        if (civ) civ.food = Math.min(220, civ.food + 4);
        say(world, `${prey.name} derriba a ${beast.name}. Hay carne.`, planet.id, [prey.id], "oro", quiet);
      }
    }
  }
}

function hazards(world: World, quiet: boolean) {
  for (const p of world.people) {
    if (!p.alive) continue;
    const planet = world.planets[p.planet];
    if (!planet) continue;
    const tile = planet.tiles[idx(p.x, p.y)] ?? 0;
    if (tile === LAVA && p.role !== "alien" && !(planet.span[idx(p.x, p.y)] ?? 0)) p.hp -= 18;
    if (tile === FLESH) p.hp -= 3;
    if (planet.kind === "hielo" && tile === SNOW && p.task !== "explora" && p.task !== "vela" && dist(p.x, p.y, p.hx, p.hy) > 22) p.hp -= 2;
    if (p.heldBy != null) {
      p.held++;
      const civ = civById(world, p.civId);
      if (p.held >= 5 && civ && civ.food >= 10 && Math.random() < 0.55) {
        civ.food -= 10;
        p.heldBy = null;
        p.held = 0;
        say(world, `${civ.name} paga y ${p.name} vuelve.`, p.planet, [p.id], "oro", quiet);
      } else if (p.held >= 6 && Math.random() < 0.45) kill(world, p, personById(world, p.heldBy) ?? null, "Nadie pagó.", quiet);
    }
    if (p.alive && p.hp <= 0) kill(world, p, null, "El suelo pudo más.", quiet);
  }
}

function retargetBeast(world: World, beast: Fauna, planet: Planet) {
  if ((beast.scare ?? 0) > 0) {
    beast.scare = (beast.scare ?? 1) - 1;
    beast.mood = "huye";
    return;
  }
  const near = (max: number) => {
    let best: Person | null = null;
    let bd = max;
    for (const p of world.people) {
      if (!p.alive || p.planet !== planet.id || stageOf(p) === "bebe") continue;
      const d = dist(beast.x, beast.y, p.x, p.y);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  };
  if (beast.kind === "presa" || beast.kind === "perro") {
    const threat = near(beast.kind === "perro" ? 6 : 9);
    const wolf = world.fauna.find((f) => f.alive && f.kind === "cazador" && f.planet === planet.id && dist(f.x, f.y, beast.x, beast.y) < 6);
    const personClose = threat != null && dist(beast.x, beast.y, threat.x, threat.y) < (beast.kind === "perro" ? 3 : 5);
    const scare = beast.kind === "perro" ? wolf : personClose ? threat : null;
    if (scare) {
      const from = scare;
      beast.facing = wrapDelta(from.x - beast.x) >= 0 ? 1 : -1;
      if (beast.mood !== "alerta" && beast.mood !== "huye") {
        beast.mood = "alerta";
        return;
      }
      beast.mood = "huye";
      beast.scare = 6;
      beast.tx = beast.x + (beast.x - from.x) * 2;
      beast.ty = beast.y + (beast.y - from.y) * 2.4;
      return;
    }
    if (beast.mood === "alerta") beast.mood = "huye";
    if (beast.kind === "perro") {
      const person = near(12);
      if (person) {
        beast.tx = person.x - 1.3;
        beast.ty = clamp(person.y + 0.4, 1, H - 2);
        beast.mood = "camina";
        return;
      }
    }
    if (beast.mood !== "huye" && (beast.belly ?? 40) > 62) {
      beast.mood = "come";
      return;
    }
    beast.mood = "camina";
  } else if (beast.kind === "carroña") {
    let corpse: Person | null = null;
    let cd = 16;
    for (const p of world.people) {
      if (p.alive || p.planet !== planet.id) continue;
      const d = dist(p.x, p.y, beast.x, beast.y);
      if (d < cd) {
        cd = d;
        corpse = p;
      }
    }
    const hurt = near(5);
    if (hurt && (hurt.hp < 40 || (hurt.wounds?.length ?? 0) > 0) && dist(hurt.x, hurt.y, beast.x, beast.y) < 5) {
      beast.tx = hurt.x;
      beast.ty = hurt.y;
      beast.mood = "camina";
      return;
    }
    if (corpse) {
      beast.tx = corpse.x;
      beast.ty = corpse.y;
      beast.mood = "come";
      return;
    }
    beast.mood = "camina";
  } else if (beast.kind === "mastin") {
    const wolf = world.fauna.find((f) => f.alive && f.kind === "cazador" && f.planet === planet.id && dist(f.x, f.y, beast.x, beast.y) < 7);
    if (wolf) {
      beast.tx = wolf.x;
      beast.ty = wolf.y;
      beast.mood = "alerta";
      return;
    }
    const person = near(8);
    if (person) {
      beast.tx = person.x + 1.2;
      beast.ty = person.y;
      beast.mood = "camina";
      return;
    }
  } else if (beast.kind === "cazador" || beast.kind === "alien") {
    if (beast.kind === "cazador") {
      let meal: Fauna | null = null;
      let md = 14;
      for (const f of world.fauna) {
        if (!f.alive || f.id === beast.id || f.planet !== planet.id) continue;
        if (f.kind !== "presa" && f.kind !== "perro" && f.kind !== "ave") continue;
        const d = dist(f.x, f.y, beast.x, beast.y);
        if (d < md) {
          md = d;
          meal = f;
        }
      }
      if (meal) {
        const urge = (beast.belly ?? 40) / 100;
        const close = md < 4;
        if (urge > 0.42 || close) {
          beast.tx = meal.x;
          beast.ty = meal.y;
          beast.mood = "camina";
          beast.facing = meal.x >= beast.x ? 1 : -1;
          return;
        }
      }
    }
    const prey = near(beast.kind === "alien" ? 8 : 5.5);
    if (prey) {
      const pack = world.people.filter((p) => p.alive && p.planet === planet.id && dist(p.x, p.y, prey.x, prey.y) < 3).length;
      if (pack < 3) {
        beast.tx = prey.x;
        beast.ty = prey.y;
        beast.mood = "camina";
        return;
      }
    }
  }
  if (dist(beast.x, beast.y, beast.tx ?? beast.x, beast.ty ?? beast.y) > 1.4) return;
  const hold = (beast.id * 13 + (world.day >> 2)) % 5;
  if (hold === 0) {
    beast.mood = beast.mood === "huye" ? "camina" : "come";
    return;
  }
  const heading = (beast.id * 0.91 + Math.floor(world.day / 6) * 1.7) % (Math.PI * 2);
  const hop = beast.kind === "ave" ? 9 : 6;
  for (let n = 0; n < 4; n++) {
    const a = heading + n * 0.9;
    const tx = beast.x + Math.cos(a) * hop;
    const ty = beast.y + Math.sin(a) * hop * 0.65;
    const tile = columnAt(planet.seed, planet.kind, tx, ty).tile;
    if (beast.kind === "ave" || !blocked(tile, beast.kind === "alien")) {
      beast.tx = tx;
      beast.ty = ty;
      beast.mood = "camina";
      return;
    }
  }
}

export function tickDay(world: World, quiet = false) {
  deathsToday = 0;
  maimsToday = 0;
  lifeToday = 0;
  world.day++;
  if (world.day % 24 === 20) {
    for (const civ of world.civs) {
      if ((civ.wood ?? 0) > 0) civ.wood = (civ.wood ?? 0) - 1;
      else civ.fear = clamp(civ.fear + 3, 0, 100);
    }
  }
  if (world.day % 14 === 0) world.attention = Math.min(3, world.attention + 1);
  for (const civ of world.civs) economy(world, civ, quiet);
  for (const p of world.people) {
    if (!p.alive) continue;
    const planet = world.planets[p.planet];
    if (!planet) continue;
    if (!p.task) p.task = "nada";
    if (p.swing) p.swing -= 1;
    if (p.reel) p.reel -= 1;
    if (p.role !== "alien" && stageOf(p) !== "bebe") {
      const night = isNight(world.day);
      const homeD = dist(p.x, p.y, p.hx, p.hy);
      const wolf = world.fauna.some((f) => f.alive && f.kind === "cazador" && f.planet === p.planet && dist(f.x, f.y, p.x, p.y) < 7);
      let dread = p.dread ?? 0;
      if (wolf) dread += 16;
      else if (night && homeD > 8) dread += 7;
      else dread -= night ? 1 : 5;
      if (p.wounds?.length) dread += 3;
      p.dread = clamp(dread, 0, 100);
      wakeNeeds(p, night);
      if ((p.dread ?? 0) > 80) p.loyalty = clamp(p.loyalty - 0.04, 0, 100);
      if (p.dread > 68 && homeD > 3 && p.heldBy == null) {
        p.task = "viaje";
        p.tx = p.hx;
        p.ty = p.hy;
        p.taskLeft = Math.max(p.taskLeft, 8);
        if (p.dread > 84 && world.day % 13 === p.id % 13) say(world, `${p.name} no aguanta la oscuridad. Corre hacia el fuego.`, p.planet, [p.id], "voz", quiet);
      }
    }
    if (p.age == null) p.age = 480;
    const before = p.age;
    p.age += 1;
    if (p.role !== "alien" && before < BABY_DAYS && p.age >= BABY_DAYS) {
      const mom = p.motherId != null ? personById(world, p.motherId) : null;
      say(world, `${p.name} ya no gatea. Se suelta${mom ? ` de ${mom.name}` : ""} y camina.`, p.planet, [p.id], "voz", quiet);
    }
    if (p.role !== "alien" && before < CHILD_DAYS && p.age >= CHILD_DAYS) {
      say(world, `${p.name} deja de ser niño. Ya come con los grandes.`, p.planet, [p.id], "voz", quiet);
    }
    if (stageOf(p) === "bebe") {
      const mom = p.motherId != null ? personById(world, p.motherId) : null;
      const anchor = mom && mom.alive && mom.planet === p.planet ? mom : null;
      const wobble = Math.sin(world.day * 0.8 + p.id) * 1.1;
      p.task = "gatea";
      p.tx = wrap((anchor ? anchor.x : p.hx) + wobble);
      p.ty = clamp((anchor ? anchor.y : p.hy) + 0.85, 1, H - 2);
      stepTo(p, p.tx, p.ty, planet, 0.45, false, false);
      continue;
    }
    if (p.heldBy != null) {
      const holder = personById(world, p.heldBy);
      if (holder && holder.alive && holder.planet === p.planet) {
        holder.task = "carga";
        holder.taskLeft = Math.max(holder.taskLeft, 2);
        p.x = wrap(holder.x + holder.facing * 0.15);
        p.y = holder.y;
        continue;
      }
    }
    steer(world, p);
    const child = stageOf(p) === "nino";
    let speed = p.role === "alien" ? 1.7 : child ? 1.05 : p.task === "explora" || p.task === "vela" ? 2.05 : 1.65;
    if (p.wounds?.includes("pierna")) speed *= 0.4;
    if (p.blind) speed *= 0.72;
    if ((p.dread ?? 0) > 72) speed *= 1.35;
    stepTo(p, p.tx, p.ty, planet, speed, p.role === "alien", p.task === "vela");
    if (p.role !== "alien" && p.task !== "nada") {
      const d = dist(p.x, p.y, p.tx, p.ty);
      if (p.task === "emboscada" && d < 1.6) {
        p.taskLeft--;
        const beast = world.fauna.find((f) => f.alive && f.planet === p.planet && dist(f.x, f.y, p.x, p.y) < 2.4);
        const foe = world.people.find((o) => o.alive && o.id !== p.id && o.planet === p.planet && o.civId !== p.civId && dist(o.x, o.y, p.x, p.y) < 1.4);
        if (beast) {
          beast.alive = false;
          const civ = civById(world, p.civId);
          if (civ) civ.food = Math.min(220, civ.food + 6);
          p.swing = 5;
          say(world, `${p.name} sale de los arbustos y derriba a ${beast.name}.`, p.planet, [p.id], "sangre", quiet);
          p.task = "nada";
        } else if (foe) {
          foe.hp -= 28;
          foe.reel = 4;
          p.swing = 5;
          foe.heldBy = p.id;
          foe.held = 0;
          say(world, `${p.name} sale de los arbustos, agarra a ${foe.name} y se lo echa al hombro.`, p.planet, [p.id, foe.id], "sangre", quiet);
          p.task = "carga";
        } else if (p.taskLeft <= 0) p.task = "nada";
        continue;
      }
      if (p.task === "tala" && d < 1.5) {
        const tree = world.timber.find((t) => t.id === p.workId && t.kind === "arbol" && t.fall === 0);
        if (tree) {
          tree.fall = 1;
          tree.civId = p.civId;
          p.swing = 5;
          const stuff = planet.kind === "lava" ? "una roca negra" : planet.kind === "hielo" ? "un bloque de hielo" : planet.kind === "cristal" ? "un cristal" : planet.kind === "carne" ? "un hueso enorme" : planet.kind === "desierto" ? "un palo seco" : "un árbol";
          say(world, `${p.name} golpea ${stuff}. Cae.`, p.planet, [p.id], "voz", quiet);
        }
        p.task = "nada";
        continue;
      }
      if (p.task === "acarreo" && d < 1.5) {
        const log = world.timber.find((t) => t.id === p.workId);
        const civ = civById(world, p.civId);
        if (log && log.kind === "tronco" && log.carriedBy == null) {
          log.carriedBy = p.id;
          p.carryId = log.id;
          p.tx = p.hx;
          p.ty = p.hy;
          p.taskLeft = 28;
          say(world, `${p.name} se echa el tronco al hombro y vuelve al pueblo.`, p.planet, [p.id], "voz", quiet);
          continue;
        }
        if (p.carryId && civ) {
          world.timber = world.timber.filter((t) => t.id !== p.carryId);
          p.carryId = null;
          civ.wood = Math.min(80, (civ.wood ?? 0) + 4);
          const work = world.works.find((w) => !w.done && w.civId === civ.id);
          if (work) {
            work.progress += 2;
            if (work.progress >= work.need) applyWork(world, work, quiet, p);
          }
          say(world, `${p.name} suelta el tronco en ${civ.name}. Con eso se levanta otro palo.`, p.planet, [p.id], "oro", quiet);
        }
        p.task = "nada";
        continue;
      }
      const prev = trail.get(p.id);
      if (d < (p.task === "obra" ? 3.4 : 1.2)) {
        trail.delete(p.id);
        arrive(world, p, quiet);
      } else if (prev == null) trail.set(p.id, d);
      else if (d > prev - 0.25) {
        p.taskLeft--;
        if (p.taskLeft <= 0) {
          if (p.task === "obra") {
            const work = world.works.find((w) => w.id === p.workId && !w.done);
            if (work) {
              work.progress += 1;
              if (work.progress >= work.need) applyWork(world, work, quiet, p);
            }
          }
          trail.delete(p.id);
          p.task = "nada";
          p.taskLeft = 0;
        } else trail.set(p.id, d);
      } else trail.set(p.id, d);
    }
  }
  for (const beast of world.fauna) {
    if (!beast.alive) continue;
    const planet = world.planets[beast.planet];
    if (!planet) continue;
    if (beast.tx == null) {
      beast.tx = beast.x;
      beast.ty = beast.y;
    }
    beast.belly = clamp((beast.belly ?? 35) + (beast.mood === "come" ? -22 : 2.4), 0, 100);
    retargetBeast(world, beast, planet);
    if (beast.mood === "alerta" || beast.mood === "come") continue;
    const speed = beast.mood === "huye" ? 2.05 : beast.kind === "ave" ? 1.7 : beast.kind === "perro" ? 1.15 : beast.kind === "mastin" ? 1.25 : beast.kind === "cazador" ? 1.85 : beast.kind === "carroña" ? 0.8 : beast.kind === "presa" ? 1.15 : 1.25;
    stepTo(beast, beast.tx, beast.ty, planet, speed, beast.kind === "alien", beast.kind === "ave");
  }
  for (const tree of world.timber ?? []) {
    if (tree.kind === "arbol" && tree.fall > 0 && tree.fall < 8) {
      tree.fall++;
      if (tree.fall >= 8) tree.kind = "tronco";
    }
    if (tree.carriedBy != null) {
      const who = personById(world, tree.carriedBy);
      if (!who || !who.alive) tree.carriedBy = null;
      else {
        tree.x = who.x;
        tree.y = who.y;
      }
    }
  }
  hazards(world, quiet);
  combat(world, quiet);
  resolvePlots(world, quiet);
  const civ = world.civs[(Math.random() * world.civs.length) | 0];
  if (civ) {
    const here = world.civs.filter((c) => c.planet === civ.planet);
    const kind = weighted([
      ["robo", 3],
      ["festival", 2.2],
      ["comercio", here.length > 1 ? 2 : 0],
      ["caza", 1.7 + (civ.food < 20 ? 0.8 : 0)],
      ["nacimiento", 1.4],
      ["descubrimiento", civ.era >= 9 ? 0.15 : 0.45],
      ["votacion", civ.law === "consejo" || civ.law === "colmena" ? 1.15 : 0.1],
      ["plan", 1.2],
      ["secuestro", 0.8],
      ["asesinato", 0.38],
      ["motin", civ.fear > 42 ? 1.4 : 0.1],
      ["peste", 0.3],
      ["hambruna", civ.food < 14 ? 2.4 : world.civs.filter((c) => c.food < 16).length * 0.25],
      ["incendio", 0.4],
      ["desercion", here.length > 1 ? 0.5 : 0],
      ["tratado", here.length > 1 ? 0.65 : 0],
      ["eclipse", 0.25],
      ["naufragio", world.planets[civ.planet]?.kind === "oceano" ? 1 : 0.2],
      ["milagro", 0.16],
    ]);
    if (kind) runEvent(world, kind, civ, quiet);
  }
  invade(world, quiet);
  if (Math.random() < 0.12) {
    const planet = world.planets[(Math.random() * world.planets.length) | 0];
    if (planet) {
      const alive = world.fauna.filter((f) => f.alive && f.planet === planet.id).length;
      if (alive < 4) {
        const tiles = planet.tiles;
        for (let n = 0; n < 20; n++) {
          const x = Math.random() * W;
          const y = Math.random() * H;
          if (blocked(tiles[idx(x, y)] ?? 0)) continue;
          world.fauna.push({ id: world.uid++, planet: planet.id, kind: "presa", x, y, hp: 24, alive: true, facing: 1, tx: x, ty: y, name: beastName("presa", world.uid) });
          break;
        }
      }
    }
  }
  for (const f of world.floaters) f.life -= 1;
  world.floaters = world.floaters.filter((f) => f.life > 0);
}

export function awaken(world: World) {
  say(world, "Abres los ojos. Dos Cuevas aún huele a humo, y el sistema ya estaba vivo.", world.focusPlanet, [], "voz", true);
  for (let i = 0; i < 8; i++) tickDay(world, true);
  world.ping = null;
}

export function blurb(p: Person) {
  if (!p.alive) return "Ya no camina.";
  if (p.heldBy) return "Está en manos de otro.";
  if (p.task === "gatea") return "Gatea. El mundo le queda grande.";
  if (p.task === "sigue") return "Sigue a quien lo trajo al fuego.";
  if (p.task === "tala") return "Golpea la madera. El golpe se oye.";
  if (p.task === "acarreo") return "Lleva un tronco al hombro.";
  if (p.task === "emboscada") return "Está quieto entre los arbustos.";
  if (p.task === "carga") return "Lleva a alguien al hombro. No lo suelta.";
  if (p.task === "obra") return "Está levantando algo con las manos.";
  if (p.task === "explora") return "Va donde el mapa todavía no tiene nombre.";
  if (p.task === "vela") return "Cruza el agua en lo que pudieron construir.";
  if (p.task === "pesca") return "Busca la orilla y lo que nade.";
  if (p.task === "caza") return "Sigue un rastro fuera del pueblo.";
  if (p.task === "siembra") return "Abre la tierra.";
  if (p.task === "viaje") return "Camina hacia otro techo.";
  if (p.task === "oficio") return "Hace lo que el día le pide.";
  if (p.task === "funda") return "Acaba de tocar una tierra que no era suya.";
  if (p.role === "alien") return "No viene a pactar.";
  if (p.role === "lider") return "Sostiene el nombre del pueblo.";
  if (p.role === "ladron") return "Mide los bolsillos ajenos.";
  if (p.role === "guardia") return "Ronda lo que todavía es suyo.";
  if (p.role === "exiliado") return "Busca un techo que no pregunte.";
  return "Come, camina, construye o se va.";
}

export function ageWord(p: Person) {
  const age = p.age ?? 0;
  const stage = stageOf(p);
  if (stage === "bebe") return `gatea · ${age} días`;
  if (stage === "nino") return `niño · ${age} días`;
  if (age > 900) return `viejo · ${age} días`;
  return `adulto · ${age} días`;
}

export function kinOf(world: World, p: Person) {
  const mother = p.motherId != null ? (personById(world, p.motherId) ?? null) : null;
  const father = p.fatherId != null ? (personById(world, p.fatherId) ?? null) : null;
  const children = world.people.filter((c) => c.motherId === p.id || c.fatherId === p.id);
  return { mother, father, children };
}

export function mind(world: World, p: Person) {
  const stage = stageOf(p);
  const mother = p.motherId != null ? personById(world, p.motherId) : null;
  const father = p.fatherId != null ? personById(world, p.fatherId) : null;
  const mom = mother?.name ?? "nadie";
  const dad = father?.name ?? "nadie";
  const civ = civById(world, p.civId);
  const i = (p.id * 13 + Math.floor(world.day / 4)) % 97;
  if (!p.alive) return "Ya no piensa. El nombre queda en la boca de otros.";
  if (p.heldBy != null) return "No ve el cielo. Cuenta los pasos de quien lo tiene.";
  if (stage === "bebe") {
    const lines = [
      `El suelo está frío. Busco la voz de ${mom}.`,
      `Tengo hambre y todavía no sé decir ${mom}.`,
      `Las manos no me alcanzan. Gateo igual.`,
      `El fuego huele. No sé si muerde.`,
      dad === "nadie" ? "Hay una sombra grande que a veces me tapa el sol." : `${dad} es una sombra que a veces me tapa el sol.`,
    ];
    return lines[i % lines.length]!;
  }
  if (stage === "nino") {
    const lines = [
      `${dad} dijo que no me acerque al agua. Quiero verla.`,
      `Si me dejan, sigo a ${mom} todo el día.`,
      "Quiero una lanza. Me dan un palo.",
      "Escucho a los grandes y no entiendo la mitad.",
      "Hoy me caigo menos. Mañana quiero ir más lejos.",
    ];
    return lines[i % lines.length]!;
  }
  const hunger = (p.needs?.hunger ?? 0) > 70 || (civ != null && civ.food < 16);
  const last = p.trace?.[p.trace.length - 1];
  const far = dist(p.x, p.y, p.hx, p.hy) > 8;
  const night = isNight(world.day);
  let near: Person | null = null;
  let nearD = 5.5;
  let child: Person | null = null;
  for (const o of world.people) {
    if (!o.alive || o.planet !== p.planet) continue;
    if (o.motherId === p.id || o.fatherId === p.id) child = o;
    if (o.id === p.id) continue;
    const d = Math.hypot(wrapDelta(o.x - p.x), o.y - p.y);
    if (d < nearD) {
      nearD = d;
      near = o;
    }
  }
  const who = near ? (near.name.split(" ")[0] ?? near.name) : "";
  const kid = child ? (child.name.split(" ")[0] ?? child.name) : "";
  if (p.blind) return who ? `No veo a ${who}. Oigo los pasos.` : "No veo. Cuento el calor del fuego.";
  if (p.wounds?.includes("pierna")) return "La pierna que queda no quiere este camino.";
  if (p.wounds?.length) {
    const part = p.wounds[0];
    const lost = part === "ojo" ? "Me falta un ojo" : part === "dedos" ? "Me faltan dedos" : `Me falta la ${part}`;
    return `${lost}. Sigo usando lo que queda.`;
  }
  if ((p.dread ?? 0) > 60 && night) return who ? `${who} tampoco duerme. Eso no me calma.` : "La noche tiene dientes y yo no tengo sueño.";
  if ((p.needs?.hunger ?? 0) > 70) return "El estómago manda más que la boca.";
  if ((p.needs?.rest ?? 0) > 78) return night ? "Debería dormir. Las piernas ya votaron." : "El cuerpo pide fuego, no camino.";
  if (last === "cazar") return "Todavía huelo el rastro.";
  if (last === "volver") return "El fuego está de ese lado. Voy.";
  if (hunger) return `En ${civ?.name ?? "casa"} el grano no alcanza. Lo pienso con el estómago.`;
  if (p.task === "tala") return "El hacha pega. El árbol todavía no entiende.";
  if (p.task === "caza") return who ? `${who} hace ruido. La presa ya lo oyó.` : "Sigo un rastro que se enfría.";
  if (p.task === "pesca") return "El agua está quieta. Yo no.";
  if (p.task === "siembra") return "Si esto no sale, el invierno nos lo cuenta.";
  if (p.task === "obra" || p.task === "acarreo") return "La piedra no se pone sola.";
  if (p.task === "carga") return "Pesa más de lo que dije que podía.";
  if (p.task === "viaje" || p.task === "funda") return "El techo de atrás ya no se ve.";
  if (p.task === "emboscada") return "Si respiro fuerte, me oyen.";
  if (p.task === "oficio") return `Mis manos saben de ${looks(p).job}. Hoy no discuten.`;
  if (kid && (child?.age ?? 999) < CHILD_DAYS) return `${kid} está cerca. No lo pierdo de vista.`;
  if (far) return "El fuego está lejos. Apuro el paso.";
  if (who) return `${who} está ahí y no me habla.`;
  if (night) return "Debería dormir. El cuerpo no quiere.";
  return "El día pasa y yo lo dejo.";
}

export function relWord(n: number) {
  if (n > 40) return "pacto";
  if (n > 10) return "tregua";
  if (n < -40) return "guerra";
  if (n < -10) return "rencor";
  return "recelo";
}

export function intervene(world: World, kind: "favor" | "escudo" | "rumor" | "chispa", id: number): string | null {
  if (world.attention <= 0) return "Tu mirada está cansada. Espera unos días.";
  if (kind === "favor" || kind === "escudo") {
    const p = personById(world, id);
    if (!p || !p.alive) return "Esa vida ya no está.";
    if (kind === "favor") {
      p.loyalty = clamp(p.loyalty + 28, 0, 100);
      say(world, `Una mirada se posa en ${p.name}. El pueblo lo nota.`, p.planet, [p.id], "oro", false, "spin");
    } else {
      world.shields[p.id] = world.day + 10;
      say(world, `Alguien cubre a ${p.name} hasta el día ${world.day + 10}.`, p.planet, [p.id], "oro", false, "spin");
    }
  } else {
    const civ = civById(world, id);
    if (!civ) return "Ese pueblo no existe.";
    if (kind === "rumor") {
      civ.fear = clamp(civ.fear + 16, 0, 100);
      civ.order = clamp(civ.order - 10, 0, 100);
      say(world, `Corre un rumor en ${civ.name}. Nadie sabe quién lo soltó.`, civ.planet, [], "voz", false);
    } else {
      civ.knowledge += 26;
      say(world, `Una idea cae en ${civ.name}, como si el aire la trajera.`, civ.planet, [civ.leaderId], "oro", false, "era");
      if (civ.knowledge > 20 + civ.era * 9) raiseEra(world, civ, false);
    }
  }
  world.attention -= 1;
  return null;
}

type SaveSite = { planet: number; x: number; y: number; civId: number; level: number; decor?: string[] };

type Save = {
  version: 1;
  seed: number;
  day: number;
  attention: number;
  visited: number;
  coached: boolean;
  angle: number;
  focusPlanet: number;
  focusCiv: number;
  civs: Civ[];
  people: Person[];
  fauna: Fauna[];
  plots: Plot[];
  works?: Work[];
  timber?: Timber[];
  sites?: SaveSite[];
  logs: Log[];
  shields: Record<number, number>;
  uid: number;
};

export function snapshot(world: World): Save {
  return {
    version: 1,
    seed: world.seed,
    day: world.day,
    attention: world.attention,
    visited: world.visited,
    coached: world.coached,
    angle: world.angle,
    focusPlanet: world.focusPlanet,
    focusCiv: world.focusCiv,
    civs: world.civs.map((c) => ({ ...c, relations: { ...c.relations } })),
    people: world.people.map((p) => ({ ...p })),
    fauna: world.fauna.map((f) => ({ ...f })),
    plots: world.plots.map((p) => ({ ...p })),
    works: world.works.map((w) => ({ ...w })),
    timber: (world.timber ?? []).map((t) => ({ ...t })),
    sites: world.planets.flatMap((planet) => planet.sites.map((s) => ({ planet: planet.id, x: s.x, y: s.y, civId: s.civId, level: s.level, decor: s.decor }))),
    logs: world.logs.slice(0, 60),
    shields: { ...world.shields },
    uid: world.uid,
  };
}

export function writeSave(world: World) {
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot(world)));
  } catch {
    /* ignore quota */
  }
}

export function loadSave(): Save | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Save;
    if (parsed.version !== 1 || typeof parsed.seed !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function restore(save: Save): World | null {
  const world = generate(save.seed);
  if (save.civs.length !== world.civs.length) return null;
  world.day = save.day;
  world.attention = save.attention;
  world.visited = save.visited;
  world.coached = save.coached;
  world.angle = save.angle;
  world.focusPlanet = save.focusPlanet;
  world.focusCiv = save.focusCiv;
  world.uid = save.uid;
  world.people = save.people.map((p) => ({
    ...p,
    age: p.age ?? 480,
    motherId: p.motherId ?? null,
    fatherId: p.fatherId ?? null,
    task: p.task || "nada",
  }));
  world.fauna = save.fauna.map((f) => ({
    ...f,
    tx: f.tx ?? f.x,
    ty: f.ty ?? f.y,
    name: f.name || beastName(f.kind, f.id),
  }));
  if (save.timber?.length) world.timber = save.timber.map((t) => ({ ...t }));
  world.plots = save.plots;
  world.logs = save.logs;
  world.shields = save.shields ?? {};
  if (save.works) world.works = save.works.map((w) => ({ ...w, reason: w.reason }));
  if (save.sites?.length) {
    for (const planet of world.planets) {
      const sites = save.sites.filter((s) => s.planet === planet.id);
      if (sites.length) planet.sites = sites.map((s) => ({ x: s.x, y: s.y, civId: s.civId, level: s.level, decor: s.decor }));
    }
  }
  for (const saved of save.civs) {
    const civ = world.civs.find((c) => c.id === saved.id);
    if (!civ) return null;
    civ.era = saved.era;
    civ.law = saved.law;
    civ.pop = saved.pop;
    civ.food = saved.food;
    civ.order = saved.order;
    civ.fear = saved.fear;
    civ.knowledge = saved.knowledge;
    civ.wood = saved.wood ?? civ.wood ?? 0;
    civ.leaderId = saved.leaderId;
    civ.relations = saved.relations ?? {};
    civ.beyond = saved.beyond ?? world.day;
    civ.pop = Math.max(6, Math.round(civ.pop));
    civ.knowledge = Math.min(48, civ.knowledge);
  }
  for (const p of world.people) {
    if (!p.task) p.task = "nada";
    if (p.taskLeft == null) p.taskLeft = 0;
    if (p.workId == null) p.workId = 0;
  }
  for (const work of world.works) if (work.done) applyWork(world, work, true, null);
  for (const p of world.people) {
    const planet = world.planets[p.planet];
    if (!planet) continue;
    if (!openTile(planet, p.x, p.y, p.role === "alien", false)) {
      const site = planet.sites.find((s) => s.civId === p.civId) ?? planet.sites[0];
      if (site) {
        p.x = site.x;
        p.y = site.y;
        p.hx = site.x;
        p.hy = site.y;
        p.tx = site.x;
        p.ty = site.y;
      }
    }
  }
  for (const planet of world.planets) {
    for (const site of planet.sites) {
      const civ = world.civs.find((c) => c.id === site.civId);
      if (civ) site.level = Math.max(site.level, siteLevel(civ.era));
    }
  }
  return world;
}

export type { Save };
