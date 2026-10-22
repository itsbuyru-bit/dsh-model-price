import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_PEAK_DAYS,
  DEFAULT_PEAK_WINDOWS,
  DEFAULT_HOLIDAYS_2026,
  configuredSetup,
  convert,
  costOf,
  isNewer,
  isOffPeak,
  modelId,
  normalizePrice,
  num,
  priceOf,
  requestUsage,
} from './lib/pricing.js'

export const inject = ['sessionProjections', 'webServer', 'sessions', 'agents']

const PLUGIN_DIR = dirname(fileURLToPath(import.meta.url))
const PLUGIN_VERSION = JSON.parse(readFileSync(join(PLUGIN_DIR, 'package.json'), 'utf8')).version
const LOCALE_DIR = join(PLUGIN_DIR, 'locale')
const LOCALE_TAG = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/
// Locale FILES must carry a region/script subtag (`en-US`, `zh-CN`, `pt-BR`).
const LOCALE_FILE_TAG = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})+$/
const REPO_URL = 'https://github.com/itsbuyru-bit/dsh-model-price'
const RELEASES_API = 'https://api.github.com/repos/itsbuyru-bit/dsh-model-price/releases/latest'
const UPDATE_INTERVAL = 6 * 60 * 60 * 1000

const KEY = 'modelPrice'
const API_PREFIX = '/api-spend/api'

const DEFAULTS = {
  version: 1,
  displayCurrency: 'USD',
  rate: 7.1,
  rateUpdatedAt: null,
  peakWindows: DEFAULT_PEAK_WINDOWS,
  peakDays: DEFAULT_PEAK_DAYS.slice(),
  holidays: DEFAULT_HOLIDAYS_2026.slice(),
  language: 'auto',
  hideWallet: false,
  hideLine: false,
  checkUpdates: true,
  showBestTime: true,
  budget: null,
  searchPrice: 0.75,
  fetchPrice: 0.75,
  requestBillingFrom: '2026-10-31T16:00:00Z',
  includeRequests: true,
  prices: {},
}

/* ------------------------------------------------------------------ */
/* small helpers                                                       */
/* ------------------------------------------------------------------ */

const zeroBuckets = () => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })

const bucketsOf = (usage) => ({
  input: usage.inputTokens || 0,
  output: usage.outputTokens || 0,
  cacheRead: usage.cacheReadTokens || 0,
  cacheWrite: usage.cacheWriteTokens || 0,
})

const addBuckets = (target, source) => {
  target.input += source.input
  target.output += source.output
  target.cacheRead += source.cacheRead
  target.cacheWrite += source.cacheWrite
}

const subBuckets = (target, source) => {
  target.input -= source.input
  target.output -= source.output
  target.cacheRead -= source.cacheRead
  target.cacheWrite -= source.cacheWrite
}

const sameBuckets = (a, b) => a && b
  && a.input === b.input && a.output === b.output
  && a.cacheRead === b.cacheRead && a.cacheWrite === b.cacheWrite

const emptyModel = () => ({ peak: zeroBuckets(), off: zeroBuckets() })

/** Usage of one assistant settlement, falling back to the last streamed usage chunk. */
function usageOf(event) {
  if (event.type !== 'assistant/message') return undefined
  if (event.data.usage !== undefined) return event.data.usage
  const stream = event.data.stream
  if (!Array.isArray(stream)) return undefined
  for (let i = stream.length - 1; i >= 0; i -= 1) {
    const record = stream[i]
    if (record && record.type === 'chunk' && record.chunk && record.chunk.type === 'usage') {
      return record.chunk.usage
    }
  }
  return undefined
}

function routeOf(event) {
  const source = event.data && event.data.message && event.data.message.source
  if (!source || typeof source.model !== 'string') return undefined
  return { provider: source.provider || 'unknown', model: source.model }
}

/* ------------------------------------------------------------------ */
/* plugin                                                              */
/* ------------------------------------------------------------------ */

export function apply(ctx, rawConfig = {}) {
  const root = rawConfig && typeof rawConfig.dataDir === 'string' && rawConfig.dataDir
    ? rawConfig.dataDir
    : join(homedir(), '.dsh', 'api-spend')
  const configFile = join(root, 'config.json')
  const totalsFile = join(root, 'totals.json')

  const runtime = {
    config: loadConfig(configFile),
    totals: loadTotals(totalsFile),
    wallet: null,
    walletAt: 0,
    walletBusy: false,
    update: null,
    updateAt: 0,
    updateBusy: false,
    lastBySession: new WeakMap(),
    callsBySession: new WeakMap(),
    writeTimer: null,
  }

  /* -------- projection: deterministic token buckets per model/tariff -------- */

  const projection = {
    key: KEY,
    stateVersion: 1,
    stateSchema: { parse: (value) => value },
    init: () => ({
      models: {},
      missing: 0,
      last: null,
      requestLog: [],
      pendingCalls: {},
    }),
    apply: (state, event) => {
      if (event.type === 'tool/call') {
        const name = event.data && event.data.name
        const kind = name === 'web_search' ? 'search' : name === 'web_fetch' ? 'fetch' : null
        const callId = event.data && event.data.callId
        if (!kind || !callId) return state
        return {
          ...state,
          pendingCalls: {
            ...(state.pendingCalls || {}),
            [callId]: { kind },
          },
        }
      }
      if (event.type === 'tool/result') {
        const message = event.data && event.data.message
        const callId = (message && (message.toolCallId || (message.source && message.source.callId))) || null
        const pending = state.pendingCalls || {}
        const entry = callId ? pending[callId] : null
        if (!entry) return state
        const nextPending = { ...pending }
        delete nextPending[callId]
        if (event.data && event.data.error) return { ...state, pendingCalls: nextPending }
        return {
          ...state,
          pendingCalls: nextPending,
          requestLog: [...(state.requestLog || []), { kind: entry.kind, time: event.time }],
        }
      }
      if (event.type !== 'assistant/message') return state
      const usage = usageOf(event)
      const route = routeOf(event)
      if (!usage) return { ...state, missing: state.missing + 1 }
      if (!route) return state
      const tariff = isOffPeak(event.time, runtime.config) ? 'off' : 'peak'
      const key = `${route.provider}/${route.model}`
      const models = { ...state.models }
      const buckets = bucketsOf(usage)
      // A retried step settles again at the same turn/step: replace its previous sample.
      if (state.last && state.last.turn === event.data.turn && state.last.step === event.data.step) {
        const old = models[state.last.key]
        if (old) {
          const patched = { peak: { ...old.peak }, off: { ...old.off } }
          subBuckets(patched[state.last.tariff], state.last.buckets)
          models[state.last.key] = patched
        }
      }
      const current = models[key] || emptyModel()
      const target = {
        peak: { ...current.peak },
        off: { ...current.off },
      }
      addBuckets(target[tariff], buckets)
      models[key] = target
      return {
        ...state,
        models,
        last: {
          turn: event.data.turn,
          step: event.data.step,
          key,
          tariff,
          buckets,
        },
      }
    },
  }

  ctx.effect(() => ctx.sessionProjections.register(projection), 'model-price: projection')

  /* -------- durable all-time totals -------- */

  const foldTotals = (session, event) => {
    if (!event) return
    if (event.type === 'tool/call') {
      const name = event.data && event.data.name
      const kind = name === 'web_search' ? 'search' : name === 'web_fetch' ? 'fetch' : null
      const callId = event.data && event.data.callId
      if (!kind || !callId) return
      let calls = runtime.callsBySession.get(session)
      if (!calls) {
        calls = new Map()
        runtime.callsBySession.set(session, calls)
      }
      calls.set(callId, { kind })
      return
    }
    if (event.type === 'tool/result') {
      const message = event.data && event.data.message
      const callId = (message && (message.toolCallId || (message.source && message.source.callId))) || null
      const calls = runtime.callsBySession.get(session)
      const entry = callId && calls ? calls.get(callId) : null
      if (!entry) return
      calls.delete(callId)
      if (event.data && event.data.error) return
      const totals = runtime.totals
      if (!Array.isArray(totals.requestLog)) totals.requestLog = []
      totals.requestLog.push({ kind: entry.kind, time: event.time })
      scheduleTotalsWrite()
      return
    }
    if (event.type !== 'assistant/message') return
    const usage = usageOf(event)
    const route = routeOf(event)
    if (!usage || !route) return
    const tariff = isOffPeak(event.time, runtime.config) ? 'off' : 'peak'
    const key = `${route.provider}/${route.model}`
    const totals = runtime.totals
    if (!totals.models[key]) totals.models[key] = emptyModel()
    const previous = runtime.lastBySession.get(session)
    const marker = `${event.data.turn}:${event.data.step}:${key}`
    if (previous && previous.marker === marker) {
      subBuckets(totals.models[previous.key][previous.tariff], previous.buckets)
    }
    const buckets = bucketsOf(usage)
    addBuckets(totals.models[key][tariff], buckets)
    runtime.lastBySession.set(session, { marker, key, tariff, buckets })
    scheduleTotalsWrite()
  }

  ctx.effect(() => ctx.on('session/event', (session, event) => foldTotals(session, event)), 'model-price: totals')

  function scheduleTotalsWrite() {
    if (runtime.writeTimer) return
    runtime.writeTimer = setTimeout(() => {
      runtime.writeTimer = null
      try {
        mkdirSync(root, { recursive: true })
        writeFileSync(totalsFile, JSON.stringify(runtime.totals), 'utf8')
      } catch (error) {
        ctx.logger?.warn?.(`model-price: totals write failed: ${error?.message || error}`)
      }
    }, 1500)
    runtime.writeTimer.unref?.()
  }

  /* -------- wallet -------- */

  async function refreshWallet() {
    if (runtime.walletBusy) return runtime.wallet
    runtime.walletBusy = true
    try {
      const account = ctx.get('deepseekAccount')
      let data = null
      if (account && typeof account.getBalance === 'function') {
        const balance = await account.getBalance({
          version: '0.2.1',
          locale: 'en',
          timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
        }).catch(() => null)
        if (balance && balance.status === 'ready') {
          data = {
            source: 'account',
            accounts: (balance.value || []).map((w) => ({ currency: w.currency, amount: Number(w.balance) })),
            bonuses: (balance.bonusWallets || []).map((w) => ({ currency: w.currency, amount: Number(w.balance) })),
          }
        }
      }
      if (!data && runtime.config.budget !== null && Number.isFinite(runtime.config.budget)) {
        data = { source: 'budget', accounts: [], bonuses: [], budget: runtime.config.budget }
      }
      runtime.wallet = data
      runtime.walletAt = Date.now()
    } finally {
      runtime.walletBusy = false
    }
    return runtime.wallet
  }

  const walletView = () => {
    const cfg = runtime.config
    const wallet = runtime.wallet
    const currency = cfg.displayCurrency
    if (!wallet) {
      return {
        source: 'none',
        currency,
        total: null,
        balance: null,
        bonus: null,
        accounts: [],
        bonuses: [],
        budget: cfg.budget,
        rate: cfg.rate,
        at: runtime.walletAt || null,
      }
    }
    if (wallet.source === 'budget') {
      return {
        source: 'budget',
        currency,
        total: wallet.budget,
        balance: wallet.budget,
        bonus: 0,
        accounts: [],
        bonuses: [],
        budget: wallet.budget,
        rate: cfg.rate,
        at: runtime.walletAt,
      }
    }
    let balance = 0
    let bonus = 0
    for (const w of wallet.accounts) balance += convert(w.amount, w.currency, currency, cfg.rate)
    for (const w of wallet.bonuses) bonus += convert(w.amount, w.currency, currency, cfg.rate)
    return {
      source: 'account',
      currency,
      total: balance + bonus,
      balance,
      bonus,
      accounts: wallet.accounts,
      bonuses: wallet.bonuses,
      budget: cfg.budget,
      rate: cfg.rate,
      at: runtime.walletAt,
    }
  }

  /* -------- spend aggregation -------- */

  function emptySpend() {
    return {
      total: 0,
      rows: [],
      missing: 0,
      requests: { searches: 0, fetches: 0, billableSearches: 0, billableFetches: 0, cost: 0 },
    }
  }

  function addRequestsToSpend(spend, state, config) {
    if (!spend.requests) {
      spend.requests = { searches: 0, fetches: 0, billableSearches: 0, billableFetches: 0, cost: 0 }
    }
    const usage = requestUsage(state.requestLog, config)
    spend.requests.searches += usage.searches
    spend.requests.fetches += usage.fetches
    spend.requests.billableSearches += usage.billableSearches
    spend.requests.billableFetches += usage.billableFetches
    if (config.includeRequests === false) return
    const cost = convert(usage.costUsd, 'USD', config.displayCurrency, config.rate)
    spend.requests.cost += cost
    spend.total += cost
  }

  function addStateToSpend(spend, state, config) {
    if (!state) return
    addRequestsToSpend(spend, state, config)
    for (const [key, model] of Object.entries(state.models || {})) {
      const [provider, ...rest] = key.split('/')
      const modelName = rest.join('/')
      const price = priceOf(config, key)
      const row = spend.rows.find((r) => r.key === key) || (() => {
        const created = {
          key,
          provider,
          model: modelName,
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          cost: 0,
          peakCost: 0,
          offCost: 0,
          priced: Boolean(price),
          currency: price ? price.currency : config.displayCurrency,
          peakUnit: price ? price.peak : null,
          offUnit: price ? price.off : null,
        }
        spend.rows.push(created)
        return created
      })()
      row.input += (model.peak.input + model.off.input)
      row.output += (model.peak.output + model.off.output)
      row.cacheRead += (model.peak.cacheRead + model.off.cacheRead)
      row.cacheWrite += (model.peak.cacheWrite + model.off.cacheWrite)
      if (price) {
        const peakCost = convert(costOf(model.peak, price.peak), price.currency, config.displayCurrency, config.rate)
        const offCost = convert(costOf(model.off, price.off), price.currency, config.displayCurrency, config.rate)
        row.cost += peakCost + offCost
        row.peakCost += peakCost
        row.offCost += offCost
        spend.total += peakCost + offCost
      }
    }
    spend.missing += state.missing || 0
  }

  async function buildSession(sessionId) {
    const cfg = runtime.config
    const self = emptySpend()
    const children = emptySpend()
    const root = ctx.sessions.get(sessionId)
    const rootState = root ? ctx.sessionProjections.stateOf(root, KEY) : undefined
    addStateToSpend(self, rootState, cfg)
    let entries = []
    try {
      const subagents = ctx.get('subagents')
      if (subagents && typeof subagents.listDescendants === 'function') {
        entries = await subagents.listDescendants(sessionId).catch(() => [])
      }
    } catch {
      entries = []
    }
    const ids = []
    for (const entry of entries || []) {
      if (!entry || !entry.id) continue
      const session = ctx.sessions.get(entry.id)
      if (!session) continue
      ids.push(entry.id)
      addStateToSpend(children, ctx.sessionProjections.stateOf(session, KEY), cfg)
    }
    const running = [sessionId, ...ids].some((id) => ctx.agents?.get?.(id)?.status === 'running')
    const total = self.total + children.total
    return {
      id: sessionId,
      total,
      currency: cfg.displayCurrency,
      running,
      self: {
        total: self.total,
        rows: self.rows.sort((a, b) => b.cost - a.cost),
        missing: self.missing,
        requests: self.requests,
      },
      children: {
        total: children.total,
        count: ids.length,
        rows: children.rows.sort((a, b) => b.cost - a.cost),
        missing: children.missing,
        requests: children.requests,
      },
      requests: {
        searches: self.requests.searches + children.requests.searches,
        fetches: self.requests.fetches + children.requests.fetches,
        billableSearches: self.requests.billableSearches + children.requests.billableSearches,
        billableFetches: self.requests.billableFetches + children.requests.billableFetches,
        cost: self.requests.cost + children.requests.cost,
      },
      unpriced: [...self.rows, ...children.rows].filter((r) => !r.priced).map((r) => r.key),
    }
  }

  function allTimeView() {
    const cfg = runtime.config
    const spend = emptySpend()
    addStateToSpend(spend, {
      models: runtime.totals.models,
      missing: 0,
      requestLog: runtime.totals.requestLog,
    }, cfg)
    return {
      since: runtime.totals.since,
      total: spend.total,
      currency: cfg.displayCurrency,
      rows: spend.rows.sort((a, b) => b.cost - a.cost),
      requests: spend.requests,
    }
  }

  /* -------- update check (GitHub Releases, at most every 6 hours) -------- */

  async function refreshUpdate(force) {
    // `force` is the manual button: it must work even when the automatic check is off.
    if (!force && !runtime.config.checkUpdates) return
    if (!force && Date.now() - runtime.updateAt < UPDATE_INTERVAL) return
    if (runtime.updateBusy) return
    runtime.updateBusy = true
    try {
      const response = await fetch(RELEASES_API, {
        headers: { accept: 'application/vnd.github+json', 'user-agent': 'dsh-model-price' },
        signal: AbortSignal.timeout(6000),
      })
      if (!response.ok) throw new Error(`GitHub answered ${response.status}`)
      const release = await response.json()
      const tag = typeof release.tag_name === 'string' ? release.tag_name.replace(/^v/i, '') : ''
      runtime.update = {
        latest: tag || null,
        url: typeof release.html_url === 'string' ? release.html_url : `${REPO_URL}/releases`,
        checkedAt: Date.now(),
      }
    } catch {
      runtime.update = { ...(runtime.update || {}), checkedAt: Date.now(), error: true }
    } finally {
      runtime.updateAt = Date.now()
      runtime.updateBusy = false
    }
  }

  function updateView() {
    const current = PLUGIN_VERSION
    const latest = runtime.update && runtime.update.latest ? runtime.update.latest : null
    return {
      enabled: Boolean(runtime.config.checkUpdates),
      current,
      latest,
      available: Boolean(latest && isNewer(latest, current)),
      url: (runtime.update && runtime.update.url) || `${REPO_URL}/releases`,
      checkedAt: (runtime.update && runtime.update.checkedAt) || null,
    }
  }

  function publicConfig() {
    const cfg = runtime.config
    return {
      version: PLUGIN_VERSION,
      displayCurrency: cfg.displayCurrency,
      rate: cfg.rate,
      rateUpdatedAt: cfg.rateUpdatedAt,
      peakWindows: cfg.peakWindows,
      peakDays: cfg.peakDays,
      holidays: cfg.holidays,
      language: cfg.language,
      hideWallet: cfg.hideWallet,
      hideLine: cfg.hideLine,
      checkUpdates: cfg.checkUpdates,
      showBestTime: cfg.showBestTime,
      budget: cfg.budget,
      searchPrice: cfg.searchPrice,
      fetchPrice: cfg.fetchPrice,
      requestBillingFrom: cfg.requestBillingFrom,
      includeRequests: cfg.includeRequests,
    }
  }

  function fullConfig() {
    return { ...publicConfig(), prices: runtime.config.prices }
  }

  function usedModels() {
    const set = new Set(Object.keys(runtime.config.prices || {}))
    for (const key of Object.keys(runtime.totals.models || {})) set.add(key)
    return [...set].sort()
  }

  /* -------- config persistence -------- */

  function saveConfig(patch) {
    const cfg = runtime.config
    if (patch && typeof patch === 'object') {
      if (patch.displayCurrency === 'USD' || patch.displayCurrency === 'CNY') cfg.displayCurrency = patch.displayCurrency
      if (patch.rate !== undefined) {
        const rate = num(patch.rate)
        if (rate !== null && rate > 0) {
          cfg.rate = rate
          cfg.rateUpdatedAt = new Date().toISOString()
        }
      }
      if (patch.peakWindows !== undefined) cfg.peakWindows = String(patch.peakWindows)
      if (Array.isArray(patch.peakDays)) {
        const days = patch.peakDays.map((day) => Number(day)).filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
        cfg.peakDays = [...new Set(days)].sort((a, b) => a - b)
      }
      if (Array.isArray(patch.holidays)) {
        cfg.holidays = [...new Set(patch.holidays.map((day) => String(day).trim()).filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day)))].sort()
      }
      if (patch.language !== undefined) {
        const language = String(patch.language)
        if (language === 'auto' || LOCALE_TAG.test(language)) cfg.language = language
      }
      if (patch.hideWallet !== undefined) cfg.hideWallet = Boolean(patch.hideWallet)
      if (patch.hideLine !== undefined) cfg.hideLine = Boolean(patch.hideLine)
      if (patch.checkUpdates !== undefined) cfg.checkUpdates = Boolean(patch.checkUpdates)
      if (patch.showBestTime !== undefined) cfg.showBestTime = Boolean(patch.showBestTime)
      if (patch.budget !== undefined) cfg.budget = num(patch.budget)
      if (patch.searchPrice !== undefined) {
        const price = num(patch.searchPrice)
        if (price !== null && price >= 0) cfg.searchPrice = price
      }
      if (patch.fetchPrice !== undefined) {
        const price = num(patch.fetchPrice)
        if (price !== null && price >= 0) cfg.fetchPrice = price
      }
      if (patch.requestBillingFrom !== undefined) {
        const text = String(patch.requestBillingFrom)
        if (!Number.isNaN(Date.parse(text))) cfg.requestBillingFrom = new Date(text).toISOString()
      }
      if (patch.includeRequests !== undefined) cfg.includeRequests = Boolean(patch.includeRequests)
      if (patch.prices && typeof patch.prices === 'object') {
        const cleaned = {}
        for (const [key, row] of Object.entries(patch.prices)) {
          if (!row || typeof row !== 'object') continue
          const peak = normalizePrice(row.peak, 'peak')
          if (!peak) continue
          const off = normalizePrice(row.off, 'off') || peak
          cleaned[key] = {
            currency: row.currency === 'CNY' ? 'CNY' : 'USD',
            peak: { input: peak.input, output: peak.output, cacheHit: num(row.peak.cacheHit), cacheWrite: num(row.peak.cacheWrite) },
            off: { input: off.input, output: off.output, cacheHit: num(row.off && row.off.cacheHit), cacheWrite: num(row.off && row.off.cacheWrite) },
          }
        }
        cfg.prices = cleaned
      }
    }
    try {
      mkdirSync(root, { recursive: true })
      writeFileSync(configFile, JSON.stringify(cfg, null, 2), 'utf8')
    } catch (error) {
      ctx.logger?.warn?.(`model-price: config write failed: ${error?.message || error}`)
    }
    return fullConfig()
  }

  /* -------- HTTP API -------- */

  const api = {
    async state(payload) {
      const sessionId = payload && payload.sessionId
      if (!sessionId) throw new Error('sessionId is required')
      if (Date.now() - runtime.walletAt > 45000) void refreshWallet()
      if (Date.now() - runtime.updateAt > UPDATE_INTERVAL) void refreshUpdate()
      const session = await buildSession(sessionId)
      return {
        config: publicConfig(),
        wallet: walletView(),
        tariff: isOffPeak(Date.now(), runtime.config) ? 'off' : 'peak',
        session,
        allTime: allTimeView(),
        update: updateView(),
      }
    },
    async config() {
      if (Date.now() - runtime.updateAt > UPDATE_INTERVAL) void refreshUpdate()
      return { config: fullConfig(), models: usedModels(), allTime: allTimeView(), update: updateView() }
    },
    async save(payload) {
      const before = runtime.config.checkUpdates
      saveConfig(payload || {})
      if (payload && payload.prices) void refreshWallet()
      if (runtime.config.checkUpdates && !before) void refreshUpdate(true)
      if (!runtime.config.checkUpdates) runtime.update = null
      return { config: fullConfig(), models: usedModels(), allTime: allTimeView(), update: updateView() }
    },
    async wallet() {
      await refreshWallet()
      return { wallet: walletView() }
    },
    async checkUpdate() {
      await refreshUpdate(true)
      return { update: updateView() }
    },
    async locales() {
      return readLocales()
    },
    async catalog() {
      const llm = ctx.get('llm')
      if (!llm || typeof llm.listProviders !== 'function') return { models: [] }
      let providers = []
      try {
        providers = llm.listProviders() || []
      } catch {
        providers = []
      }

      // Models the user actually bound in Settings → Models. A provider whose
      // settings entry carries an explicit (even empty) `models` array must be
      // taken from that array only; the adapter catalog is just its defaults.
      let configured = new Map()
      let defaults = null
      const settings = ctx.get('settings')
      if (settings && typeof settings.describe === 'function') {
        let entries = []
        try {
          entries = settings.describe({ redactSecrets: true }) || []
        } catch {
          entries = []
        }
        const setup = configuredSetup(entries)
        configured = setup.configured
        defaults = setup.defaults
      }

      const models = []
      const seen = new Set()
      const push = (provider, id, name) => {
        if (!provider || !id) return
        const key = `${provider}/${id}`
        if (seen.has(key)) return
        seen.add(key)
        models.push({ provider, providerName: provider, model: id, name: name || id })
      }

      const listedFor = async (providerId) => {
        try {
          return await Promise.race([
            llm.listModels(providerId),
            new Promise((resolve) => {
              const timer = setTimeout(() => resolve([]), 4000)
              timer.unref?.()
            }),
          ])
        } catch {
          return []
        }
      }

      await Promise.all(providers.map(async (provider) => {
        const explicit = configured.get(provider.id)
        if (explicit !== undefined) {
          // Empty list = the user selected nothing for this provider.
          if (explicit.length === 0) return
          const listed = await listedFor(provider.id)
          const names = new Map((listed || []).map((model) => [model.id, model.name]))
          for (const id of explicit) push(provider.id, id, names.get(id))
          return
        }
        // Account-scoped providers have no per-model settings: their catalog is
        // bound to the signed-in account, so it is safe to list.
        if (!settings || provider.id === 'deepseek-account') {
          const listed = await listedFor(provider.id)
          for (const model of listed || []) push(provider.id, model.id, model.name)
        }
      }))

      if (defaults) push(defaults.provider, defaults.model, null)
      models.sort((a, b) => a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model))
      return { models }
    },
    async reset() {
      runtime.totals = { since: new Date().toISOString(), models: {} }
      try {
        mkdirSync(root, { recursive: true })
        writeFileSync(totalsFile, JSON.stringify(runtime.totals), 'utf8')
      } catch {
        /* ignore */
      }
      return { allTime: allTimeView() }
    },
  }

  ctx.effect(() => {
    const dispose = ctx.webServer.register({
      kind: 'prefix',
      path: API_PREFIX,
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          json(res, 405, { ok: false, error: 'method not allowed' })
          return
        }
        const url = new URL(req.url || '/', 'http://dsh.internal')
        const method = url.pathname.startsWith(`${API_PREFIX}/`)
          ? url.pathname.slice(API_PREFIX.length + 1)
          : ''
        if (!method || method.includes('/') || !api[method]) {
          json(res, 404, { ok: false, error: `unknown method "${method}"` })
          return
        }
        try {
          const payload = await readJsonBody(req)
          const value = await api[method](payload)
          json(res, 200, { ok: true, value })
        } catch (error) {
          ctx.logger?.warn?.(`model-price: ${method} failed: ${error?.message || error}`)
          json(res, 500, { ok: false, error: String(error?.message || error) })
        }
      },
    })
    return () => dispose()
  }, 'model-price: http api')

  // Warm the wallet and the update check once so the first poll has data.
  void refreshWallet()
  void refreshUpdate()
}

/* ------------------------------------------------------------------ */
/* persistence helpers                                                 */
/* ------------------------------------------------------------------ */

function loadConfig(file) {
  const config = { ...DEFAULTS, prices: {} }
  try {
    if (!existsSync(file)) return config
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    if (!parsed || typeof parsed !== 'object') return config
    for (const key of Object.keys(DEFAULTS)) {
      if (parsed[key] !== undefined) config[key] = parsed[key]
    }
    if (config.displayCurrency !== 'CNY') config.displayCurrency = 'USD'
    if (!(Number(config.rate) > 0)) config.rate = DEFAULTS.rate
    if (config.language !== 'auto' && !LOCALE_TAG.test(String(config.language))) config.language = 'auto'
    if (typeof config.peakWindows !== 'string') config.peakWindows = DEFAULTS.peakWindows
    if (!Array.isArray(config.peakDays) || config.peakDays.length === 0) config.peakDays = DEFAULTS.peakDays.slice()
    if (!Array.isArray(config.holidays)) config.holidays = []
    if (!(Number(config.searchPrice) >= 0)) config.searchPrice = DEFAULTS.searchPrice
    if (!(Number(config.fetchPrice) >= 0)) config.fetchPrice = DEFAULTS.fetchPrice
    if (Number.isNaN(Date.parse(String(config.requestBillingFrom)))) config.requestBillingFrom = DEFAULTS.requestBillingFrom
    if (typeof config.includeRequests !== 'boolean') config.includeRequests = DEFAULTS.includeRequests
    config.prices = parsed.prices && typeof parsed.prices === 'object' ? parsed.prices : {}
  } catch {
    /* fall back to defaults */
  }
  return config
}

function loadTotals(file) {
  const empty = () => ({
    since: new Date().toISOString(),
    models: {},
    requestLog: [],
  })
  try {
    if (!existsSync(file)) return empty()
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    if (!parsed || typeof parsed !== 'object' || typeof parsed.models !== 'object') {
      return empty()
    }
    return {
      since: typeof parsed.since === 'string' ? parsed.since : new Date().toISOString(),
      models: parsed.models,
      requestLog: Array.isArray(parsed.requestLog) ? parsed.requestLog : [],
    }
  } catch {
    return empty()
  }
}

/**
 * Scan the plugin's `locale/` directory. Every `<BCP47-tag>.json` file becomes a
 * selectable language; `name` inside the file is the display name. The scan runs
 * on each request, so dropping a new file in is enough to offer a new language.
 */
function readLocales() {
  const locales = []
  const dicts = {}
  let files = []
  try {
    files = readdirSync(LOCALE_DIR)
  } catch {
    files = []
  }
  for (const file of files) {
    if (!file.toLowerCase().endsWith('.json')) continue
    const tag = file.slice(0, -5)
    if (!LOCALE_FILE_TAG.test(tag)) continue
    try {
      const parsed = JSON.parse(readFileSync(join(LOCALE_DIR, file), 'utf8'))
      const strings = parsed && typeof parsed.strings === 'object' && parsed.strings ? parsed.strings : {}
      if (Object.keys(strings).length === 0) continue
      dicts[tag] = strings
      locales.push({
        tag,
        name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : tag,
      })
    } catch {
      /* a malformed locale file is skipped, never fatal */
    }
  }
  locales.sort((a, b) => a.tag.localeCompare(b.tag))
  return { locales, dicts }
}

function json(res, status, body) {  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text),
  })
  res.end(text)
}

async function readJsonBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (chunks.length === 0) return {}
  const text = Buffer.concat(chunks).toString('utf8')
  if (!text.trim()) return {}
  return JSON.parse(text)
}
