import { useCallback, useEffect, useState } from 'react'
import type { GameRow, ProgressSummary, RatingValue } from '../../../../shared/types'

export interface ProgressData {
  summary: ProgressSummary | null
  puzzleRating: RatingValue | null
  vsBotRating: RatingValue | null
  /** A wider, recent window of games used only for the trend sparkline. */
  trendGames: GameRow[]
}

const EMPTY: ProgressData = {
  summary: null,
  puzzleRating: null,
  vsBotRating: null,
  trendGames: []
}

/** Games fetched for the trend sparkline (newest-first, capped). */
const TREND_WINDOW = 40

/**
 * Loads the progress payload (summary, both ratings, a recent-games window for
 * the trend) in parallel. Uses Promise.allSettled so one failing IPC channel
 * degrades only its own section. Tolerates window.api being undefined (browser
 * preview) and unmount. `reload` re-runs the fetch (e.g. after pagination saves
 * nothing, but kept for parity / manual refresh).
 */
export function useProgressData(): {
  data: ProgressData
  loading: boolean
  reload: () => void
} {
  const [data, setData] = useState<ProgressData>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false
    const api = window.api
    if (!api) {
      setLoading(false)
      return
    }
    setLoading(true)

    void (async () => {
      const [summaryR, puzzleR, vsBotR, trendR] = await Promise.allSettled([
        api.progress.summary(),
        api.ratings.get('puzzle'),
        api.ratings.get('vs-bot'),
        api.games.list({ limit: TREND_WINDOW, offset: 0 })
      ])
      if (cancelled) return

      setData({
        summary: summaryR.status === 'fulfilled' ? summaryR.value : null,
        puzzleRating: puzzleR.status === 'fulfilled' ? puzzleR.value : null,
        vsBotRating: vsBotR.status === 'fulfilled' ? vsBotR.value : null,
        trendGames: trendR.status === 'fulfilled' ? (trendR.value.games ?? []) : []
      })
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [nonce])

  return { data, loading, reload }
}

export interface GamesPage {
  games: GameRow[]
  loading: boolean
  /** True while the very first page is loading (used for the skeleton state). */
  initial: boolean
  /** Whether a next page is likely available (we fetched a full page). */
  hasMore: boolean
}

/**
 * Paginated "My Games" loader. Fetches `pageSize` rows at `offset`. We infer
 * `hasMore` from a full page (no count endpoint exists in the contract).
 */
export function useGamesPage(offset: number, pageSize: number): GamesPage {
  const [state, setState] = useState<GamesPage>({
    games: [],
    loading: true,
    initial: true,
    hasMore: false
  })

  useEffect(() => {
    let cancelled = false
    const api = window.api
    if (!api) {
      setState((s) => ({ ...s, loading: false, initial: false }))
      return
    }
    setState((s) => ({ ...s, loading: true }))

    void (async () => {
      try {
        const res = await api.games.list({ limit: pageSize, offset })
        if (cancelled) return
        const games = res.games ?? []
        setState({
          games,
          loading: false,
          initial: false,
          hasMore: games.length === pageSize
        })
      } catch {
        if (cancelled) return
        setState({ games: [], loading: false, initial: false, hasMore: false })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [offset, pageSize])

  return state
}
