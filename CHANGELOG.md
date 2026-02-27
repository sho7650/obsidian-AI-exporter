# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.11.1](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.11.0...v0.11.1) (2026-02-27)


### Bug Fixes

* address security gaps, error handling, and dead code from analysis report ([#82](https://github.com/sho7650/obsidian-AI-exporter/issues/82)) ([950673a](https://github.com/sho7650/obsidian-AI-exporter/commit/950673a9ea907752c404855117324a96ccb217a5))

## [0.11.0](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.10.9...v0.11.0) (2026-02-25)


### Features

* add append mode to preserve existing notes and append only new messages ([ae34366](https://github.com/sho7650/obsidian-AI-exporter/commit/ae34366f577bff7e1ab9e0eca1fa40763238fed7))
* add append mode to preserve existing notes and append only new messages ([77db89c](https://github.com/sho7650/obsidian-AI-exporter/commit/77db89c34909252abe9950d0d8b0caba39ccbb1b))

## [0.10.9](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.10.8...v0.10.9) (2026-02-25)


### Code Refactoring

* reduce duplication, remove dead code, and shrink public API surface ([f2ed454](https://github.com/sho7650/obsidian-AI-exporter/commit/f2ed454f7c34075d08d25aa35a90fbeadad48a4b))
* reduce duplication, remove dead code, and shrink public API surface ([fff4008](https://github.com/sho7650/obsidian-AI-exporter/commit/fff400820966f871e295628bec1dc9fbeef0180b))

## [0.10.8](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.10.7...v0.10.8) (2026-02-24)


### Bug Fixes

* preserve Gemini KaTeX math blocks as LaTeX in Obsidian output ([8dfa467](https://github.com/sho7650/obsidian-AI-exporter/commit/8dfa4674697d995cd0bf5e0dd1ce19e715f4df8d))
* preserve Gemini KaTeX math blocks as LaTeX in Obsidian output ([ac67045](https://github.com/sho7650/obsidian-AI-exporter/commit/ac67045e63c7afee45ae49572c5bceea92c2858a))

## [0.10.7](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.10.6...v0.10.7) (2026-02-24)


### Code Refactoring

* split background/index.ts into focused modules ([44f07f3](https://github.com/sho7650/obsidian-AI-exporter/commit/44f07f34e5bccc0476f081971cc1a409e3d399ee))

## [0.10.6](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.10.5...v0.10.6) (2026-02-24)


### Tests

* add edge case coverage for ChatGPT and Perplexity extractors ([f2c08df](https://github.com/sho7650/obsidian-AI-exporter/commit/f2c08dfffff19076e51c129a4a7f0e8d0317834d))

## [0.10.5](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.10.4...v0.10.5) (2026-02-24)


### Miscellaneous

* fix npm audit vulnerabilities ([1039c74](https://github.com/sho7650/obsidian-AI-exporter/commit/1039c7400a0491a155bd36204a3c6ddd058f1e6d))
* fix npm audit vulnerabilities ([122611a](https://github.com/sho7650/obsidian-AI-exporter/commit/122611aa768a1c7cdfde6c9482fe0de7bacc307b))

## [0.10.4](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.10.3...v0.10.4) (2026-02-23)


### Bug Fixes

* use MAX_DEEP_RESEARCH_TITLE_LENGTH in Claude getDeepResearchTitle ([3ee6002](https://github.com/sho7650/obsidian-AI-exporter/commit/3ee600297a09d3d68f73b41dd8a9cfa0f3965385))


### Code Refactoring

* add template method extract() with hooks to BaseExtractor ([b61bb97](https://github.com/sho7650/obsidian-AI-exporter/commit/b61bb97e89d3f080b1f139777d26fbe766b63971))
* deduplicate citation callback and API key guard ([4071894](https://github.com/sho7650/obsidian-AI-exporter/commit/407189467ddc0c0a9abb3f1bc71d02ed43f984ae))
* extract AIPlatform type alias ([e8b5e6f](https://github.com/sho7650/obsidian-AI-exporter/commit/e8b5e6fc9d8ba50577bfeed4b84d47e3bab9f34e))
* reduce extractor code complexity and redundancy ([dedc58e](https://github.com/sho7650/obsidian-AI-exporter/commit/dedc58e770ca48c498c12d28023a78765368f424))
* simplify extractor subclasses using template method ([3ee6002](https://github.com/sho7650/obsidian-AI-exporter/commit/3ee600297a09d3d68f73b41dd8a9cfa0f3965385))


### Tests

* add template method and utility tests to BaseExtractor ([01ce497](https://github.com/sho7650/obsidian-AI-exporter/commit/01ce4970fb2e6de1bd4eaedca7134b10df55018f))

## [0.10.3](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.10.2...v0.10.3) (2026-02-22)


### Code Refactoring

* replace innerHTML with safe DOM API and optimize hot-path patterns ([aa76785](https://github.com/sho7650/obsidian-AI-exporter/commit/aa7678535a382ec270df0dafd79fcef1cf53caa9))
* replace innerHTML with safe DOM API and optimize hot-path patterns ([5586dd4](https://github.com/sho7650/obsidian-AI-exporter/commit/5586dd4abd7318eee5c859ac96f09e416f20d24a))

## [0.10.2](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.10.1...v0.10.2) (2026-02-21)


### Documentation

* update web store descriptions with Perplexity and new features ([c9a5e4a](https://github.com/sho7650/obsidian-AI-exporter/commit/c9a5e4a056f1d371b55229a21f8bf36a121700f9))
* update web store descriptions with Perplexity and new features ([da9efbb](https://github.com/sho7650/obsidian-AI-exporter/commit/da9efbb720720f365e795710b099c9d393ee468a))

## [0.10.1](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.10.0...v0.10.1) (2026-02-21)


### Documentation

* update documentation for v0.8.1–v0.9.0 changes ([d3d94ad](https://github.com/sho7650/obsidian-AI-exporter/commit/d3d94adc9bc4ab3ee41c5a71e570f212412f4c49))
* update documentation for v0.8.1–v0.9.0 changes ([733211d](https://github.com/sho7650/obsidian-AI-exporter/commit/733211d95fa15c497de1931c24cf3bf30e182f3a))

## [0.10.0](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.9.0...v0.10.0) (2026-02-21)


### Features

* redesign popup with toggle switches and collapsible advanced settings ([34c211b](https://github.com/sho7650/obsidian-AI-exporter/commit/34c211ba0ccbec71871af32fcd75d28c20a7ec81))
* redesign popup with toggle switches and collapsible advanced settings ([e89ab95](https://github.com/sho7650/obsidian-AI-exporter/commit/e89ab95945759283e7058459b494c50371664318))

## [0.9.0](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.8.1...v0.9.0) (2026-02-21)


### Features

* support {platform} template variable in vault path ([88ab2eb](https://github.com/sho7650/obsidian-AI-exporter/commit/88ab2eb89de496486308e34546c15a8ac8edba99))
* support {platform} template variable in vault path ([#46](https://github.com/sho7650/obsidian-AI-exporter/issues/46)) ([bbec9b7](https://github.com/sho7650/obsidian-AI-exporter/commit/bbec9b7b091aa21ee0c453a87b293c4c0aac092e))

## [0.8.1](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.8.0...v0.8.1) (2026-02-21)


### Bug Fixes

* improve Gemini title extraction using document.title ([#47](https://github.com/sho7650/obsidian-AI-exporter/issues/47)) ([0e5e0e1](https://github.com/sho7650/obsidian-AI-exporter/commit/0e5e0e19283e08a04866eb7d9e6b6ffc0f5d4bea))
* improve Gemini title extraction with top bar selector ([f878a6b](https://github.com/sho7650/obsidian-AI-exporter/commit/f878a6ba7955eeb64fa517bfb3eb2ccbc93b5907))
* use top bar selector for Gemini title extraction ([#47](https://github.com/sho7650/obsidian-AI-exporter/issues/47)) ([8d3cf27](https://github.com/sho7650/obsidian-AI-exporter/commit/8d3cf2798ddc57376218b49e0db492d394121dc5))

## [0.8.0](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.7.4...v0.8.0) (2026-02-21)


### Features

* add auto-scroll for Gemini long conversations with settings toggle ([4d28e2d](https://github.com/sho7650/obsidian-AI-exporter/commit/4d28e2da5858c7324d201efd7788ce4c1c2109eb))
* add auto-scroll for Gemini long conversations with settings toggle ([a587fd8](https://github.com/sho7650/obsidian-AI-exporter/commit/a587fd8a602a56cbadde3bfb2b785cf4529b920f))


### Styles

* fix prettier formatting in gemini extractor ([24c4793](https://github.com/sho7650/obsidian-AI-exporter/commit/24c4793c37e7d2739bff12bcaffbcc2bb7d08e4a))

## [0.7.4](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.7.3...v0.7.4) (2026-02-20)


### Bug Fixes

* skip Extended Thinking content in Claude assistant extraction ([#50](https://github.com/sho7650/obsidian-AI-exporter/issues/50)) ([c2825d2](https://github.com/sho7650/obsidian-AI-exporter/commit/c2825d249ee267345bcc3b2c3dc12fb69b38ec58))

## [0.7.3](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.7.2...v0.7.3) (2026-02-11)


### Code Refactoring

* centralize error utilities and security constants ([#42](https://github.com/sho7650/obsidian-AI-exporter/issues/42)) ([cc5454b](https://github.com/sho7650/obsidian-AI-exporter/commit/cc5454b56572f66585745c09aab638b5bb2d1daf))

## [0.7.2](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.7.1...v0.7.2) (2026-02-07)


### Code Refactoring

* fix selector priority in queryWithFallback and harden URL sanitization ([2b3176a](https://github.com/sho7650/obsidian-AI-exporter/commit/2b3176a1c33fe7d9567b023bbbf1658879b20853))
* fix selector priority in queryWithFallback and harden URL sanitization ([f63e69e](https://github.com/sho7650/obsidian-AI-exporter/commit/f63e69ef6c68be2d5d6d58a198bf8d121686f612))

## [0.7.1](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.7.0...v0.7.1) (2026-02-05)


### Code Refactoring

* extract common extractor logic and remove dead code ([08446db](https://github.com/sho7650/obsidian-AI-exporter/commit/08446dbebcef1b27838b8f4e238e9c4a16eb124f))
* extract common extractor logic and remove dead code ([37098ce](https://github.com/sho7650/obsidian-AI-exporter/commit/37098ce295fa3a4cea785697ec3319730d3fe5d8))

## [0.7.0](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.6.11...v0.7.0) (2026-02-03)


### Features

* add platform lint script and update docs for Perplexity support ([c0861eb](https://github.com/sho7650/obsidian-AI-exporter/commit/c0861eb03594b1a0721e5d9e93b0388fceb6c395))
* add platform lint script and update docs for Perplexity support ([df32c06](https://github.com/sho7650/obsidian-AI-exporter/commit/df32c061b7eccc3c9dd4ddecca4d59d63ef9d647))

## [0.6.11](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.6.10...v0.6.11) (2026-02-02)


### Bug Fixes

* disable bump-patch-for-minor-pre-major for proper semver feat bumps ([c1ea1b5](https://github.com/sho7650/obsidian-AI-exporter/commit/c1ea1b54e732d1d948faef871fbc11278382ab6a))
* release-please versioning and add Perplexity docs ([d3c11d0](https://github.com/sho7650/obsidian-AI-exporter/commit/d3c11d0762c091e6b62209e400468e8dbeb3b4db))


### Documentation

* add Perplexity extractor design, requirements, and workflow docs ([6f60dba](https://github.com/sho7650/obsidian-AI-exporter/commit/6f60dba20ec5d873b633f2b286dfeebf316b4b93))

## [0.6.10](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.6.9...v0.6.10) (2026-02-02)


### Features

* add Perplexity AI conversation extractor ([c3bb22b](https://github.com/sho7650/obsidian-AI-exporter/commit/c3bb22b306e2749510fc0a201b3511c5d12b46ec))
* add Perplexity AI conversation extractor ([6182092](https://github.com/sho7650/obsidian-AI-exporter/commit/6182092dce65661c8d53987408ec07203746e9f0))

## [0.6.9](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.6.8...v0.6.9) (2026-02-01)


### Bug Fixes

* update conversation ID extraction for new Gemini and ChatGPT URL patterns ([b88968b](https://github.com/sho7650/obsidian-AI-exporter/commit/b88968b463afb48753e12cac871629d724d85224))
* update conversation ID extraction for new URL patterns ([e616386](https://github.com/sho7650/obsidian-AI-exporter/commit/e61638671ce7f36980628df43ea52492f35bf898))

## [0.6.8](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.6.7...v0.6.8) (2026-01-30)


### Code Refactoring

* code quality improvements and dead code removal ([66322a1](https://github.com/sho7650/obsidian-AI-exporter/commit/66322a110f5fdc969f2bd49f670df8abba277776))
* improve code quality and remove dead code ([7d811b0](https://github.com/sho7650/obsidian-AI-exporter/commit/7d811b0077137ea6f68753e40ebca6530db0058e))


### Documentation

* add ADR-001 for code quality improvements ([95019d5](https://github.com/sho7650/obsidian-AI-exporter/commit/95019d54e0b9a5c97e0d210b1ec173e9c2541b03))


### Styles

* fix trailing blank line in constants.ts ([859a5b2](https://github.com/sho7650/obsidian-AI-exporter/commit/859a5b2f653719bba8679d484506be182fd98c03))

## [0.6.7](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.6.6...v0.6.7) (2026-01-29)


### Tests

* add e2e test system with HTML fixtures (DES-004) ([fb41863](https://github.com/sho7650/obsidian-AI-exporter/commit/fb418636aaa5a5aa9ca752ababa623d075afdccf))
* add e2e test system with HTML fixtures (DES-004) ([d231d51](https://github.com/sho7650/obsidian-AI-exporter/commit/d231d513fcd9363a7dabf1583c4933a3a350d172))

## [0.6.6](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.6.5...v0.6.6) (2026-01-29)


### Tests

* increase test coverage to 96% stmts / 90% branch ([cfbb604](https://github.com/sho7650/obsidian-AI-exporter/commit/cfbb604ca497d07b5ab96b5524e64e11ff570bf4))
* increase test coverage to 96% stmts / 90% branch ([8a65c96](https://github.com/sho7650/obsidian-AI-exporter/commit/8a65c964c80d811ba105fb4e078184731b2dbbef))

## [0.6.5](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.6.4...v0.6.5) (2026-01-27)


### Bug Fixes

* remove duplicate .md extension in file download ([57eb01d](https://github.com/sho7650/obsidian-AI-exporter/commit/57eb01d5d4b1fa2dc01cc67d997a1b9dce5e38a8))
* remove duplicate .md extension in file download ([4857cb8](https://github.com/sho7650/obsidian-AI-exporter/commit/4857cb8c50c41fcbecd8ce7981bfb83f76f80ed4))

## [0.6.4](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.6.3...v0.6.4) (2026-01-27)


### Code Refactoring

* improve code quality and cleanup project structure ([ee0b70e](https://github.com/sho7650/obsidian-AI-exporter/commit/ee0b70e93e7c0e48f5c29b28954bfdcdc87b731f))
* improve code quality and cleanup project structure ([49b42b0](https://github.com/sho7650/obsidian-AI-exporter/commit/49b42b0c9b1f4124663e35200ed4fc94149dc000))

## [0.6.3](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.6.2...v0.6.3) (2026-01-27)


### Bug Fixes

* 🔧 update commitlint config for Release Please compatibility ([c95f9c9](https://github.com/sho7650/obsidian-AI-exporter/commit/c95f9c9e1323b804d5bb3ae5817dafc35a5e8509))
* 🔧 update commitlint config for Release Please compatibility ([87637e6](https://github.com/sho7650/obsidian-AI-exporter/commit/87637e6dac4b7250f6cbdd130204ffa3daeceaa3))

## [Unreleased]

## [0.6.2] - 2025-01-21

### Changed
- Updated extension description and locales for multi-platform support

## [0.6.1] - 2025-01-21

### Added
- ChatGPT conversation extractor support
- Dynamic assistant labels in callout format (ChatGPT, Claude, Gemini)

### Changed
- Privacy Policy updated for ChatGPT support

## [0.5.0] - 2025-01-15

### Added
- Claude AI conversation extractor support
- Extended Thinking content extraction for Claude
- Artifacts extraction with inline citations
- Privacy Policy updated for Claude AI support

### Security
- Resolved CodeQL security alerts

## [0.4.1] - 2025-01-13

### Changed
- Increased test coverage to meet quality thresholds

## [0.4.0] - 2025-01-12

### Added
- Multiple output options: Obsidian (default), file download, and clipboard
- Output method selector in popup UI
- Design documents for multiple output options feature

## [0.3.0] - 2025-01-11

### Added
- International support (English and Japanese)
- Unit tests with Vitest
- Privacy policy documentation
- GitHub Pages hosting for documentation

### Changed
- Renamed extension from "Gemini to Obsidian" to "Obsidian AI Exporter"
- Improved error messages with localization support

### Fixed
- ESLint configuration updated for flat config format

## [0.2.0] - 2025-01-08

### Added
- Security hardening: API key storage separation (local vs sync)
- Input validation for vault paths and API keys
- Path traversal protection
- YAML injection prevention
- Message sender validation
- Content size limits

### Changed
- API key now stored in chrome.storage.local (not synced)
- Improved error messages

## [0.1.0] - 2025-01-05

### Added
- Initial release
- Gemini conversation extraction
- Obsidian Local REST API integration
- Floating sync button
- Toast notifications
- Configurable frontmatter and callout styles
- Support for code blocks, tables, and lists
