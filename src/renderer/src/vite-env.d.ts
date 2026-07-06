/// <reference types="vite/client" />

// ffish-es6 ships no exports map; games/ffish.ts imports the wasm asset as a
// URL for the emscripten locateFile hook (Vite handles the ?url suffix).
declare module 'ffish-es6/ffish.wasm?url' {
  const url: string
  export default url
}
