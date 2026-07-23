import { type JSX } from 'react'
import { ChainViewer } from './ChainViewer'
import { StoragePanel } from './StoragePanel'
import './data.css'

/**
 * Data & network tab (A-UI): the chain (§2) then storage + the fabric
 * (§4/§5/§11). Section intros restate §0 — everything shown is recomputable
 * public signed data, never asserted state.
 */

export function DataTab(): JSX.Element {
  return (
    <div className="adata-tab">
      <header className="adata-sechead">
        <h2 className="adata-sectitle">Your chain</h2>
        <p className="adata-secsub muted">
          Your account is a signed file you carry — an append-only log of signed events. Nothing
          here is asserted: every number is a pure fold over public signed data, recomputable by
          anyone, bit-identically.
        </p>
      </header>
      <ChainViewer />

      <header className="adata-sechead">
        <h2 className="adata-sectitle">Storage &amp; network</h2>
        <p className="adata-secsub muted">
          No database, ever — the network of clients is the storage. Everyone online holds a few
          pieces of everyone else; to view anyone, you gather the pieces and check the math
          yourself.
        </p>
      </header>
      <StoragePanel />
    </div>
  )
}
