/**
 * The YAML of an `aa-comments` block, read and written without a YAML library,
 * which would be the largest thing in the editor for a block few documents have.
 * It covers block mappings and sequences, plain, quoted, literal and folded
 * scalars, comments and one-line flow collections: all a person or the writer
 * below would put there, and all a full YAML writer ever did. What it does not
 * cover it refuses, as a document with anchors, aliases or tags always was, so
 * the block stays in the text untouched. It must agree with a real YAML parser
 * or refuse, never differ: `tests/comment-yaml.test.ts` holds it to that.
 */

const refuse = (line: number, why: string): never => { throw Error(`Invalid comment YAML (line ${line + 1}: ${why}).`) }

const NULL = /^(?:~|[Nn]ull|NULL)?$/
const BOOL = /^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$/
const NUMBER = /^(?:[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)(?:[eE][-+]?[0-9]+)?|0o[0-7]+|0x[0-9a-fA-F]+|[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/

/** A plain scalar as the core schema reads it. Only a string can pass validation, but the others must not read as strings. */
function typed(text: string): unknown {
  if (NULL.test(text)) return null
  if (BOOL.test(text)) return /^[tT]/.test(text)
  if (NUMBER.test(text)) return Number(text)
  return text
}

const ESCAPES: Record<string, string> = { 0: '\0', a: '\x07', b: '\b', t: '\t', '\t': '\t', n: '\n', v: '\v', f: '\f', r: '\r', e: '\x1b', ' ': ' ', '"': '"', '/': '/', '\\': '\\', N: '\u0085', _: '\u00a0', L: '\u2028', P: '\u2029' }
const WIDTHS: Record<string, number> = { x: 2, u: 4, U: 8 }

/** A quoted scalar at the start of `text`: its value and where it ends. */
function quoted(text: string, at: number, line: number): { value: string; end: number } {
  const quote = text[at]
  let value = '', i = at + 1
  for (; i < text.length; i++) {
    const char = text[i]
    if (quote === "'") {
      if (char !== "'") { value += char; continue }
      if (text[i + 1] === "'") { value += "'"; i++; continue }
      return { value, end: i + 1 }
    }
    if (char === '"') return { value, end: i + 1 }
    if (char !== '\\') { value += char; continue }
    const next = text[++i], width = WIDTHS[next]
    if (width) {
      const hex = text.slice(i + 1, i + 1 + width)
      if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length !== width) refuse(line, 'bad escape')
      value += width === 8 ? String.fromCodePoint(parseInt(hex, 16)) : String.fromCharCode(parseInt(hex, 16))
      i += width
    } else if (next in ESCAPES) value += ESCAPES[next]
    else refuse(line, 'bad escape')
  }
  return refuse(line, 'quote not closed on its line')
}

/** What may stand after a value on its line: nothing, or a comment. */
function ends(text: string, at: number, line: number) {
  const rest = text.slice(at)
  if (/[^ \t]/.test(rest) && !/^[ \t]+#/.test(rest)) refuse(line, 'text after a value')
}

/** Whether a line is only a comment or blank. */
const empty = (text: string) => /^[ \t]*(?:#.*)?$/.test(text)

/** Without the spaces and tabs at its ends: YAML's own white space, never a no-break space, which is a letter to it. */
const spaced = (text: string) => text.replace(/^[ \t]+|[ \t]+$/g, '')

/** A document's own marker, which ends anything at the start of a line. */
const MARKER = /^(?:---|\.\.\.)(?:[ \t]|$)/

const PLAIN_START = /^[^ \t\-?:,[\]{}#&*!|>'"%@`]|^[-?:][^ \t,[\]{}]/

/** The value in a mapping's `key: value`, with a plain key or a quoted one; null where the line is no such thing. */
function keyOf(text: string, line: number): { key: string; rest: string } | null {
  if (text[0] === '"' || text[0] === "'") {
    const { value, end } = quoted(text, 0, line)
    const after = text.slice(end).replace(/^[ \t]+/, '')
    return after[0] === ':' && (after.length === 1 || /[ \t]/.test(after[1])) ? { key: value, rest: after.slice(1) } : null
  }
  if (!PLAIN_START.test(text)) return null
  const colon = text.search(/:(?:[ \t]|$)/)
  if (colon < 0 || /[ \t]#/.test(text.slice(0, colon))) return null
  return { key: spaced(text.slice(0, colon)), rest: text.slice(colon + 1) }
}

function flow(text: string, at: number, line: number, depth: number): { value: unknown; end: number } {
  if (depth > 16) refuse(line, 'too deep')
  const skip = (i: number) => { while (text[i] === ' ' || text[i] === '\t') i++; return i }
  const open = text[at], close = open === '[' ? ']' : '}'
  const isList = open === '['
  const list: unknown[] = [], map: Record<string, unknown> = {}
  const seen = new Set<string>()
  let i = skip(at + 1)
  const item = (start: number): { value: unknown; end: number; quoted: boolean } => {
    const char = text[start]
    if (char === '[' || char === '{') return { ...flow(text, start, line, depth + 1), quoted: true }
    if (char === '"' || char === "'") return { ...quoted(text, start, line), quoted: true }
    let end = start
    while (end < text.length && !/[,[\]{}]/.test(text[end]) && !(text[end] === ':' && /[ \t,[\]{}]|^$/.test(text[end + 1] ?? ''))) end++
    const word = spaced(text.slice(start, end))
    if (!word || !PLAIN_START.test(word) || /[ \t]#/.test(word) || /[&*!]/.test(word[0])) refuse(line, 'bad flow value')
    return { value: typed(word), end, quoted: false }
  }
  while (text[i] !== close) {
    if (i >= text.length) refuse(line, 'flow not closed on its line')
    const first = item(i)
    i = skip(first.end)
    if (isList) {
      if (text[i] === ':') refuse(line, 'mapping in a flow sequence')
      list.push(first.value)
    } else {
      if (typeof first.value !== 'string' || text[i] !== ':') refuse(line, 'bad flow key')
      if (seen.has(first.value as string)) refuse(line, 'duplicate key')
      seen.add(first.value as string)
      const value = item(skip(i + 1))
      put(map, first.value as string, value.value)
      i = skip(value.end)
    }
    if (text[i] === ',') { i = skip(i + 1); continue }
    if (text[i] !== close) refuse(line, 'flow not closed on its line')
  }
  return { value: isList ? list : map, end: i + 1 }
}

/** A key that names a real property of the object, `__proto__` included. */
function put(map: Record<string, unknown>, key: string, value: unknown) {
  Object.defineProperty(map, key, { value, enumerable: true, writable: true, configurable: true })
}

/** Read the YAML in a block. Throws on anything it does not read exactly as YAML does. */
export function readYaml(text: string): unknown {
  const lines = text.split(/\r\n|\n/)
  if (lines[lines.length - 1] === '') lines.pop()
  let at = 0, begun = false
  /** The next line that says anything, its indent counted; tabs cannot indent. */
  const next = (): { indent: number; text: string } | null => {
    for (; at < lines.length; at++) {
      if (empty(lines[at])) {
        if (/^ *\t/.test(lines[at])) refuse(at, 'a tab in the indent')
        continue
      }
      const indent = /^ */.exec(lines[at])![0].length
      if (lines[at][indent] === '\t') refuse(at, 'a tab in the indent')
      if (begun && MARKER.test(lines[at])) refuse(at, 'one document only')
      return { indent, text: spaced(lines[at].slice(indent)) }
    }
    return null
  }

  const block = (header: RegExpExecArray, parent: number): string => {
    const [, style, c1, digit, c2, comment] = header
    if (comment && !/^[ \t]/.test(comment)) refuse(at, 'bad block header')
    const chomp = c1 || c2
    let indent = digit ? parent + Number(digit) : -1
    const taken: string[] = []
    let i = at + 1
    for (; i < lines.length; i++) {
      const line = lines[i]
      const own = /^ */.exec(line)![0].length
      if (MARKER.test(line)) break
      if (line.length === own) { taken.push(indent >= 0 ? line.slice(indent) : ''); continue }
      if (indent < 0) {
        if (own <= parent && parent >= 0) break
        if (line[own] === '\t' && own === 0) refuse(i, 'a tab in the indent')
        indent = own
        // Blank lines before the first line of words are longer than it: a real parser objects.
        for (const earlier of lines.slice(at + 1, i)) if (earlier.length > indent) refuse(i, 'indent')
        taken.length = 0
        for (let blank = at + 1; blank < i; blank++) taken.push('')
      }
      if (own < indent) break
      taken.push(line.slice(indent))
    }
    at = i
    let trailing = 0
    while (taken.length - trailing > 0 && taken[taken.length - 1 - trailing] === '') trailing++
    const words = taken.slice(0, taken.length - trailing)
    let body: string
    if (style === '|') body = words.join('\n')
    else {
      // Folded: a line break between two lines of words is a space, and blank lines are line breaks. A more-indented line keeps its own, which is left to a real parser.
      if (words.some(line => /^[ \t]/.test(line))) refuse(at, 'a more-indented folded line')
      body = ''
      for (let i = 0; i < words.length; i++) {
        if (i && words[i] && words[i - 1]) body += ' '
        else if (i && !words[i]) body += '\n'
        body += words[i]
      }
    }
    if (!words.length) return chomp === '+' ? '\n'.repeat(trailing) : ''
    if (chomp === '-') return body
    if (chomp === '+') return `${body}\n${'\n'.repeat(trailing)}`
    return `${body}\n`
  }

  /** A value that starts on a key's or dash's line: `parent` is that key's or dash's indent. */
  const inline = (text: string, parent: number): unknown => {
    const line = at
    const head = /^([|>])([-+]?)([1-9]?)([-+]?)(.*)$/.exec(text)
    if (head) {
      if ((head[2] && head[4]) || (/[^ \t]/.test(head[5]) && !/^[ \t]+#/.test(head[5]))) refuse(line, 'bad block header')
      return block(head, parent)
    }
    at++
    if (text[0] === '"' || text[0] === "'") {
      const { value, end } = quoted(text, 0, line)
      ends(text, end, line)
      return value
    }
    if (text[0] === '[' || text[0] === '{') {
      const { value, end } = flow(text, 0, line, 0)
      ends(text, end, line)
      return value
    }
    const words = spaced(text.replace(/[ \t]+#.*$/, ''))
    if (/:(?:[ \t]|$)/.test(words)) refuse(line, 'a mapping inside a plain value')
    if (words[0] === '#') return null
    if (!PLAIN_START.test(words)) refuse(line, 'anchors, aliases, tags and reserved characters are not read')
    return typed(words)
  }

  const collection = (indent: number, depth: number): unknown => {
    if (depth > 32) refuse(at, 'too deep')
    const first = next()!
    return first.text === '-' || first.text.startsWith('- ') ? sequence(indent, depth) : mapping(indent, depth)
  }

  const sequence = (indent: number, depth: number): unknown[] => {
    const out: unknown[] = []
    for (let line = next(); line && line.indent === indent && (line.text === '-' || line.text.startsWith('- ')); line = next()) {
      const content = spaced(line.text.slice(1))
      if (!content || content[0] === '#') {
        at++
        const after = next()
        out.push(after && after.indent > indent ? collection(after.indent, depth + 1) : null)
        continue
      }
      const offset = line.text.length - content.length + indent
      if (content === '-' || content.startsWith('- ') || keyOf(content, at)) {
        // `- id: x`: the rest of the line is the first line of what the item holds.
        lines[at] = ' '.repeat(offset) + content
        out.push(collection(offset, depth + 1))
      } else out.push(inline(content, indent))
    }
    const after = next()
    if (after && after.indent > indent) refuse(at, 'indent')
    return out
  }

  const mapping = (indent: number, depth: number): Record<string, unknown> => {
    const out: Record<string, unknown> = {}
    const seen = new Set<string>()
    for (let line = next(); line && line.indent === indent; line = next()) {
      const found = keyOf(line.text, at)
      if (!found) refuse(at, 'expected a key')
      const { key, rest } = found!
      if (seen.has(key)) refuse(at, 'duplicate key')
      seen.add(key)
      const value = spaced(rest)
      if (value && value[0] !== '#') { put(out, key, inline(value, indent)); continue }
      if (value && !/^[ \t]/.test(rest)) refuse(at, 'expected a key')
      at++
      const after = next()
      if (after && after.indent > indent) put(out, key, collection(after.indent, depth + 1))
      else if (after && after.indent === indent && (after.text === '-' || after.text.startsWith('- '))) put(out, key, sequence(indent, depth + 1))
      else put(out, key, null)
    }
    const after = next()
    if (after && after.indent > indent) refuse(at, 'indent')
    return out
  }

  const first = next()
  if (!first) return null
  if (first.text === '---') at++
  else if (MARKER.test(lines[at])) refuse(at, 'one document only')
  begun = true
  if (!next()) return null
  const start = next()!
  if (start.indent !== 0 && start.text.match(/^-/)) refuse(at, 'indent')
  const value = start.text.startsWith('- ') || start.text === '-' || keyOf(start.text, at) ? collection(start.indent, 0) : inline(start.text, -1)
  if (next()) refuse(at, 'more than one value')
  return value
}

const PLAIN = /^[^\s\-?:,[\]{}#&*!|>'"%@`=~][^\t\n\r]*$/u
const UNPRINTABLE = /[^\t\n\x20-\x7e\u0085\u00a0-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/u

/** Whether a string can stand as it is, read back as the same string. */
const plain = (text: string) => PLAIN.test(text) && !/\s$|: |:$| #/.test(text) && typed(text) === text && !UNPRINTABLE.test(text)

/** A string on a line of its own or as a block of lines, `indent` being where the block's words stand. */
function scalar(text: string, indent: number): string {
  if (plain(text)) return text
  // Lines read best as lines; a line of nothing but spaces, or anything unprintable, is safest quoted.
  if (text.includes('\n') && !text.startsWith('\n') && !UNPRINTABLE.test(text) && !text.includes('\r') && !text.includes('\u0085') && !/\n[ \t]+(?:\n|$)|^[ \t]+\n/.test(text)) {
    const trailing = /\n*$/.exec(text)![0].length
    const chomp = trailing === 0 ? '-' : trailing === 1 ? '' : '+'
    const hint = /^[ \t]/.test(text) ? '2' : ''
    const lines = text.slice(0, text.length - trailing).split('\n')
    const pad = ' '.repeat(indent)
    return `|${hint}${chomp}\n${lines.map(line => line ? pad + line : '').join('\n')}${chomp === '+' ? '\n'.repeat(trailing - 1) : ''}`
  }
  return JSON.stringify(text)
}

/** Write plain data as YAML, as a full writer sets it out: no aliases, no line folded. */
export function writeYaml(value: unknown): string {
  const entry = (key: string, item: unknown, indent: number): string => {
    const pad = ' '.repeat(indent), name = plain(key) ? key : JSON.stringify(key)
    if (Array.isArray(item) && item.length || isMap(item) && Object.keys(item as object).length) return `${pad}${name}:\n${node(item, indent + 2)}`
    return `${pad}${name}: ${leaf(item, indent + 2)}\n`
  }
  const isMap = (item: unknown): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item)
  const leaf = (item: unknown, indent: number): string => typeof item === 'string' ? scalar(item, indent) : Array.isArray(item) ? '[]' : isMap(item) ? '{}' : String(item)
  const node = (item: unknown, indent: number): string => {
    const pad = ' '.repeat(indent)
    if (Array.isArray(item)) return item.map(each => {
      if (Array.isArray(each) && each.length || isMap(each) && Object.keys(each).length) return `${pad}- ${node(each, indent + 2).slice(indent + 2)}`
      return `${pad}- ${leaf(each, indent + 2)}\n`
    }).join('')
    return Object.entries(item as Record<string, unknown>).filter(([, each]) => each !== undefined).map(([key, each]) => entry(key, each, indent)).join('')
  }
  return node(value, 0)
}
