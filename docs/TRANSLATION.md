# Translation guide

This guide is for adding or updating a UI language in `dsh-model-price`. Locale
files live in `locale/` and are loaded at runtime by the Host; there is no build
step and no code change involved.

## File naming

Each file is named after a BCP 47 tag with a region or script subtag:
`en-US.json`, `zh-CN.json`, `pt-BR.json`, `zh-TW.json`. Two-letter base tags
(`en.json`, `de.json`) are ignored by the Host scan and rejected by
`scripts/check.mjs`, because the plugin requires a region-qualified file to
distinguish variants such as `pt-BR` and `pt-PT`.

The file name must equal the `locale` field inside the file.

## JSON schema

```json
{
  "locale": "de-DE",
  "name": "Deutsch",
  "meta": {
    "title": "Model Price",
    "description": "Per-model API prices in USD or CNY, …"
  },
  "strings": {
    "session": "Sitzung",
    "rateLine": "1 USD = {rate} CNY"
  }
}
```

| Field | Meaning |
|---|---|
| `locale` | The BCP 47 tag; identical to the file name without `.json` |
| `name` | Language name written in that language; shown in the settings selector |
| `meta.title` | Catalog title; keep `Model Price` |
| `meta.description` | One-sentence catalog description; translate it |
| `strings` | Flat key/value map; the only field the UI reads |

`strings` currently holds 97 keys. The Host serves the whole dictionary and the
Client resolves each key independently.

## Rules

1. Never change, add or remove keys. The key set must match `en-US.json`
   exactly; CI compares the sorted key lists.
2. Preserve every placeholder verbatim: `{n}`, `{rate}`, `{time}`, `{duration}`,
   `{start}`, `{end}`. Translate the surrounding sentence, not the token.
3. Keep product and technical terms in English: `Peak`, `Off-Peak`, `USD`,
   `CNY`, `DSH`, `DeepSeek`, `API`, `cache hit`, `cache write`. Keep
   `Model Price` in `meta.title`.
4. Translate `settingsTitle` and `settingsNav`; they are the settings page
   heading and the settings nav label. `settingsNav` falls back to
   `Model Price` only if the key is missing.
5. Values must be non-empty strings. `""` fails the check and renders blank.
6. Write UTF-8 without a BOM. A BOM makes `JSON.parse` fail, so the Host skips
   the file.

## Step by step

1. Copy `locale/en-US.json` to `locale/<tag>.json`, for example
   `locale/it-IT.json`.
2. Translate the values of `strings` and `meta.description`.
3. Set `"locale"` to the tag and `"name"` to the language name written in that
   language (`Italiano`), not in English.
4. Run the validator from the repository root:

   ```sh
   node scripts/check.mjs
   ```

   It checks the file tag, `locale`, `name`, key parity, empty values and
   placeholder preservation, and also runs `node --check` on the JS sources.
5. Load the plugin, open **Settings → Models & prices** (mounting the section
   forces a locale re-scan), then refresh the page.
6. Select the new language under **Display → Language**; entries appear as
   `Name (tag)`, for example `Italiano (it-IT)`.

## Fallback chain

The Client resolves the active tag as: exact requested tag → case-insensitive
match → same base language (`de-AT` may use `de-DE`) → `en-US` → first available
locale. Within the chosen dictionary, a key missing there falls back to the
`en-US` value, and then to the key name itself.

A partial file therefore renders, but it fails `scripts/check.mjs`, because
repository files must be complete. Incomplete dictionaries are only tolerated at
runtime, not in CI.

## Common mistakes

| Mistake | Symptom | Fix |
|---|---|---|
| Typo in a key (`langauge`) | Key shown literally; CI parity failure | Copy keys exactly |
| Translated placeholder | `rateLine` renders an empty value | Keep `{rate}`, translate around it |
| Bare file name (`de.json`) | Language never appears | Rename to `de-DE.json`, fix `locale` |
| Empty value | CI failure, blank label | Translate it or copy the English |
| UTF-8 BOM | File skipped, parse error in CI | Save as UTF-8 without BOM |
| `locale` differs from file name | CI failure | Make both identical |
| `name` left in English | Wrong language name in the selector | Name it in the target language |

## Current locales

| File | `name` | Language |
|---|---|---|
| `en-US.json` | English (US) | English |
| `ru-RU.json` | Русский | Russian |
| `zh-CN.json` | 简体中文 | Chinese (Simplified) |
| `ja-JP.json` | 日本語 | Japanese |
| `ko-KR.json` | 한국어 | Korean |
| `es-ES.json` | Español | Spanish |
| `pt-BR.json` | Português (Brasil) | Portuguese (Brazil) |
| `de-DE.json` | Deutsch | German |
| `fr-FR.json` | Français | French |

All nine files carry the same 97 keys. Add a row to this table when adding a
language.
