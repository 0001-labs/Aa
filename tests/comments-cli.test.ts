// @vitest-environment node
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
beforeAll(() => { const r = spawnSync('vp', ['build', '--config', 'vite.config.comments.ts'], { encoding: 'utf8' }); if (r.status) throw Error(r.stderr) })
const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach(d => rmSync(d, { recursive: true, force: true })))
const cli = (...args: string[]) => spawnSync(process.execPath, [resolve('bin/aa.mjs'), ...args], { encoding: 'utf8' })
const fixture = () => { const dir = mkdtempSync(join(tmpdir(), 'aa-comments-')); dirs.push(dir); const file = join(dir, 'note.md'); writeFileSync(file, 'Ship the new editor.'); return { dir, file } }
describe('aa comment CLI', () => {
  it('adds, reads, replies, resolves and exports without comments or source mutation', () => {
    const { dir, file } = fixture()
    const added = cli('comments', 'add', file, '--author', 'Jo4712', '--quote', 'the new editor', '--body', 'Test first.', '--json')
    expect(added.status, added.stderr).toBe(0)
    const thread = JSON.parse(added.stdout).threads[0].id
    expect(cli('comments', 'reply', file, thread, '--author', 'An1234', '--body', 'Done').status).toBe(0)
    expect(cli('comments', 'resolve', file, thread, '--author', 'Jo4712').status).toBe(0)
    const listed = JSON.parse(cli('comments', 'list', file, '--json').stdout)
    expect(listed[0].comments).toHaveLength(2)
    expect(listed[0].status).toBe('resolved')
    const source = readFileSync(file, 'utf8'), output = join(dir, 'download.md')
    expect(cli('export', file, '--output', output).status).toBe(0)
    expect(readFileSync(output, 'utf8')).toBe('Ship the new editor.')
    expect(readFileSync(file, 'utf8')).toBe(source)
    expect(cli('export', file).stdout).toBe('Ship the new editor.')
    expect(cli('export', file, '--output', file).status).not.toBe(0)
    expect(cli('export', file, '--output', output).status).not.toBe(0)
  })
  it('refuses ambiguous quotes, invalid flags, lock conflicts and author impersonation', () => {
    const { file } = fixture()
    writeFileSync(file, 'same same')
    expect(cli('comments', 'add', file, '--author', 'Jo4712', '--quote', 'same', '--body', 'x').status).toBe(2)
    expect(cli('comments', 'add', file, '--author', 'Jo4712', '--from', '0', '--to', '4', '--body', 'x').status).toBe(0)
    const thread = JSON.parse(cli('comments', 'list', file, '--json').stdout)[0].id
    expect(cli('comments', 'remove', file, thread, '--author', 'An1234').status).toBe(3)
    const before = readFileSync(file, 'utf8')
    expect(cli('comments', 'resolve', file, thread, '--author', 'Jo4712', '--body', 'ignored').status).toBe(2)
    expect(cli('comments', 'reply', file, thread, '--body', '--author', 'Jo4712').status).toBe(2)
    writeFileSync(file + '.aa-lock', '')
    expect(cli('comments', 'resolve', file, thread, '--author', 'Jo4712').status).toBe(1)
    expect(readFileSync(file, 'utf8')).toBe(before)
  })
  it('does not leak malformed comment data on export', () => {
    const { file } = fixture()
    writeFileSync(file, 'Text\n\n```aa-comments v9\nprivate reply\n```')
    const result = cli('export', file)
    expect(result.status).toBe(2)
    expect(result.stdout).toBe('')
  })
})
