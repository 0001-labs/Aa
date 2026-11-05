// A diagram handled by hand in a real browser, where a unit test cannot see it:
// what is carried must visibly move, with its lines, and sizing must follow the
// pointer and land on whole squares. `node tests/browser/diagram.mjs [chromium|webkit]`
import { playwright, serve } from './lib.mjs'

const SOURCE = '```diagram\n# A diagram by hand\n[Drawn] @ 0 3\n[Kept as Markdown] @ 16 1 light-green w8\nDrawn -> Kept as Markdown\n```\n\nAfter it.'
const engines = process.argv[2] ? [process.argv[2]] : ['chromium', 'webkit']
const pw = playwright(), server = await serve()
let failed = 0

for (const name of engines) {
  const browser = await pw[name].launch({ headless: true })
  const page = await (await browser.newContext({ viewport: { width: 760, height: 460 } })).newPage()
  page.on('pageerror', error => { console.log(`  page error: ${error.message}`); failed++ })
  await page.goto(server.url); await page.waitForFunction(() => window.ready)
  const check = (what, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? '  ✓' : '  ✗'} ${name}: ${what}${detail === '' ? '' : ` (${detail})`}`) }
  const open = () => page.evaluate(async source => {
    const diagram = await import('/dist/diagram.js'), aa = await import('/dist/aa.js')
    window.make(source, { atoms: [aa.imageAtom, diagram.diagramAtom], toolbar: true, menus: true })
    window.inDrawing = selector => document.querySelector('aa-diagram-board aa-diagram').shadowRoot.querySelector(selector)
    window.boxOf = text => [...document.querySelector('aa-diagram-board aa-diagram').shadowRoot.querySelectorAll('.box')].find(box => box.textContent === text)
    window.rectOf = text => { const box = window.boxOf(text); if (!box) return null; const r = box.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } }
    window.board = selector => document.querySelector('aa-diagram-board').shadowRoot.querySelector(selector)
    window.lineEnds = () => [...document.querySelector('aa-diagram-board aa-diagram').shadowRoot.querySelectorAll('path')].map(path => path.getAttribute('d')).join('|')
    await new Promise(done => setTimeout(done, 200))
  }, SOURCE)

  // Carrying
  await open()
  const start = await page.evaluate(() => window.rectOf('Drawn'))
  const lines = await page.evaluate(() => window.lineEnds())
  const point = { x: start.x + 20, y: start.y + 10 }
  await page.mouse.move(point.x, point.y); await page.mouse.down()
  await page.mouse.move(point.x + 8, point.y + 4, { steps: 3 }); await page.waitForTimeout(40)
  const trail = []
  for (let dx = 20; dx <= 130; dx += 11) { await page.mouse.move(point.x + dx, point.y + dx / 4); await page.waitForTimeout(16); trail.push(await page.evaluate(() => window.rectOf('Drawn'))) }
  const held = trail.at(-1)
  check('what is carried follows the pointer exactly', Math.abs(held.x - start.x - 130) < 1.5 && Math.abs(held.y - start.y - 32.5) < 1.5, `moved ${held.x - start.x}, ${held.y - start.y}`)
  check('it moves smoothly, never by whole squares', trail.slice(1).every((rect, i) => Math.abs(rect.x - trail[i].x - 11) < 1.5), trail.map(r => Math.round(r.x)).join(' '))
  check('it visibly lifts', await page.evaluate(() => getComputedStyle(window.boxOf('Drawn')).boxShadow !== 'none'))
  check('its squares are marked', await page.evaluate(() => { const ring = window.board('.ring'); return !ring.hidden && getComputedStyle(ring).backgroundColor !== 'rgba(0, 0, 0, 0)' }))
  check('its line goes with it', await page.evaluate(() => window.lineEnds()) !== lines)
  await page.mouse.up(); await page.waitForTimeout(350)
  const landed = await page.evaluate(() => window.rectOf('Drawn'))
  check('it lands on whole squares', landed.x % 20 === start.x % 20 && landed.y % 20 === start.y % 20, `${landed.x}, ${landed.y}`)
  check('nothing is left lifted', await page.evaluate(() => { const box = window.boxOf('Drawn'); return !box.hasAttribute('data-carried') && !box.style.transform }))
  check('it is written', (await page.evaluate(() => window.editor.value)).includes('[Drawn] @ '))
  await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+z`); await page.waitForTimeout(100)
  check('one undo takes it back', await page.evaluate(source => window.editor.value === source, SOURCE))

  // Taken back
  await open()
  await page.mouse.move(point.x, point.y); await page.mouse.down()
  await page.mouse.move(point.x + 90, point.y + 45, { steps: 8 }); await page.waitForTimeout(40)
  await page.keyboard.press('Escape'); await page.waitForTimeout(350)
  await page.mouse.up()
  const home = await page.evaluate(() => window.rectOf('Drawn'))
  check('Escape takes it home', Math.abs(home.x - start.x) < 1 && Math.abs(home.y - start.y) < 1, `${home.x}, ${home.y}`)
  check('Escape changes nothing', await page.evaluate(source => window.editor.value === source, SOURCE))

  // Sizing
  await open()
  const kept = await page.evaluate(() => window.rectOf('Kept as Markdown'))
  await page.mouse.move(kept.x + 40, kept.y + 10); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(80)
  await page.keyboard.press('Escape'); await page.waitForTimeout(80)
  const grip = await page.evaluate(() => { const grip = window.board('.grip'), r = grip.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, hidden: grip.hidden } })
  check('a chosen box shows its grip', !grip.hidden)
  if (!grip.hidden) {
    await page.mouse.move(grip.x, grip.y); await page.mouse.down(); await page.mouse.move(grip.x + 6, grip.y); await page.waitForTimeout(30)
    const widths = []
    for (let dx = 12; dx <= 72; dx += 12) { await page.mouse.move(grip.x + dx, grip.y); await page.waitForTimeout(16); widths.push((await page.evaluate(() => window.rectOf('Kept as Markdown'))).w) }
    check('a box sized follows the pointer, never whole squares at a time', widths.slice(1).every((w, i) => Math.abs(w - widths[i] - 12) < 1.5), widths.map(Math.round).join(' '))
    await page.mouse.up(); await page.waitForTimeout(350)
    const final = await page.evaluate(() => window.rectOf('Kept as Markdown'))
    check('a box sized lands on whole squares', final.w % 20 === 0, final.w)
    check('its size is written', /w\d+/.test(await page.evaluate(() => window.editor.value)) )
  }

  // Out of the tools
  await open()
  const paperAt = await page.evaluate(() => { const r = document.querySelector('aa-diagram-board').getBoundingClientRect(); return { x: r.x, y: r.y } })
  await page.mouse.click(paperAt.x + 300, paperAt.y + 110); await page.waitForTimeout(100)
  const tool = await page.evaluate(() => { const r = window.board('.tools button').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  await page.mouse.move(tool.x, tool.y); await page.mouse.down()
  await page.mouse.move(paperAt.x + 200, paperAt.y + 120, { steps: 8 }); await page.waitForTimeout(60)
  const ghost = await page.evaluate(() => { const ghost = window.board('.ghost-box'); return { hidden: ghost.hidden, background: getComputedStyle(ghost).backgroundColor } })
  check('an item carried from the tools shows where it lands', !ghost.hidden && ghost.background !== 'rgba(0, 0, 0, 0)', JSON.stringify(ghost))
  await page.mouse.up(); await page.waitForTimeout(200)
  await page.keyboard.press('Escape')

  await browser.close()
}
server.close()
console.log(failed ? `\n${failed} failed` : '\nAll sturdy')
process.exit(failed ? 1 : 0)
