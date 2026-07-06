// Decal textures for wedge (shogi) and token (xiangqi/janggi/custom) pieces.
//
// Preferred source: rasterized art from resources/games-art/<dir>/ when the
// art loader can resolve it. Reliable fallback (always available, still
// handsome): canvas-drawn CJK glyphs over the piece face. Custom variants with
// unknown types fall back to their type letter.

import * as THREE from 'three'
import { loadArtImage } from '../artLoader'
import type { TabletopColor } from '../types'

const CJK_FONT =
  '"Hiragino Mincho ProN", "Yu Mincho", "Songti SC", "SimSun", "Noto Serif CJK JP", serif'

const SHOGI: Record<string, string> = {
  p: '歩',
  l: '香',
  n: '桂',
  s: '銀',
  g: '金',
  b: '角',
  r: '飛',
  k: '玉',
  '+p': 'と',
  '+l': '杏',
  '+n': '圭',
  '+s': '全',
  '+b': '馬',
  '+r': '龍'
}

const XIANGQI: Record<TabletopColor, Record<string, string>> = {
  // red side moves first ('white' seat)
  white: { r: '車', n: '馬', c: '炮', b: '相', a: '仕', k: '帥', p: '兵' },
  black: { r: '車', n: '馬', c: '砲', b: '象', a: '士', k: '將', p: '卒' }
}

const JANGGI: Record<TabletopColor, Record<string, string>> = {
  white: { k: '漢', a: '士', b: '象', n: '馬', r: '車', c: '包', p: '兵' },
  black: { k: '楚', a: '士', b: '象', n: '馬', r: '車', c: '包', p: '卒' }
}

export function glyphFor(decalDir: string | undefined, type: string, color: TabletopColor): string {
  const t = type.toLowerCase()
  if (decalDir === 'shogi') return SHOGI[t] ?? type.toUpperCase()
  if (decalDir === 'xiangqi') return XIANGQI[color][t] ?? type.toUpperCase()
  if (decalDir === 'janggi') return JANGGI[color][t] ?? type.toUpperCase()
  return type.slice(0, 2).toUpperCase()
}

export interface GlyphStyle {
  ink: string
  /** Engraved ring around the glyph (tokens). */
  ring?: string
}

const texCache = new Map<string, THREE.CanvasTexture>()

/** Transparent 256² canvas with an optional ring + centered glyph. Cached. */
export function makeGlyphTexture(glyph: string, style: GlyphStyle): THREE.CanvasTexture {
  const key = `${glyph}|${style.ink}|${style.ring ?? ''}`
  const hit = texCache.get(key)
  if (hit) return hit
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  if (style.ring) {
    ctx.strokeStyle = style.ring
    ctx.lineWidth = 11
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size * 0.44, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.fillStyle = style.ink
  ctx.font = `600 ${glyph.length > 1 ? 96 : 148}px ${CJK_FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(glyph, size / 2, size / 2 + 6)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  texCache.set(key, tex)
  return tex
}

const artDecalCache = new Map<string, Promise<THREE.Texture | null>>()

/**
 * Rasterized games-art decal (SVG/PNG) for a piece face, or null → caller uses
 * the glyph fallback. File naming probes <dir>/<color>_<type>.<ext> then
 * <dir>/<type>.<ext>.
 */
export function loadArtDecal(
  decalDir: string,
  type: string,
  color: TabletopColor,
  artBase: string | null | undefined
): Promise<THREE.Texture | null> {
  const key = `${artBase ?? ''}|${decalDir}|${color}|${type}`
  const hit = artDecalCache.get(key)
  if (hit) return hit
  const p = (async (): Promise<THREE.Texture | null> => {
    const candidates = [
      `${decalDir}/${color}_${type}.svg`,
      `${decalDir}/${color}_${type}.png`,
      `${decalDir}/${type}.svg`,
      `${decalDir}/${type}.png`
    ]
    for (const rel of candidates) {
      const img = await loadArtImage(rel, artBase)
      if (img) {
        // Rasterize through a canvas so SVGs get a crisp fixed-size bitmap.
        const size = 256
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        canvas.getContext('2d')!.drawImage(img, 0, 0, size, size)
        const tex = new THREE.CanvasTexture(canvas)
        tex.colorSpace = THREE.SRGBColorSpace
        tex.anisotropy = 8
        return tex
      }
    }
    return null
  })()
  artDecalCache.set(key, p)
  return p
}
