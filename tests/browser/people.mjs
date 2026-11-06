// One Backspace removes a tagged person, and any atom, however the caret came to stand after it.
import { playwright, serve } from './lib.mjs'

let failed = 0
const pw = playwright(), server = await serve()
for (const name of ['chromium', 'webkit']) {
  const check = (what, ok, detail = '') => { console.log(`  ${ok ? '✓' : '✗'} ${name}: ${what}${detail ? ` (${detail})` : ''}`); if (!ok) failed++ }
  const browser = await pw[name].launch({ headless: true }), page = await browser.newPage()
  await page.goto(server.url)
  const make = (value, caret) => page.evaluate(([v, at]) => {
    window.make(v, { atoms: [window.imageAtom, window.personAtom(() => ['Joachim', 'Steven', 'Steven Nielsen'])] })
    window.editor.focus(); window.editor.selectRange(at)
  }, [value, caret ?? value.length])
  const value = () => page.evaluate(() => window.editor.value)
  const press = async key => { await page.evaluate(() => new Promise(requestAnimationFrame)); await page.keyboard.press(key) }
  const once = async (what, source, key, expected, caret) => {
    await make(source, caret)
    await press(key)
    check(what, (await value()) === expected, await value())
  }
  await once('Backspace after a tag takes all of it', 'Hej @Steven', 'Backspace', 'Hej ')
  await once('Backspace after the space after a tag takes both', 'Hej @Steven ', 'Backspace', 'Hej ')
  await once('a longer name goes whole', 'Hej @Steven Nielsen', 'Backspace', 'Hej ')
  await once('a tag alone in a block goes in one press', '@Joachim', 'Backspace', '')
  await once('a tag in the middle of words', 'Hej @Joachim tak', 'Backspace', 'Hej  tak', 'Hej @Joachim'.length)
  await once('Delete before a tag takes all of it', 'Hej @Steven tak', 'Delete', 'Hej  tak', 4)
  await once('a tag in a list', '- Hej @Steven', 'Backspace', '- Hej ')
  await once('a tag in bold', 'Hej **@Steven** nu', 'Backspace', 'Hej  nu', 'Hej **@Steven'.length)
  await once('a tag in a table cell', '| Navn |\n| --- |\n| @Steven |', 'Backspace', '| Navn |\n| --- |\n|  |', '| Navn |\n| --- |\n| @Steven'.length)
  await once('a picture goes in one press too', 'Se ![a](https://a.b/c.png)', 'Backspace', 'Se ')
  await once('plain words are still a letter at a time', 'Hej @Stevens', 'Backspace', 'Hej @Steven')
  await once('words after a space stay a letter at a time', 'Hej @Steven tak', 'Backspace', 'Hej @Steven ta')

  await make('Hej @Steven')
  await press('Backspace')
  await page.keyboard.press('ControlOrMeta+z')
  check('undo brings the tag back in one step', (await value()) === 'Hej @Steven', await value())
  await make('Hej ')
  await page.locator('#host .aa-block').click()
  await page.keyboard.press('End')
  await page.keyboard.type('@Steven')
  check('a typed name becomes a tag', await page.locator('.aa-atom[data-atom=person]').count() === 1)
  await press('Backspace')
  check('and one Backspace removes it', (await value()) === 'Hej ', await value())
  await browser.close()
}
server.close()
console.log(failed ? `\n${failed} failed` : '\nAll sturdy')
process.exit(failed ? 1 : 0)
