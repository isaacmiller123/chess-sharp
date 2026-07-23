// The OWN profile tab (§10 social surface, §6 display states, §6b reputation).
// Left: "As others see you" — the profile exactly as any client would derive
// it from public data. Right: the personal-lane editor — self-signed records
// that apply instantly and merge across devices at next sync (no save button).

import { useEffect, useRef, useState, type ChangeEvent, type JSX } from 'react'
import {
  AlertCircle,
  Check,
  Clock,
  Eye,
  Globe,
  ImagePlus,
  Signature,
  UserRound
} from 'lucide-react'
import { DEV_FIXTURE, OWN_ACCOUNT } from '../mock/fixtures'
import { FixturePreviewBadge } from '../mock/FixturePreviewBadge'
import { accountsUiStore, useAccountsUi } from '../mock/store'
import { RatingLadders } from './RatingLadders'
import { ReputationPanel } from './ReputationPanel'
import { regionName, relativeWts } from './profileFormat'
import './profile.css'

/** Chess figurine flairs — the picker's whole vocabulary (personal lane, §2). */
const FLAIRS = ['♔', '♕', '♖', '♗', '♘', '♙', '♚', '♛', '♜', '♝', '♞', '♟']

const MAX_AVATAR_BYTES = 32 * 1024

export function ProfileTab(): JSX.Element {
  const ui = useAccountsUi()
  const account = ui.account ?? OWN_ACCOUNT

  /**
   * §10 staleness (complete-1): the REAL derived value — the newest VERIFIED
   * witness-attested time from the canonical shared fold (store →
   * derive.ts deriveProfile), or null = no witnessed activity on record.
   * The signed-out fixture fallback also renders null: this surface never
   * asserts a fabricated freshness claim.
   */
  const lastWitnessedWts = ui.signedIn ? ui.lastWitnessedActivityWts : null

  // Personal-lane fields: controlled, applied instantly (house style — no save).
  const [bio, setBio] = useState(account.profile.bio)
  const [country, setCountry] = useState(account.profile.country)
  const [flair, setFlair] = useState(account.profile.flair)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarNote, setAvatarNote] = useState<string | null>(null)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Revoke replaced / unmounted avatar object URLs.
  useEffect(() => {
    if (!avatarUrl) return
    return () => URL.revokeObjectURL(avatarUrl)
  }, [avatarUrl])

  const region = regionName(country)
  const regionLabel = country.length === 2 ? region : '—'

  /** WIRED (§10): commit a field as a REAL signed personal-lane 'profile'
   * record (store → src/web/accounts.ts updateProfile → appendPersonal).
   * Bio/country commit on blur (one chain record per edit, not per
   * keystroke); flair commits on pick. Skips unchanged values. */
  const commit = (patch: { bio?: string; country?: string; flair?: string }): void => {
    if (!ui.signedIn) return
    const cur = ui.account?.profile
    if (patch.bio !== undefined && patch.bio === cur?.bio) return
    if (patch.country !== undefined && patch.country === cur?.country) return
    if (patch.flair !== undefined && patch.flair === cur?.flair) return
    void accountsUiStore.updateProfile(patch)
  }

  function onAvatarPick(e: ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const kb = Math.max(1, Math.ceil(file.size / 1024))
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError(
        `${file.name} is ${kb} KB — over the 32 KB limit. The avatar lives inside your chain as base64, so it has to stay small.`
      )
      setAvatarNote(null)
      return
    }
    setAvatarError(null)
    setAvatarUrl(URL.createObjectURL(file))
    // DEV_FIXTURE: avatar records are not yet written to the chain — the
    // preview is local-only and says so (no silent pretend-persistence).
    setAvatarNote(`${file.name} · ${kb} KB — local preview only (avatar records land with sync)`)
  }

  return (
    <div className="aprof-tab">
      {/* ---------------- As others see you ---------------- */}
      <section className="card aprof-card aprof-rail aprof-preview" aria-label="Profile preview">
        <header className="aprof-card-head">
          <span className="aprof-eyebrow">
            <Eye size={14} aria-hidden /> As others see you
          </span>
          {/* Signed out this tab falls back to the sample account — say so. */}
          {!ui.signedIn && DEV_FIXTURE && (
            <FixturePreviewBadge label="Sample account — sign in to derive your real chain" />
          )}
          <p className="aprof-card-sub muted small">
            Rendered from your public chain the way any client derives it — nothing here is
            asserted.
          </p>
        </header>
        <div className="aprof-card-body">
          <div className="aprof-identity">
            {avatarUrl ? (
              <img className="aprof-avatar is-img" src={avatarUrl} alt="Your avatar" />
            ) : (
              <span className="aprof-avatar" aria-hidden>
                <span className="aprof-avatar-glyph">{flair}</span>
              </span>
            )}
            <div className="aprof-identity-main">
              <h3 className="aprof-name">
                {account.displayName}
                <span className="aprof-tag">#{account.tag}</span>
              </h3>
              <span className="aprof-handle account-handle-mono">{account.handle}</span>
              <span className="aprof-identity-meta muted small">
                <Globe size={12} aria-hidden /> {regionLabel}
                <span className="aprof-dot" aria-hidden>
                  ·
                </span>
                <Clock size={12} aria-hidden />{' '}
                {lastWitnessedWts !== null
                  ? `Last witnessed activity: ${relativeWts(lastWitnessedWts, Date.now())}`
                  : 'No witnessed activity on record yet — witness attestations arrive with network transport.'}
              </span>
            </div>
          </div>
          {bio.trim() !== '' && <p className="aprof-bio">{bio}</p>}

          <div className="aprof-sect">
            <span className="aprof-sect-title">Ratings</span>
            <span className="aprof-sect-sub muted small">
              Placement and provisional ladders show no number — not even to you. Every client
              derives the same display states from public data.
            </span>
          </div>
          <RatingLadders ladders={account.ladders} />

          <div className="aprof-sect">
            <span className="aprof-sect-title">Reputation</span>
            <span className="aprof-sect-sub muted small">
              Public conduct standing, recomputed from witnessed conduct events — visible from
              game 1.
            </span>
          </div>
          <ReputationPanel reputation={account.reputation} />
        </div>
      </section>

      {/* ---------------- Edit (personal lane) ---------------- */}
      <section className="card aprof-card aprof-edit" aria-label="Edit profile">
        <header className="aprof-card-head">
          <span className="aprof-eyebrow">
            <UserRound size={14} aria-hidden /> Edit profile
          </span>
          <p className="aprof-card-sub muted small">
            Changes apply as you type — there is nothing to save.
          </p>
        </header>
        <div className="aprof-card-body">
          <div className="aprof-field">
            <span className="aprof-field-label">Avatar</span>
            <div className="aprof-avatar-row">
              {avatarUrl ? (
                <img className="aprof-avatar-mini is-img" src={avatarUrl} alt="Current avatar" />
              ) : (
                <span className="aprof-avatar-mini" aria-hidden>
                  {flair}
                </span>
              )}
              <button
                type="button"
                className="btn ghost aprof-btn-sm"
                onClick={() => fileRef.current?.click()}
              >
                <ImagePlus size={14} aria-hidden /> Upload image
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="aprof-file-input"
                aria-label="Choose avatar image"
                onChange={onAvatarPick}
              />
              <span className="aprof-field-hint muted small">
                PNG or JPEG, 32 KB max — stored as base64 inside your chain.
              </span>
            </div>
            {avatarError && (
              <p className="aprof-alert" role="alert">
                <AlertCircle size={13} aria-hidden /> {avatarError}
              </p>
            )}
            {avatarNote && !avatarError && (
              <p className="aprof-status" role="status">
                <Check size={13} aria-hidden /> {avatarNote}
              </p>
            )}
          </div>

          <div className="aprof-field">
            <div className="aprof-field-labelrow">
              <label className="aprof-field-label" htmlFor="aprof-bio">
                Bio
              </label>
              <span className={`aprof-count num${bio.length >= 480 ? ' is-max' : ''}`}>
                {bio.length} / 500
              </span>
            </div>
            <textarea
              id="aprof-bio"
              className="aprof-textarea"
              maxLength={500}
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, 500))}
              onBlur={() => commit({ bio })}
              placeholder="Tell the pool who they're up against"
            />
          </div>

          <div className="aprof-field">
            <label className="aprof-field-label" htmlFor="aprof-country">
              Country
            </label>
            <div className="aprof-country-row">
              <input
                id="aprof-country"
                className="text-input aprof-country"
                maxLength={2}
                value={country}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) =>
                  setCountry(
                    e.target.value
                      .replace(/[^a-zA-Z]/g, '')
                      .toUpperCase()
                      .slice(0, 2)
                  )
                }
                onBlur={() => commit({ country })}
                placeholder="US"
              />
              <span className="aprof-field-hint muted small">
                {country.length === 2 ? region : 'Two-letter code'}
              </span>
            </div>
          </div>

          <div className="aprof-field">
            <span className="aprof-field-label" id="aprof-flair-label">
              Flair
            </span>
            <div className="aprof-flairs" role="group" aria-labelledby="aprof-flair-label">
              {FLAIRS.map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`aprof-flair${flair === f ? ' on' : ''}`}
                  aria-pressed={flair === f}
                  aria-label={`Flair ${f}`}
                  onClick={() => {
                    setFlair(f)
                    commit({ flair: f })
                  }}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>
        <footer className="aprof-card-foot muted small">
          <Signature size={13} aria-hidden />
          Every edit above is a self-signed personal-lane record — it merges across your devices at
          the next sync.
        </footer>
      </section>
    </div>
  )
}
