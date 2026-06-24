import { useEffect, useState } from 'react'
import type { CurriculumBand } from '../../../../shared/types'

export type CurriculumStatus = 'loading' | 'ready' | 'empty' | 'error'

export interface CurriculumState {
  status: CurriculumStatus
  bands: CurriculumBand[]
}

/**
 * Loads the lesson curriculum tree from the main process once on mount.
 * Guarded against a missing `window.api` so the view degrades gracefully
 * (e.g. when rendered outside the Electron shell). Bands are returned in
 * `order`, defensively re-sorted in case the backend ever ships unordered.
 */
export function useCurriculum(): CurriculumState {
  const [state, setState] = useState<CurriculumState>({ status: 'loading', bands: [] })

  useEffect(() => {
    const api = window.api?.curriculum
    if (!api) {
      setState({ status: 'error', bands: [] })
      return
    }
    let cancelled = false
    api
      .tree()
      .then(({ bands }) => {
        if (cancelled) return
        const sorted = [...bands].sort((a, b) => a.order - b.order)
        setState({ status: sorted.length > 0 ? 'ready' : 'empty', bands: sorted })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', bands: [] })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return state
}
