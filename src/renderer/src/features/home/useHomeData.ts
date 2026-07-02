import { useEffect, useState } from 'react'
import type {
  GameRow,
  ProgressSummary,
  RatingValue,
  SchoolChapterMeta,
  SchoolMastery
} from '../../../../shared/types'

export interface HomeData {
  summary: ProgressSummary | null
  games: GameRow[]
  puzzleRating: RatingValue | null
  vsBotRating: RatingValue | null
  chapters: SchoolChapterMeta[]
  mastery: SchoolMastery | null
}

export interface UseHomeDataResult {
  data: HomeData
  loading: boolean
  /**
   * Baseline of solved puzzles captured the first time the app loaded the
   * dashboard this run. `summary.puzzlesSolved - sessionBaseline` yields a
   * best-effort "this session" count without a dedicated IPC channel.
   */
  sessionBaseline: number | null
}

const EMPTY: HomeData = {
  summary: null,
  games: [],
  puzzleRating: null,
  vsBotRating: null,
  chapters: [],
  mastery: null
}

/**
 * Module-scoped baseline of `puzzlesSolved`, captured once per app run (the
 * first dashboard load that yields a summary). Persists across HomeView
 * mount/unmount within the same session, reset only on full reload.
 */
let sessionSolvedBaseline: number | null = null

/**
 * Loads the dashboard payload (progress summary, recent games, both ratings,
 * curriculum tree) in parallel. Uses Promise.allSettled so one failing IPC
 * channel degrades only its own card. Tolerates window.api being undefined
 * (browser preview) and unmount.
 */
export function useHomeData(): UseHomeDataResult {
  const [data, setData] = useState<HomeData>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [sessionBaseline, setSessionBaseline] = useState<number | null>(sessionSolvedBaseline)

  useEffect(() => {
    let cancelled = false
    const api = window.api
    if (!api) {
      setLoading(false)
      return
    }

    void (async () => {
      const [summaryR, gamesR, puzzleR, vsBotR, chaptersR, masteryR] = await Promise.allSettled([
        api.progress.summary(),
        api.games.list({ limit: 5 }),
        api.ratings.get('puzzle'),
        api.ratings.get('vs-bot'),
        api.school?.chapters?.() ?? Promise.resolve({ chapters: [] }),
        api.school?.mastery?.() ?? Promise.resolve(null)
      ])
      if (cancelled) return

      const summary = summaryR.status === 'fulfilled' ? summaryR.value : null

      // Capture the per-run baseline exactly once, the first time we learn the
      // total. Subsequent loads compare against this frozen value.
      if (summary && sessionSolvedBaseline === null) {
        sessionSolvedBaseline = Number.isFinite(summary.puzzlesSolved)
          ? summary.puzzlesSolved
          : 0
        setSessionBaseline(sessionSolvedBaseline)
      }

      setData({
        summary,
        games: gamesR.status === 'fulfilled' ? (gamesR.value.games ?? []) : [],
        puzzleRating: puzzleR.status === 'fulfilled' ? puzzleR.value : null,
        vsBotRating: vsBotR.status === 'fulfilled' ? vsBotR.value : null,
        chapters: chaptersR.status === 'fulfilled' ? (chaptersR.value.chapters ?? []) : [],
        mastery: masteryR.status === 'fulfilled' ? masteryR.value : null
      })
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return { data, loading, sessionBaseline }
}
