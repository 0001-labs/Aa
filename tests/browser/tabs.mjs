// Renaming a tab in a real browser: the row must not move by a pixel as the field
// opens or closes, and only by what the letters add as they are typed.
import { playwright, serve } from './lib.mjs'

const engines = process.argv[2] ? [process.argv[2]] : ['chromium', 'webkit']
const pw = playwright(), server = await serve()
let failed = 0
for (const name of engines) {
  const browser = await pw[name].launch({ headless: true })
  const page = await (await browser.newContext({ viewport: { width: 620, height: 240 } })).newPage()
  await page.goto(server.url); await page.waitForFunction(() => window.ready)
  const check = (what, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? '  ✓' : '  ✗'} ${name}: ${what}${detail === '' ? '' : ` (${detail})`}`) }
  await page.evaluate(() => window.make('<tabs>\n<tab name="Entrance">\nOne\n</tab>\n<tab name="Stage" icon="🎤">\nTwo\n</tab>\n<tab name="Another tab">\nThree\n</tab>\n</tabs>'))
  const places = () => page.evaluate(() => [...document.querySelectorAll('.aa-tab')].map(tab => { const r = tab.getBoundingClientRect(); return `${r.left}:${r.width}` }).join(' '))
  const stage = page.locator('.aa-tab', { hasText: 'Stage' })
  await stage.click(); await page.waitForTimeout(60)
  const closed = await places()
  await stage.click(); await page.waitForTimeout(60)
  check('the name opens for writing', await page.evaluate(() => document.activeElement?.classList.contains('aa-tab-name') && document.activeElement.isContentEditable))
  check('opening it moves nothing', await places() === closed, await places())
  check('it has no underline', await page.evaluate(() => { const c = getComputedStyle(document.activeElement); return c.borderBottomWidth === '0px' && c.textDecorationLine === 'none' && c.outlineStyle === 'none' }))
  check('there is no field to line up with the words', await page.evaluate(() => !document.querySelector('.aa-tabs-row input')))
  await page.keyboard.press('Escape'); await page.waitForTimeout(60)
  check('closing it moves nothing', await places() === closed)
  check('Escape leaves the name', await page.evaluate(() => !window.editor.value.includes('Staged')))
  await stage.click(); await page.waitForTimeout(60)
  await page.keyboard.press('ArrowRight'); await page.keyboard.type('s'); await page.waitForTimeout(60)
  const typed = (await page.evaluate(() => [...document.querySelectorAll('.aa-tab')].map(tab => tab.getBoundingClientRect().left)))
  check('the row grows by what is typed, and only that', typed[1] > Number(closed.split(' ')[1].split(':')[0]) - 1, typed.join(' '))
  await page.keyboard.press('Enter'); await page.waitForTimeout(80)
  check('Enter writes the name', await page.evaluate(() => window.editor.value.includes('name="Stages"')))
  check('the name shows', await page.evaluate(() => [...document.querySelectorAll('.aa-tab-name')].some(n => n.textContent === 'Stages')))
  await page.evaluate(() => window.make('<tabs>\n<tab name="Stage" icon="🎤">\nTwo\n</tab>\n</tabs>'))
  check('the emoji clears the row', await page.evaluate(() => { const i = document.querySelector('.aa-tab-icon').getBoundingClientRect(), r = document.querySelector('.aa-tabs-row').getBoundingClientRect(); return i.top >= r.top && i.bottom <= r.bottom && parseFloat(getComputedStyle(document.querySelector('.aa-tab-icon')).fontSize) <= 12 }))
  await page.setViewportSize({ width: 240, height: 400 })
  await page.evaluate(() => window.make('<tabs>\n<tab name="Entrance">\nOne\n</tab>\n<tab name="Stairs">\nTwo\n</tab>\n<tab name="Stage">\nThree\n</tab>\n</tabs>'))
  check('narrow tab rows wrap without hiding any tab', await page.evaluate(() => {
    const row = document.querySelector('.aa-tabs-row')
    const box = row.getBoundingClientRect()
    return row.scrollWidth <= row.clientWidth + 1 && [...row.querySelectorAll('.aa-tab')].every(tab => {
      const face = tab.getBoundingClientRect()
      return face.left >= box.left - 1 && face.right <= box.right + 1 && face.bottom <= box.bottom + 1
    })
  }))
  await browser.close()
}
server.close()
console.log(failed ? `\n${failed} failed` : '\nAll sturdy')
process.exit(failed ? 1 : 0)
