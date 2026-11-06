// Design system 1's components load from their own file, and only when a document needs one.
import { playwright, serve } from './lib.mjs'

let failed = 0
const pw = playwright(), server = await serve()
for (const name of ['chromium', 'webkit']) {
  const check = (what, ok, detail = '') => { console.log(`  ${ok ? '✓' : '✗'} ${name}: ${what}${detail ? ` (${detail})` : ''}`); if (!ok) failed++ }
  const browser = await pw[name].launch({ headless: true }), page = await browser.newPage()
  const loads = []
  page.on('request', request => { if (request.url().includes('aa-components')) loads.push(request.url()) })
  page.on('pageerror', error => check('no page error', false, error.message))
  await page.goto(server.url)
  await page.waitForFunction(() => window.ready)
  await page.evaluate(() => window.make('# Words\n\nAnd **more** words.', { menus: true }))
  await page.waitForTimeout(100)
  check('a plain document loads no components', loads.length === 0, String(loads.length))
  await page.evaluate(() => window.make('<table_of_contents/>\n\n# First\n\n## Second'))
  await page.waitForFunction(() => document.querySelectorAll('.aa-toc a').length === 2)
  check('a table of contents draws its headings', await page.locator('.aa-toc a').first().innerText() === 'First')
  check('the component file loads once', loads.length === 1, String(loads.length))
  await page.evaluate(() => window.make('Press @Button("Save", "primary") now', { partials: true, atoms: [] }))
  await page.waitForFunction(() => document.querySelector('.aa-partial ds-button'))
  check('an inline button is the real one at once the second time', await page.locator('.aa-partial ds-button').innerText() === 'Save')
  check('its words are not doubled', await page.evaluate(() => window.editor.value) === 'Press @Button("Save", "primary") now')
  await browser.close()
}
server.close()
console.log(failed ? `\n${failed} failed` : '\nAll sturdy')
process.exit(failed ? 1 : 0)
