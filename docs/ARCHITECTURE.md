# Architecture

`dsh-model-price` is a DeepSeek Harness Host + Client bundle that turns recorded
token usage into a per-model cost. The Host (`index.js`) registers one session
projection, folds a durable all-time counter, reads the DeepSeek balance and serves
a JSON API; the Client (`client.js`) is a build-free module that registers two Web
UI slots, polls that API and renders the line, popover and settings page. Prices
are applied on read: no token is estimated and no session log is changed.

## Data flow

```text
Harness session event (assistant/message)
        |  usageOf() + routeOf() + isOffPeak(event.time)
        v
projection 'modelPrice' (per session, memory)     totals.json (session/event)
        |                                                  |
        +---------------------+----------------------------+
                              |
                 buildSession() / allTimeView()
                 costOf() x priceOf() -> convert() to displayCurrency
                              |
                 POST /api-spend/api/{state,config}
                              |
     composer dock line -> portal popover -> settings.section
```

## Host responsibilities

- **Projection.** `key: 'modelPrice'`, `stateVersion: 1`, identity
  `stateSchema.parse`; initial state `{ models: {}, missing: 0, last: null,
  requestLog: [], pendingCalls: {} }`. `models` is keyed `provider/model`; each
  entry `{ peak, off }` holds per-tariff counts
  `{ input, output, cacheRead, cacheWrite }`. `requestLog` stores successful
  `web_search` / `web_fetch` calls as `{ kind, time }`, while `pendingCalls` maps
  a `callId` to its kind until `tool/result` settles it.
- **Source and usage.** `routeOf` reads `event.data.message.source.{provider,model}`
  (missing `model` skips the event, missing provider becomes `unknown`). `usageOf`
  prefers `event.data.usage`, else scans `event.data.stream` backwards for the last
  `{ type: 'chunk', chunk: { type: 'usage' } }`; without it `missing` increments.
- **Tariff.** `isOffPeak(event.time, config)` maps UTC minutes onto the window to
  pick `off` or `peak`; classification is frozen at capture, so window edits never
  re-bucket existing tokens.
- **Retry replacement.** `last` stores `{ turn, step, key, tariff, buckets }`; a
  settlement with the same `turn` and `step` subtracts its previous sample before
  adding new buckets, so repeated retries of one step replace each other.
- **All-time totals.** `foldTotals` on `session/event` accumulates into
  `runtime.totals.models`, de-duplicated by a per-session `WeakMap` marker
  `${turn}:${step}:${key}`; successful tool calls append to `totals.requestLog`.
  `totals.json` writes are debounced 1.5 s and non-fatal.
- **Wallet.** `refreshWallet()` calls `deepseekAccount.getBalance({ version:
  '0.2.1', locale: 'en', timezoneOffsetSeconds })` and accepts only `ready`,
  mapping `value` to `accounts` and `bonusWallets` to `bonuses`; otherwise a finite
  `budget`, else `none`. The cache is memory-only; `state` re-fetches after 45 s.
- **Update check.** `refreshUpdate(force)` calls the GitHub Releases API with a 6 s
  timeout, at most every 6 hours and only with `checkUpdates` on unless forced;
  failures keep the previous `latest` and set `error: true`. `isNewer` compares
  numeric dot segments after stripping `v`.

## HTTP API

`ctx.webServer.register` mounts the prefix `/api-spend/api`. Only `POST` is
accepted (otherwise `405`); the path segment after the prefix is the method name.
Responses are `{ ok: true, value }` or `{ ok: false, error }` (unknown method
`404`, thrown error `500`) with `cache-control: no-store`.

| Method | Request body | `value` |
|---|---|---|
| `state` | `{ sessionId }` (required) | `{ config, wallet, tariff, session, allTime, update }` |
| `config` | `{}` | `{ config, models, allTime, update }` |
| `save` | subset of config fields, plus `prices` | `{ config, models, allTime, update }` |
| `wallet` | `{}` | `{ wallet }` (awaits a refresh) |
| `checkUpdate` | `{}` | `{ update }` (always forces a check) |
| `reset` | `{}` | `{ allTime }` (truncates `totals.json`) |
| `catalog` | `{}` | `{ models: [{ provider, providerName, model, name }] }` |
| `locales` | `{}` | `{ locales: [{ tag, name }], dicts: { tag: strings } }` |

`config` is `publicConfig()` plus `prices`; `publicConfig()` returns `version`,
`displayCurrency`, `rate`, `rateUpdatedAt`, `offPeakStart`, `offPeakEnd`,
`language`, `hideWallet`, `hideLine`, `checkUpdates`, `showBestTime`, `budget`.

`session` is `{ id, total, currency, running, self, children, unpriced }`, where
`self` and `children` are `{ total, rows, missing }` and each row is `{ key,
provider, model, input, output, cacheRead, cacheWrite, cost, peakCost, offCost,
priced, currency, peakUnit, offUnit }`. `children` also carries `count`; `unpriced`
lists unpriced keys. `allTime` is `{ since, total, currency, rows }`.

`catalog` mirrors Settings → Models: an explicit (even empty) `models` array wins,
account-scoped providers use `llm.listModels` (4 s cap), and the default model is added.

## Pricing model

Pricing helpers (`isOffPeak`, `normalizePrice`, `priceOf`, `convert`, `costOf`,
`isNewer`, `configuredSetup`) live in `lib/pricing.js`, shared by Host and tests.

| Bucket | Usage field | Unit price |
|---|---|---|
| Input (cache miss) | `inputTokens` | `input` |
| Output | `outputTokens` | `output` |
| Cache read | `cacheReadTokens` | `cacheHit` |
| Cache write | `cacheWriteTokens` | `cacheWrite` |

`costOf` computes `(in*input + out*output + read*cacheHit + write*cacheWrite) /
1e6`. Fallbacks applied by `normalizePrice` and `priceOf`:

- Missing input or output price: unpriced (`?`), never zero.
- Missing cache-hit price: charged at the input price.
- Missing cache-write price: charged at 0.
- Missing or invalid `off` row: the Peak row is used.
- `currency`: `CNY` if explicitly set, otherwise `USD`.

Amounts convert to `displayCurrency` with the manual `rate` (USD→CNY multiplies,
CNY→USD divides; other pairs pass through). Because prices are read at request
time, edits recalculate history ("retroactive"); `save` drops unpriceable rows.

## Client extension points

- `conversation.composer.dock`, id `spend`, order `2` — line and portaled popover;
  receives `{ dshLocale }`.
- `settings.section`, id `model-price`, order `30` — page and nav label, resolved
  via `translator(...)('settingsNav')` with a `Model Price` fallback.
- Polling: a chained `setTimeout` calls `state` every 1000 ms while `session.running`,
  2500 ms otherwise, 5000 ms after a failure; a new `sessionId` restarts it.
- Locales: `locales` is fetched once and forced again when settings mounts.
  `resolveLocaleTag` tries exact tag, case-insensitive match, base language,
  `en-US`, then the first tag; missing keys fall back to `en-US`, then the key
  name; unknown `{vars}` render empty.
- Rendering: one `<style data-dsh-model-price>` element; the popover mounts via
  `ReactDOM.createPortal` into `document.body` (fixed), closing on click or `Escape`.

## Configuration and storage

Files live in `config.dataDir`, or `~/.dsh/api-spend/` when empty (the default in
`cordis.patch.yml`). `config.json` holds every `DEFAULTS` key including `prices`;
`totals.json` holds `{ since, models }` — token buckets only, no money. A malformed
file falls back to defaults; reads never throw.

| Setting | Default | Notes |
|---|---|---|
| `displayCurrency` | `USD` | Only `USD` or `CNY` is accepted |
| `rate` | `7.1` | CNY per USD; must be > 0, restamps `rateUpdatedAt` |
| `peakWindows` | `01:00-04:00, 06:00-10:00` | UTC ranges; anything outside is Off-Peak |
| `peakDays` | `[1,2,3,4,5]` | ISO weekdays (1 = Monday) that can be Peak |
| `holidays` | 2026 statutory days | `YYYY-MM-DD` dates that are fully Off-Peak; bridge days excluded |
| `language` | `auto` | `auto` or a BCP 47 tag |
| `hideWallet` | `false` | Masks wallet amounts (`••••`) |
| `hideLine` | `false` | Removes the composer line |
| `checkUpdates` | `true` | Automatic 6-hour release check |
| `showBestTime` | `true` | Best-time block in the popover |
| `budget` | `null` | Display-only fallback, never enforced |
| `searchPrice` | `0.75` | USD per 1,000 successful Search calls |
| `fetchPrice` | `0.75` | USD per 1,000 successful Fetch calls |
| `requestBillingFrom` | `2026-10-31T16:00:00Z` | Calls before this instant are free |
| `includeRequests` | `true` | Adds request costs to the displayed totals |
| `prices` | `{}` | `{ 'provider/model': { currency, peak, off } }` |

## Security and privacy

Outbound traffic is limited to the Harness's own `getBalance` call (the plugin only
invokes the service) and the optional GitHub Releases request, which carries no
session data or identifiers. Nothing is written to the session log. Disk holds
prices, configuration and token counts; wallet amounts, prompts, completions and
credentials are never persisted. There is no telemetry, analytics or FX call.

## Failure modes and degradation

| Condition | Behavior |
|---|---|
| `deepseekAccount` absent or signed out | Wallet `source` is `budget` or `none`; UI stays usable |
| No price for a route | Row shows `?`, key listed in `unpriced`, cost omitted |
| Settlement without usage | Counted in `missing`, no tokens, no cost |
| Malformed locale file | Skipped by the Host; Client falls back to `en-US`, then keys |
| Update request fails | Previous `latest` kept, `error: true`, UI reports it |
| Slot missing, renamed, or `hideLine` on | Line disappears; API and settings still work |

## File map

```text
dsh-model-price/
├── index.js                  # Host: projection, pricing, wallet, API, locales
├── client.js                 # Client: composer line, popover, settings, i18n
├── lib/pricing.js            # Pure tariff, price, cost and setup helpers
├── locale/*.json             # 9 BCP 47 locale files, 97 string keys each
├── scripts/check.mjs         # Manifest, syntax and locale-parity checks
├── test/pricing.test.mjs     # Unit tests for lib/pricing.js
├── .github/workflows/ci.yml  # check.mjs, unit tests, actionlint
└── docs/                     # This document and the translation guide
```
