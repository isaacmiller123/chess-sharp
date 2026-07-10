// Bundling entry for scripts/test-theater.mjs's module smoke: re-export the
// theater-facing 3D surface so esbuild resolves the whole three/R3F tree.
export { TheaterRig } from '../../src/renderer/src/games/three/TheaterRig'
export { Tabletop3D } from '../../src/renderer/src/games/three/Tabletop3D'
export { default as GameBoard3D, occupancyOf } from '../../src/renderer/src/games/three/GameBoard3D'
