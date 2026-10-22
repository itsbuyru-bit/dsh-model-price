# Security policy

## Supported versions

| Version | Supported |
|---|---|
| 1.0.x | ✅ |

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use
[GitHub Security Advisories](https://github.com/itsbuyru-bit/dsh-model-price/security/advisories/new)
or email **itsnxt@gmail.com** with:

- the plugin version and DeepSeek Harness version;
- the operating system;
- a description of the issue and, if possible, reproduction steps.

You can expect an acknowledgement within a few days. Please give a reasonable
amount of time for a fix before disclosing the issue publicly.

## Scope

The plugin runs locally inside DeepSeek Harness. It reads the DeepSeek account
balance through the Harness account service, stores prices and counters in
`~/.dsh/api-spend/`, and serves a local HTTP API under `/api-spend/api/`.

Out of scope: vulnerabilities in DeepSeek Harness itself, in the DeepSeek
account platform, or in third-party providers.

## Handling secrets

Never paste account tokens, API keys, `~/.npmrc` contents or private session data
into issues, pull requests or screenshots. The plugin never needs a DeepSeek API
key: the balance call is delegated to the Harness account service.
