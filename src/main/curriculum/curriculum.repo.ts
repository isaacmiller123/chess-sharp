import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

// Curriculum tree (beginner -> ~2000 Elo) authored in
// resources/curriculum/curriculum.json, derived from docs/content-coaching.md
// section 1. Loaded lazily and cached for the process. Mirrors the resource-load
// pattern in src/main/openings/openings.repo.ts: in dev __dirname is
// <root>/out/main and ../../resources resolves to the repo's resources dir; in a
// packaged build the JSON ships under process.resourcesPath/curriculum.

export type LessonKind = 'concept' | 'tactics' | 'endgame' | 'opening' | 'strategy'

export interface CurriculumLesson {
  id: string
  title: string
  summary: string
  objectives: string[]
  /** Puzzle theme keys (Lichess taxonomy) drilled by this lesson. */
  linkedThemes: string[]
  /** Inclusive [lo, hi] puzzle-Glicko difficulty window. */
  ratingRange: [number, number]
  kind: LessonKind
}

export interface CurriculumUnit {
  id: string
  order: number
  title: string
  goal: string
  lessons: CurriculumLesson[]
}

export interface CurriculumBand {
  id: string
  order: number
  label: string
  /** User-Glicko estimate required to unlock the band. */
  ratingFloor: number
  /** Inclusive [lo, hi] band rating window. */
  ratingRange: [number, number]
  goal: string
  units: CurriculumUnit[]
}

export interface Curriculum {
  version: string
  puzzleDbSnapshot: string
  bands: CurriculumBand[]
}

// Authored interactive content (resources/curriculum/lessons-content.json),
// keyed by lesson id. Example FENs are legality-validated at build time.
export interface LessonExample {
  fen: string
  title: string
  explanation: string
}
export interface LessonContent {
  intro: string
  examples: LessonExample[]
  keyPoints: string[]
}

let curriculum: Curriculum | null = null
let lessonIndex: Map<string, CurriculumLesson> | null = null
let contentMap: Record<string, LessonContent> | null = null

function curriculumPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'curriculum', 'curriculum.json')
    : path.join(__dirname, '../../resources/curriculum/curriculum.json')
}

function load(): Curriculum {
  if (!curriculum) {
    try {
      const raw = fs.readFileSync(curriculumPath(), 'utf-8')
      curriculum = JSON.parse(raw) as Curriculum
    } catch {
      // Missing/corrupt data must not crash the UI - treat as an empty tree.
      curriculum = { version: '0', puzzleDbSnapshot: '', bands: [] }
    }
  }
  return curriculum
}

function index(): Map<string, CurriculumLesson> {
  if (!lessonIndex) {
    const map = new Map<string, CurriculumLesson>()
    for (const band of load().bands) {
      for (const unit of band.units) {
        for (const item of unit.lessons) {
          map.set(item.id, item)
        }
      }
    }
    lessonIndex = map
  }
  return lessonIndex
}

/** The full band -> unit -> lesson tree. */
export function tree(): CurriculumBand[] {
  return load().bands
}

/** Look up a single lesson by its stable id. */
export function lesson(id: string): CurriculumLesson | null {
  return index().get(id) ?? null
}

function loadContent(): Record<string, LessonContent> {
  if (!contentMap) {
    try {
      const p = app.isPackaged
        ? path.join(process.resourcesPath, 'curriculum', 'lessons-content.json')
        : path.join(__dirname, '../../resources/curriculum/lessons-content.json')
      contentMap = JSON.parse(fs.readFileSync(p, 'utf-8')) as Record<string, LessonContent>
    } catch {
      contentMap = {}
    }
  }
  return contentMap
}

/** Interactive teaching content (intro + example positions + key points) for a lesson. */
export function lessonContent(id: string): LessonContent | null {
  return loadContent()[id] ?? null
}
