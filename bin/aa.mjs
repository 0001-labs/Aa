#!/usr/bin/env node
import { readFile, writeFile, rename, unlink, lstat, open, realpath } from 'node:fs/promises'
import { resolve, dirname, basename, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { changeCommentSource, exportMarkdown, readCommentSource } from '../dist/comments-markdown.js'

const declarations = {
  'comments list': ['--json'],
  'comments add': ['--author', '--quote', '--body', '--from', '--to', '--json'],
  'comments reply': ['--author', '--body', '--json'],
  'comments edit': ['--author', '--body', '--json'],
  'comments resolve': ['--author', '--json'],
  'comments reopen': ['--author', '--json'],
  'comments remove': ['--author', '--json'],
  export: ['--output', '--json'],
}
const help = `aa comments list FILE [--json]
aa comments add FILE --author Jo4712 --quote TEXT --body TEXT
  Or use --from N --to N (UTF-16 offsets in clean Markdown).
aa comments reply FILE THREAD --author Jo4712 --body TEXT
aa comments edit FILE COMMENT --author Jo4712 --body TEXT
aa comments resolve|reopen|remove FILE THREAD --author Jo4712
aa export FILE [--output OTHER_FILE]

AA_AUTHOR supplies the author when --author is omitted. Local IDs are attribution,
not authentication. Comment commands edit the source file. Export always strips
comments and writes to stdout or a new file; it never overwrites the editable source.`

export async function run(args) {
  if (args[0] === 'completion' && args[1] === 'bash' && args.length === 2) {
    const words = [...new Set([...Object.keys(declarations).flatMap(k => k.split(' ')), ...Object.values(declarations).flat(), 'completion', '--help'])].join(' ')
    console.log(`complete -W '${words}' aa`); return
  }
  if (!args.length || args.includes('--help') || args.includes('-h')) { console.log(help + '\n\nDeclared options:\n' + Object.entries(declarations).map(([name, flags]) => name + ': ' + flags.join(' ')).join('\n') + '\n\naa completion bash'); return }
  const positional = [], flags = new Map()
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--') { positional.push(...args.slice(i + 1)); break }
    if (!a.startsWith('--')) { positional.push(a); continue }
    if (flags.has(a)) throw Error(`Repeated option ${a}`)
    if (a === '--json') { flags.set(a, true); continue }
    if (![...new Set(Object.values(declarations).flat())].includes(a)) throw Error(`Unknown option ${a}. See --help for declared options.`)
    if (++i >= args.length || args[i].startsWith('--')) throw Error(`Missing value for ${a}`)
    flags.set(a, args[i])
  }
  const [group, command, file, identifier] = positional
  const exporting = group === 'export'
  let path = resolve(exporting ? command ?? '' : file ?? '')
  if (!(exporting ? command : file)) throw Error('A file is required.')
  if (exporting ? positional.length !== 2 : positional.length < 3 || positional.length > 4) throw Error('Unexpected positional arguments.')
  const stat = await lstat(path)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1) throw Error('Use a regular file, not a symlink or hard-linked file.')
  path = await realpath(path)
  const original = await readFile(path, 'utf8')
  const allowed = declarations[exporting ? 'export' : `${group} ${command}`]
  if (!allowed) throw Error('Unknown command. Use --help.')
  for (const flag of flags.keys()) if (!allowed.includes(flag)) throw Error(`Option ${flag} does not apply to this command.`)
  if (exporting) {
    const markdown = exportMarkdown(original), output = flags.get('--output')
    if (output) {
      if (resolve(output) === path) throw Error('Export must not overwrite the editable source.')
      await writeFile(resolve(output), markdown, { flag: 'wx', mode: 0o600 })
      if (flags.has('--json')) console.log(JSON.stringify({ output: resolve(output) }))
    } else if (flags.has('--json')) console.log(JSON.stringify({ markdown }))
    else process.stdout.write(markdown)
    return
  }
  if (group !== 'comments') throw Error('Expected comments or export. Use --help.')
  const doc = readCommentSource(original)
  if (doc.diagnostics.length) throw Error(doc.diagnostics.join(' '))
  if (command === 'list') {
    if (identifier) throw Error('list takes only a file.')
    const threads = doc.threads.map(t => ({ ...t, anchor: doc.anchors[t.id] ?? null, orphaned: !doc.anchors[t.id] }))
    if (flags.has('--json')) console.log(JSON.stringify(threads, null, 2))
    else for (const t of threads) {
      console.log(`${t.id}  ${t.status}${t.orphaned ? ' · orphaned' : ''}  ${JSON.stringify(t.quote)}`)
      for (const c of t.comments) console.log(`  ${c.id}  ${c.author}  ${c.created}\n    ${c.body.replace(/\n/g, '\n    ')}`)
    }
    return
  }
  const author = flags.get('--author') ?? process.env.AA_AUTHOR
  if (!author) throw Error('Use --author with an IDv1 account code, or set AA_AUTHOR.')
  const body = flags.get('--body')
  let action
  if (command === 'add') {
    if (identifier) throw Error('add takes only a file.')
    let from, to
    if (flags.has('--quote')) {
      if (flags.has('--from') || flags.has('--to')) throw Error('Choose --quote or --from/--to.')
      const quote = flags.get('--quote')
      from = doc.markdown.indexOf(quote)
      if (!quote || from < 0 || doc.markdown.indexOf(quote, from + 1) >= 0) throw Error('Quote must match exactly once; use --from and --to to disambiguate.')
      to = from + quote.length
    } else {
      if (!flags.has('--from') || !flags.has('--to')) throw Error('Use --quote or --from and --to.')
      from = Number(flags.get('--from')); to = Number(flags.get('--to'))
    }
    action = { type: 'add', from, to, body }
  } else if (['reply', 'resolve', 'reopen', 'remove'].includes(command)) {
    if (!identifier) throw Error('A thread ID is required.')
    action = { type: command, thread: identifier, ...(command === 'reply' ? { body } : {}) }
  } else if (command === 'edit') {
    if (!identifier) throw Error('A comment ID is required.')
    action = { type: command, comment: identifier, body }
  } else throw Error('Unknown comments command. Use --help.')
  if (['add', 'reply', 'edit'].includes(command) && typeof body !== 'string') throw Error('--body is required.')
  const next = changeCommentSource(original, author, action)
  // Cooperative writer lock plus compare-before-rename avoids stale CLI writes.
  const lockPath = `${path}.aa-lock`, temp = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`)
  const lock = await open(lockPath, 'wx', 0o600)
  try {
    if (await realpath(path) !== path || await readFile(path, 'utf8') !== original) throw Error('The file changed; read it again before writing.')
    await writeFile(temp, next, { flag: 'wx', mode: stat.mode & 0o777 })
    if (await readFile(path, 'utf8') !== original) throw Error('The file changed; read it again before writing.')
    await rename(temp, path)
  } finally { await unlink(temp).catch(() => {}); await lock.close(); await unlink(lockPath) }
  if (flags.has('--json')) console.log(JSON.stringify({ command, file: path, threads: readCommentSource(next).threads }))
  else console.log(`${command}: ${path}`)
}

try { await run(process.argv.slice(2)) }
catch (error) {
  const code = /Only the .*author/.test(error.message) ? 3 : error.code ? 1 : 2
  if (process.argv.includes('--json')) console.error(JSON.stringify({ error: error.message, code }))
  else console.error(`aa: ${error.message}`)
  process.exitCode = code
}
