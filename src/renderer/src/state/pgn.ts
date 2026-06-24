import type { TreeNode } from './gameTree'

// Mainline PGN export (variations omitted for v0). Walks children[0] from root.
export function treeToPgn(root: TreeNode, headers: Record<string, string> = {}): string {
  const tags = Object.entries(headers)
    .map(([k, v]) => `[${k} "${v.replace(/"/g, "'")}"]`)
    .join('\n')

  let movetext = ''
  let node = root
  while (node.children[0]) {
    const m = node.children[0]
    if (m.ply % 2 === 1) movetext += `${Math.ceil(m.ply / 2)}. `
    movetext += `${m.move?.san ?? ''} `
    node = m
  }

  const result = headers.Result ?? '*'
  const body = `${movetext.trim()} ${result}`.trim()
  return (tags ? `${tags}\n\n` : '') + body + '\n'
}
