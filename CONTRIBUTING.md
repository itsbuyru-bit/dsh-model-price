# Contributing

Thanks for improving `dsh-model-price`.

## Bug reports and ideas

Open an issue with the DSH version, the operating system, what you expected and what
happened. For price or wallet problems include the model route (`provider/model`) and
whether the provider reported usage for that step.

## Translations

The easiest contribution: copy `locale/en-US.json` to `locale/<tag>.json`, translate
the values, keep the keys and the `{n}` / `{rate}` placeholders, set `"locale"` to the
file name and `"name"` to the language name in that language. See the *Adding a
language* section of the [README](README.md).

## Code

- `index.js` is the Host half (price table, session projection, wallet, HTTP API).
- `client.js` is the browser half (composer line, popover, settings section).
- `cordis.patch.yml` inserts the plugin row.
- Run `node scripts/check.mjs` before opening a pull request; CI runs the same check.

Keep the plugin dependency-free and build-free, and use theme tokens
(`--dsw-alias-*`, `--dsw-specific-*`) instead of literal colors for UI.
