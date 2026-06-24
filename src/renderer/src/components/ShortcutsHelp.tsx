import { type JSX } from 'react'
import { X } from 'lucide-react'
import { OverlayDialog } from './OverlayDialog'

export interface ShortcutsHelpProps {
  onClose: () => void
  /** Whether to label the palette shortcut as Cmd (mac) or Ctrl. */
  isMac: boolean
}

interface Shortcut {
  label: string
  keys: string[]
}

export function ShortcutsHelp({ onClose, isMac }: ShortcutsHelpProps): JSX.Element {
  const mod = isMac ? 'Cmd' : 'Ctrl'
  const shortcuts: Shortcut[] = [
    { label: 'Open command palette', keys: [mod, 'K'] },
    { label: 'Show keyboard shortcuts', keys: ['?'] },
    { label: 'Close any overlay', keys: ['Esc'] },
    { label: 'Move selection (palette)', keys: ['Up', 'Down'] },
    { label: 'Run selected command', keys: ['Enter'] }
  ]

  return (
    <OverlayDialog onClose={onClose} placement="center" className="shell-modal" labelledBy="shortcuts-title">
      <div className="shell-modal-head">
        <h2 id="shortcuts-title">Keyboard shortcuts</h2>
        <button type="button" className="shell-modal-close" aria-label="Close" onClick={onClose}>
          <X size={18} aria-hidden />
        </button>
      </div>
      <div className="shell-modal-body">
        <dl className="shortcuts-list">
          {shortcuts.map((s) => (
            <div className="shortcut-row" key={s.label}>
              <dt>{s.label}</dt>
              <dd>
                {s.keys.map((k) => (
                  <kbd className="kbd" key={k}>
                    {k}
                  </kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="shell-modal-foot">
        <button type="button" className="btn" onClick={onClose}>
          Done
        </button>
      </div>
    </OverlayDialog>
  )
}
