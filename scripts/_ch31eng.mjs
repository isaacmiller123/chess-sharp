import { spawn } from 'node:child_process'

const ENG = 'resources/engine/mac/stockfish'
const fens = process.argv.slice(2)

const sf = spawn(ENG)
let buf = ''
const out = []
let idx = -1
let resolveDone

function send(s) { sf.stdin.write(s + '\n') }

sf.stdout.on('data', (d) => {
  buf += d.toString()
  let nl
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim()
    buf = buf.slice(nl + 1)
    handle(line)
  }
})

let lastInfo = ''
function handle(line) {
  if (line.startsWith('info ') && line.includes(' pv ')) lastInfo = line
  if (line.startsWith('bestmove')) {
    const bm = line.split(' ')[1]
    let score = ''
    const m = lastInfo.match(/score (cp|mate) (-?\d+)/)
    if (m) score = m[1] === 'mate' ? `#${m[2]}` : `${m[2]}cp`
    const pvm = lastInfo.match(/ pv (.+)$/)
    const pv = pvm ? pvm[1].split(' ').slice(0, 6).join(' ') : ''
    out.push(`${fens[idx]}  =>  best=${bm} eval(stm)=${score}  pv=${pv}`)
    next()
  }
}

function next() {
  idx++
  if (idx >= fens.length) { console.log(out.join('\n')); send('quit'); return }
  lastInfo = ''
  send('position fen ' + fens[idx])
  send('go depth 24')
}

send('uci')
setTimeout(next, 300)
