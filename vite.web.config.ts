import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// Web-target build (docs/WEB-PORT-SPEC.md): the UNCHANGED renderer compiled as
// a plain SPA against src/web/main.web.tsx (which installs the web `Api`
// implementation before booting '@/main'). Fully separate from
// electron.vite.config.ts — the desktop build never reads this file.
//
// COOP/COEP headers: multi-threaded Stockfish WASM (W2) needs
// SharedArrayBuffer, which browsers only enable in a crossOriginIsolated
// context. The production server (server/index.ts) sets the same two headers;
// setting them on the dev/preview servers too means dev === prod isolation
// semantics from day one.

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as {
  version: string
}

const CROSS_ORIGIN_ISOLATION = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp'
}

// Engine WASM assets (web port W2, src/web/engines): copied verbatim to
// <outDir>/engines/ on build AND served at /engines/ by the dev server
// (vite-plugin-static-copy does both), so the engine workers load same-origin
// — which is what COEP require-corp demands and what lets the multithreaded
// builds spawn their nested pthread workers.
//
//  - stockfish-18-lite[.js/.wasm]        chess: multithreaded, small NNUE
//                                        EMBEDDED (~7 MB — no separate net).
//  - stockfish-18-lite-single[.js/.wasm] chess fallback when the page is not
//                                        crossOriginIsolated.
//    (each stockfish.js worker resolves its .wasm as <same basename>.wasm
//     next to the script — the js/wasm pairs MUST stay together)
//  - fairy/*                             Fairy-Stockfish 14 (pychess build):
//                                        UMD script + wasm + its pthread
//                                        worker glue (stockfish.worker.js),
//                                        kept in their own dir because all
//                                        three files resolve relative paths.
// (rename stripBase flattens the copies to <dest>/<basename> — without it the
// plugin recreates the whole node_modules/... path under dest.)
const ENGINE_ASSETS = [
  ...[
    'stockfish-18-lite.js',
    'stockfish-18-lite.wasm',
    'stockfish-18-lite-single.js',
    'stockfish-18-lite-single.wasm'
  ].map((f) => ({
    src: resolve(__dirname, 'node_modules/stockfish/bin', f),
    dest: 'engines',
    rename: { stripBase: true as const }
  })),
  ...['stockfish.js', 'stockfish.wasm', 'stockfish.worker.js'].map((f) => ({
    src: resolve(__dirname, 'node_modules/fairy-stockfish-nnue.wasm', f),
    dest: 'engines/fairy',
    rename: { stripBase: true as const }
  }))
]

export default defineConfig({
  root: resolve(__dirname, 'src/web'),
  publicDir: false,
  define: {
    __WEB_APP_VERSION__: JSON.stringify(pkg.version)
  },
  server: {
    port: 5199,
    headers: CROSS_ORIGIN_ISOLATION,
    // games/art.ts resolves resources/games-art via /@fs in dev; allow the
    // whole repo explicitly so outside-root asset URLs never 403 (same
    // allowance as electron.vite.config.ts).
    fs: { allow: [resolve(__dirname)] }
  },
  preview: {
    port: 5199,
    headers: CROSS_ORIGIN_ISOLATION
  },
  build: {
    outDir: resolve(__dirname, 'dist-web'),
    emptyOutDir: true,
    rollupOptions: {
      input: { index: resolve(__dirname, 'src/web/index.html') }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src'),
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  plugins: [react(), viteStaticCopy({ targets: ENGINE_ASSETS })]
})
