// Render the Chess# logo to build/icon.png (512) and build/icon.ico (256) via an
// offscreen Electron window. Run: electron scripts/make-icon.cjs
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

app.disableHardwareAcceleration()

const SVG = `
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4ea0ef"/>
      <stop offset="1" stop-color="#2a72b8"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="512" height="512" rx="112" fill="url(#g)"/>
  <g transform="translate(256 256) scale(8.6) translate(-24 -24)" stroke="#ffffff" fill="none" stroke-linecap="round">
    <path d="M34 12.5 A14 14 0 1 0 34 35.5" stroke-width="5"/>
    <g stroke-width="3.2">
      <line x1="23" y1="15" x2="20.5" y2="34"/>
      <line x1="31" y1="14" x2="28.5" y2="33"/>
      <line x1="17" y1="22" x2="34" y2="19.5"/>
      <line x1="16" y1="30" x2="33" y2="27.5"/>
    </g>
  </g>
</svg>`

const HTML = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:transparent">${SVG}</body>`

function icoFromPng(png) {
  const h = Buffer.alloc(6)
  h.writeUInt16LE(0, 0)
  h.writeUInt16LE(1, 2)
  h.writeUInt16LE(1, 4)
  const d = Buffer.alloc(16)
  d[0] = 0 // width 0 => 256
  d[1] = 0 // height 0 => 256
  d.writeUInt16LE(1, 4) // color planes
  d.writeUInt16LE(32, 6) // bpp
  d.writeUInt32LE(png.length, 8)
  d.writeUInt32LE(22, 12) // offset (6 + 16)
  return Buffer.concat([h, d, png])
}

app.on('ready', () => {
  const win = new BrowserWindow({
    width: 512,
    height: 512,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: { offscreen: true }
  })
  let done = false
  win.webContents.on('paint', (_e, _dirty, image) => {
    if (done || image.isEmpty()) return
    done = true
    const dir = path.join(__dirname, '..', 'build')
    fs.mkdirSync(dir, { recursive: true })
    const png = image.toPNG()
    fs.writeFileSync(path.join(dir, 'icon.png'), png)
    const png256 = image.resize({ width: 256, height: 256 }).toPNG()
    const ico = icoFromPng(png256)
    fs.writeFileSync(path.join(dir, 'icon.ico'), ico)
    console.log(`icon written: png=${png.length}B ico=${ico.length}B at ${dir}`)
    setTimeout(() => app.quit(), 150)
  })
  win.webContents.setFrameRate(2)
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(HTML))
  setTimeout(() => {
    if (!done) {
      console.log('FAIL: no paint captured')
      app.quit()
    }
  }, 8000)
})
