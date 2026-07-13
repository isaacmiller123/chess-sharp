// ReviewStore implementations (web port W3 — build contract AGENT-CLIENT).
//
// The W2 engine layer computes reviews CLIENT-side (src/web/engines) and
// persists through the ReviewStore seam its contract file defines. Two
// implementations live here plus a delegator that picks per-call on auth
// state (auth state is constant for a page lifetime — user-driven changes
// reload — but the delegator also keeps a mid-session 401 flip coherent):
//
//   localReviewStore — logged out: localStorage, LRU-capped at 40 reviews
//     (reviews are the biggest client payload: tens of KB of move evals per
//     game; 40 keeps well under localStorage quota, and on a quota error the
//     tail is evicted until the write fits).
//   httpReviewStore  — logged in: POST /api/review/save + GET /api/review/:id
//     (auth-only; the server also marks accuracy on the game row on save).

import type { GameReview, ReviewMoveEval } from '@shared/types'
import type { ReviewStore } from './engines'
import { authStore } from './authStore'
import { HttpError, reviewLoadHttp, reviewSaveHttp } from './http'
import { setLocalGameAccuracy, storageGet, storageRemove, storageSet } from './localData'

const REVIEWS_KEY = 'chess-sharp.reviews'
export const LOCAL_REVIEWS_CAP = 40

interface StoredReviews {
  /** Most-recently-used first. */
  order: number[]
  byGame: Record<string, GameReview>
}

function readReviews(): StoredReviews {
  const raw = storageGet(REVIEWS_KEY)
  if (!raw) return { order: [], byGame: {} }
  try {
    const p = JSON.parse(raw) as StoredReviews
    return {
      order: Array.isArray(p.order) ? p.order : [],
      byGame: p.byGame && typeof p.byGame === 'object' ? p.byGame : {}
    }
  } catch {
    return { order: [], byGame: {} }
  }
}

function evictTail(store: StoredReviews): void {
  const evicted = store.order.pop()
  if (evicted !== undefined) delete store.byGame[String(evicted)]
}

function localStorageWritable(): boolean {
  try {
    window.localStorage.setItem('chess-sharp.probe', '1')
    window.localStorage.removeItem('chess-sharp.probe')
    return true
  } catch {
    return false
  }
}

function writeReviews(store: StoredReviews): void {
  while (store.order.length > LOCAL_REVIEWS_CAP) evictTail(store)
  if (!localStorageWritable()) {
    // Private mode / storage disabled: session-lifetime memory fallback.
    storageSet(REVIEWS_KEY, JSON.stringify(store))
    return
  }
  // Quota-safe write: evict the LRU tail until the payload fits.
  for (;;) {
    try {
      window.localStorage.setItem(REVIEWS_KEY, JSON.stringify(store))
      return
    } catch {
      if (store.order.length === 0) return // nothing left to shed — drop the write
      evictTail(store)
    }
  }
}

function bumpToFront(store: StoredReviews, gameId: number): void {
  store.order = [gameId, ...store.order.filter((id) => id !== gameId)]
}

export const localReviewStore: ReviewStore = {
  async save(gameId, review) {
    // A pgn-only review (no stored game) has nothing to key a later lookup on;
    // the caller still gets the full review object back from review.run.
    if (gameId == null) return { reviewId: null }
    const store = readReviews()
    store.byGame[String(gameId)] = review
    bumpToFront(store, gameId)
    writeReviews(store)
    // Desktop parity (ipc/review.ipc.ts): a gameId review marks per-side
    // accuracy on the game row.
    setLocalGameAccuracy(gameId, review.white.accuracy, review.black.accuracy)
    return { reviewId: gameId }
  },

  async load(gameId) {
    const store = readReviews()
    const review = store.byGame[String(gameId)] ?? null
    if (review) {
      bumpToFront(store, gameId)
      writeReviews(store)
    }
    return { review, moveEvals: review?.moveEvals ?? [] }
  },

  async markAccuracy(gameId, white, black) {
    setLocalGameAccuracy(gameId, white, black)
  }
}

export const httpReviewStore: ReviewStore = {
  async save(gameId, review) {
    const res = (await reviewSaveHttp(gameId, review)) as { reviewId?: unknown } | null
    return { reviewId: typeof res?.reviewId === 'number' ? res.reviewId : null }
  },

  async load(gameId) {
    let res: { review: GameReview | null; moveEvals: ReviewMoveEval[] }
    try {
      res = await reviewLoadHttp(gameId)
    } catch (err) {
      // "No review yet" must read as the empty shape, exactly like desktop
      // review:get on an unreviewed game — not an error toast.
      if (err instanceof HttpError && err.status === 404) return { review: null, moveEvals: [] }
      throw err
    }
    return {
      review: res?.review ?? null,
      moveEvals: Array.isArray(res?.moveEvals) ? res.moveEvals : []
    }
  },

  async markAccuracy() {
    // POST /api/review/save marks accuracy on the game row server-side
    // (build contract §5) — nothing further per-call.
  }
}

/** The store handed to createReviewApi/createPerfApi: routes per-call so a
 *  mid-session 401 sign-out cleanly lands subsequent saves in local storage. */
export const reviewStore: ReviewStore = {
  save: (gameId, review) => active().save(gameId, review),
  load: (gameId) => active().load(gameId),
  markAccuracy: (gameId, white, black) =>
    (active().markAccuracy ?? (async () => {}))(gameId, white, black)
}

function active(): ReviewStore {
  return authStore.isAuthed() ? httpReviewStore : localReviewStore
}

/** app:resetProgress (logged out, 'games' scope) wipes cached local reviews. */
export function clearLocalReviews(): void {
  storageRemove(REVIEWS_KEY)
}
