# dsh-model-price — API pricing for DeepSeek Harness

**English** | [Русский](README.ru.md)

[![CI](https://github.com/itsbuyru-bit/dsh-model-price/actions/workflows/ci.yml/badge.svg)](https://github.com/itsbuyru-bit/dsh-model-price/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform: Web / Desktop](https://img.shields.io/badge/platform-Web%20%2F%20Desktop-0078D4.svg)](#requirements)
[![DeepSeek Harness: 0.2.x](https://img.shields.io/badge/DeepSeek%20Harness-0.2.x-6f42c1.svg)](#supported-versions)
[![Languages: 9](https://img.shields.io/badge/languages-9-2ea44f.svg)](#languages)

Per-model API prices, wallet balance and live session spend for
**DeepSeek Harness**. The plugin adds a compact line under the chat composer —
`Session: $0.0123 · Wallet: $12.34 · Peak` — and a **Models & prices** section in
Settings where you enter what each model costs per million tokens, in USD or CNY,
separately for Peak and Off-Peak hours.

The plugin is a Host + Client bundle. It does not patch Harness, does not modify
session logs, and keeps all of its data in `~/.dsh/api-spend/`.

> **Unofficial.** This project is not affiliated with, endorsed by, or sponsored
> by DeepSeek. “DeepSeek” and “DeepSeek Harness” belong to their respective
> authors. See [Non-affiliation](#non-affiliation).

---

## Table of contents

- [What this plugin does](#what-this-plugin-does)
- [Features](#features)
- [Supported versions](#supported-versions)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Usage](#usage)
- [How it works](#how-it-works)
- [Price model](#price-model)
- [Languages](#languages)
- [Data and privacy](#data-and-privacy)
- [Project structure](#project-structure)
- [Testing](#testing)
- [Updating](#updating)
- [Troubleshooting](#troubleshooting)
- [Limitations](#limitations)
- [Contributing](#contributing)
- [Security](#security)
- [License and credits](#license-and-credits)
- [Non-affiliation](#non-affiliation)

---

## What this plugin does

DeepSeek Harness reports token usage per step but has no per-model price table
and no wallet display. This plugin adds both:

| Surface | What it shows | Where it lives |
|---|---|---|
| Composer line | Session spend, wallet balance, Peak / Off-Peak badge, live indicator | `conversation.composer.dock`, order 2 |
| Popover | Token composition, per-model cost, wallet split, child sessions, all-time total | Click the line |
| Settings section | Price table per model, currency, manual FX rate, Off-Peak window, language | `settings.section`, order 30 |
| Host API | Prices, wallet and session aggregation | `/api-spend/api/*` |

The plugin works from the durable session log: it folds
`assistant/message` usage into a session projection and prices it on read. It
does not estimate tokens, does not rewrite logs, and does not block requests.

---

## Features

- **Per-model price table** — input (cache miss), output, cache hit and cache
  write, each with a Peak and an Off-Peak rate.
- **Two currencies** — enter prices in USD or CNY, display in one currency and
  convert with a manual rate stored in the settings.
- **Wallet** — real DeepSeek account balance plus bonus wallets; a local budget
  can stand in when the account is unavailable.
- **Live session cost** — updates while the model works; retries are
  de-duplicated and aborted steps without usage are reported, not guessed.
- **Peak / Off-Peak** — editable UTC window, orange Peak badge, green Off-Peak
  badge, and the matching price column is used for each settlement.
- **Model import** — one click loads every model configured in **Settings →
  Models**; duplicates are skipped and the list is collapsible.
- **Localized** — 9 bundled languages with automatic discovery of new locale
  files.
- **Update indicator** — optional check of the latest GitHub release (at most
  once every 6 hours) with a link to it in the About block.
- **Dependency-free, build-free** — plain JavaScript, no runtime packages.

---

## Supported versions

| Component | Value |
|---|---|
| DeepSeek Harness | **0.2.x** — tested on **0.2.1-rc.2** (Desktop, Windows) |
| Profile | `desktop` (Web/Desktop); any profile that mounts the Web UI |
| Node.js | bundled with DSH, **22.5+** |
| Plugin version | **1.1.0** |

The plugin is not gated on an exact Harness version. If a future release
renames a slot, a projection key or a service, the affected part degrades to
“no line”/“no wallet” instead of crashing the page; the Host API keeps working.

---

## Requirements

| Need | Why |
|---|---|
| **DeepSeek Harness 0.2.x** | Provides the Web UI, session projections and the account service |
| **A Web/Desktop profile** | The composer line and the settings section are Web-UI slots |
| **DeepSeek account (optional)** | Only for the wallet balance; without it use the local-budget fallback |
| **No build tools** | The bundle ships `index.js` and `client.js` as-is |

Works on Windows, macOS and Linux; the UI uses Harness theme tokens and follows
the active theme automatically.

---

## Quick start

### Option 1 — Add Plugin (recommended)

1. Open **Settings → Plugins → Add plugin**.
2. Paste one of:

   ```
   github:itsbuyru-bit/dsh-model-price
   ```

   ```
   https://github.com/itsbuyru-bit/dsh-model-price
   ```

   ```
   /path/to/dsh-model-price
   ```

3. Install, restart DeepSeek Harness and refresh the page.

The plugin is distributed from GitHub; there is no npm registry package.

### Option 2 — CLI

```sh
dsh plugin --profile <your-profile> add github:itsbuyru-bit/dsh-model-price
```

The `desktop` profile is owned by the Electron application and the CLI refuses
to write to it; use **Add Plugin** in the UI for that profile.

### Option 3 — local development

```sh
git clone https://github.com/itsbuyru-bit/dsh-model-price.git
dsh plugin --profile <your-profile> add link:/absolute/path/to/dsh-model-price
```

Host changes require reinstalling the bundle; client changes only need a page
refresh.

---

## Usage

1. Open **Settings → Models & prices**.
2. Press **Load models from Models** to import the models configured in the
   harness, or add one manually by provider and model id.
3. Expand a model row and fill the Peak / Off-Peak prices per 1M tokens.
4. Press **Apply** at the bottom of the block.

The composer line shows `Session: … · Wallet: … · Peak`. Click it for the token
composition, per-model cost, wallet breakdown and the all-time total; the eye
button masks the wallet.

| Action | Result |
|---|---|
| Click the line | Opens the spend popover |
| Eye button | Hides or shows the wallet amount (persisted) |
| **Load models from Models** | Adds missing models from the Harness catalog |
| **Expand all / Collapse all** | Opens or closes every price row |
| **Apply** (Display) | Saves currency, rate, window, language and toggles |
| **Apply** (Models) | Saves the price table |
| **Reset total** | Resets the all-time counter; session history is kept |

Prices are applied retroactively: editing a rate recalculates the visible
history, which the popover states explicitly. A model without a price shows `?`
and is listed as unpriced instead of counting as zero.

---

## How it works

### Host half — `index.js`

1. Registers the `modelPrice` session projection, keyed by
   `provider/model` and split into Peak / Off-Peak token buckets.
2. Folds `assistant/message` events only; a retried step at the same
   `turn/step` replaces its previous sample instead of double counting.
3. Keeps an all-time counter in `totals.json`, updated from `session/event`.
4. Prices tokens on read with the current table and converts the result to the
   display currency.
5. Reads the wallet from `deepseekAccount.getBalance` (45-second cache) and
   falls back to the local budget.
6. Serves `/api-spend/api/{state,config,save,wallet,reset,catalog,locales}`.

### Client half — `client.js`

1. Registers `conversation.composer.dock → spend` and
   `settings.section → model-price`.
2. Polls the Host state every 1–2.5 s (faster while a turn runs) and renders the
   line, the portaled popover and the settings form.
3. Loads locale files from `/api-spend/api/locales`, so the UI language is
   independent of the Harness language and can be overridden per plugin.

### What is counted

| Token bucket | Source | Charged at |
|---|---|---|
| Input (cache miss) | `usage.inputTokens` | input price |
| Cache read | `usage.cacheReadTokens` | cache-hit price, falls back to input |
| Cache write | `usage.cacheWriteTokens` | cache-write price, empty = free |
| Output | `usage.outputTokens` | output price |

`reasoningTokens` is already inside `outputTokens` and is not charged twice.
Child sessions are included while they are live and are shown separately.

---

## Price model

| Rule | Behaviour |
|---|---|
| Empty cache-hit price | Charged at the input price |
| Empty cache-write price | Free |
| Empty Off-Peak column | Uses the Peak price |
| Missing input or output price | Model is unpriced; session total shows `?` |
| Price currency ≠ display currency | Converted with the manual rate |
| Off-Peak window | Editable in UTC; DeepSeek default 16:30–00:30 |
| Price edits | Recalculate the visible history (retroactive) |
| Budget | A display fallback only; no limits and no blocking |

---

## Languages

Bundled locales are BCP 47 files with a region or script subtag:

| File | Language |
|---|---|
| `locale/en-US.json` | English (US) |
| `locale/ru-RU.json` | Русский |
| `locale/zh-CN.json` | 简体中文 |
| `locale/ja-JP.json` | 日本語 |
| `locale/ko-KR.json` | 한국어 |
| `locale/es-ES.json` | Español |
| `locale/pt-BR.json` | Português (Brasil) |
| `locale/de-DE.json` | Deutsch |
| `locale/fr-FR.json` | Français |

### Adding a language

1. Copy `locale/en-US.json` to `locale/<tag>.json`, where `<tag>` includes a
   region or script subtag (`it-IT`, `nl-NL`, `tr-TR`, `zh-TW`). A file without
   a subtag (`en.json`) is ignored.
2. Translate every value in `strings` and `meta.description`.
3. Keep the keys and the `{n}` / `{rate}` placeholders; keep `Peak`, `Off-Peak`,
   `USD`, `CNY`, `DSH`, `DeepSeek`, `API`, `cache miss/hit/write` and
   `Model Price` (inventory name) in English.
4. Translate `settingsTitle` / `settingsNav` — they are the page title and the
   nav label.
5. Set `"locale"` to the file tag and `"name"` to the language name written in
   that language.

The Host rescans `locale/` on every request: drop the file in, open
**Settings → Models & prices** (the section forces a re-scan) or refresh the
page. Missing keys fall back to `en-US`, then to the key name.

---

## Data and privacy

| Data | Location | Notes |
|---|---|---|
| Prices, currency, rate, window, language | `~/.dsh/api-spend/config.json` | Plain JSON |
| All-time token counters | `~/.dsh/api-spend/totals.json` | Token buckets only |
| Wallet balance | DeepSeek account API | Cached 45 s in memory, never written to disk |
| Session usage | Harness session log | Read through the projection, never modified |
| Update check | `api.github.com` Releases API | Optional; one request per 6 h, no payload |

There are no analytics and no telemetry. The only outbound requests are the
account balance call made by the Harness itself and the optional update check;
disable it in **Settings → Models & prices → Check for updates**. The FX rate is
manual by design.

---

## Project structure

```text
dsh-model-price/
├── index.js                 # Host half: projection, wallet, pricing API
├── client.js                # Client half: composer line, popover, settings
├── cordis.patch.yml         # Inserts the plugin row
├── icon.svg                 # Plugin icon
├── locale/                  # 9 BCP 47 locale files (83 keys each)
├── scripts/check.mjs        # Manifest, syntax and locale-parity checks
├── .github/workflows/ci.yml # CI: node scripts/check.mjs
├── README.md                # English
├── README.ru.md             # Russian
├── CHANGELOG.md
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
├── SUPPORT.md
├── LICENSE
└── package.json
```

---

## Testing

```sh
node scripts/check.mjs
```

The check validates the manifest, runs `node --check` on both halves, and
verifies every locale against `en-US.json`: file tag, `locale` field, key set,
empty values and `{placeholder}` preservation. CI runs the same command on every
push and pull request.

---

## Updating

- Distribution is GitHub-only. Re-installing the bundle from
  `github:itsbuyru-bit/dsh-model-price` picks up the default branch.
- The About block shows **Update available** when a newer GitHub release exists.
  The plugin only reports it: install the new tag with
  `github:itsbuyru-bit/dsh-model-price#vX.Y.Z` (or reinstall the bundle).
- Version lives in `package.json` and `CHANGELOG.md`; releases are tagged
  `vX.Y.Z`.
- Pushing a `vX.Y.Z` tag runs `.github/workflows/release.yml` and publishes a
  GitHub Release with generated notes.
- Host changes require reinstalling the bundle; client changes only need a page
  refresh.
- Settings and totals survive updates; they are not part of the package.

---

## Troubleshooting

### The composer line is missing

- Make sure a session is open — the dock is session-scoped.
- Check **Settings → Models & prices → Hide the composer line**.
- Refresh the page after installing or updating the client half.

### The settings section is not in the list

- The Host must be restarted after installing the bundle.
- Look for **Models & prices** near the bottom of the settings nav.

### The wallet shows “No balance available”

- The DeepSeek account is not signed in, or the provider is not DeepSeek.
- Set **Local budget fallback** to show a number instead.

### Cost shows `?`

- The model route is not priced. Open the settings, expand that model and fill
  input/output prices, then press **Apply**.
- The popover lists every unpriced route.

### The session total looks too low

- A step without provider usage is counted as “steps without usage”, not
  estimated.
- Completed child sessions are not part of the current session total; they are
  still included in the all-time total.

### Peak and Off-Peak look swapped

- The window is in **UTC**. Set it in the settings; the badge follows the same
  window as the price choice.

### A new language does not appear

- The file name must include a region/script subtag: `de-DE`, not `de`.
- The file must be valid JSON with a non-empty `strings` object.
- Open **Settings → Models & prices** to force a re-scan, then refresh.

### The line shows `••••`

- The eye button is masked, or **Hide wallet amount** is on. Click the eye.

---

## Limitations

- **Web UI only.** There is no TUI/CLI rendering of the spend line.
- **Wallet is DeepSeek-specific.** Other providers show the local-budget
  fallback.
- **Completed child sessions** are only in the all-time total, not in the
  current session line.
- **Prices are retroactive.** Editing a rate recalculates history rather than
  freezing the rate at settlement time.
- **No limits or blocking.** The plugin reports money; it never stops a request.
- **FX is manual.** No exchange-rate service is called.
- **Locale files ship as-is.** A partial translation falls back key by key.

---

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md).
Translation fixes are especially useful: include the language, the English
source, the current text and a suggested correction.

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).

---

## Security

Do not paste account tokens, API keys or private session data into issues.
Report security problems privately through GitHub Security Advisories; see
[SECURITY.md](SECURITY.md).

---

## License and credits

- This project: **MIT**, © 2026 **Aleksey Zakurdaev**. See [LICENSE](LICENSE).
- Built for [DeepSeek Harness](https://github.com/deepseek-ai); the plugin uses
  its slot, projection, settings and account services without bundling any
  Harness code.
- The UI follows Harness theme tokens (`--dsw-alias-*`, `--dsw-specific-*`) and
  the native popover metrics so it matches the host in light and dark themes.

---

## Non-affiliation

This is an independent, unofficial project. It is **not affiliated with,
endorsed by, or sponsored by** DeepSeek or the DeepSeek Harness maintainers.
It contains no DeepSeek source code or binaries; it only extends a local Harness
installation through its public plugin APIs. “DeepSeek” and “DeepSeek Harness”
belong to their respective authors.
