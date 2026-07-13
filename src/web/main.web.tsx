// Web entry (docs/WEB-PORT-SPEC.md): install the web `Api` implementation,
// resolve the session, then boot the UNCHANGED renderer. The import of
// '@/main' is dynamic so `window.api` (and the platform flag below) are
// guaranteed to exist before any renderer module evaluates — static imports
// would hoist above the assignments.

import { webApi } from './webApi'
import { authStore } from './authStore'

declare global {
  interface Window {
    __gamesArtBase?: string
    __chessSharpWeb?: boolean
  }
}

// Platform flag for renderer copy (src/renderer/src/platform.ts reads it).
// MUST be set before '@/main' evaluates any renderer module.
window.__chessSharpWeb = true

window.api = webApi

// Production: the web server statically serves resources/games-art at
// /games-art (server/index.ts), and games/three/artLoader.ts documents this
// pre-set global as its highest-priority hook — 3D PBR textures work without
// any Electron path probing. Dev: leave it unset; the renderer's own /@fs
// sentinel mechanism (games/art.ts) resolves against the Vite dev server.
if (!import.meta.env.DEV) {
  window.__gamesArtBase = '/games-art'
}

async function boot(): Promise<void> {
  // Resolve the session cookie BEFORE the renderer boots: webApi routes every
  // user-data namespace on auth state at call time, so the first settings/
  // games reads must already know whether an account is live. boot() never
  // rejects (offline / dev-without-server resolves to logged-out local mode).
  await authStore.boot()
  await import('@/main')
  // The account chip is its own React root, mounted after the renderer so the
  // design-token stylesheet is loaded (the chip's CSS carries dark fallbacks
  // regardless). A chip failure must never blank a working app — log only.
  import('./account/mount')
    .then((m) => m.mountAccountRoot())
    .catch((err) => console.error('Chess# account chip failed to mount', err))
}

// A failed chunk load (flaky network, mid-deploy refresh) must say so — an
// uncaught boot rejection would leave a silent blank page.
boot().catch((err) => {
  console.error('Chess# failed to boot', err)
  const root = document.getElementById('root')
  if (root) {
    root.innerHTML =
      '<p style="font:14px system-ui,sans-serif;padding:2em">' +
      'Chess# failed to load — please refresh the page.</p>'
  }
})
