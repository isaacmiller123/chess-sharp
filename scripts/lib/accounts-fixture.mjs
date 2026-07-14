// Shared fixture for the web-accounts determinism suites
// (scripts/test-web-accounts.mjs — the node oracle — and
// scripts/test-web-accounts-browser.mjs — the real-browser gate, spec §14 A1
// "browser worst-case exercised in CI for at least chain verification").
//
// ONE fixture source, bundled per-platform, so node and browser run the
// byte-identical flow: derive the KAT identity (argon2id + SLIP-0010),
// replicate the chain suite's golden fixture chain from fixed raw seeds,
// build a second chain from the DERIVED identity keys, verify both, and emit
// every digest as a string. The suites assert field-by-field equality across
// platforms AND against the recorded goldens below.

import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { readFileSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const ROOT = resolve(__dirname, '..', '..')

// ---------------------------------------------------------------------------
// Goldens
// ---------------------------------------------------------------------------

export const GOLDENS = {
  // frozen-at-genesis parameter digest (params.ts, asserted by both stage-1
  // suites). Changed once pre-ship when PARAMS_V1 gained the pwNorm row —
  // nothing had shipped, so v1 grew the row instead of minting v2.
  paramsDigest: 'ZDoblqaVf5z1zL8IvmWK2sdZK29JTNWZpY38XuDBZdk',
  // argon2id KAT from scripts/test-accounts-core.mjs:
  //   deriveSeed('TestUser', 'correct horse battery staple')
  // UNCHANGED by pwNorm: NFKD of a pure-ASCII password is the identity.
  seedHex: 'fa3616fce3505728af8fa08f8e38286d85a34b773e8075332844c9f20d11cd4a',
  tag: '7U2MY',
  // happy-path chain goldens from scripts/test-accounts-chain.mjs (the fixture
  // below replicates buildBase() bit-for-bit from the same raw seeds/ts)
  chainVerifyDigest: '9X73ZssMl6BygmtesggEAp91sSDKfWM1ngaMG4-fCWM',
  chainFileSha256: 'ZJm5bqJwj7RrgksYMvwxH20nzLvUATaFPmOwr6koQSc',
  // identity-derived chain (argon2 seed → device children → chain), recorded
  // from a green run of this suite — freezes derivation→chain end to end
  identityChainVerifyDigest: 'iNi_HEWRboKox2BbKvDh4ToNf09PFWrq4XzdD35cB_s',
  identityChainFileSha256: 'E8V34SGrs_459L3osc6DQvqkNtT2ryE4z1nsi_k7POU',
  // unicode display-name end to end: name 'Zoë' (also derived from NFD input),
  // password 'pâsswörd' (NFC and NFD spellings both) → one account, one chain
  unicodeSeedHex: '9757e060b372fe9359e6748db32c311427b4eee5c782278b1bba402d18f9ee8b',
  unicodeTag: 'B6DXR',
  unicodeChainVerifyDigest: '4F2tiaKCfqncx9nsaQRYryB3dZ5w2qeXwveH1rA8ni0',
  unicodeChainFileSha256: 'rIWyvV5p5oaXywHJAYQzw1_4nqWOAuZMnZ4FXHw_I-8',
}

// ---------------------------------------------------------------------------
// The fixture entry (TypeScript, bundled with alias @shared → src/shared)
// ---------------------------------------------------------------------------

export const FIXTURE_ENTRY_TS = `
import * as A from '@shared/accounts'

const hex = (b: Uint8Array): string =>
  Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')

/** Replicates scripts/test-accounts-chain.mjs buildBase() exactly. */
function buildGoldenChain() {
  const seed = (b: number) => Uint8Array.from({ length: 32 }, (_, i) => (b + i) & 0xff)
  const kp = (b: number) => {
    const priv = seed(b)
    const pub = A.ed25519.getPublicKey(priv)
    return { priv, pub, pubB: A.toB64u(pub) }
  }
  const root = kp(1)
  const devA = kp(50)
  const devB = kp(90)
  const rootB = root.pubB
  let c = A.createAccountChain({
    rootPriv: root.priv,
    rootPub: root.pub,
    displayName: 'Isaac',
    ts: 1000,
    device: { pub: devA.pubB, index: 0, label: 'MacBook' },
  })
  c = A.appendEvent(
    c,
    A.makeCertEvent(root.priv, rootB, c, { childPub: devB.pubB, purpose: 0, index: 1, label: 'Work PC', ts: 1100 }),
  )
  c = A.appendPersonal(c, root.priv, rootB, 'profile', { fields: { bio: 'hi there', country: 'US' } }, 1200)
  c = A.appendPersonal(c, devA.priv, devA.pubB, 'profile', { fields: { flair: 'knight' } }, 1300)
  c = A.appendEvent(c, A.makeRevokeEvent(root.priv, rootB, c, { pub: devB.pubB, ts: 1400 }))
  c = A.appendPersonal(c, devB.priv, devB.pubB, 'profile', { fields: { bio: 'EVIL' } }, 1500)
  c = A.appendEvent(c, A.makeCheckpointEvent(c, root.priv, rootB, 1600))
  return c
}

/** A second chain built from the DERIVED identity's real keys, fixed ts. */
function buildIdentityChain(identity: A.Identity) {
  const T = 1700000000000
  const rootB = A.toB64u(identity.rootPub)
  const d0 = A.deriveChild(identity.seed, A.KEY_PURPOSE.device, 0)
  const d1 = A.deriveChild(identity.seed, A.KEY_PURPOSE.device, 1)
  let c = A.createAccountChain({
    rootPriv: identity.rootPriv,
    rootPub: identity.rootPub,
    displayName: identity.displayName,
    ts: T,
    device: { pub: A.toB64u(d0.pub), index: 0, label: 'CI fixture' },
  })
  c = A.appendEvent(
    c,
    A.makeCertEvent(identity.rootPriv, rootB, c, { childPub: A.toB64u(d1.pub), purpose: A.KEY_PURPOSE.device, index: 1, ts: T + 1000 }),
  )
  c = A.appendPersonal(c, d0.priv, A.toB64u(d0.pub), 'profile', { fields: { bio: 'bit-determinism or bust', country: 'NZ' } }, T + 2000)
  c = A.appendEvent(c, A.makeCheckpointEvent(c, identity.rootPriv, rootB, T + 3000))
  return c
}

export interface FixtureResult {
  paramsDigest: string
  seedHex: string
  tag: string
  rootPubHex: string
  chainBytesB64u: string
  chainFileSha256: string
  verifyDigest: string
  verifyOk: boolean
  identityChainBytesB64u: string
  identityChainFileSha256: string
  identityVerifyDigest: string
  identityVerifyOk: boolean
  unicodeFoldedName: string
  unicodeSeedHex: string
  unicodeNfdSeedHex: string
  unicodeTag: string
  unicodeChainFileSha256: string
  unicodeVerifyDigest: string
  unicodeVerifyOk: boolean
}

export async function runFixture(): Promise<FixtureResult> {
  const identity = await A.deriveIdentity('TestUser', 'correct horse battery staple')

  const golden = buildGoldenChain()
  const goldenBytes = A.chainToBytes(golden)
  const goldenVerify = A.verifyChain(golden)

  const idChain = buildIdentityChain(identity)
  const idBytes = A.chainToBytes(idChain)
  const idVerify = A.verifyChain(idChain)

  // Unicode display-name end to end (pwNorm nfkd-v1 + name nfkc fold): the
  // NFC and NFD spellings of BOTH the name and the password must land on one
  // account and one canonical chain.
  const uni = await A.deriveIdentity('Zo\\u00eb', 'p\\u00e2ssw\\u00f6rd') // NFC name + NFC pw
  const uniNfd = await A.deriveIdentity('Zoe\\u0308', 'pa\\u0302sswo\\u0308rd') // NFD name + NFD pw
  const uniChain = buildIdentityChain(uni)
  const uniBytes = A.chainToBytes(uniChain)
  const uniVerify = A.verifyChain(uniChain)

  return {
    paramsDigest: A.PARAMS_V1_DIGEST,
    seedHex: hex(identity.seed),
    tag: identity.tag,
    rootPubHex: hex(identity.rootPub),
    chainBytesB64u: A.toB64u(goldenBytes),
    chainFileSha256: A.toB64u(A.sha256(goldenBytes)),
    verifyDigest: goldenVerify.digest,
    verifyOk: goldenVerify.ok,
    identityChainBytesB64u: A.toB64u(idBytes),
    identityChainFileSha256: A.toB64u(A.sha256(idBytes)),
    identityVerifyDigest: idVerify.digest,
    identityVerifyOk: idVerify.ok,
    unicodeFoldedName: uni.foldedName,
    unicodeSeedHex: hex(uni.seed),
    unicodeNfdSeedHex: hex(uniNfd.seed),
    unicodeTag: uni.tag,
    unicodeChainFileSha256: A.toB64u(A.sha256(uniBytes)),
    unicodeVerifyDigest: uniVerify.digest,
    unicodeVerifyOk: uniVerify.ok,
  }
}
`

// ---------------------------------------------------------------------------
// Bundling
// ---------------------------------------------------------------------------

/**
 * Bundle the fixture entry for 'node' or 'browser'. format esm both; NOTHING
 * is stubbed or externalized for the browser build — the shared accounts tree
 * must carry zero node built-ins, and esbuild failing to resolve one IS the
 * packaging assertion.
 */
export async function bundleFixture(entryPath, outfile, platform) {
  await build({
    entryPoints: [entryPath],
    outfile,
    bundle: true,
    format: 'esm',
    platform,
    mainFields: ['module', 'main'],
    conditions: ['import', 'module', 'default'],
    alias: { '@shared': resolve(ROOT, 'src/shared') },
    absWorkingDir: ROOT,
    logLevel: 'warning',
  })
}

/** Node-builtin leak scan over bundled JS text (browser bundle must be clean). */
export function findNodeBuiltinRefs(bundleText) {
  const hits = []
  const patterns = [
    /require\(\s*["'](?:node:)?(fs|path|os|crypto|url|util|stream|buffer|child_process|worker_threads|events|http|https|net|tls|zlib)["']\s*\)/g,
    /from\s*["']node:[^"']+["']/g,
    /import\s*\(\s*["']node:[^"']+["']\s*\)/g,
  ]
  for (const re of patterns) {
    let m
    while ((m = re.exec(bundleText)) !== null) hits.push(m[0])
  }
  return hits
}

/** The browser fixture page: runs the flow, parks the result on window. */
export const FIXTURE_HTML = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>accounts fixture</title></head>
<body>
<script type="module">
  import { runFixture } from './fixture.browser.mjs'
  runFixture().then(
    (r) => { window.__result = JSON.stringify(r) },
    (e) => { window.__error = String((e && e.stack) || e) },
  )
</script>
</body>
</html>
`

export function readBundle(path) {
  return readFileSync(path, 'utf8')
}
