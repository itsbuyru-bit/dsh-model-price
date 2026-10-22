# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [1.2.0] — 2026-10-22

### Added

- A “Check now” button next to the update toggle: forces an immediate GitHub
  Releases lookup and reports “Checking…”, “Up to date” or “Update available”.

[1.2.0]: https://github.com/itsbuyru-bit/dsh-model-price/releases/tag/v1.2.0

## [1.1.1] — 2026-10-22

### Changed

- The “Check for updates” toggle moved from the Display block to the About
  block and now saves immediately, without the Apply button.

[1.1.1]: https://github.com/itsbuyru-bit/dsh-model-price/releases/tag/v1.1.1

## [1.1.0] — 2026-10-22

### Added

- Optional update check: the Host asks the GitHub Releases API for the latest
  tag at most once every 6 hours and the About block links to a newer release.
  The check is on by default and can be disabled in the settings.

[1.1.0]: https://github.com/itsbuyru-bit/dsh-model-price/releases/tag/v1.1.0

## [1.0.1] — 2026-10-22

### Added

- A Peak / Off-Peak explainer in the settings intro, localized in all nine
  bundled languages.

[1.0.1]: https://github.com/itsbuyru-bit/dsh-model-price/releases/tag/v1.0.1

## [1.0.0] — 2026-10-22

### Added

- Per-model price table with Peak and Off-Peak rates for input (cache miss),
  output, cache hit and cache write, in USD or CNY.
- Composer dock line with the live session spend, the wallet balance and a
  Peak / Off-Peak badge.
- Click-through popover with the token composition, per-model cost, wallet
  breakdown (balance + bonus), child sessions and the all-time total.
- Real DeepSeek account balance with a local-budget fallback and an eye toggle
  to mask the amount.
- Model import from **Settings → Models**, collapsible model list and per-block
  **Apply** buttons.
- Manual CNY/USD rate, editable Off-Peak window in UTC and display-currency
  conversion for both session cost and wallet.
- Nine bundled locales (`en-US`, `ru-RU`, `zh-CN`, `ja-JP`, `ko-KR`, `es-ES`,
  `pt-BR`, `de-DE`, `fr-FR`) with automatic discovery of new locale files.
- `scripts/check.mjs` and a GitHub Actions workflow validating syntax, manifest
  and locale parity.

[1.0.0]: https://github.com/itsbuyru-bit/dsh-model-price/releases/tag/v1.0.0
