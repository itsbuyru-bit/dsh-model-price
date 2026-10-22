# dsh-model-price

**English** | [Русский](README.ru.md)

Per-model API pricing, wallet balance and live session spend for [DeepSeek Harness](https://github.com/deepseek-ai).

The plugin adds a compact line under the chat composer — `Session: $0.0123 · Wallet: $12.34 · Peak` — and a **Models & prices** section in Settings where you enter what each model costs per million tokens, in USD or CNY, separately for Peak and Off-Peak hours.

## Features

- **Per-model price table** — input (cache miss), output, cache hit and cache write, each with a Peak and an Off-Peak rate. Empty cache-hit falls back to the input price; empty cache-write is free; an empty Off-Peak column reuses the Peak rate.
- **Two currencies** — enter each model's prices in USD or CNY, pick one display currency, and convert with a manual CNY/USD rate. Wallet balances are converted the same way and the original amounts stay visible in the popover.
- **Wallet** — reads the real DeepSeek account balance plus bonus wallets. A local budget can be used as a fallback when the account is unavailable. The eye toggle masks the amount.
- **Live session cost** — token buckets come from the durable session log (`assistant/message`), retries are de-duplicated, and the line updates while the model is working. Child sessions started by subagents/workflows are included and shown separately.
- **Peak / Off-Peak** — the badge follows an editable UTC window (DeepSeek default 16:30–00:30). Peak is orange, Off-Peak green; the matching price column is used at settlement time.
- **Model catalog** — one click imports every model already present in **Settings → Models**, duplicates are skipped, and the list is collapsible.
- **Localized** — 9 bundled languages with automatic discovery of new locale files (see below).

## Requirements

- DeepSeek Harness **0.2.0** or newer (Web/Desktop profile).
- The bundled Node.js of DSH (22.5+). No build step and no runtime dependencies.

## Installation

### Option 1 — Add Plugin (recommended)

1. Open **Settings → Plugins → Add plugin**.
2. Paste the package name, a GitHub repository address, or an absolute local path:

   ```
   dsh-model-price
   ```

   ```
   github:itsbuyru-bit/dsh-model-price
   ```

   ```
   https://github.com/itsbuyru-bit/dsh-model-price
   ```

   ```
   /path/to/dsh-model-price
   ```

3. Install, then restart DeepSeek Harness and refresh the page.

> The npm name works after the package is published to the registry (see *Publishing* below); the GitHub forms work immediately for a public repository.

### Option 2 — CLI

```sh
dsh plugin --profile <your-profile> add dsh-model-price
dsh plugin --profile <your-profile> add github:itsbuyru-bit/dsh-model-price
```

The `desktop` profile is owned by the Electron application and the CLI refuses to write to it; use **Add Plugin** in the UI for that profile.

### Option 3 — local development

```sh
git clone https://github.com/itsbuyru-bit/dsh-model-price.git
dsh plugin --profile <your-profile> add link:/absolute/path/to/dsh-model-price
```

Host changes require reinstalling the bundle; client changes only need a page refresh.

## Usage

1. Open **Settings → Models & prices**.
2. Press **Load models from Models** to import the models configured in the harness, or add one manually by provider and model id.
3. Click a model row to expand it and fill the Peak / Off-Peak prices per 1M tokens.
4. Press **Apply** at the bottom of the block. The composer line and the popover update immediately.

The composer line shows `Session: … · Wallet: … · Peak`. Click it for the token composition, per-model cost, wallet breakdown and the all-time total; the eye button masks the wallet.

Prices are applied retroactively: editing a rate recalculates the whole visible history, which is why the popover says *Prices are applied retroactively*. If a model has no price, the session total shows `?` and that model is listed as unpriced instead of silently counting as zero.

Data lives in `~/.dsh/api-spend/` (`config.json`, `totals.json`). The balance is fetched from the DeepSeek account; the FX rate is manual and no exchange-rate request is ever made.

## Adding a language

Locale files live in `locale/` and are named with a BCP 47 tag that includes a region or script subtag — `en-US.json`, `ru-RU.json`, `zh-CN.json`, `pt-BR.json`, `de-DE.json`, … A file whose name has no subtag (`en.json`) is ignored.

Each file is self-describing:

```json
{
  "locale": "it-IT",
  "name": "Italiano",
  "meta": { "title": "Model Price", "description": "…" },
  "strings": {
    "session": "Sessione",
    "wallet": "Portafoglio",
    "…": "…"
  }
}
```

1. Copy `locale/en-US.json` to `locale/<tag>.json`.
2. Translate every value in `strings` and `meta.description`.
3. Keep the keys, the placeholders `{n}` and `{rate}`, and these terms unchanged: `Peak`, `Off-Peak`, `USD`, `CNY`, `DSH`, `DeepSeek`, `API`, `cache miss/hit/write`, `Model Price` (the inventory name).
4. `settingsTitle` / `settingsNav` are the page title and the nav label — translate them (`Models & prices`, `Модели и цены`, …).
5. Set `"locale"` to the same tag as the file name and `"name"` to the language name written in that language.

The Host rescans `locale/` on every request, so a new file is picked up without a restart: open **Settings → Models & prices** (the section re-scans and refreshes every client half) or refresh the page. Missing keys fall back to `en-US`, then to the key name.

Bundled languages:

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

## Development

```sh
git clone https://github.com/itsbuyru-bit/dsh-model-price.git
cd dsh-model-price
node scripts/check.mjs   # syntax, manifest and locale-parity checks
```

The plugin is plain JavaScript: `index.js` is the Host half, `client.js` is the browser half, `cordis.patch.yml` inserts the plugin row. There is no build step.

## Publishing

```sh
npm publish
```

Before the first publish, make sure the package name is still available on npm and replace the repository owner in `package.json`, `README.md` and `README.ru.md` if the GitHub account differs.

## License

[MIT](LICENSE) © 2026 Aleksey Zakurdaev
