import { z } from 'zod'
import { handle } from './util'
import { tree, lesson, lessonContent } from '../curriculum/curriculum.repo'

export function registerCurriculum(): void {
  handle('curriculum:tree', z.object({}).strict(), () => ({ bands: tree() }))

  handle('curriculum:lesson', z.object({ id: z.string() }).strict(), ({ id }) => ({
    lesson: lesson(id)
  }))

  handle('curriculum:lessonContent', z.object({ id: z.string() }).strict(), ({ id }) => ({
    content: lessonContent(id)
  }))
}
