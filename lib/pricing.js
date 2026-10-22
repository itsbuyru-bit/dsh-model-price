/**
 * Pure pricing helpers shared by the Host half and the test suite.
 * No Cordis, filesystem or network dependency: everything here is deterministic.
 */

/**
 * DeepSeek publishes Peak as 01:00–04:00 and 06:00–10:00 UTC, Monday–Friday,
 * excluding Chinese public holidays. Everything else is Off-Peak.
 */
export const DEFAULT_PEAK_WINDOWS = '01:00-04:00, 06:00-10:00'
export const DEFAULT_PEAK_DAYS = [1, 2, 3, 4, 5]

/**
 * All public-holiday days of the PRC for 2026, including the bridge days from
 * the State Council notice: DeepSeek bills the whole holiday block as Off-Peak.
 * Source: 国办发明电〔2025〕7号 (2025-11-04).
 * Weekend make-up workdays need no entry: weekends are always Off-Peak.
 */
export const DEFAULT_HOLIDAYS_2026 = [
  '2026-01-01', '2026-01-02', '2026-01-03',
  '2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19',
  '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23',
  '2026-04-04', '2026-04-05', '2026-04-06',
  '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
  '2026-06-19', '2026-06-20', '2026-06-21',
  '2026-09-25', '2026-09-26', '2026-09-27',
  '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05',
  '2026-10-06', '2026-10-07',
]

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

/**
 * Parse "01:00-04:00, 06:00-10:00" into minute ranges. Invalid entries are
 * skipped; an empty result means the caller should use the defaults.
 */
export function parsePeakWindows(text) {
  const windows = []
  for (const part of String(text || '').split(/[,;\n]+/)) {
    const match = /^\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*$/.exec(part)
    if (!match) continue
    const start = clockMinutes(`${match[1]}:${match[2]}`, -1)
    const end = clockMinutes(`${match[3]}:${match[4]}`, -1)
    if (start < 0 || end < 0) continue
    windows.push({ start, end })
  }
  return windows
}

/** Normalize the holiday list (array or comma-separated string) to YYYY-MM-DD. */
export function parseHolidays(value) {
  const parts = Array.isArray(value) ? value : String(value || '').split(/[,;\s]+/)
  const holidays = new Set()
  for (const part of parts) {
    const date = String(part || '').trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) holidays.add(date)
  }
  return holidays
}

function peakDaysOf(config) {
  const days = Array.isArray(config && config.peakDays) ? config.peakDays : DEFAULT_PEAK_DAYS
  const normalized = days.map((day) => Number(day)).filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
  return normalized.length > 0 ? normalized : DEFAULT_PEAK_DAYS
}

function peakWindowsOf(config) {
  const windows = parsePeakWindows(config && config.peakWindows)
  return windows.length > 0 ? windows : parsePeakWindows(DEFAULT_PEAK_WINDOWS)
}

/** True when `time` (epoch ms) falls inside the configured UTC Peak schedule. */
export function isPeak(time, config) {
  const date = new Date(time)
  if (Number.isNaN(date.getTime())) return false
  const ymd = date.toISOString().slice(0, 10)
  if (parseHolidays(config && config.holidays).has(ymd)) return false
  const isoDay = date.getUTCDay() === 0 ? 7 : date.getUTCDay()
  if (!peakDaysOf(config).includes(isoDay)) return false
  const minute = date.getUTCHours() * 60 + date.getUTCMinutes()
  return peakWindowsOf(config).some((window) => (
    window.start <= window.end
      ? minute >= window.start && minute < window.end
      : minute >= window.start || minute < window.end
  ))
}

/** True when `time` (epoch ms) is outside Peak: nights, weekends and holidays. */
export function isOffPeak(time, config) {
  return !isPeak(time, config)
}

/**
 * Normalize the provenance of a price row: where the numbers came from and when
 * they were checked. Both fields are optional; an invalid URL or date is
 * dropped instead of being stored.
 */
export function normalizeSource(raw) {
  if (!raw || typeof raw !== 'object') return null
  const source = {}
  if (typeof raw.url === 'string' && raw.url.trim()) {
    try {
      const url = new URL(raw.url.trim())
      if (url.protocol === 'http:' || url.protocol === 'https:') source.url = url.toString()
    } catch {
      /* not a URL: drop it */
    }
  }
  if (typeof raw.checkedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.checkedAt.trim())) {
    source.checkedAt = raw.checkedAt.trim()
  }
  return Object.keys(source).length > 0 ? source : null
}

/**
 * Normalize a per-model `schedule` override. Every field is optional: an absent
 * field inherits the global config, so `{}`/null means "follow the shared
 * schedule". An explicit empty `holidays` array is meaningful (no holidays).
 */
export function normalizeSchedule(raw) {
  if (!raw || typeof raw !== 'object') return null
  const schedule = {}
  if (typeof raw.peakWindows === 'string' && raw.peakWindows.trim()) {
    schedule.peakWindows = raw.peakWindows.trim()
  }
  if (Array.isArray(raw.peakDays)) {
    const days = raw.peakDays
      .map((day) => Number(day))
      .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
    if (days.length > 0) schedule.peakDays = [...new Set(days)].sort((a, b) => a - b)
  }
  if (Array.isArray(raw.holidays)) {
    schedule.holidays = [...new Set(
      raw.holidays.map((day) => String(day).trim()).filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day))
    )].sort()
  }
  return Object.keys(schedule).length > 0 ? schedule : null
}

/**
 * Effective Peak schedule for one model key: the model's own `schedule` wins
 * field by field, everything else is inherited from the global config.
 */
export function scheduleOf(config, key) {
  const row = config && config.prices ? config.prices[key] : null
  const own = row && row.schedule && typeof row.schedule === 'object' ? row.schedule : {}
  return {
    peakWindows: typeof own.peakWindows === 'string' && own.peakWindows.trim()
      ? own.peakWindows
      : config && config.peakWindows,
    peakDays: Array.isArray(own.peakDays) && own.peakDays.length > 0
      ? own.peakDays
      : config && config.peakDays,
    holidays: Array.isArray(own.holidays) ? own.holidays : config && config.holidays,
  }
}

/** True when `time` is Peak for this exact model key (own schedule or global). */
export function isPeakFor(config, key, time) {
  return isPeak(time, scheduleOf(config, key))
}

/** True when `time` is Off-Peak for this exact model key. */
export function isOffPeakFor(config, key, time) {
  return !isPeakFor(config, key, time)
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

/**
 * Aggregate successful Search/Fetch calls from a request log.
 * Calls before `billingFrom` are free; the returned `costUsd` covers the rest.
 */
export function requestUsage(log, config) {
  const cutoff = Date.parse((config && config.requestBillingFrom) || '') || 0
  const searchPrice = Number(config && config.searchPrice) || 0
  const fetchPrice = Number(config && config.fetchPrice) || 0
  let searches = 0
  let fetches = 0
  let billableSearches = 0
  let billableFetches = 0
  for (const entry of Array.isArray(log) ? log : []) {
    if (!entry) continue
    const billable = Number(entry.time) >= cutoff
    if (entry.kind === 'search') {
      searches += 1
      if (billable) billableSearches += 1
    } else if (entry.kind === 'fetch') {
      fetches += 1
      if (billable) billableFetches += 1
    }
  }
  return {
    searches,
    fetches,
    billableSearches,
    billableFetches,
    costUsd: (billableSearches * searchPrice + billableFetches * fetchPrice) / 1000,
  }
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
