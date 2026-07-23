import { useState, type JSX } from 'react'
import { FileKey, KeyRound, Link2, Swords } from 'lucide-react'
import { AuthDialog } from './AuthDialog'
import './auth.css'

/**
 * Signed-out hero for the Account view (spec §0 one-line model, §1 identity,
 * §10 sign-in anywhere). Honest framing: everything local already works with
 * no account at all; an account is a signed file you carry, derived from
 * name + password — no email, no server record, no reset.
 */

export function SignedOutCard(): JSX.Element {
  const [dialog, setDialog] = useState<'signin' | 'create' | null>(null)

  return (
    <>
      <section className="card aauth-hero" aria-labelledby="aauth-hero-title">
        <span className="aauth-hero-badge" aria-hidden>
          <FileKey size={22} />
        </span>
        <h2 id="aauth-hero-title" className="aauth-hero-title">
          Your account is a signed file you carry
        </h2>
        <p className="aauth-hero-lead">
          No email, no server record. Your name and password derive your keys on this machine;
          every rated game writes itself into both players&rsquo; files, and anything the network
          says about you is math anyone can re-check.
        </p>

        <ul className="aauth-perks">
          <li className="aauth-perk">
            <span className="aauth-perk-ic" aria-hidden>
              <Swords size={16} />
            </span>
            <span className="aauth-perk-body">
              <strong>Full local &amp; offline play — no account needed</strong>
              <span>
                Engine games, analysis, puzzles, School: everything on this machine already works.
              </span>
            </span>
          </li>
          <li className="aauth-perk">
            <span className="aauth-perk-ic" aria-hidden>
              <Link2 size={16} />
            </span>
            <span className="aauth-perk-body">
              <strong>Unrated play by link</strong>
              <span>Send a friend a link and play — unrated, no sign-in on either side.</span>
            </span>
          </li>
        </ul>

        <p className="aauth-hero-more">
          An account adds rated ladders, friends, reputation, and a history that travels with you —
          carried in your file, verifiable by anyone.
        </p>

        <div className="aauth-cta-row">
          <button type="button" className="btn" onClick={() => setDialog('create')}>
            Create account
          </button>
          <button type="button" className="btn ghost" onClick={() => setDialog('signin')}>
            Sign in
          </button>
        </div>

        <p className="aauth-hero-foot">
          <KeyRound size={13} aria-hidden />
          Signing in on any device is pure re-derivation — same name and password, same keys.
          Nothing to look up, nothing to reset: guard your recovery phrase instead.
        </p>
      </section>

      {dialog && <AuthDialog mode={dialog} onClose={() => setDialog(null)} />}
    </>
  )
}
