// Tables and colours behind words in a real browser: rows one square high, a
// column's edge that follows the pointer and lands on whole squares, its width
// kept in the Markdown, and the bar's background tool. `node tests/browser/tables.mjs`
import { playwright, serve } from './lib.mjs'

const SOURCE = 'Before\n\n| Capability | Try it |\n| --- | --- |\n| Tables | Tab moves between cells |\n| Menus | Space for AI |\n\nAfter'
const engines = process.argv[2] ? [process.argv[2]] : ['chromium', 'webkit']
const pw = playwright(), server = await serve()
const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
let failed = 0
for (const name of engines) {
  const browser = await pw[name].launch({ headless: true })
  const page = await (await browser.newContext({ viewport: { width: 760, height: 500 } })).newPage()
  page.on('pageerror', error => { console.log(`  page error: ${error.message}`); failed++ })
  await page.goto(server.url); await page.waitForFunction(() => window.ready)
  const check = (what, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? '  ✓' : '  ✗'} ${name}: ${what}${detail === '' ? '' : ` (${detail})`}`) }
  const open = (value = SOURCE, options = {}) => page.evaluate(({ value, options }) => { window.make(value, options) }, { value, options })
  const firstCell = () => page.evaluate(() => { const r = document.querySelector('.aa-table-cell').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })
  const grip = at => page.evaluate(at => { const r = document.querySelectorAll('.ds-table-column-resize')[at].getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } }, at)

  await open()
  check('a row is one square high', await page.evaluate(() => [...document.querySelectorAll('.aa-table-row')].every(row => row.getBoundingClientRect().height === 20)))
  check('a table says nothing of widths until one is set', await page.evaluate(() => !document.querySelector('.aa-block[data-kind=table]').style.getPropertyValue('--aa-table-columns')))
  await page.setViewportSize({ width: 760, height: 500 })
  const before = await firstCell()
  const edge = await grip(0)
  await page.mouse.move(edge.x, edge.y); await page.waitForTimeout(160)
  check('the edge shows on hover', await page.evaluate(() => getComputedStyle(document.querySelector('.ds-table-column-resize'), '::after').opacity !== '0'))
  check('its line runs the table\'s height', await page.evaluate(() => { const handle = document.querySelector('.ds-table-column-resize'); return handle.getBoundingClientRect().height === document.querySelector('.aa-block[data-kind=table]').getBoundingClientRect().height }))
  await page.mouse.down()
  const steps = []
  for (let dx = -14; dx >= -98; dx -= 14) { await page.mouse.move(edge.x + dx, edge.y); await page.waitForTimeout(16); steps.push((await firstCell()).w) }
  check('the edge follows the pointer, never a square at a time', steps.slice(1).every((width, at) => Math.abs(steps[at] - width - 14) < 1.5), steps.map(Math.round).join(' '))
  await page.mouse.up(); await page.waitForTimeout(260)
  const landed = await firstCell()
  check('it lands on whole squares', landed.w % 20 === 0, landed.w)
  const value = await page.evaluate(() => window.editor.value)
  const dashes = /\n\| (-+) \| (-+) \|\n/.exec(value)
  check('the width is written as the table\'s dashes', !!dashes && dashes[1].length === landed.w / 20, dashes?.[0].trim())
  check('the words stay as they were', value.includes('| Capability | Try it |') && value.includes('| Tables | Tab moves between cells |'))
  await page.evaluate(value => window.make(value), value)
  check('it opens at that width', (await firstCell()).w === landed.w)
  check('a row stays one square high at that width', await page.evaluate(() => [...document.querySelectorAll('.aa-table-row')].every(row => row.getBoundingClientRect().height === 20)))

  await open()
  const start = await grip(0)
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(start.x - 60, start.y, { steps: 4 }); await page.waitForTimeout(30)
  await page.keyboard.press('Escape'); await page.mouse.up(); await page.waitForTimeout(220)
  check('Escape takes a drag back', (await firstCell()).w === before.w && await page.evaluate(source => window.editor.value === source, SOURCE))

  await open()
  await page.evaluate(() => document.querySelector('.ds-table-column-resize').focus())
  await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(40)
  const one = (await firstCell()).w
  check('an arrow moves a square, and the keys stay on the handle', one % 20 === 0 && await page.evaluate(() => document.activeElement?.classList.contains('ds-table-column-resize')), one)
  await page.keyboard.press('Shift+ArrowLeft'); await page.waitForTimeout(40)
  check('Shift and an arrow move five', (await firstCell()).w === one - 100, (await firstCell()).w)

  await open()
  const again = await grip(0)
  await page.mouse.move(again.x, again.y); await page.mouse.down(); await page.mouse.move(again.x - 40, again.y, { steps: 3 }); await page.mouse.up(); await page.waitForTimeout(260)
  await page.evaluate(() => document.querySelector('.ds-table-column-resize')?.blur())
  await page.evaluate(() => document.querySelector('.aa-block').focus())
  await page.keyboard.press(`${mod}+z`); await page.waitForTimeout(80)
  check('one undo takes a width back', await page.evaluate(source => window.editor.value === source, SOURCE))

  await open()
  const cell = await page.evaluate(() => { const r = document.querySelectorAll('.aa-table-cell')[2].getBoundingClientRect(); return { x: r.x + 30, y: r.y + 10 } })
  await page.mouse.click(cell.x, cell.y); await page.keyboard.type('X'); await page.waitForTimeout(40)
  check('a cell still takes words', /\| \S*X\S* \|/.test(await page.evaluate(() => window.editor.value)))

  // The bar
  await open('Colour these words', { toolbar: true })
  await page.evaluate(() => window.pickWords('these')); await page.waitForTimeout(260)
  check('background stands after text colour', await page.evaluate(() => { const actions = [...document.querySelectorAll('.aa-toolbar > button')].map(b => b.dataset.action); return actions[0] === 'color' && actions[1] === 'background' }))
  check('no dead plus', await page.evaluate(() => !document.querySelector('.aa-toolbar-spacer .aa-icon')))
  const pick = async id => { await page.evaluate(() => window.pickWords('these')); await page.waitForTimeout(240); await page.locator('.aa-toolbar [data-action="background"]').click(); await page.waitForTimeout(40); await page.locator(`.aa-menu [data-command="${id}"]`).click(); await page.waitForTimeout(40) }
  await pick('color-bg-red')
  check('a background is written as Notion writes it', await page.evaluate(() => window.editor.value) === 'Colour <span color="red_background">these</span> words', await page.evaluate(() => window.editor.value))
  check('it shows, with no tag on the screen', await page.evaluate(() => { const el = document.querySelector('.aa-bg'); return !!el && getComputedStyle(el).backgroundColor !== 'rgba(0, 0, 0, 0)' && window.visible() === 'Colour these words' }))
  await pick('color-bg-yellow')
  check('yellow is the highlight, in its place', await page.evaluate(() => window.editor.value) === 'Colour ==these== words', await page.evaluate(() => window.editor.value))
  await page.evaluate(() => { window.pickWords('these'); window.editor.color('blue') }); await page.waitForTimeout(40)
  await pick('color-bg-green')
  check('a background and a text colour stand together', await page.evaluate(() => { const el = document.querySelector('.aa-bg'); return !!el?.closest('[data-color="blue"]') || !!el?.querySelector?.('[data-color="blue"]') || el?.dataset.color === 'blue' }), await page.evaluate(() => window.editor.value))
  await pick('color-bg-default')
  check('Default takes it off and leaves the colour', await page.evaluate(() => window.editor.value) === 'Colour <span color="blue">these</span> words', await page.evaluate(() => window.editor.value))
  await browser.close()
}
server.close()
console.log(failed ? `\n${failed} failed` : '\nAll sturdy')
process.exit(failed ? 1 : 0)
