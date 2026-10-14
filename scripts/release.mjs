#!/usr/bin/env node
// Publishes this package to npm with a semantic version, in one command:
//
//   vp run release patch     1.2.3 -> 1.2.4   fixes, nothing changes for users
//   vp run release minor     1.2.3 -> 1.3.0   new things, nothing breaks
//   vp run release major     1.2.3 -> 2.0.0   something breaks for users
//   vp run release alpha     1.2.3 -> 1.2.4-alpha.0, then -alpha.1 …   a preview
//   vp run release current   publishes the version already in package.json (the first release)
//   vp run release 2.0.0     any exact version
//
// Add --dry-run to go through every step without publishing, committing or
// keeping the new version.
//
// It checks you are signed in to npm (`vp pm login` otherwise) and that the
// package has nothing uncommitted, writes the new version, runs the package's
// `release:sync`, `check` (or `release:check`), `test` and `build` scripts where it has them,
// publishes (an alpha under the `alpha` tag, everything else under `latest`),
// then commits the version and tags it. If a step fails, the version is put back.
// The same file is in Aa, Design system 1, ID v1 and Drag: change it in all four.
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { relative, resolve } from 'node:path'

const args = process.argv.slice(2).filter((arg) => arg !== '--')
const dryRun = args.includes('--dry-run')
const bump = args.find((arg) => !arg.startsWith('--'))
const usage = 'Usage: vp run release patch|minor|major|alpha|current|<version> [--dry-run]'

const root = process.cwd()
const pkgPath = resolve(root, 'package.json')
const pkgText = readFileSync(pkgPath, 'utf8')
const pkg = JSON.parse(pkgText)

function run(command, commandArgs, { env, quiet, cwd = root } = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd,
    stdio: quiet ? 'pipe' : 'inherit',
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
  return { ok: result.status === 0, out: (result.stdout ?? '').trim(), err: (result.stderr ?? '').trim() }
}

function must(command, commandArgs, options) {
  const result = run(command, commandArgs, options)
  if (!result.ok) throw new Error(`${command} ${commandArgs.join(' ')} failed${result.err ? `:\n${result.err}` : ''}`)
  return result.out
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/

function next(version, kind) {
  const match = SEMVER.exec(version)
  if (!match) throw new Error(`package.json has no semantic version: ${version}`)
  const [major, minor, patch] = match.slice(1, 4).map(Number)
  const pre = match[4]
  if (kind === 'current') return version
  if (SEMVER.test(kind)) return kind
  // A preview becomes its own release: 1.3.0-alpha.2 -> minor -> 1.3.0
  if (kind === 'major') return pre && minor === 0 && patch === 0 ? `${major}.0.0` : `${major + 1}.0.0`
  if (kind === 'minor') return pre && patch === 0 ? `${major}.${minor}.0` : `${major}.${minor + 1}.0`
  if (kind === 'patch') return pre ? `${major}.${minor}.${patch}` : `${major}.${minor}.${patch + 1}`
  if (kind === 'alpha') {
    const count = /^alpha\.(\d+)$/.exec(pre ?? '')
    if (count) return `${major}.${minor}.${patch}-alpha.${Number(count[1]) + 1}`
    return pre ? `${major}.${minor}.${patch}-alpha.0` : `${major}.${minor}.${patch + 1}-alpha.0`
  }
  throw new Error(usage)
}

function compare(a, b) {
  const [, ...x] = SEMVER.exec(a)
  const [, ...y] = SEMVER.exec(b)
  for (let i = 0; i < 3; i++) if (Number(x[i]) !== Number(y[i])) return Number(x[i]) - Number(y[i])
  if (!x[3] || !y[3]) return (x[3] ? -1 : 0) + (y[3] ? 1 : 0)
  return x[3].localeCompare(y[3], 'en', { numeric: true })
}

function step(title) {
  console.log(`\n→ ${title}`)
}

function fail(message) {
  console.error(`\n✗ ${message}`)
  process.exit(1)
}

if (!bump) {
  console.log(`${pkg.name} is at ${pkg.version}.\n${usage}`)
  process.exit(1)
}

const from = pkg.version
let to
try {
  to = next(from, bump)
} catch (error) {
  fail(error.message)
}
if (compare(to, from) < 0) fail(`${to} is lower than ${from}`)
const pre = SEMVER.exec(to)[4]
const tag = pre ? pre.split('.')[0] : 'latest'

// Inside a larger repository (Drag lives in Ezo), the tag carries the package's name.
const gitRoot = must('git', ['rev-parse', '--show-toplevel'], { quiet: true })
const nested = resolve(gitRoot) !== resolve(root)
const gitTag = nested ? `${pkg.name.split('/').pop()}-v${to}` : `v${to}`

console.log(`${pkg.name}: ${from} → ${to} (npm tag ${tag})${dryRun ? ', dry run' : ''}`)

step('Checking')
if (run('git', ['status', '--porcelain', '--', '.'], { quiet: true }).out) {
  fail(`${nested ? relative(gitRoot, root) : 'The repository'} has uncommitted changes: commit them first, so the release holds only what is committed.`)
}
// `current` publishes a version that may be tagged already; any other release makes a new one.
const tagged = run('git', ['rev-parse', '-q', '--verify', `refs/tags/${gitTag}`], { quiet: true }).ok
if (tagged && to !== from) fail(`The tag ${gitTag} already exists`)
// npm runs from the home folder: a package that pins pnpm in `devEngines` refuses npm inside it.
const published = run('npm', ['view', `${pkg.name}@${to}`, 'version'], { quiet: true, cwd: homedir() })
if (published.ok && published.out) fail(`${pkg.name}@${to} is already on npm`)
if (!dryRun) {
  const user = run('npm', ['whoami'], { quiet: true, cwd: homedir() })
  if (!user.ok) fail('Not signed in to npm: run `vp pm login`, then release again.')
  console.log(`Signed in to npm as ${user.out}`)
}

// The release touches only the version: package.json, and what `release:sync` writes.
// Those files alone are put back or committed, so work elsewhere in the repository is left alone.
let touched = []
const changedFiles = () => must('git', ['diff', '--name-only', '--relative', '--', '.'], { quiet: true }).split('\n').filter(Boolean)

function restore() {
  if (touched.length) run('git', ['checkout', '--', ...touched], { quiet: true })
}

try {
  if (to !== from) {
    step(`Writing ${to}`)
    pkg.version = to
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + (pkgText.endsWith('\n') ? '\n' : ''))
    touched = ['package.json']
  }
  // A package whose `check` covers more than what it publishes names a narrower `release:check`.
  const check = pkg.scripts?.['release:check'] ? 'release:check' : 'check'
  for (const script of ['release:sync', check, 'test', 'build']) {
    if (pkg.scripts?.[script]) {
      step(`vp run ${script}`)
      must('vp', ['run', script], { env: { CI: 'true', RELEASE_FROM: from, RELEASE_TO: to } })
    }
    if (script === 'release:sync') touched = changedFiles()
  }
  step(`Publishing ${pkg.name}@${to}`)
  must('vp', ['pm', 'publish', '--access', 'public', '--tag', tag, '--no-git-checks', ...(dryRun ? ['--dry-run'] : [])])
} catch (error) {
  restore()
  fail(`${error.message}\nNothing was published; the version is back at ${from}.`)
}

if (dryRun) {
  restore()
  console.log(`\n✓ Dry run passed. \`vp run release ${bump}\` publishes ${pkg.name}@${to}.`)
  process.exit(0)
}

step(tagged ? `Committing (${gitTag} is tagged already)` : `Committing and tagging ${gitTag}`)
if (touched.length) must('git', ['commit', '-m', `Release ${pkg.name} ${to}`, '--', ...touched])
if (!tagged) must('git', ['tag', '-a', gitTag, '-m', `${pkg.name} ${to}`])

console.log(`\n✓ Published ${pkg.name}@${to} under "${tag}": https://www.npmjs.com/package/${pkg.name}/v/${to}`)
console.log(`  Update a product with: vp add ${pkg.name}@${tag === 'latest' ? to : tag}`)
