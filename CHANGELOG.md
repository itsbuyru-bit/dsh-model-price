# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- `migrate.ps1` / `migrate.cmd`: export the workspace chats, plugin settings and
  the plugin into one ZIP, and import it on another computer (the script detects
  the archive next to itself and asks before installing).

## [1.4.1] — 2026-10-22

### Added

- Unit test suite for the pricing layer (`test/pricing.test.mjs`), run in CI.
- Static project website in `site/` with a GitHub Pages workflow.
- `docs/ARCHITECTURE.md` and `docs/TRANSLATION.md`.
- Social preview and composer-line images in `docs/images/`.

### Changed

- Pure pricing helpers moved to `lib/pricing.js` and shipped with the package.
- `engines.dsh` (`>=0.2.0`), Dependabot for Actions and actionlint in CI.

[1.4.1]: https://github.com/itsbuyru-bit/dsh-model-price/releases/tag/v1.4.1

## [1.4.0] — 2026-10-22

### Changed

- **Load models from Models** now mirrors the model list configured in
  **Settings → Models** instead of the adapter's full catalog. Models that are
  not bound there (or were removed from it) disappear from the price table
  together with their prices. Providers with an empty model list contribute
  nothing; the account-scoped DeepSeek provider keeps its account catalog.

[1.4.0]: https://github.com/itsbuyru-bit/dsh-model-price/releases/tag/v1.4.0

## [1.3.1] — 2026-10-22

### Fixed

- The “Check now” button stays available when the automatic update check is
  disabled; a manual check still queries GitHub and reports the result.

[1.3.1]: https://github.com/itsbuyru-bit/dsh-model-price/releases/tag/v1.3.1

## [1.3.0] — 2026-10-22

### Added

- “Best time” block in the popover: the Off-Peak window in local time and a
  countdown until it starts (or until it ends, when already active). Toggle it
  in the Display settings.

[1.3.0]: https://github.com/itsbuyru-bit/dsh-model-price/releases/tag/v1.3.0

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
