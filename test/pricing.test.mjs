import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_HOLIDAYS_2026,
  configuredSetup,
  convert,
  costOf,
  isNewer,
  isOffPeak,
  modelId,
  normalizePrice,
  priceOf,
  requestUsage,
} from '../lib/pricing.js'

test('costOf prices each bucket per million tokens', () => {
  const price = { input: 0.3, output: 1.2, cacheHit: 0.006, cacheWrite: 0 }
  const cost = costOf({ input: 1_000_000, output: 500_000, cacheRead: 2_000_000, cacheWrite: 0 }, price)
  assert.ok(Math.abs(cost - 0.912) < 1e-9, `expected 0.912, got ${cost}`)
})

test('normalizePrice falls back from cache-hit to input and defaults cache-write to free', () => {
  const price = normalizePrice({ input: '0,15', output: '0.6', cacheHit: '', cacheWrite: null }, 'peak')
  assert.equal(price.input, 0.15)
  assert.equal(price.output, 0.6)
  assert.equal(price.cacheHit, 0.15)
  assert.equal(price.cacheWrite, 0)
  assert.match(price.tariffApplied, /cache-hit = input/)
})

test('normalizePrice rejects a row without input or output', () => {
  assert.equal(normalizePrice({ input: '', output: 1 }, 'peak'), null)
  assert.equal(normalizePrice({ input: 1, output: undefined }, 'peak'), null)
})

test('priceOf falls back from Off-Peak to the Peak row', () => {
  const config = {
    prices: {
      'deepseek-account/deepseek-flash': {
        currency: 'USD',
        peak: { input: 0.3, output: 1.2, cacheHit: 0.006 },
        off: {},
      },
    },
  }
  const price = priceOf(config, 'deepseek-account/deepseek-flash')
  assert.equal(price.currency, 'USD')
  assert.equal(price.off.input, 0.3)
  assert.equal(price.off.cacheHit, 0.006)
  assert.equal(priceOf(config, 'unknown/model'), null)
})

test('isOffPeak follows the two peak windows on a weekday', () => {
  const config = { peakWindows: '01:00-04:00, 06:00-10:00', peakDays: [1, 2, 3, 4, 5], holidays: [] }
  const at = (iso) => Date.parse(iso)
  // 2026-10-22 is a Thursday.
  assert.equal(isOffPeak(at('2026-10-22T00:59:00Z'), config), true)
  assert.equal(isOffPeak(at('2026-10-22T01:00:00Z'), config), false)
  assert.equal(isOffPeak(at('2026-10-22T03:59:00Z'), config), false)
  assert.equal(isOffPeak(at('2026-10-22T04:00:00Z'), config), true)
  assert.equal(isOffPeak(at('2026-10-22T05:59:00Z'), config), true)
  assert.equal(isOffPeak(at('2026-10-22T06:00:00Z'), config), false)
  assert.equal(isOffPeak(at('2026-10-22T09:59:00Z'), config), false)
  assert.equal(isOffPeak(at('2026-10-22T10:00:00Z'), config), true)
})

test('isOffPeak treats weekends and Chinese holidays as fully Off-Peak', () => {
  const config = { peakWindows: '01:00-04:00, 06:00-10:00', peakDays: [1, 2, 3, 4, 5], holidays: ['2026-10-23'] }
  // 2026-10-24 is a Saturday, 2026-10-23 a Friday listed as a holiday.
  assert.equal(isOffPeak(Date.parse('2026-10-24T02:00:00Z'), config), true)
  assert.equal(isOffPeak(Date.parse('2026-10-23T02:00:00Z'), config), true)
  assert.equal(isOffPeak(Date.parse('2026-10-22T02:00:00Z'), config), false)
})

test('isOffPeak falls back to the documented schedule for an empty config', () => {
  // Thursday 02:00 UTC is Peak, Thursday 23:00 UTC is Off-Peak.
  assert.equal(isOffPeak(Date.parse('2026-10-22T02:00:00Z'), {}), false)
  assert.equal(isOffPeak(Date.parse('2026-10-22T23:00:00Z'), {}), true)
})

test('convert uses the manual rate in both directions', () => {
  assert.equal(convert(10, 'USD', 'CNY', 7.1), 71)
  assert.equal(convert(71, 'CNY', 'USD', 7.1), 10)
  assert.equal(convert(5, 'USD', 'USD', 7.1), 5)
  assert.equal(convert(5, 'CNY', 'USD', 0), 0)
})

test('isNewer compares release tags numerically', () => {
  assert.equal(isNewer('1.4.0', '1.3.9'), true)
  assert.equal(isNewer('v1.10.0', '1.9.9'), true)
  assert.equal(isNewer('1.4.0', '1.4.0'), false)
  assert.equal(isNewer('1.3.9', '1.4.0'), false)
})

test('configuredSetup keeps empty providers and extracts explicit model lists', () => {
  const entries = [
    {
      ns: 'llm-pi-ai',
      value: {
        providers: {
          'qwen-token-plan': { models: [] },
          acme: { models: [{ id: 'acme-large' }, 'acme-small'] },
        },
      },
    },
    {
      ns: 'llm-deepseek',
      value: { models: [{ id: 'deepseek-flash' }, { id: 'deepseek-v4-pro' }] },
    },
    { ns: 'agent-default-model', value: { provider: 'deepseek-account', model: 'deepseek-flash' } },
  ]
  const { configured, defaults } = configuredSetup(entries)
  assert.deepEqual(configured.get('qwen-token-plan'), [])
  assert.deepEqual(configured.get('acme'), ['acme-large', 'acme-small'])
  assert.deepEqual(configured.get('deepseek'), ['deepseek-flash', 'deepseek-v4-pro'])
  assert.deepEqual(defaults, { provider: 'deepseek-account', model: 'deepseek-flash' })
})

test('requestUsage separates free and billable Search/Fetch calls', () => {
  const config = {
    requestBillingFrom: '2026-10-31T16:00:00Z',
    searchPrice: 0.75,
    fetchPrice: 0.75,
  }
  const before = Date.parse('2026-10-31T15:59:00Z')
  const after = Date.parse('2026-10-31T16:00:01Z')
  const usage = requestUsage([
    { kind: 'search', time: before },
    { kind: 'fetch', time: before },
    { kind: 'fetch', time: after },
  ], config)
  assert.equal(usage.searches, 1)
  assert.equal(usage.fetches, 2)
  assert.equal(usage.billableSearches, 0)
  assert.equal(usage.billableFetches, 1)
  assert.ok(Math.abs(usage.costUsd - 0.00075) < 1e-12)
})

test('default 2026 statutory holidays make weekdays Off-Peak', () => {
  const config = { holidays: DEFAULT_HOLIDAYS_2026 }
  // 2026-02-17 (Tuesday, Spring Festival) and 2026-10-01 (Thursday) are holidays.
  assert.equal(isOffPeak(Date.parse('2026-02-17T02:00:00Z'), config), true)
  assert.equal(isOffPeak(Date.parse('2026-10-01T02:00:00Z'), config), true)
  // 2026-02-24 is a regular Tuesday.
  assert.equal(isOffPeak(Date.parse('2026-02-24T02:00:00Z'), config), false)
})

test('modelId accepts strings and objects only', () => {
  assert.equal(modelId('a'), 'a')
  assert.equal(modelId({ id: 'b' }), 'b')
  assert.equal(modelId({ name: 'c' }), null)
  assert.equal(modelId(null), null)
})
