import assert from 'node:assert/strict'
import { playwright, serve } from './lib.mjs'

const server = await serve()
const engines = playwright()
const source = `![Harbour view](data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="320"><rect width="640" height="320" fill="skyblue"/></svg>')} "w12")`
try {
  for (const engine of ['chromium', 'webkit']) {
    const browser = await engines[engine].launch({ headless: true })
    try {
      const page = await browser.newPage({ viewport: { width: 1000, height: 800 } })
      await page.goto(server.url)
      await page.evaluate(() => window.ready)
      await page.evaluate(async source => {
        const { createImageAtom } = await import('/dist/aa.js')
        window.captionless = createImageAtom({ caption: false })
        window.make(source)
      }, source)
      assert.equal(await page.locator('.aa-caption').textContent(), 'Harbour view')
      await page.evaluate(source => window.make(source, { atoms: [window.captionless] }), source)
      assert.equal(await page.locator('.aa-caption').count(), 0)
      assert.equal(await page.locator('.aa-atom img').getAttribute('alt'), 'Harbour view')
      await page.waitForFunction(() => document.querySelector('.aa-atom img')?.naturalWidth > 0)
      await page.locator('.aa-atom img').hover()
      const grip = await page.locator('.aa-picture-grip').boundingBox()
      assert.ok(grip)
      await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
      await page.mouse.down()
      await page.mouse.move(grip.x + grip.width / 2 + 80, grip.y + grip.height / 2, { steps: 8 })
      await page.mouse.up()
      await page.waitForFunction(() => window.editor.value.includes('"w16"'))
      const saved = await page.evaluate(() => window.editor.value)
      assert.ok(saved.startsWith('![Harbour view]('))
      for (const readOnly of [false, true]) {
        await page.evaluate(({ saved, readOnly }) => window.make(saved, { atoms: [window.captionless], readOnly }), { saved, readOnly })
        assert.equal(await page.locator('.aa-caption').count(), 0)
        assert.equal(await page.locator('.aa-atom img').getAttribute('alt'), 'Harbour view')
        assert.equal(await page.locator('.aa-atom[data-width]').getAttribute('data-width'), '16')
        assert.equal(await page.evaluate(() => window.editor.value), saved)
        if (readOnly) {
          assert.equal(await page.locator('.aa-picture-grip').isVisible(), false)
          const edge = await page.locator('.aa-atom img').boundingBox()
          assert.ok(edge)
          const x = edge.x + edge.width - 1, y = edge.y + edge.height / 2
          await page.mouse.move(x, y)
          await page.mouse.down()
          await page.mouse.move(x - 80, y, { steps: 8 })
          await page.mouse.up()
          await page.mouse.dblclick(x, y)
          assert.equal(await page.evaluate(() => window.editor.value), saved)
          assert.equal(await page.locator('.aa-atom[data-width]').getAttribute('data-width'), '16')
        }
      }
      console.log(`${engine}: default caption, captionless resize, saved alt/width, editable/read-only reload and read-only gestures passed`)
    } finally { await browser.close() }
  }
} finally { server.close() }
