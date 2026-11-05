// How sturdy Aa is, in a real browser with real keys: each case starts from a
// document, does what a person does, and must leave no syntax on the screen,
// the words and marks expected, a document that reads back the same when
// reopened, and an undo that goes all the way back.
// `node tests/browser/sturdy.mjs [chromium|webkit|all] [--only=name]`
import { playwright, serve } from './lib.mjs'

const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
const C = (m, ...rest) => ({ m, ...Object.fromEntries(rest.map(k => [k, true])) })
const pick = words => ({ pick: words })
const end = { end: true }, type = text => ({ type: text }), press = key => ({ press: key })
const color = name => ({ color: name })

/** A case: `value`, the steps, and what the words must then be; `marks` is `[[text, marks]…]` a block. */
export const CASES = [
  // Typing at a mark's edges
  { name: 'space then word at the end of bold', value: '**word**', steps: [end, type(' next')], shows: 'word next', marks: [[['word next', 'b']]] },
  { name: 'space at the end of bold and stop', value: '**word**', steps: [end, type(' ')], shows: 'word ' },
  { name: 'space at the end of italic then word', value: '*word*', steps: [end, type(' next')], shows: 'word next', marks: [[['word next', 'i']]] },
  { name: 'space at the end of strike then word', value: '~~word~~', steps: [end, type(' next')], shows: 'word next', marks: [[['word next', 's']]] },
  { name: 'space at the end of highlight then word', value: '==word==', steps: [end, type(' next')], shows: 'word next', marks: [[['word next', 'h']]] },
  { name: 'space at the end of bold italic then word', value: '***word***', steps: [end, type(' next')], shows: 'word next', marks: [[['word next', 'b+i']]] },
  { name: 'typing inside bold', value: '**word**', steps: [pick('or'), type('X')], shows: 'wXd', marks: [[['wXd', 'b']]] },
  // Deleting within a mark
  { name: 'delete the first word of bold', value: '**Hello world**', steps: [pick('Hello'), press('Backspace')], shows: ' world' },
  { name: 'delete the last word of bold', value: '**Hello world**', steps: [pick('world'), press('Backspace')], shows: 'Hello ' },
  { name: 'delete all of a bold word in a sentence', value: 'one **two** three', steps: [pick('two'), press('Backspace')], shows: 'one  three' },
  { name: 'backspace bold away letter by letter', value: 'one **ab** three', steps: [pick('b'), press('Backspace'), press('Backspace')], shows: 'one  three' },
  { name: 'backspace bold away alone in a block', value: '**x**', steps: [end, press('Backspace')], shows: '' },
  { name: 'backspace strike away alone stays a paragraph', value: '~~x~~', steps: [end, press('Backspace'), type('y')], shows: 'y' },
  { name: 'backspace bold away alone stays a paragraph', value: '**xy**', steps: [end, press('Backspace'), press('Backspace'), type('z')], shows: 'z' },
  { name: 'backspace code away', value: 'a `x` b', steps: [pick('x'), press('Backspace')], shows: 'a  b' },
  { name: 'delete word with option across bold end', value: 'plain **bold word**', steps: [end, press('Alt+Backspace'), press('Alt+Backspace')], shows: 'plain ' },
  // Selections that cross a mark's edge
  { name: 'delete across the end of bold', value: '**bold text** plain rest', steps: [pick('text plain'), press('Backspace')], shows: 'bold  rest', marks: [[['bold', 'b'], ['  rest', '']]] },
  { name: 'delete across the start of bold', value: 'plain **bold text** rest', steps: [pick('plain bold'), press('Backspace')], shows: ' text rest' },
  { name: 'type over across the end of bold', value: '**bold text** plain rest', steps: [pick('text plain'), type('X')], shows: 'bold X rest' },
  { name: 'type over across the start of bold', value: 'plain **bold text** rest', steps: [pick('plain bold'), type('X')], shows: 'X text rest' },
  { name: 'delete across two marks', value: '**one two** and *three four*', steps: [pick('two and three'), press('Backspace')], shows: 'one  four' },
  { name: 'delete across the end of colour', value: '<span color="red">one two</span> three', steps: [pick('two three'), press('Backspace')], shows: 'one ' },
  { name: 'delete across the end of a link', value: '[link text](https://a.example) rest', steps: [pick('text rest'), press('Backspace')], shows: 'link ' },
  { name: 'delete across the end of code', value: '`one two` three', steps: [pick('two three'), press('Backspace')], shows: 'one ' },
  { name: 'cut across the end of bold', value: '**one two** three', steps: [pick('two three'), press(`${mod}+x`)], shows: 'one ' },
  // Blocks
  { name: 'enter in the middle of bold', value: '**bold text**', steps: [pick('b'), { right: 4 }, press('Enter')], shows: 'bold\n text' },
  { name: 'enter in the middle of colour', value: '<span color="blue">one two</span>', steps: [pick('o'), { right: 3 }, press('Enter')], shows: 'one\n two', marks: [[['one', 'blue']], [[' two', 'blue']]] },
  { name: 'enter in the middle of a bold bullet', value: '- **one two**', steps: [pick('o'), { right: 3 }, press('Enter')], shows: 'one\ntwo' },
  { name: 'join two bold blocks', value: '**a**\n\n**b**', steps: [pick('b'), { collapse: true }, press('Backspace')], shows: 'ab', marks: [[['ab', 'b']]] },
  { name: 'join a bold block to plain', value: 'plain\n\n**b**', steps: [pick('b'), { collapse: true }, press('Backspace')], shows: 'plainb' },
  { name: 'delete across two bold blocks', value: '**one two**\n\n**three four**', steps: [pick('two'), { shift: 'three' }, press('Backspace')], shows: 'one  four' },
  { name: 'type over two bold blocks', value: '**one two**\n\n**three four**', steps: [pick('two'), { shift: 'three' }, type('X')], shows: 'one X four' },
  { name: 'enter over a selection across bold', value: '**one two** three', steps: [pick('two three'), press('Enter')], shows: 'one \n' },
  { name: 'delete joins a heading\'s words, not its hashes', value: 'plain\n\n## Heading', steps: [pick('plain'), { collapseEnd: true }, press('Delete')], shows: 'plainHeading' },
  { name: 'delete joins a bullet\'s words, not its dash', value: 'plain\n\n- item', steps: [pick('plain'), { collapseEnd: true }, press('Delete')], shows: 'plainitem' },
  { name: 'drag across two blocks and delete', value: 'one two\n\nthree four', steps: [{ drag: ['two', 'three'] }, press('Backspace')], shows: 'one  four' },
  { name: 'drag across two blocks and type', value: 'one two\n\nthree four', steps: [{ drag: ['two', 'three'] }, type('X')], shows: 'one X four' },
  { name: 'drag across bold blocks and bold', value: '**one two**\n\n**three four**', steps: [{ drag: ['two', 'three'] }, press(`${mod}+b`)], shows: 'one two\nthree four' },
  { name: 'after a selection across blocks, typing goes on', value: 'one two\n\nthree four', steps: [{ drag: ['two', 'three'] }, press('Backspace'), type('ok')], shows: 'one ok four' },
  // Tables
  { name: 'a bold word in a table cell', value: '| **one** | two |\n| --- | --- |\n| *three* | four |', steps: [], shows: 'one two three four'.replace(/ /g, '') },
  { name: 'typing in a cell keeps its marks', value: '| **one** | two |\n| --- | --- |\n| a | b |', steps: [pick('one'), { collapseEnd: true }, type('x')], shows: 'onextwoab' },
  { name: 'an escaped pipe in a cell', value: '| a \\| b | c |\n| --- | --- |\n| d | e |', steps: [], shows: 'a | bcde' },
  // Formatting over formatting
  { name: 'bold a word in italic', value: '*one two three*', steps: [pick('two'), press(`${mod}+b`)], shows: 'one two three', marks: [[['one ', 'i'], ['two', 'b+i'], [' three', 'i']]] },
  { name: 'italic a word in bold', value: '**one two three**', steps: [pick('two'), press(`${mod}+i`)], shows: 'one two three', marks: [[['one ', 'b'], ['two', 'b+i'], [' three', 'b']]] },
  { name: 'unbold a word in bold', value: '**one two three**', steps: [pick('two'), press(`${mod}+b`)], shows: 'one two three', marks: [[['one', 'b'], [' two ', ''], ['three', 'b']]] },
  { name: 'unitalic a word in italic', value: '*one two three*', steps: [pick('two'), press(`${mod}+i`)], shows: 'one two three' },
  { name: 'bold across the end of bold', value: '**one** two', steps: [pick('ne tw'), press(`${mod}+b`)], shows: 'one two' },
  { name: 'bold across the start of bold', value: 'one **two**', steps: [pick('ne tw'), press(`${mod}+b`)], shows: 'one two' },
  { name: 'bold across two bold words', value: '**one** and **two**', steps: [pick('one and two'), press(`${mod}+b`)], shows: 'one and two', marks: [[['one and two', 'b']]] },
  { name: 'strike a word in bold', value: '**one two three**', steps: [pick('two'), press(`${mod}+Shift+x`)], shows: 'one two three' },
  { name: 'underline across the end of bold', value: '**one two** three', steps: [pick('two three'), press(`${mod}+u`)], shows: 'one two three' },
  { name: 'code a word in bold', value: '**one two three**', steps: [pick('two'), press(`${mod}+e`)], shows: 'one two three' },
  { name: 'bold a word in code', value: '`one two three`', steps: [pick('two'), press(`${mod}+b`)], shows: 'one two three' },
  { name: 'bold twice gives it back', value: 'one two', steps: [pick('one'), press(`${mod}+b`), press(`${mod}+b`)], shows: 'one two', marks: [[['one two', '']]] },
  { name: 'bold a word with its space', value: 'one two three', steps: [pick('two '), press(`${mod}+b`)], shows: 'one two three', marks: [[['one ', ''], ['two', 'b'], [' three', '']]] },
  { name: 'bold with nothing selected, then type', value: 'one ', steps: [end, press(`${mod}+b`), type('two')], shows: 'one two', marks: [[['one ', ''], ['two', 'b']]] },
  { name: 'bold with nothing selected, then leave', value: 'one', steps: [end, press(`${mod}+b`), press('ArrowLeft'), type('x')], shows: 'onxe' },
  { name: 'bold off at the end of bold, then type', value: '**one**', steps: [end, press(`${mod}+b`), type(' two')], shows: 'one two' },
  { name: 'select all and bold, twice', value: 'one\n\n**two**\n\nthree', steps: [press(`${mod}+a`), press(`${mod}+a`), press(`${mod}+b`), press(`${mod}+b`)], shows: 'one\ntwo\nthree' },
  // Colour
  { name: 'colour across a soft break in a quote', value: '> one\n> two', steps: [pick('one'), { shift: 'two' }, color('blue')], shows: 'one\ntwo', marks: [[['one', 'blue'], ['\n', ''], ['two', 'blue']]] , loose: true },
  { name: 'a colour left across a quote\'s lines', value: '> <span color="blue">**Read first:** the words.\n> </span>', steps: [], shows: 'Read first: the words.\n' },
  { name: 'a colour left across a callout\'s lines', value: '> [!note]\n> <span color="blue">one\n> two</span>', steps: [], shows: '\none\ntwo', loose: true },
  { name: 'bold left across a quote\'s lines', value: '> **one\n> two**', steps: [], shows: 'one\ntwo', loose: true },
  { name: 'recolour a word in a colour', value: '<span color="red">one two three</span>', steps: [pick('two'), color('blue')], shows: 'one two three', marks: [[['one ', 'red'], ['two', 'blue'], [' three', 'red']]] },
  { name: 'take colour off a word in a colour', value: '<span color="red">one two three</span>', steps: [pick('two'), color(null)], shows: 'one two three', marks: [[['one ', 'red'], ['two', ''], [' three', 'red']]] },
  { name: 'colour across the end of bold', value: '**one two** three', steps: [pick('two three'), color('blue')], shows: 'one two three', marks: [[['one ', 'b'], ['two', 'b+blue'], [' three', 'blue']]] },
  { name: 'colour across the end of a colour', value: '<span color="red">one two</span> three', steps: [pick('two three'), color('blue')], shows: 'one two three' },
  { name: 'colour a selection ending on a line break', value: 'one\ntwo', steps: [pick('one'), { shiftRight: 1 }, color('blue')], shows: 'one\ntwo' },
  { name: 'a colour nested in a colour, left by an earlier version', value: '<span color="red">one <span color="blue">two</span> three</span>', steps: [], shows: 'one two three', marks: [[['one ', 'red'], ['two', 'blue'], [' three', 'red']]] },
  { name: 'bold nested in bold, left by an earlier version', value: '**one **two** three**', steps: [], shows: 'one two three', marks: [[['one two three', 'b']]] },
  { name: 'bold in italic, left by an earlier version', value: '*one **two** three*', steps: [], shows: 'one two three', marks: [[['one ', 'i'], ['two', 'b+i'], [' three', 'i']]] },
  { name: 'colour crossing bold, left by an earlier version', value: '**one <span color="red">two** three</span>', steps: [], shows: 'one two three', marks: [[['one ', 'b'], ['two', 'b+red'], [' three', 'red']]] },
  { name: 'two bold runs touching, left by an earlier version', value: '**a****b**', steps: [], shows: 'ab', marks: [[['ab', 'b']]] },
  { name: 'bold then italic touching', value: '**a***b*', steps: [], shows: 'ab', marks: [[['a', 'b'], ['b', 'i']]] },
  { name: 'a closing tag alone', value: 'one</span> two', steps: [], shows: 'one two' },
  { name: 'an opening tag alone colours to the end', value: '<span color="red">one two', steps: [], shows: 'one two', marks: [[['one two', 'red']]] },
  { name: 'a mark left open across blocks', value: '<span color="red">one\n\ntwo</span>', steps: [], shows: 'one\ntwo' },
  // Copy and paste
  { name: 'copy across the end of bold and paste', value: '**one two** three\n\nX', steps: [pick('two three'), press(`${mod}+c`), pick('X'), press(`${mod}+v`)], shows: 'one two three\ntwo three', browser: 'chromium' },
  { name: 'copy inside bold and paste', value: '**one two three**\n\nX', steps: [pick('two'), press(`${mod}+c`), pick('X'), press(`${mod}+v`)], shows: 'one two three\ntwo', marks: [[['one two three', 'b']], [['two', 'b']]], browser: 'chromium' },
  { name: 'paste bold into bold', value: '**one two**', steps: [pick('one'), { collapse: true }, { paste: '**x**' }], shows: 'xone two', marks: [[['xone two', 'b']]] },
  { name: 'paste words into the middle of bold', value: '**one two**', steps: [pick('one'), { collapse: true }, { paste: 'x **y** z ' }], shows: 'x y z one two' },
  // Things that must stay as they are
  { name: 'stars a person typed stay', value: 'a ', steps: [end, type('2 * 3 * 4')], shows: 'a 2 * 3 * 4' },
  { name: 'typing bold by hand becomes bold', value: 'a ', steps: [end, type('**bold**')], shows: 'a bold', marks: [[['a ', ''], ['bold', 'b']]] },
  { name: 'typing an unfinished mark stays literal', value: 'a ', steps: [end, type('**bold')], shows: 'a **bold' },
  { name: 'snake_case stays', value: 'a_b_c', steps: [], shows: 'a_b_c' },
  { name: 'backslash escapes hide their backslash', value: 'a \\*not italic\\* b', steps: [], shows: 'a *not italic* b' },
  // Japanese and other composed text
  { name: 'composing in bold', value: '**word**', steps: [end, { compose: 'にほんご' }], shows: 'wordにほんご', marks: [[['wordにほんご', 'b']]], browser: 'chromium' },
  { name: 'composing over a selection across bold', value: '**one two** three', steps: [pick('two three'), { compose: 'ご' }], shows: 'one ご', browser: 'chromium' },
]

// What must not be on the screen, unless the case says the words really are that.
const LEAK = /\*\*|~~|==|<\/?u>|<\/?span|<span color|`|\]\(/

async function step(page, s) {
  if (s.pick !== undefined) await page.evaluate(words => window.pickWords(words), s.pick)
  else if (s.end) { await page.evaluate(() => { const host = document.querySelector('#host .aa-block:last-child'); host.focus(); }); await page.keyboard.press(`${mod}+ArrowDown`); await page.keyboard.press('End') }
  else if (s.type !== undefined) await page.keyboard.type(s.type)
  else if (s.press) await page.keyboard.press(s.press)
  else if (s.right !== undefined) { await page.keyboard.press('ArrowLeft'); for (let i = 0; i < s.right; i++) await page.keyboard.press('ArrowRight') }
  else if (s.left !== undefined) { await page.keyboard.press('ArrowLeft'); for (let i = 0; i < s.left; i++) await page.keyboard.press('ArrowLeft') }
  else if (s.collapse) await page.keyboard.press('ArrowLeft')
  else if (s.collapseEnd) await page.keyboard.press('ArrowRight')
  else if (s.shiftRight) { for (let i = 0; i < s.shiftRight; i++) await page.keyboard.press('Shift+ArrowRight') }
  else if (s.shift) await page.evaluate(words => { const start = window.editor.selection().start; window.pickWords(words); window.editor.selectRange(start, window.editor.selection().end) }, s.shift)
  else if (s.drag) {
    const at = await page.evaluate(words => words.map(word => { window.pickWords(word); const box = getSelection().getRangeAt(0).getBoundingClientRect(); return [box.left + 1, box.top + box.height / 2, box.right - 1] }), s.drag)
    await page.mouse.move(at[0][0], at[0][1]); await page.mouse.down()
    await page.mouse.move(at[0][2], at[0][1], { steps: 3 }); await page.mouse.move(at[1][2], at[1][1], { steps: 6 }); await page.mouse.up()
  }
  else if ('color' in s) await page.evaluate(name => window.editor.color(name), s.color)
  else if (s.paste !== undefined) await page.evaluate(text => { const data = new DataTransfer(); data.setData('text/plain', text); document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })) }, s.paste)
  else if (s.compose !== undefined) {
    const cdp = await page.context().newCDPSession(page)
    const text = s.compose
    for (let i = 1; i <= text.length; i++) await cdp.send('Input.imeSetComposition', { text: text.slice(0, i), selectionStart: i, selectionEnd: i })
    await cdp.send('Input.insertText', { text })
    await cdp.detach()
  }
  await page.waitForTimeout(0)
}

export async function run(page, testCase, browser) {
  const failures = []
  await page.evaluate(value => window.make(value), testCase.value)
  if (testCase.steps.length) await page.evaluate(() => document.querySelector('#host .aa-block')?.focus())
  for (const s of testCase.steps) await step(page, s)
  await page.waitForTimeout(10)
  const seen = await page.evaluate(() => ({ text: window.visible(), value: window.editor.value, look: window.look() }))
  if (await page.evaluate(() => document.getElementById('host').querySelectorAll('.aa-block').length) === 0) failures.push('no blocks left')
  if (seen.text !== testCase.shows) failures.push(`shows ${JSON.stringify(seen.text)}, not ${JSON.stringify(testCase.shows)}`)
  if (LEAK.test(seen.text) && !LEAK.test(testCase.shows)) failures.push(`syntax on the screen: ${JSON.stringify(seen.text)}`)
  if (testCase.marks && !testCase.loose) {
    const got = JSON.stringify(seen.look.filter(b => b.length || testCase.marks.length > 1)), want = JSON.stringify(testCase.marks)
    if (got !== want) failures.push(`marks ${got}, not ${want}`)
  }
  const reopened = await page.evaluate(value => { window.make(value); return { text: window.visible(), value: window.editor.value } }, seen.value)
  if (reopened.text.trimEnd() !== seen.text.trimEnd()) failures.push(`reopened it shows ${JSON.stringify(reopened.text)}, not ${JSON.stringify(seen.text)} (stored ${JSON.stringify(seen.value)})`)
  // Undo all the way back, in the same document as the steps.
  if (testCase.steps.length) {
    await page.evaluate(value => window.make(value), testCase.value)
    await page.evaluate(() => document.querySelector('#host .aa-block')?.focus())
    for (const s of testCase.steps) await step(page, s)
    for (let i = 0; i < 40; i++) { await page.keyboard.press(`${mod}+z`); if (await page.evaluate(value => window.editor.value === value, testCase.value)) break }
    const back = await page.evaluate(() => window.editor.value)
    if (back !== testCase.value) failures.push(`undo reached ${JSON.stringify(back)}, not the start`)
  }
  return { failures, value: seen.value }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const which = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'all'
  const only = process.argv.find(a => a.startsWith('--only='))?.slice(7)
  const json = process.argv.find(a => a.startsWith('--json='))?.slice(7)
  const engines = which === 'all' ? ['chromium', 'webkit'] : [which]
  const pw = playwright(), server = await serve()
  const report = {}
  let exit = 0
  for (const name of engines) {
    const browser = await pw[name].launch({ headless: true })
    const context = await browser.newContext()
    if (name === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const page = await context.newPage()
    page.on('pageerror', error => console.log(`  page error: ${error.message}`))
    await page.goto(server.url)
    await page.waitForFunction(() => window.ready)
    let passed = 0, total = 0
    const failed = []
    for (const testCase of CASES) {
      if (only && !testCase.name.includes(only)) continue
      if (testCase.browser && testCase.browser !== name) continue
      total++
      const result = await run(page, testCase, name).catch(error => ({ failures: [`threw ${error.message.split('\n')[0]}`] }))
      if (result.failures.length) { failed.push({ name: testCase.name, failures: result.failures, value: result.value }); exit = 1 } else passed++
    }
    console.log(`\n${name}: ${passed}/${total} sturdy`)
    for (const f of failed) console.log(`  ✗ ${f.name}\n      ${f.failures.join('\n      ')}\n      stored ${JSON.stringify(f.value)}`)
    report[name] = { passed, total, failed: failed.map(f => f.name) }
    await browser.close()
  }
  if (json) (await import('node:fs')).writeFileSync(json, JSON.stringify(report, null, 2))
  server.close()
  process.exit(exit)
}
