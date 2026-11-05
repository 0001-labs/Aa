import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'

const root = resolve(new URL('../..', import.meta.url).pathname)
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json', '.woff2': 'font/woff2' }

/** Playwright is the studio's: taken from the website's dependencies unless PLAYWRIGHT_FROM says otherwise. */
export function playwright() {
  const require = createRequire(`${process.env.PLAYWRIGHT_FROM ?? '/Users/joachim/0001/0001/node_modules/.pnpm/playwright@1.62.1/node_modules'}/package.json`)
  return require('playwright')
}

/** The built library served as it is, so what is measured is what ships. */
export function serve(dist) {
  return new Promise(done => {
    const server = createServer(async (request, response) => {
      const path = new URL(request.url, 'http://x').pathname
      try {
        const file = path === '/' ? 'tests/browser/harness.html' : dist && path.startsWith('/dist/') ? null : path
        const body = await readFile(file ? join(root, file) : join(dist, path.slice(6)))
        response.writeHead(200, { 'content-type': path === '/' ? types['.html'] : types[extname(path)] ?? 'application/octet-stream' })
        response.end(body)
      } catch { response.writeHead(404); response.end() }
    })
    server.listen(0, '127.0.0.1', () => done({ url: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() }))
  })
}
