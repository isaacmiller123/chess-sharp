import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

// chessground board + cburnett pieces (embedded, fully offline)
import 'chessground/assets/chessground.base.css'
import 'chessground/assets/chessground.brown.css'
import 'chessground/assets/chessground.cburnett.css'

import './styles/tokens.css'
import './styles/global.css'
import './styles/app.css'
import './styles/pieces.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
