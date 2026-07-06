import { useMemo, type JSX, type ReactNode } from 'react'
import { BookOpen } from 'lucide-react'
import type { CatalogEntry } from './catalog'

// Manuals ship as markdown in resources/manuals/<kind>.md and are inlined at
// build time. TODO(P2): serve via a main-process manuals IPC instead (so
// imported/custom-variant manuals work) + board-diagram code fences rendered
// by each game's 2D board component (spec §Library-UI).
const MANUALS = import.meta.glob('../../../../../resources/manuals/*.md', {
  eager: true,
  query: '?raw',
  import: 'default'
}) as Record<string, string>

function manualSource(id: string): string | undefined {
  const hit = Object.entries(MANUALS).find(([path]) => path.endsWith(`/${id}.md`))
  return hit?.[1]
}

/** Inline markdown: **bold**, *italic*, `code`. Deliberately tiny — manuals
 *  are authored in-house, so this covers exactly what we write. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('**')) out.push(<strong key={k++}>{tok.slice(2, -2)}</strong>)
    else if (tok.startsWith('`')) out.push(<code key={k++}>{tok.slice(1, -1)}</code>)
    else out.push(<em key={k++}>{tok.slice(1, -1)}</em>)
    last = m.index + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function renderMarkdown(src: string): JSX.Element[] {
  const lines = src.split(/\r?\n/)
  const blocks: JSX.Element[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let para: string[] = []
  let key = 0

  const flushList = (): void => {
    if (!list) return
    const items = list.items.map((it, i) => <li key={i}>{inline(it)}</li>)
    blocks.push(list.ordered ? <ol key={key++}>{items}</ol> : <ul key={key++}>{items}</ul>)
    list = null
  }
  const flushPara = (): void => {
    if (para.length === 0) return
    blocks.push(<p key={key++}>{inline(para.join(' '))}</p>)
    para = []
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    const h = /^(#{1,3})\s+(.*)$/.exec(line)
    const ul = /^[-*]\s+(.*)$/.exec(line)
    const ol = /^\d+\.\s+(.*)$/.exec(line)
    const quote = /^>\s?(.*)$/.exec(line)
    if (h) {
      flushList()
      flushPara()
      const text = inline(h[2])
      if (h[1].length === 1) blocks.push(<h2 key={key++}>{text}</h2>)
      else if (h[1].length === 2) blocks.push(<h3 key={key++}>{text}</h3>)
      else blocks.push(<h4 key={key++}>{text}</h4>)
    } else if (ul) {
      flushPara()
      if (!list || list.ordered) {
        flushList()
        list = { ordered: false, items: [] }
      }
      list.items.push(ul[1])
    } else if (ol) {
      flushPara()
      if (!list || !list.ordered) {
        flushList()
        list = { ordered: true, items: [] }
      }
      list.items.push(ol[1])
    } else if (quote) {
      flushList()
      flushPara()
      blocks.push(
        <blockquote key={key++}>
          <p>{inline(quote[1])}</p>
        </blockquote>
      )
    } else if (line === '') {
      flushList()
      flushPara()
    } else {
      flushList()
      para.push(line)
    }
  }
  flushList()
  flushPara()
  return blocks
}

export function ManualPane({ entry }: { entry: CatalogEntry }): JSX.Element {
  const src = manualSource(entry.manualId)
  const body = useMemo(() => (src ? renderMarkdown(src) : null), [src])
  if (!body) {
    return (
      <div className="manual-empty">
        <BookOpen size={28} aria-hidden />
        <strong>Manual coming in P2</strong>
        <p>
          The illustrated manual for {entry.title} — rules, board reading, three beginner
          principles and two classic traps — ships with the game.
        </p>
      </div>
    )
  }
  return <article className="manual-body">{body}</article>
}
