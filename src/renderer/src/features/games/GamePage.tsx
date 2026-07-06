import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { ArrowLeft, BookOpen, Bot, Globe, Swords, Users } from 'lucide-react'
import { Board } from '../../board/Board'
import { pieceSetClass } from '../../board/pieceSets'
import { useSettings } from '../../state/settings'
import type { CatalogEntry } from './catalog'
import { ArtThumb } from './ArtThumb'
import { ManualPane } from './ManualPane'
import { VariantOtb } from './VariantOtb'

type PageTab = 'play' | 'manual'
type PlayMode = 'bot' | 'otb' | 'online'

/**
 * Per-game page: hero + Play (vs Bot / Local OTB / Online) + Manual.
 * Local OTB is wired end-to-end for the chessops variant wave; vs Bot and
 * Online surface "landing in P2" toasts. TODO(P2): parameterize the existing
 * PlayView machinery (SetupCard/GameView/OnlineTab) by game kind via the
 * kernel registry so all three modes share the chess Play experience.
 */
export function GamePage({ entry, onBack }: { entry: CatalogEntry; onBack: () => void }): JSX.Element {
  const { settings } = useSettings()
  const [tab, setTab] = useState<PageTab>('play')
  const [mode, setMode] = useState<PlayMode | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
    },
    []
  )

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2600)
  }, [])

  const pickMode = useCallback(
    (m: PlayMode) => {
      if (entry.status !== 'playable') {
        showToast(`${entry.title} is landing in P2 — the board is being carved.`)
        return
      }
      if (m === 'otb' && entry.otbReady) {
        setMode('otb')
        return
      }
      if (m === 'otb') {
        showToast('Crazyhouse pockets need the chessgroundx board — landing in P2.')
        return
      }
      // TODO(P2): vs Bot via Fairy-Stockfish provider + Online via OnlineTab
      // parameterized by kind (wire v4 start config carries the game kind).
      showToast(
        m === 'bot'
          ? `Bots for ${entry.title} are landing in P2 (Fairy-Stockfish, 5 levels).`
          : `Online ${entry.title} is landing in P2 — join codes will carry the game.`
      )
    },
    [entry, showToast]
  )

  const playable = entry.status === 'playable'

  return (
    <div className="game-page">
      <button type="button" className="game-back" onClick={mode ? () => setMode(null) : onBack}>
        <ArrowLeft size={15} aria-hidden />
        {mode ? `${entry.title} — modes` : 'All games'}
      </button>

      {mode === 'otb' ? (
        <VariantOtb entry={entry} />
      ) : (
        <>
          <header className="game-hero">
            <div className="game-hero-visual" aria-hidden>
              {entry.thumbFen ? (
                <div className={`board-wrap board-${settings.boardTheme} ${pieceSetClass(settings.pieceSet)} game-hero-board`}>
                  <Board
                    fen={entry.thumbFen}
                    orientation="white"
                    turnColor="white"
                    dests={new Map()}
                    viewOnly
                    coordinates={false}
                    animation={false}
                  />
                </div>
              ) : (
                <ArtThumb kind={entry.kind} />
              )}
            </div>
            <div className="game-hero-copy">
              <div className="game-hero-titlerow">
                <h2>{entry.title}</h2>
                {!playable && <span className="pill-p2">P2</span>}
              </div>
              <p className="game-hero-tagline">{entry.tagline}</p>
              <div className="game-tabs" role="tablist" aria-label={`${entry.title} sections`}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'play'}
                  className={`game-tab${tab === 'play' ? ' is-active' : ''}`}
                  onClick={() => setTab('play')}
                >
                  <Swords size={15} aria-hidden /> Play
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'manual'}
                  className={`game-tab${tab === 'manual' ? ' is-active' : ''}`}
                  onClick={() => setTab('manual')}
                >
                  <BookOpen size={15} aria-hidden /> Manual
                </button>
              </div>
            </div>
          </header>

          {tab === 'play' ? (
            <div className="game-modes">
              <button type="button" className="mode-card" onClick={() => pickMode('bot')}>
                <span className="mode-icon"><Bot size={22} aria-hidden /></span>
                <span className="mode-name">vs Bot</span>
                <span className="mode-desc">Five strength levels, engine-backed</span>
                <span className="mode-status is-p2">P2</span>
              </button>
              <button type="button" className="mode-card" onClick={() => pickMode('otb')}>
                <span className="mode-icon"><Users size={22} aria-hidden /></span>
                <span className="mode-name">Local OTB</span>
                <span className="mode-desc">Two players, one machine, auto-flip</span>
                {playable && entry.otbReady ? (
                  <span className="mode-status is-live">Play now</span>
                ) : (
                  <span className="mode-status is-p2">P2</span>
                )}
              </button>
              <button type="button" className="mode-card" onClick={() => pickMode('online')}>
                <span className="mode-icon"><Globe size={22} aria-hidden /></span>
                <span className="mode-name">Online</span>
                <span className="mode-desc">Peer-to-peer with a join code</span>
                <span className="mode-status is-p2">P2</span>
              </button>
            </div>
          ) : (
            <ManualPane entry={entry} />
          )}
        </>
      )}

      {toast && (
        <div className="games-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  )
}
