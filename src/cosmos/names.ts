export type Kind = "tierra" | "desierto" | "hielo" | "jungla" | "lava" | "cristal" | "carne" | "oceano";

export const KIND_LABEL: Record<Kind, string> = {
  tierra: "Tierra",
  desierto: "Desierto",
  hielo: "Hielo",
  jungla: "Jungla",
  lava: "Lava",
  cristal: "Cristal",
  carne: "Carne",
  oceano: "Océano",
};

export const KIND_BLURB: Record<Kind, string> = {
  tierra: "Mares, bosques y una cueva que insiste.",
  desierto: "El agua es un rumor. La sombra se cobra.",
  hielo: "El frío decide antes que la gente.",
  jungla: "Todo crece, también lo que muerde.",
  lava: "La forja no se apaga. La piel sí.",
  cristal: "Avanzaron más rápido. Por eso cruzan el vacío.",
  carne: "El suelo respira y a veces traga.",
  oceano: "Islas chicas, ambición de flota.",
};

export const LAW_LABEL = {
  clan: "Clan",
  consejo: "Consejo",
  tirano: "Tirano",
  mercado: "Mercado",
  colmena: "Colmena",
} as const;

export const ROLE_LABEL = {
  lider: "Líder",
  ciudadano: "Ciudadano",
  guardia: "Guardia",
  ladron: "Ladrón",
  alien: "Invasor",
  exiliado: "Exiliado",
} as const;

export const ERAS: Record<Kind, string[]> = {
  tierra: ["Cueva", "Hoguera", "Aldea", "Reino", "Muralla", "Imprenta", "Vapor", "Nación", "Red", "Órbita"],
  desierto: ["Pozo", "Caravana", "Oasis", "Emirato", "Ruta", "Pólvora", "Refinería", "Metrópoli", "Espejo", "Velero solar"],
  hielo: ["Iglú", "Fuego bajo", "Pueblo", "Trineo", "Fortín", "Ballenero", "Caldera", "Cúpula", "Radar", "Arca"],
  jungla: ["Nido", "Clan", "Tala", "Templo", "Camino", "Tinta", "Aserradero", "Puerto", "Satélite", "Dosel"],
  lava: ["Grieta", "Forja", "Bastión", "Fundición", "Cañón", "Vapor negro", "Reactor", "Escoria", "Plasma", "Sol cautivo"],
  cristal: ["Astilla", "Coro", "Aguja", "Catedral", "Prisma", "Lente", "Red de luz", "Ciudad clara", "Orbital", "Mente"],
  carne: ["Llaga", "Rebaño", "Púlpito", "Estómago", "Procesión", "Cirujano", "Criadero", "Ciudad húmeda", "Nervio", "Útero"],
  oceano: ["Balsa", "Redes", "Isla", "Flota", "Puerto", "Astillero", "Vapor", "Ciudad flotante", "Abismo", "Arrecife"],
};

export function eraName(kind: Kind, era: number) {
  const list = ERAS[kind];
  return list[Math.max(0, Math.min(list.length - 1, era))] ?? "Era";
}

export function siteLevel(era: number) {
  if (era <= 1) return 0;
  if (era <= 3) return 1;
  if (era <= 6) return 2;
  return 3;
}

const FIRST = [
  "Ada", "Bruno", "Ciro", "Dalia", "Eco", "Farah", "Gael", "Hilda", "Ivo", "Juno", "Kael", "Luz", "Milo", "Nara",
  "Otto", "Paz", "Quira", "Rita", "Saúl", "Tova", "Uma", "Vera", "Nilo", "Yara", "Zoe", "León", "Mar", "Iris",
  "Teo", "Noa", "Rui", "Sol", "Eva", "Ian", "Lía", "Omar", "Inés", "Asa", "Ruth", "Enzo", "Boreal", "Cala",
];

const ALIEN = ["Tallo", "Nudo", "Hueco", "Cosa", "Limo", "Vacio", "Diente", "Sombra"];

export function personName(rng: () => number, used: Set<string>, alien = false) {
  const pool = alien ? ALIEN : FIRST;
  let name = pool[(rng() * pool.length) | 0] ?? "Nadie";
  for (let i = 2; used.has(name) && i < 40; i++) name = `${pool[(rng() * pool.length) | 0] ?? "N"} ${i}`;
  used.add(name);
  return name;
}

const LEFT = ["Bruma", "Óseo", "Nacre", "Umbral", "Cendra", "Velo", "Raíz", "Fauces", "Lumen", "Salitre"];
const RIGHT = ["quieta", "roja", "hundida", "ciega", "viva", "fría", "alta", "nueva", "lenta", "amarga"];

export function civName(rng: () => number, used: Set<string>) {
  let name = `${LEFT[(rng() * LEFT.length) | 0]} ${RIGHT[(rng() * RIGHT.length) | 0]}`;
  for (let i = 2; used.has(name) && i < 30; i++) {
    name = `${LEFT[(rng() * LEFT.length) | 0]} ${RIGHT[(rng() * RIGHT.length) | 0]} ${i}`;
  }
  used.add(name);
  return name;
}
