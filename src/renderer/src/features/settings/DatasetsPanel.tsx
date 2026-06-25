import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { Check, Download, X, Database, Cpu, AlertCircle } from 'lucide-react'
import type { DatasetImportResult, DatasetItemMeta, DatasetProgress, DatasetStatus } from '@shared/types'

function fmtBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`
  if (n >= 1024) return `${Math.round(n / 1024)} KB`
  return `${n} B`
}

const ICONS: Record<string, JSX.Element> = {
  engine: <Cpu size={16} aria-hidden />,
  puzzles: <Database size={16} aria-hidden />
}

/**
 * Settings → Datasets. Imports the large redistributable datasets (Stockfish
 * engine, Lichess puzzle DB) from the project's public GitHub release into the
 * per-user datasets folder, with live progress. Kept out of the repo/installer
 * so distribution stays lean.
 */
export default function DatasetsPanel(): JSX.Element {
  const api = typeof window !== 'undefined' ? window.api?.datasets : undefined

  const [status, setStatus] = useState<DatasetStatus | null>(null)
  const [items, setItems] = useState<DatasetItemMeta[]>([])
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<DatasetProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const refresh = useCallback(() => {
    api
      ?.status()
      .then(setStatus)
      .catch(() => undefined)
  }, [api])

  useEffect(() => {
    if (!api) return
    refresh()
    api
      .items()
      .then((r) => setItems(r.items))
      .catch(() => undefined)
    const off = api.onProgress((p) => setProgress(p))
    return off
  }, [api, refresh])

  const onImport = useCallback(() => {
    if (!api) return
    setImporting(true)
    setError(null)
    setDone(false)
    setProgress(null)
    api
      .import()
      .then((res: DatasetImportResult) => {
        setStatus(res.status)
        if (res.ok) setDone(true)
        else if (res.error && res.error !== 'cancelled') setError(res.error)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => {
        setImporting(false)
        setProgress(null)
        refresh()
      })
  }, [api, refresh])

  const onCancel = useCallback(() => {
    api?.cancel().catch(() => undefined)
  }, [api])

  // Keep the latest item label for the progress line without re-subscribing.
  const itemsRef = useRef(items)
  itemsRef.current = items

  if (!api) {
    return (
      <section className="card settings-card">
        <h2>Datasets</h2>
        <p className="muted small">Dataset management is available in the desktop app.</p>
      </section>
    )
  }

  const pct =
    progress && progress.total > 0 ? Math.min(100, Math.round((progress.received / progress.total) * 100)) : 0
  const activeItem =
    progress && progress.key !== 'all' ? itemsRef.current.find((i) => i.key === progress.key) : undefined
  const phaseLabel =
    progress?.phase === 'verify'
      ? 'Verifying'
      : progress?.phase === 'download'
        ? 'Downloading'
        : ''

  return (
    <section className="card settings-card">
      <h2>Datasets</h2>
      <p className="muted small dataset-intro">
        The Stockfish engine and the Lichess puzzle database are downloaded on demand to keep the app lean.
        They are fetched once from the project&apos;s public release and stored locally — everything stays
        offline afterwards.
      </p>

      <ul className="dataset-list">
        {items.map((it) => {
          const installed = status ? status[it.key] : false
          return (
            <li key={it.key} className="dataset-item">
              <span className="dataset-item-icon">{ICONS[it.key]}</span>
              <span className="dataset-item-main">
                <span className="dataset-item-label">{it.label}</span>
                <span className="dataset-item-size muted small">
                  {fmtBytes(it.bytes)} download
                  {it.installedBytes !== it.bytes ? ` · ${fmtBytes(it.installedBytes)} on disk` : ''}
                </span>
              </span>
              <span className={`dataset-item-state${installed ? ' is-installed' : ''}`}>
                {installed ? (
                  <>
                    <Check size={14} aria-hidden /> Installed
                  </>
                ) : (
                  'Not installed'
                )}
              </span>
            </li>
          )
        })}
      </ul>

      {importing && (
        <div className="dataset-progress" role="status" aria-live="polite">
          <div className="dataset-progress-head">
            <span>
              {phaseLabel}
              {activeItem ? ` ${activeItem.label}` : '…'}
              {progress && progress.itemCount > 1 ? ` (${progress.itemIndex + 1}/${progress.itemCount})` : ''}
            </span>
            <span className="num">
              {progress && progress.total > 0
                ? `${fmtBytes(progress.received)} / ${fmtBytes(progress.total)} · ${pct}%`
                : 'Starting…'}
            </span>
          </div>
          <div className="dataset-progress-track">
            <div className="dataset-progress-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {error && (
        <div className="dataset-error" role="alert">
          <AlertCircle size={15} aria-hidden /> {error}
        </div>
      )}

      {done && !error && (
        <div className="dataset-done ok">
          <Check size={15} aria-hidden /> Datasets ready. All features are now available.
        </div>
      )}

      <div className="dataset-actions">
        {importing ? (
          <button type="button" className="btn ghost" onClick={onCancel}>
            <X size={15} aria-hidden /> Cancel
          </button>
        ) : status?.complete ? (
          <button type="button" className="btn ghost" disabled>
            <Check size={15} aria-hidden /> All datasets installed
          </button>
        ) : (
          <button type="button" className="btn dataset-import" onClick={onImport}>
            <Download size={15} aria-hidden /> Import datasets
          </button>
        )}
      </div>
    </section>
  )
}
