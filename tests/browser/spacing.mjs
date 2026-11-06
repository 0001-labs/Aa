// The room between blocks, which each block is told from what stands before it, through every way the blocks change.
import { playwright, serve } from './lib.mjs'

let failed = 0
const pw = playwright(), server = await serve()
for (const name of ['chromium', 'webkit']) {
  const check = (what, ok, detail = '') => { console.log(`  ${ok ? '✓' : '✗'} ${name}: ${what}${detail ? ` (${detail})` : ''}`); if (!ok) failed++ }
  const browser = await pw[name].launch({ headless: true }), page = await browser.newPage()
  await page.goto(server.url)
  await page.waitForFunction(() => window.ready)
  await page.addStyleTag({ content: ':root { --aa-unit: 20px; --aa-gap: 20px; }' })
  const room = () => page.evaluate(async () => {
    await new Promise(requestAnimationFrame)
    return [...document.querySelectorAll('#host .aa-block')].map(block => parseFloat(getComputedStyle(block).marginTop)).join(' ')
  })
  const same = async (what, expected) => { const got = await room(); check(what, got === expected, got) }
  await page.evaluate(() => window.make('Words\n\nMore\n\n## Head\n\n### Next\n\n- One\n- Two\n\n---\n\nEnd'))
  await same('the first stands at the top, a heading two squares down, a heading after a heading one, bullets together, a divider none', '0 20 40 20 20 0 0 20')

  // Enter at the end of "Words", Backspace back: blocks come and go.
  await page.locator('#host .aa-block').first().click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await same('a block added keeps the room of those after it', '0 20 20 40 20 20 0 0 20')
  await page.keyboard.press('Backspace')
  await same('a block taken away gives it back', '0 20 40 20 20 0 0 20')

  // A heading after a heading stops being one when the block before it changes.
  await page.evaluate(() => window.make('## Head\n\n## Next'))
  await same('a heading after a heading stands one square down', '0 20')
  await page.locator('#host .aa-block').first().click()
  await page.evaluate(() => window.editor.turnInto('paragraph'))
  await same('the block before it turned to words gives it two', '0 40')
  await page.keyboard.press('ControlOrMeta+z')
  await same('undo gives it one again', '0 20')

  // Typing a mark of a kind turns the block in place; the one after it follows.
  await page.evaluate(() => window.make('Words\n\n- One'))
  await page.locator('#host .aa-block').first().click()
  await page.keyboard.press('Home')
  await page.keyboard.type('- ')
  await same('a block typed into a bullet draws the next bullet to it', '0 0')

  // A block moved stands by its new neighbours.
  await page.evaluate(() => window.make('## Head\n\n## Next\n\nWords'))
  await page.evaluate(() => { window.editor.moveBlock(2, 0) })
  await same('a block moved stands by its new neighbours', '0 40 20')
  await page.evaluate(() => { window.editor.value = 'Words\n\n## Head' })
  await same('a new value is told too', '0 40')
  await browser.close()
}
server.close()
console.log(failed ? `\n${failed} failed` : '\nAll sturdy')
process.exit(failed ? 1 : 0)
