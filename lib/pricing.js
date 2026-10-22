/**
 * Pure pricing helpers shared by the Host half and the test suite.
 * No Cordis, filesystem or network dependency: everything here is deterministic.
 */

export const DEFAULT_OFF_START = '16:30'
export const DEFAULT_OFF_END = '00:30'

/** Parse a number, treating empty strings and blanks as "not set". */
export const num = (value) => {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' && value.trim() === '') return null
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Model entries in provider settings are either ids or `{ id, name, … }` objects. */
export const modelId = (entry) => {
  if (typeof entry === 'string') return entry
  if (entry && typeof entry.id === 'string') return entry.id
  return null
}

/** Minutes since UTC midnight from an ISO "HH:MM" string; `fallback` when malformed. */
export function clockMinutes(text, fallback) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(text || '').trim())
  if (!match) return fallback
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return fallback
  return hour * 60 + minute
}

export function windowOf(config) {
  const start = clockMinutes(config.offPeakStart, clockMinutes(DEFAULT_OFF_START, 990))
  const end = clockMinutes(config.offPeakEnd, clockMinutes(DEFAULT_OFF_END, 30))
  return { start, end }
}

/** True when `time` (epoch ms) falls inside the configured UTC Off-Peak window. */
export function isOffPeak(time, config) {
  const { start, end } = windowOf(config)
  const date = new Date(time)
  const minute = date.getUTCHours() * 60 + date.getUTCMinutes()
  return start <= end ? minute >= start && minute < end : minute >= start || minute < end
}

/** Normalize one tariff row; empty cache-hit falls back to input, empty write is free. */
export function normalizePrice(raw, tariff) {
  if (!raw || typeof raw !== 'object') return null
  const input = num(raw.input)
  const output = num(raw.output)
  if (input === null || output === null) return null
  const cacheHit = num(raw.cacheHit)
  const cacheWrite = num(raw.cacheWrite)
  return {
    input,
    output,
    cacheHit: cacheHit === null ? input : cacheHit,
    cacheWrite: cacheWrite === null ? 0 : cacheWrite,
    tariffApplied: cacheHit === null ? `cache-hit = input (${tariff})` : null,
  }
}

/** Resolve peak/off prices for one model, or null when unpriced. */
export function priceOf(config, key) {
  const row = config.prices && config.prices[key]
  if (!row) return null
  const peak = normalizePrice(row.peak, 'peak')
  const off = normalizePrice(row.off, 'off') || peak
  if (!peak) return null
  return {
    currency: row.currency === 'CNY' ? 'CNY' : 'USD',
    peak,
    off,
  }
}

export function convert(amount, from, to, rate) {
  if (!Number.isFinite(amount)) return 0
  if (from === to) return amount
  if (from === 'USD' && to === 'CNY') return amount * rate
  if (from === 'CNY' && to === 'USD') return rate > 0 ? amount / rate : 0
  return amount
}

/** Cost of one token-bucket group at the given per-million rates. */
export function costOf(buckets, price) {
  return (buckets.input * price.input
    + buckets.output * price.output
    + buckets.cacheRead * price.cacheHit
    + buckets.cacheWrite * price.cacheWrite) / 1e6
}

/** Semver-ish comparison for release tags: is `latest` strictly newer than `current`? */
export function isNewer(latest, current) {
  const left = String(latest).replace(/^v/i, '').split('.').map((part) => Number.parseInt(part, 10) || 0)
  const right = String(current).replace(/^v/i, '').split('.').map((part) => Number.parseInt(part, 10) || 0)
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const a = left[i] || 0
    const b = right[i] || 0
    if (a > b) return true
    if (a < b) return false
  }
  return false
}

/**
 * Extract the model lists the user actually bound in Settings → Models from a
 * `settings.describe()` snapshot.
 *
 * @param entries settings descriptors (`{ ns, value }`).
 * @returns `{ configured: Map<providerId, string[]>, defaults: { provider, model } | null }`.
 *   A provider present with an empty array means "nothing selected"; a provider
 *   absent from the map has no per-model setting at all.
 */
export function configuredSetup(entries) {
  const configured = new Map()
  let defaults = null
  for (const entry of entries || []) {
    const value = entry && entry.value && typeof entry.value === 'object' ? entry.value : {}
    if (entry && entry.ns === 'agent-default-model'
      && typeof value.provider === 'string' && typeof value.model === 'string') {
      defaults = { provider: value.provider, model: value.model }
    }
    if (!entry || !String(entry.ns).startsWith('llm-')) continue
    if (Array.isArray(value.models)) {
      configured.set(String(entry.ns).slice(4), value.models.map(modelId).filter(Boolean))
    }
    if (value.providers && typeof value.providers === 'object') {
      for (const [providerId, providerValue] of Object.entries(value.providers)) {
        if (providerValue && Array.isArray(providerValue.models)) {
          configured.set(providerId, providerValue.models.map(modelId).filter(Boolean))
        }
      }
    }
  }
  return { configured, defaults }
}
