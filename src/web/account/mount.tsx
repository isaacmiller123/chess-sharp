// Mounts the account chip as its OWN React root outside the renderer's #root
// (web port W3). The renderer tree stays byte-identical to desktop; this root
// only ever renders the chip/modal and re-renders on authStore changes.

import { createRoot } from 'react-dom/client'
import { AccountChip } from './AccountChip'
import './account.css'

export function mountAccountRoot(): void {
  if (document.getElementById('account-root')) return
  const host = document.createElement('div')
  host.id = 'account-root'
  document.body.appendChild(host)
  createRoot(host).render(<AccountChip />)
}
