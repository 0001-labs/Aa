import { describe, expect, it } from 'vite-plus/test'
import { parseDocument, stringify } from 'yaml'
import { readYaml, writeYaml } from '../src/comment-yaml'

/** The real parser, as `readCommentSource` called it before: the judge. Throws where it would have refused. */
function judge(text: string): unknown {
  const doc = parseDocument(text, { schema: 'core', uniqueKeys: true })
  if (doc.errors.length || doc.warnings.length) throw Error('refused')
  return doc.toJS({ maxAliasCount: 0 })
}
const written = (value: unknown) => stringify(value, { lineWidth: 0, aliasDuplicateObjects: false })

function random(seed: number) {
  return (below: number) => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return (((t ^ (t >>> 14)) >>> 0) % below)
  }
}

const WORDS = ['plain words', 'Can we finish **keyboard testing** first?', 'a: b', 'a #b', 'ends:', '# heading', '- bullet', '* star', '? q', 'yes', 'no', 'null', '~', 'true', 'False', '123', '-1.5', '1e3', '0x1f', '0o7', '.inf', '.nan', '', ' ', '  leading', 'trailing ', '"quoted"', "it's", "'single'", '`code`', '```\nfence\n```', '[x](https://a.example)', '{a: b}', '[1, 2]', '&anchor', '*alias', '!tag', '%directive', '@at', '|', '>', '|-', '---', '...', '--- a', 'line one\nline two', 'line one\n\nline three', 'ends with newline\n', 'two newlines\n\n', 'three\n\n\n', '\nstarts with newline', '  indented\nfirst', 'second\n  indented', 'tab\tinside', '\ttab first', 'crlf\r\nline', 'nel\u0085here', 'nbsp\u00a0here', '日本語のコメント', 'emoji 👍 here', 'bell\x07', 'null\0byte', 'lone \ud83d surrogate', 'a\n \nb', 'a\n\t\nb', 'key: value\nother: value', '- a\n- b', '#!shebang', 'http://a.example:80/x', '2026-10-23T07:00:00Z', 'a,b', 'a]b', 'a}b', '=', '==', '<<', '__proto__', 'x'.repeat(300)]
const ids = ['Ab12Cd', 'Ef34Gh', 'Ij56Kl', 'Mn78Op'], people = ['Jo4712', 'Te0001']

function shape(take: (below: number) => number) {
  const word = () => WORDS[take(WORDS.length)]
  const comment = () => ({
    id: ids[take(4)], author: people[take(2)], created: '2026-10-23T07:00:00.000Z', body: word(),
    ...(take(3) === 0 ? { edited: '2026-10-24T07:00:00Z' } : {}),
    ...(take(3) === 0 ? { mentions: take(2) ? [people[take(2)]] : [] } : {}),
    ...(take(3) === 0 ? { reactions: take(3) ? { [['👍', '❤️', word()][take(3)]]: [people[0]], '🎉': take(2) ? [] : people } : {} } : {}),
  })
  return { threads: Array.from({ length: take(4) }, () => ({ id: ids[take(4)], quote: word(), status: ['open', 'resolved'][take(2)], comments: Array.from({ length: 1 + take(3) }, comment) })) }
}

describe('comment YAML', () => {
  it('reads everything a full YAML writer wrote, exactly', () => {
    for (let seed = 1; seed <= 4000; seed++) {
      const value = shape(random(seed)), text = written(value)
      expect(readYaml(text), `seed ${seed}\n${text}`).toEqual(judge(text))
    }
  }, 60_000)

  it('writes what a full YAML parser reads back exactly, and reads it itself', () => {
    for (let seed = 1; seed <= 4000; seed++) {
      const value = shape(random(seed)), text = writeYaml(value)
      expect(judge(text), `seed ${seed}\n${text}`).toEqual(value)
      expect(readYaml(text), `seed ${seed}\n${text}`).toEqual(value)
    }
  }, 60_000)

  it('sets ordinary threads out as a full writer does, so saving changes no lines', () => {
    const value = { threads: [{ id: 'Ab12Cd', quote: 'the new editor', status: 'resolved', resolved: '2026-10-23T07:00:00Z', resolvedBy: 'Jo4712', comments: [
      { id: 'Ef34Gh', author: 'Jo4712', created: '2026-10-23T07:00:00Z', body: 'Can we finish **keyboard testing** first?\n\nSecond paragraph.', mentions: ['Te0001'], reactions: { '👍': ['Jo4712'] } },
      { id: 'Ij56Kl', author: 'Te0001', created: '2026-10-23T08:00:00Z', body: 'Yes: on Friday.' },
    ] }] }
    expect(writeYaml(value)).toBe(written(value))
  })

  it('reads what a person writes by hand as YAML does', () => {
    for (const text of [
      '# a note\nthreads:\n  # the first\n  - id: Ab12Cd   # its code\n    quote: \'it\'\'s\'\n',
      'threads:\n- id: Ab12Cd\n  comments:\n  - id: Ef34Gh\n',
      'threads:\n  - id: Ab12Cd\n    mentions: [Jo4712, "Te0001"]\n    reactions: {"👍": [Jo4712], a: []}\n',
      'threads: []\n', 'threads: {}\n', 'threads:\n', '---\nthreads: []\n', '',
      'body: |\n  one\n  two\n', 'body: |-\n  one\n\n  two\nnext: x\n', 'body: |+\n  one\n\nnext: x\n', 'body: >\n  one\n  two\n\n  three\n', 'body: >-\n  one\n  two\n',
      'body: |2\n    indented\n', 'body: "a\\tb\\u0041\\x41\\n"\n', "a: 'b'   # c\n", '"quoted key": 1\n', "'single': true\n",
      '{"threads":[{"id":"Ab12Cd","comments":[]}]}\n', '- a\n- b\n', '- - a\n  - b\n- c\n', '- a: 1\n  b: 2\n',
      'a:\r\n  - b\r\n',
    ]) expect(readYaml(text), text).toEqual(judge(text))
  })

  it('refuses what it was always refused, and all it does not read', () => {
    for (const text of ['a: &x 1\nb: *x\n', 'a: *x\n', '- !!binary abc\n', 'a: !tag b\n', 'a: 1\na: 2\n', 'threads:\n\t- a\n', 'a: "open\n', 'a: b: c\n', 'a: 1\n---\nb: 2\n', '%YAML 1.2\n---\na: 1\n', '? complex\n: key\n', 'a: [1, 2\n'])
      expect(() => readYaml(text), text).toThrow()
  })

  it('agrees with a real parser or refuses, however the YAML is damaged', () => {
    const noise = [' ', '  ', '\n', ':', ': ', '- ', '#', ' #', '"', "'", '|', '>', '[', ']', '{', '}', ',', '&a', '*a', '!', '\t', '\\', '---', '?', '%', '@']
    let agreed = 0, refused = 0
    for (let seed = 1; seed <= 12000; seed++) {
      const take = random(seed)
      let text = written(shape(take))
      for (let edits = 1 + take(3); edits; edits--) {
        const at = take(text.length + 1), cut = take(4) === 0 ? 1 + take(6) : 0
        text = text.slice(0, at) + noise[take(noise.length)] + text.slice(at + cut)
      }
      let mine: unknown, read = false
      try { mine = readYaml(text); read = true } catch { refused++ }
      if (!read) continue
      let real: unknown, accepted = false
      try { real = judge(text); accepted = true } catch { /* the judge refused what was read */ }
      expect(accepted, `read what YAML refuses, seed ${seed}:\n${text}`).toBe(true)
      expect(mine, `differs from YAML, seed ${seed}:\n${text}`).toEqual(real)
      agreed++
    }
    expect(agreed).toBeGreaterThan(refused / 20)
  }, 60_000)
})
