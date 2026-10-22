import assert from 'node:assert/strict'
import test from 'node:test'
import {
  configuredSetup,
  convert,
  costOf,
  isNewer,
  isOffPeak,
  modelId,
  normalizePrice,
  priceOf,
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

test('isOffPeak handles a window that crosses UTC midnight', () => {
  const config = { offPeakStart: '16:30', offPeakEnd: '00:30' }
  const at = (iso) => Date.parse(iso)
  assert.equal(isOffPeak(at('2026-10-22T16:29:00Z'), config), false)
  assert.equal(isOffPeak(at('2026-10-22T16:30:00Z'), config), true)
  assert.equal(isOffPeak(at('2026-10-23T00:29:00Z'), config), true)
  assert.equal(isOffPeak(at('2026-10-23T00:30:00Z'), config), false)
})

test('isOffPeak handles a same-day window', () => {
  const config = { offPeakStart: '09:00', offPeakEnd: '10:00' }
  assert.equal(isOffPeak(Date.parse('2026-10-22T08:59:00Z'), config), false)
  assert.equal(isOffPeak(Date.parse('2026-10-22T09:00:00Z'), config), true)
  assert.equal(isOffPeak(Date.parse('2026-10-22T09:59:00Z'), config), true)
  assert.equal(isOffPeak(Date.parse('2026-10-22T10:00:00Z'), config), false)
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

test('modelId accepts strings and objects only', () => {
  assert.equal(modelId('a'), 'a')
  assert.equal(modelId({ id: 'b' }), 'b')
  assert.equal(modelId({ name: 'c' }), null)
  assert.equal(modelId(null), null)
})
