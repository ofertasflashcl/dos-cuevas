# Dos Cuevas

Código del juego de planeta y civilización. Canvas 2D, TypeScript. No es un motor de terceros.

Empieza por `src/components/cosmos-app.tsx`. La ruta `/` monta esa pantalla (`src/routes/index.tsx`).

| Archivo | Qué es |
| --- | --- |
| `src/cosmos/sim.ts` | El día: gente, bestias, necesidades, tareas, crónica |
| `src/cosmos/draw.ts` | Cómo se pinta el planeta, la noche, las casas, el sistema solar |
| `src/cosmos/chunks.ts` | Mundo infinito por columnas. `columnAt` es el suelo de verdad |
| `src/cosmos/planet.ts` | Planetas, biomas, sitios |
| `src/cosmos/folk.ts` | Cuerpo de la gente cuando no hay sprite |
| `src/cosmos/creature.ts` | Cuerpo de las bestias cuando no hay sprite |
| `src/cosmos/art.ts` | Carga las hojas de `public/cosmos/` |
| `src/cosmos/types.ts` | Persona, bestia, mundo, necesidades |
| `src/cosmos/geo.ts` | Tamaño del mapa y números de cada terreno |
| `src/cosmos/names.ts` | Nombres |
| `src/cosmos/voxel-skin.ts` | Colores de cada baldosa |
| `src/cosmos/noise.ts` | Ruido del terreno |

Los dibujos (gente, casas, árboles, terreno) son PNG en `public/cosmos/`. No están en este repo: pesan demasiado para leerlos como texto. El juego los pide así: `/cosmos/folk-walk.png`, `woman-walk.png`, `child-walk.png`, `work.png`, `deer-walk.png`, `wolf-walk.png`, `houses.png`, `bird-fly.png`, `boat.png`, `trees.png`, `terrain.png`.

Para leer un archivo desde otro Grok, usa la URL cruda. Ejemplo:

https://raw.githubusercontent.com/ofertasflashcl/dos-cuevas/main/src/cosmos/sim.ts
