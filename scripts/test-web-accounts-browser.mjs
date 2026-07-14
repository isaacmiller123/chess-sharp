// REAL-browser determinism gate for the accounts tree (spec §14 quality gate:
// "browser worst-case exercised in CI for at least chain verification").
//
//   node scripts/test-web-accounts-browser.mjs
//
// Builds the SAME fixture bundle as scripts/test-web-accounts.mjs
// (platform=browser, nothing stubbed), serves it over plain-node http WITH
// COOP/COEP headers (the production isolation semantics, server/index.ts),
// drives headless chromium via playwright-core, runs the full flow IN PAGE
// (argon2id derivation → SLIP-0010 → chain build → verifyChain →
// chainToBytes), and asserts byte-parity of every digest against the node
// oracle run in this same process + the recorded goldens.
//
// Browser provisioning: uses playwright-core's registry; if no chromium is
// present it attempts `npx playwright-core install chromium-headless-shell`.
// If that fails (offline): SKIP (exit 0) locally, HARD FAIL (exit 1) when
// process.env.CI is set — CI must never silently skip the gate.
//
// Style: failures counter, per-assert one-line output, exit(failures ? 1 : 0).

import { spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { dirname, resolve, extname } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import {
  GOLDENS,
  FIXTURE_ENTRY_TS,
  FIXTURE_HTML,
  bundleFixture,
  findNodeBuiltinRefs,
} from './lib/accounts-fixture.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// ---- tiny check kit ---------------------------------------------------------
let passed = 0
let failures = 0
function ok(cond, msg) {
  if (cond) {
    passed++
    console.log(`  ✓ ${msg}`)
  } else {
    failures++
    console.log(`  ✗ ${msg}`)
  }
}
function eq(a, b, msg) {
  ok(a === b, a === b ? msg : `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`)
}

// ---- browser provisioning -----------------------------------------------------
async function launchChromium(chromium) {
  try {
    return { browser: await chromium.launch({ headless: true }) }
  } catch (err) {
    return { err }
  }
}

async function ensureBrowser(chromium) {
  let attempt = await launchChromium(chromium)
  if (attempt.browser) return attempt.browser
  console.log('· no chromium available — attempting `npx playwright-core install chromium-headless-shell` …')
  // shell:true on Windows: 'npx' is npx.cmd there, and spawning .cmd files
  // directly is both ENOENT-prone and blocked by node's batch-file hardening.
  const res = spawnSync('npx', ['playwright-core', 'install', 'chromium-headless-shell'], {
    cwd: ROOT,
    stdio: 'inherit',
    timeout: 300_000,
    shell: process.platform === 'win32',
  })
  // res.error (spawn failure, e.g. ENOENT) never sets status — check BOTH,
  // and say WHY provisioning failed instead of silently skipping.
  if (res.error || res.status !== 0) {
    console.error(
      `· provisioning failed: ${res.error ? String(res.error) : `exit status ${res.status}`}`,
    )
  } else {
    attempt = await launchChromium(chromium)
    if (attempt.browser) return attempt.browser
  }
  if (process.env.CI) {
    console.error('❌ CI is set and no browser could be provisioned — the browser gate MUST run in CI.')
    console.error(String(attempt.err))
    process.exit(1)
  }
  console.log('SKIP (no browser available)')
  process.exit(0)
}

// ---- static file server with production isolation headers --------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
}

function serveDir(dir) {
  const server = createServer((req, res) => {
    const path = resolve(dir, '.' + (req.url === '/' ? '/index.html' : req.url.split('?')[0]))
    if (!path.startsWith(dir)) {
      res.writeHead(403).end()
      return
    }
    let body
    try {
      body = readFileSync(path)
    } catch {
      res.writeHead(404).end('not found')
      return
    }
    res.writeHead(200, {
      'content-type': MIME[extname(path)] ?? 'application/octet-stream',
      // Same two headers the production server sets (server/index.ts /
      // vite.web.config.ts): the page must work under full cross-origin
      // isolation — the strictest environment the app ever runs in.
      'cross-origin-opener-policy': 'same-origin',
      'cross-origin-embedder-policy': 'require-corp',
      'cache-control': 'no-store',
    })
    res.end(body)
  })
  return new Promise((resolvePromise) => {
    server.listen(0, '127.0.0.1', () => resolvePromise(server))
  })
}

async function main() {
  const cacheRoot = resolve(ROOT, 'node_modules/.cache/web-accounts-browser-test')
  mkdirSync(cacheRoot, { recursive: true })
  const outdir = mkdtempSync(resolve(cacheRoot, 'run-'))
  try {
    await run(outdir)
  } finally {
    // cleanup on failure paths too — a crashed run must not leak temp dirs
    rmSync(outdir, { recursive: true, force: true })
  }
  console.log(`\n${failures ? `❌ ${failures} FAILED — ` : 'ALL GREEN — '}${passed} assertions${failures ? `, ${failures} failures` : ''}`)
  process.exit(failures ? 1 : 0)
}

async function run(outdir) {
  // ---- build fixture bundles --------------------------------------------------
  console.log('· building the fixture (browser bundle + node oracle) …')
  const entry = resolve(outdir, 'fixture.entry.ts')
  writeFileSync(entry, FIXTURE_ENTRY_TS)
  const browserOut = resolve(outdir, 'fixture.browser.mjs')
  const nodeOut = resolve(outdir, 'fixture.node.mjs')
  await bundleFixture(entry, browserOut, 'browser')
  await bundleFixture(entry, nodeOut, 'node')
  writeFileSync(resolve(outdir, 'index.html'), FIXTURE_HTML)
  eq(findNodeBuiltinRefs(readFileSync(browserOut, 'utf8')).length, 0, 'browser bundle carries no node builtins')

  // ---- node oracle run ----------------------------------------------------------
  console.log('· running the node oracle …')
  const oracle = await (await import(pathToFileURL(nodeOut).href)).runFixture()
  eq(oracle.seedHex, GOLDENS.seedHex, 'node oracle seed matches the argon2 KAT')
  eq(oracle.verifyDigest, GOLDENS.chainVerifyDigest, 'node oracle verify digest matches the chain-suite golden')

  // ---- browser ---------------------------------------------------------------
  const { chromium } = await import('playwright-core')
  const browser = await ensureBrowser(chromium)
  console.log(`· chromium launched (${browser.version()})`)

  const server = await serveDir(outdir)
  const port = server.address().port
  let page
  try {
    page = await browser.newPage()
    const pageErrors = []
    page.on('pageerror', (e) => pageErrors.push(String(e)))
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' })

    const isolated = await page.evaluate('self.crossOriginIsolated')
    eq(isolated, true, 'page is crossOriginIsolated (COOP/COEP served — production semantics)')

    // The in-page flow: argon2id (~sub-second) + chain build + verify.
    await page.waitForFunction('window.__result !== undefined || window.__error !== undefined', {
      timeout: 120_000,
    })
    const pageError = await page.evaluate('window.__error')
    if (pageError) {
      ok(false, `in-page fixture flow completed without error (got: ${pageError})`)
    } else {
      ok(true, 'in-page fixture flow completed without error')
      const result = JSON.parse(await page.evaluate('window.__result'))

      console.log('\n· byte-parity: browser vs node oracle, field by field …')
      const fields = Object.keys(oracle).sort()
      eq(Object.keys(result).sort().join(','), fields.join(','), 'browser run emits the same field set')
      for (const f of fields) eq(result[f], oracle[f], `browser === node: ${f}`)

      console.log('\n· browser digests vs recorded goldens …')
      eq(result.paramsDigest, GOLDENS.paramsDigest, 'in-browser params digest matches the frozen golden')
      eq(result.seedHex, GOLDENS.seedHex, 'in-browser argon2id seed matches the KAT')
      eq(result.tag, GOLDENS.tag, `in-browser tag is '${GOLDENS.tag}'`)
      eq(result.verifyOk, true, 'in-browser verifyChain(golden fixture) is ok')
      eq(result.verifyDigest, GOLDENS.chainVerifyDigest, 'in-browser verify digest matches the chain-suite golden')
      eq(result.chainFileSha256, GOLDENS.chainFileSha256, 'in-browser chain file sha256 matches the chain-suite golden')
      eq(result.identityVerifyOk, true, 'in-browser identity-chain verify is ok')
      eq(result.identityVerifyDigest, GOLDENS.identityChainVerifyDigest, 'in-browser identity-chain verify digest matches its golden')
      eq(result.identityChainFileSha256, GOLDENS.identityChainFileSha256, 'in-browser identity-chain file sha256 matches its golden')

      console.log('\n· browser unicode display-name fixture vs goldens …')
      eq(result.unicodeFoldedName, 'zo\u00eb', "in-browser unicode name folds to 'zo\u00eb' (NFC)")
      eq(result.unicodeSeedHex, GOLDENS.unicodeSeedHex, 'in-browser unicode argon2id seed matches its golden')
      eq(result.unicodeNfdSeedHex, result.unicodeSeedHex, 'in-browser NFD name+password input derives the identical seed')
      eq(result.unicodeTag, GOLDENS.unicodeTag, `in-browser unicode tag is '${GOLDENS.unicodeTag}'`)
      eq(result.unicodeVerifyOk, true, 'in-browser unicode chain verifies ok')
      eq(result.unicodeVerifyDigest, GOLDENS.unicodeChainVerifyDigest, 'in-browser unicode verify digest matches its golden')
      eq(result.unicodeChainFileSha256, GOLDENS.unicodeChainFileSha256, 'in-browser unicode chain file sha256 matches its golden')
    }
    eq(pageErrors.length, 0, `no uncaught page errors${pageErrors.length ? `: ${pageErrors[0]}` : ''}`)
  } finally {
    await browser.close().catch(() => {})
    server.close()
  }
}

main().catch((err) => {
  console.error(`\n❌ ${err.stack || err}`)
  process.exit(1)
})
