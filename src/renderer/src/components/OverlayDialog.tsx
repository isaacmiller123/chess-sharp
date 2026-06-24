import { useCallback, useEffect, useRef, type JSX, type KeyboardEvent, type ReactNode } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export interface OverlayDialogProps {
  onClose: () => void
  labelledBy?: string
  label?: string
  /** Vertical placement of the dialog within the scrim. */
  placement?: 'top' | 'center'
  /** Extra class on the dialog element (e.g. 'cmdk', 'shell-modal'). */
  className?: string
  children: ReactNode
}

/**
 * Accessible modal shell shared by the command palette, shortcuts help, and
 * onboarding overlays. Handles: scrim + dialog markup, Escape to close,
 * focus trapping (Tab/Shift+Tab cycle), initial-focus capture, and focus
 * restoration to the previously-focused element on unmount. Motion is governed
 * by the global prefers-reduced-motion guard in global.css.
 */
export function OverlayDialog({
  onClose,
  labelledBy,
  label,
  placement = 'center',
  className,
  children
}: OverlayDialogProps): JSX.Element {
  const dialogRef = useRef<HTMLDivElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)

  // Capture the element that had focus so we can restore it on close, and move
  // focus into the dialog once mounted.
  useEffect(() => {
    restoreRef.current = (document.activeElement as HTMLElement) ?? null
    const node = dialogRef.current
    if (node) {
      const first = node.querySelector<HTMLElement>(FOCUSABLE)
      ;(first ?? node).focus()
    }
    return () => {
      restoreRef.current?.focus?.()
    }
  }, [])

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const node = dialogRef.current
      if (!node) return
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      )
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (e.shiftKey) {
        if (active === first || !node.contains(active)) {
          e.preventDefault()
          last.focus()
        }
      } else if (active === last) {
        e.preventDefault()
        first.focus()
      }
    },
    [onClose]
  )

  return (
    <div
      className={`overlay-scrim ${placement === 'top' ? 'scrim-top' : 'scrim-center'}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className={`overlay-dialog${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
    </div>
  )
}
