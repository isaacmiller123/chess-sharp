import { useState, type JSX } from 'react'
import {
  Database,
  Fingerprint,
  Scale,
  ShieldCheck,
  Swords,
  UserRound,
  Users
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAccountsUi } from './mock/store'
import { SignedOutCard } from './auth/SignedOutCard'
import { OverviewSection } from './hub/OverviewSection'
import { SecurityTab } from './hub/SecurityTab'
import { NetStatusPill } from './hub/NetStatusPill'
import { ProfileTab } from './profile/ProfileTab'
import { PeopleTab } from './social/PeopleTab'
import { DataTab } from './data/DataTab'
import { FairPlayTab } from './fairplay/FairPlayTab'
import { RatedLobby } from './rated/RatedLobby'
import { GameChromeShowcase } from './gamechrome/GameChromeShowcase'
import './account.css'

/**
 * Decentralized-accounts UI (docs/ACCOUNTS-SPEC.md). A6 WIRED: identity, keys,
 * chain, profile, ratings/reputation/standing and devices render from the REAL
 * keyring + signed chain (mock/store.ts over src/web/accounts.ts); the
 * overlay-dependent surfaces read the LIVE account peer (net/accountNetStatus)
 * and degrade HONESTLY when a transport isn't reached — never a fixture, never a
 * dead button. The tab-strip pill shows live overlay presence (§4). The tab set
 * covers the spec's user-facing surface: identity/keys (§1), the chain (§2),
 * social (§3, §10), the witness fabric in game chrome (§4), storage/overlay
 * (§5, §11), ratings display states (§6), reputation (§6b), trust-width
 * matchmaking (§7), fair play (§8), and standing/bans (§9).
 */

export type AccountTab =
  | 'overview'
  | 'profile'
  | 'people'
  | 'security'
  | 'data'
  | 'fairplay'
  | 'rated'

const TABS: { key: AccountTab; label: string; Icon: LucideIcon }[] = [
  { key: 'overview', label: 'Overview', Icon: Fingerprint },
  { key: 'profile', label: 'Profile', Icon: UserRound },
  { key: 'people', label: 'People', Icon: Users },
  { key: 'security', label: 'Security', Icon: ShieldCheck },
  { key: 'data', label: 'Data & network', Icon: Database },
  { key: 'fairplay', label: 'Fair play', Icon: Scale },
  { key: 'rated', label: 'Rated play', Icon: Swords }
]

export default function AccountView(): JSX.Element {
  const ui = useAccountsUi()
  const [tab, setTab] = useState<AccountTab>('overview')

  if (!ui.signedIn) {
    return (
      <div className="account-view">
        <div className="account-signedout-wrap">
          <SignedOutCard />
        </div>
      </div>
    )
  }

  return (
    <div className="account-view">
      <div className="account-tabs" role="tablist" aria-label="Account sections">
        {TABS.map(({ key, label, Icon }) => {
          const on = tab === key
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={on}
              className={`account-tab${on ? ' on' : ''}`}
              onClick={() => setTab(key)}
            >
              <Icon size={15} aria-hidden />
              {label}
            </button>
          )
        })}
        <NetStatusPill style={{ marginLeft: 'auto' }} />
      </div>

      <div className="account-tab-body">
        {tab === 'overview' && <OverviewSection onOpenTab={setTab} />}
        {tab === 'profile' && <ProfileTab />}
        {tab === 'people' && <PeopleTab />}
        {tab === 'security' && <SecurityTab />}
        {tab === 'data' && <DataTab />}
        {tab === 'fairplay' && <FairPlayTab />}
        {tab === 'rated' && (
          <>
            <RatedLobby />
            <GameChromeShowcase />
          </>
        )}
      </div>
    </div>
  )
}
