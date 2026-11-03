import type { Kind } from "./names";

export type Law = "clan" | "consejo" | "tirano" | "mercado" | "colmena";
export type Role = "lider" | "ciudadano" | "guardia" | "ladron" | "alien" | "exiliado";
export type FaunaKind = "presa" | "cazador" | "ave" | "alien" | "perro" | "mastin" | "carroña";
export type Tone = "sangre" | "oro" | "voz" | "vacio";
export type Task = "nada" | "obra" | "explora" | "caza" | "pesca" | "siembra" | "oficio" | "viaje" | "vela" | "funda" | "gatea" | "sigue" | "tala" | "acarreo" | "emboscada" | "carga";
export const BABY_DAYS = 80;
export const CHILD_DAYS = 200;

export type WorkKind =
  | "puente"
  | "camino"
  | "granja"
  | "pozo"
  | "barco"
  | "balsa"
  | "muelle"
  | "muralla"
  | "atalaya"
  | "taller"
  | "molino"
  | "horno"
  | "santuario"
  | "mercado"
  | "escuela"
  | "hospital"
  | "faro"
  | "acueducto"
  | "mina"
  | "dique"
  | "presa"
  | "invernadero"
  | "torre"
  | "astillero"
  | "canal"
  | "embarcadero"
  | "mapa"
  | "granero"
  | "palacio"
  | "calzada"
  | "coloso";

export type Site = { x: number; y: number; civId: number; level: number; decor?: string[] };

export type Planet = {
  id: number;
  name: string;
  kind: Kind;
  seed: number;
  orbit: number;
  speed: number;
  phase: number;
  tiles: Uint8Array;
  farm: Uint8Array;
  road: Uint8Array;
  span: Uint8Array;
  stamp: number;
  sites: Site[];
};

export type Civ = {
  id: number;
  planet: number;
  name: string;
  kind: Kind;
  era: number;
  law: Law;
  pop: number;
  food: number;
  order: number;
  fear: number;
  knowledge: number;
  wood: number;
  leaderId: number;
  relations: Record<number, number>;
  beyond: number;
};

export type Needs = { hunger: number; rest: number; social: number; safety: number; curiosity: number };

export type Person = {
  id: number;
  name: string;
  civId: number;
  planet: number;
  role: Role;
  x: number;
  y: number;
  hx: number;
  hy: number;
  tx: number;
  ty: number;
  hp: number;
  wealth: number;
  loyalty: number;
  alive: boolean;
  heldBy: number | null;
  held: number;
  facing: number;
  task: Task;
  taskLeft: number;
  workId: number;
  age: number;
  motherId: number | null;
  fatherId: number | null;
  job?: string;
  hair?: number;
  cloth?: number;
  mark?: number;
  swing?: number;
  carryId?: number | null;
  reel?: number;
  dread?: number;
  blind?: boolean;
  wounds?: Array<"ojo" | "dedos" | "mano" | "brazo" | "pierna">;
  needs?: Needs;
  /** Últimas acciones reales. Sirve para no oscilar y para que el pensamiento no invente. */
  trace?: string[];
};

export type Fauna = {
  id: number;
  planet: number;
  kind: FaunaKind;
  x: number;
  y: number;
  hp: number;
  alive: boolean;
  facing: number;
  tx: number;
  ty: number;
  name: string;
  mood?: "camina" | "alerta" | "huye" | "come";
  /** Pasos de día que sigue huyendo aunque el peligro ya no esté en rango. */
  scare?: number;
  /** 0 saciado, 100 vacío. */
  belly?: number;
};

export type Plot = {
  id: number;
  due: number;
  kind: "atentado" | "secuestro" | "robo";
  planet: number;
  actorId: number;
  targetId: number;
  civId: number;
};

export type Work = {
  id: number;
  planet: number;
  civId: number;
  kind: WorkKind;
  x: number;
  y: number;
  x2: number;
  y2: number;
  progress: number;
  need: number;
  done: boolean;
  reason?: string;
};

export type Timber = {
  id: number;
  planet: number;
  x: number;
  y: number;
  kind: "arbol" | "tronco";
  fall: number;
  carriedBy: number | null;
  civId: number;
  form?: "roble" | "pino" | "seco" | "palma";
};

export type Log = {
  day: number;
  text: string;
  planet: number;
  people: number[];
  tone: Tone;
};

export type Floater = { planet: number; x: number; y: number; text: string; life: number };

export type World = {
  seed: number;
  day: number;
  attention: number;
  visited: number;
  coached: boolean;
  angle: number;
  /** Fracción de la hora en curso. No se guarda: solo sirve para que la órbita no salte. */
  frac?: number;
  planets: Planet[];
  civs: Civ[];
  people: Person[];
  fauna: Fauna[];
  plots: Plot[];
  works: Work[];
  timber: Timber[];
  logs: Log[];
  floaters: Floater[];
  shields: Record<number, number>;
  uid: number;
  focusPlanet: number;
  focusCiv: number;
  ping: "hit" | "era" | "spin" | null;
};

export type { Kind };
