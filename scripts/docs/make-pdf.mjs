// Builds docs/PocketZen-Architecture.pdf from the sources in docs/architecture/ (npm run docs).
import { chromium } from 'playwright-core'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { diagrams } from './diagrams.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const src = join(root, 'docs', 'architecture')
const out = join(root, 'docs', 'PocketZen-Architecture.pdf')

const browserPath = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(existsSync)
if (!browserPath) throw new Error('Chrome or Edge is required to render the PDF.')

const css = readFileSync(join(src, 'style.css'), 'utf8')
const logo = 'data:image/png;base64,' + readFileSync(join(root, 'src/assets/logo.png')).toString('base64')
const sections = readdirSync(join(src, 'sections')).filter((f) => f.endsWith('.html')).sort()
let body = sections.map((f) => readFileSync(join(src, 'sections', f), 'utf8')).join('\n')
body = body.replace(/<!--diagram:(\w+)-->/g, (_, name) => {
  if (!diagrams[name]) throw new Error(`Unknown diagram "${name}"`)
  return `<figure class="diagram">${diagrams[name]()}</figure>`
}).replaceAll('{{LOGO}}', logo)

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>PocketZen — Architecture & Implementation Guide</title><style>${css}</style></head><body>${body}</body></html>`
mkdirSync(join(root, 'docs'), { recursive: true })
const htmlPath = join(src, '_assembled.html') // derived file, git-ignored
writeFileSync(htmlPath, html)

const browser = await chromium.launch({ executablePath: browserPath })
const page = await browser.newPage()
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' })
await page.emulateMedia({ media: 'print' })
await page.pdf({
  path: out,
  format: 'A4',
  printBackground: true,
  outline: true,
  tagged: true,
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate:
    '<div style="width:100%;font-size:8px;color:#5c7780;padding:0 16mm;display:flex;justify-content:space-between;font-family:Segoe UI,Arial,sans-serif"><span>PocketZen — Architecture &amp; Implementation Guide · v1.0</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
  margin: { top: '16mm', bottom: '18mm', left: '16mm', right: '16mm' },
})
await browser.close()
console.log('PDF written:', out)
