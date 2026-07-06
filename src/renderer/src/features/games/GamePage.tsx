import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { ArrowLeft, BookOpen, Bot, Globe, Swords, Users } from 'lucide-react'
import { Board } from '../../board/Board'
import { pieceSetClass } from '../../board/pieceSets'
import { useSettings } from '../../state/settings'
import type { GameKind } from '../../games/kernel'
import { isRegisteredGame } from '../../games/registry'
import OnlineTab from '../play/OnlineTab'
import type { CatalogEntry } from './catalog'
import { ArtThumb } from './ArtThumb'
import { KernelOtb } from './KernelOtb'
import { ManualPane } from './ManualPane'
import { VariantBot } from './VariantBot'
import { VariantOtb } from './VariantOtb'

type PageTab = 'play' | 'manual'
type PlayMode = 'bot' | 'otb' | 'online'

/** Catalog kinds that predate the kernel registry's naming. */
const REGISTRY_ALIAS: Record<string, GameKind> = { 'checkers-8': 'checkers', ttt: 'tictactoe' }

/** The registry kind for a catalog entry, or null when this build has no
 *  kernel for it (Online then keeps its "landing in P2" toast). */
function registryKind(entry: CatalogEntry): GameKind | null {
  if (isRegisteredGame(entry.kind)) return entry.kind
  const alias = REGISTRY_ALIAS[entry.kind]
  return alias !== undefined && isRegisteredGame(alias) ? alias : null
}

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

  const onlineKind = registryKind(entry)

  const pickMode = useCallback(
    (m: PlayMode) => {
      // Online: any kernel-registered game — the OnlineTab below is pre-seeded
      // with this kind (wire v4 start config carries it to the joiner).
      if (m === 'online') {
        if (onlineKind) {
          setMode('online')
        } else {
          showToast(`Online ${entry.title} is landing in P2 — join codes will carry the game.`)
        }
        return
      }
      if (entry.status !== 'playable') {
        showToast(`${entry.title} is landing in P2 — the board is being carved.`)
        return
      }
      if ((m === 'otb' || m === 'bot') && !entry.otbReady) {
        showToast(`The ${entry.title} board is landing in P2 — it is being carved.`)
        return
      }
      if (m === 'otb') {
        setMode('otb')
        return
      }
      if (m === 'bot' && entry.family === 'chess') {
        // Chess-family wave: 5-level Fairy-Stockfish via games/bots.ts.
        // (Standard chess lives in the Play tab's richer PlayView, not here.)
        setMode('bot')
        return
      }
      // TODO(P2): non-chess vs Bot via the generic kernel board views (the
      // providers in games/bots.ts are ready).
      showToast(`Bots for ${entry.title} are landing in P2 — the board is being carved.`)
    },
    [entry, onlineKind, showToast]
  )

  const playable = entry.status === 'playable'
  const botReady = playable && entry.otbReady === true && entry.family === 'chess'

  return (
    <div className="game-page">
      <button type="button" className="game-back" onClick={mode ? () => setMode(null) : onBack}>
        <ArrowLeft size={15} aria-hidden />
        {mode ? `${entry.title} — modes` : 'All games'}
      </button>

      {mode === 'otb' ? (
        // The chess family (chessops + ffish waves, incl. runtime customs)
        // keeps its dedicated view (side naming, janggi pass, 960 reshuffle);
        // every other family plays through the generic kernel owner
        // (go sizes/scoring, hex swap, ...).
        entry.family === 'chess' ? (
          <VariantOtb entry={entry} />
        ) : (
          <KernelOtb entry={entry} />
        )
      ) : mode === 'bot' ? (
        <VariantBot entry={entry} onToast={showToast} />
      ) : mode === 'online' && onlineKind ? (
        <div className="game-online">
          <OnlineTab initialGameKind={onlineKind} />
        </div>
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
                {botReady ? (
                  <span className="mode-status is-live">Play now</span>
                ) : (
                  <span className="mode-status is-p2">P2</span>
                )}
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
                {onlineKind ? (
                  <span className="mode-status is-live">Play now</span>
                ) : (
                  <span className="mode-status is-p2">P2</span>
                )}
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
