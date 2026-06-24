import { useEffect, useState } from 'react'
import type { GameRow, ProgressSummary, RatingValue } from '../../../../shared/types'

export interface HomeData {
  summary: ProgressSummary | null
  games: GameRow[]
  puzzleRating: RatingValue | null
  vsBotRating: RatingValue | null
}

export interface UseHomeDataResult {
  data: HomeData
  loading: boolean
}

const EMPTY: HomeData = {
  summary: null,
  games: [],
  puzzleRating: null,
  vsBotRating: null
}

/**
 * Loads the dashboard payload (progress summary, recent games, both ratings) in
 * parallel. Uses Promise.allSettled so one failing IPC channel degrades only its
 * own card. Tolerates window.api being undefined (browser preview) and unmount.
 */
export function useHomeData(): UseHomeDataResult {
  const [data, setData] = useState<HomeData>(EMPTY)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const api = window.api
    if (!api) {
      setLoading(false)
      return
    }

    void (async () => {
      const [summaryR, gamesR, puzzleR, vsBotR] = await Promise.allSettled([
        api.progress.summary(),
        api.games.list({ limit: 5 }),
        api.ratings.get('puzzle'),
        api.ratings.get('vs-bot')
      ])
      if (cancelled) return

      setData({
        summary: summaryR.status === 'fulfilled' ? summaryR.value : null,
        games: gamesR.status === 'fulfilled' ? (gamesR.value.games ?? []) : [],
        puzzleRating: puzzleR.status === 'fulfilled' ? puzzleR.value : null,
        vsBotRating: vsBotR.status === 'fulfilled' ? vsBotR.value : null
      })
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return { data, loading }
}
