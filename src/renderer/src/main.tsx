import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'

// chessground board + cburnett pieces (embedded, fully offline)
import 'chessground/assets/chessground.base.css'
import 'chessground/assets/chessground.brown.css'
import 'chessground/assets/chessground.cburnett.css'

import './styles/tokens.css'
import './styles/global.css'
import './styles/app.css'
import './styles/pieces.css'

function mount(): void {
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  )
}

// Preview-only test harness: when opened in a plain browser with `?mock` and no
// real preload bridge, install a fake window.api so the UI is fully driveable.
// The packaged desktop app always has window.api, so this never runs there.
const wantMock =
  typeof window !== 'undefined' &&
  !window.api &&
  new URLSearchParams(window.location.search).has('mock')

if (wantMock) {
  import('./devMock')
    .then((m) => m.installMock())
    .catch(() => undefined)
    .finally(mount)
} else {
  mount()
}
