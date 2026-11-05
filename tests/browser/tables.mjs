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
  check('editor resize styles leave sibling native-table handles alone', await page.evaluate(() => {
    const handle = document.createElement('span'); handle.className = 'ds-table-column-resize';
    document.body.append(handle);
    const untouched = getComputedStyle(handle).position === 'static'; handle.remove(); return untouched;
  }))
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

  // On the grid
  await page.evaluate(() => { document.getElementById('host').style.width = '643.8px' })
  await open()
  const lines = () => page.evaluate(() => { const table = document.querySelector('.aa-block[data-kind=table]'), box = table.getBoundingClientRect(), rows = [...table.querySelectorAll('.aa-table-row')].map(row => row.getBoundingClientRect()), cells = [...table.querySelectorAll('.aa-table-row:first-child .aa-table-cell')].map(cell => cell.getBoundingClientRect()), word = document.createRange(); word.selectNodeContents(table.querySelector('.aa-table-cell span:last-child')); return { width: box.width, tops: rows.map(row => row.top - box.top), columns: cells.map(cell => cell.left - box.left), inset: word.getBoundingClientRect().left - cells[0].left, frame: getComputedStyle(table).boxShadow, lastRule: getComputedStyle(table.querySelector('.aa-table-row:nth-last-child(2) .aa-table-cell:last-child')).boxShadow } })
  const grid = await lines()
  check('the table is as wide as whole squares', grid.width % 20 === 0, grid.width)
  check('every row starts on a square', grid.tops.every(top => top % 20 === 0), grid.tops.join(' '))
  check('every column starts on a square', grid.columns.every(left => left % 20 === 0), grid.columns.join(' '))
  check('words stand an item\'s padding in', grid.inset === 4, grid.inset)
  check('it has lines all around', grid.frame !== 'none' && !grid.frame.includes('0px 0px 0px 0px'), grid.frame.slice(0, 50))

  // Code blocks
  await open('Before\n\n```ts\nconst a = 1\nconst b = 2\n```\n\nAfter')
  const code = await page.evaluate(() => { const b = document.querySelector('[data-kind=code]'), r = b.getBoundingClientRect(), t = b.querySelector('.aa-c'), tr = t.getBoundingClientRect(), c = getComputedStyle(t); return { top: tr.top - r.top, height: r.height, fill: c.backgroundColor, button: getComputedStyle(b, '::before').content, x: r.right - 10, y: r.top + 10, words: t.textContent } })
  check('a code block has one square above its code', code.top >= 20 && code.top < 25, code.top)
  check('its height is its lines and one square each way', code.height === 80, code.height)
  check('its code is not drawn as inline code', code.fill === 'rgba(0, 0, 0, 0)')
  check('it always shows a copy button', code.button !== 'none')
  await page.evaluate(() => { window.copied = null; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: text => { window.copied = text; return Promise.resolve() } } }) })
  await page.mouse.click(code.x, code.y); await page.waitForTimeout(40)
  check('it copies the code, without its fences', await page.evaluate(() => window.copied) === 'const a = 1\nconst b = 2', await page.evaluate(() => JSON.stringify(window.copied)))
  check('it changes nothing', await page.evaluate(() => window.editor.value.includes('```ts\nconst a = 1')))
  await page.evaluate(() => window.pickWords('const a')); await page.keyboard.press('ArrowRight'); await page.keyboard.type('X'); await page.waitForTimeout(40)
  check('code can still be typed in', (await page.evaluate(() => window.editor.value)).includes('const aX = 1'), JSON.stringify((await page.evaluate(() => window.editor.value)).slice(8, 34)))

  // A header is as bold as its Markdown
  await open()
  check('a header is not bold by itself', await page.evaluate(() => Number(getComputedStyle(document.querySelector('.aa-table-cell span:last-child')).fontWeight) < 500))
  await page.evaluate(() => { document.querySelector('.aa-table-cell').focus(); window.pickWords('Capability') })
  await page.keyboard.press(`${mod}+b`); await page.waitForTimeout(40)
  check('Bold on a header\'s words bolds them', (await page.evaluate(() => window.editor.value)).includes('| **Capability** | Try it |'))
  await page.evaluate(() => window.pickWords('Capability')); await page.keyboard.press(`${mod}+b`); await page.waitForTimeout(40)
  check('and again takes it off', (await page.evaluate(() => window.editor.value)).includes('| Capability | Try it |'))
  await page.evaluate(() => { window.pickWords('Capability'); window.editor.table('bold-header') }); await page.waitForTimeout(40)
  check('the menu bolds the whole row', (await page.evaluate(() => window.editor.value)).includes('| **Capability** | **Try it** |'))
  await page.evaluate(() => { window.pickWords('Capability'); window.editor.table('bold-header') }); await page.waitForTimeout(40)
  check('and takes it off the whole row', (await page.evaluate(() => window.editor.value)).includes('| Capability | Try it |'))

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
  // A drag over cells: marks stay in each cell, and deleting or typing leaves the columns.
  const ROW = '| Tjeneste | Formål | Pris |\n| --- | --- | --- |\n| Cloudflare | Hosting | 750 |'
  const wordBox = word => page.evaluate(word => { const walker = document.createTreeWalker(document.querySelector('#host'), 4); for (let node = walker.nextNode(); node; node = walker.nextNode()) { if (node.parentElement.closest('.aa-syntax')) continue; const at = node.data.indexOf(word); if (at < 0) continue; const range = document.createRange(); range.setStart(node, at); range.setEnd(node, at + word.length); const box = range.getBoundingClientRect(); return { left: box.left, right: box.right, y: box.top + box.height / 2 } } }, word)
  const sweep = async () => {
    await open(ROW)
    const first = await wordBox('Tjeneste'), last = await wordBox('Pris')
    await page.mouse.click(4, 490)
    await page.mouse.move(first.left + 1, first.y); await page.mouse.down(); await page.mouse.move(last.right - 1, last.y, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(80)
  }
  const written = () => page.evaluate(() => window.editor.value)
  await sweep(); await page.keyboard.press(`${mod}+b`); await page.waitForTimeout(80)
  check('bold over cells marks each cell', (await written()).startsWith('| **Tjeneste** | **Formål** | **Pris** |'), (await written()).split('\n')[0])
  check('and no star shows', await page.evaluate(() => !window.visible().includes('*')))
  await page.keyboard.press(`${mod}+b`); await page.waitForTimeout(80)
  check('bold again takes it off every cell', await written() === ROW, (await written()).split('\n')[0])
  await sweep(); await page.keyboard.press('Backspace'); await page.waitForTimeout(80)
  check('deleting over cells keeps the columns', (await written()).startsWith('|  |  |  |\n'), (await written()).split('\n')[0])
  await sweep(); await page.keyboard.type('ab'); await page.waitForTimeout(80)
  check('typing over cells writes in the first', (await written()).startsWith('| ab |  |  |\n'), (await written()).split('\n')[0])
  await sweep(); await page.keyboard.press(`${mod}+x`); await page.waitForTimeout(80)
  check('cutting over cells keeps the columns', (await written()).startsWith('|  |  |  |\n'), (await written()).split('\n')[0])
  await browser.close()
}
server.close()
console.log(failed ? `\n${failed} failed` : '\nAll sturdy')
process.exit(failed ? 1 : 0)
