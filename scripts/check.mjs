#!/usr/bin/env node
/**
 * Repository checks with no dependencies:
 *  - manifest sanity (name, semver, license, author, dsh.bundle/client);
 *  - JavaScript syntax of the Host and Client halves;
 *  - every locale file parses, matches its file name, and has the same keys,
 *    placeholders and non-empty values as `locale/en-US.json`.
 *
 * Run with `node scripts/check.mjs` (or `npm test`).
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const fail = []
const ok = []

function check(condition, message) {
  if (condition) ok.push(message)
  else fail.push(message)
}

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
check(/^[a-z0-9][a-z0-9._-]*$/.test(pkg.name || ''), `package name is valid: ${pkg.name}`)
check(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version || ''), `version is semver: ${pkg.version}`)
check(Boolean(pkg.description), 'description is set')
check(pkg.license === 'MIT', `license is MIT: ${pkg.license}`)
check(Boolean(pkg.author && pkg.author.name && pkg.author.email), 'author name and email are set')
check(pkg.private !== true, 'package is publishable (no "private": true)')
check(Boolean(pkg.repository && pkg.repository.url), 'repository is set')
check(Boolean(pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch), 'dsh.bundle.patch is set')
check(Boolean(pkg.dsh && pkg.dsh.client && pkg.dsh.client.platform === 'web'), 'dsh.client.platform is web')
check(Array.isArray(pkg.files) && pkg.files.includes('client.js'), 'files list ships the client half')

for (const file of ['index.js', 'client.js', 'cordis.patch.yml', 'icon.svg', 'README.md', 'README.ru.md', 'LICENSE', 'CHANGELOG.md']) {
  check(existsSync(join(root, file)), `file exists: ${file}`)
}

for (const file of ['index.js', 'client.js']) {
  const result = spawnSync(process.execPath, ['--check', join(root, file)], { encoding: 'utf8' })
  check(result.status === 0, `syntax: ${file}${result.stderr ? ` — ${result.stderr.trim()}` : ''}`)
}

const localeDir = join(root, 'locale')
const files = readdirSync(localeDir).filter((file) => file.endsWith('.json')).sort()
const source = JSON.parse(readFileSync(join(localeDir, 'en-US.json'), 'utf8'))
const sourceKeys = Object.keys(source.strings)
const TAG = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})+$/

for (const file of files) {
  const tag = file.slice(0, -5)
  const raw = readFileSync(join(localeDir, file), 'utf8')
  let data
  try {
    data = JSON.parse(raw)
  } catch (error) {
    check(false, `locale JSON parses: ${file} — ${error.message}`)
    continue
  }
  check(TAG.test(tag), `locale file has a BCP 47 tag: ${file}`)
  check(data.locale === tag, `locale field matches file name: ${file}`)
  check(typeof data.name === 'string' && data.name.trim().length > 0, `language name is set: ${file}`)
  check(JSON.stringify(Object.keys(data.strings).sort()) === JSON.stringify([...sourceKeys].sort()), `locale keys match en-US: ${file}`)
  const empty = Object.keys(data.strings).filter((key) => !String(data.strings[key]).trim())
  check(empty.length === 0, `locale has no empty values: ${file}${empty.length ? ` (${empty.join(', ')})` : ''}`)
  for (const key of sourceKeys) {
    const expected = String(source.strings[key]).match(/\{\w+\}/g) || []
    const actual = String(data.strings[key]).match(/\{\w+\}/g) || []
    check(expected.every((token) => actual.includes(token)), `placeholders preserved in ${file}: ${key}`)
  }
}

for (const line of ok) console.log(`  ok   ${line}`)
for (const line of fail) console.error(`  FAIL ${line}`)
console.log(`\n${ok.length} checks passed, ${fail.length} failed.`)
if (fail.length > 0) process.exit(1)
