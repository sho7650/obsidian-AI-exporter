# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.20.6](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.20.5...v0.20.6) (2026-04-09)


### Bug Fixes

* preserve multi-paragraph and code-block user messages in Claude ([#200](https://github.com/sho7650/obsidian-AI-exporter/issues/200)) ([#201](https://github.com/sho7650/obsidian-AI-exporter/issues/201)) ([604e31d](https://github.com/sho7650/obsidian-AI-exporter/commit/604e31d73db97884a83ac01e62b963797fdf4079))

## [0.20.5](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.20.4...v0.20.5) (2026-04-07)


### Tests

* cover buildQuestionHeader edge cases and truncation ([#198](https://github.com/sho7650/obsidian-AI-exporter/issues/198)) ([ae798b7](https://github.com/sho7650/obsidian-AI-exporter/commit/ae798b7d59d2d20675f5f9b0436158c766795e03))

## [0.20.4](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.20.3...v0.20.4) (2026-04-07)


### Documentation

* document optional question headers feature in READMEs and store listings ([#196](https://github.com/sho7650/obsidian-AI-exporter/issues/196)) ([9fa7a1f](https://github.com/sho7650/obsidian-AI-exporter/commit/9fa7a1f22dd3d460eb1d10ee92bbe9461f7197c5))

## [0.20.3](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.20.2...v0.20.3) (2026-04-07)


### Tests

* cover error paths in background/index, message-counter, and i18n ([#194](https://github.com/sho7650/obsidian-AI-exporter/issues/194)) ([1067dc5](https://github.com/sho7650/obsidian-AI-exporter/commit/1067dc50a5925712c8950fa7558ce7759f3e9c18))

## [0.20.2](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.20.1...v0.20.2) (2026-04-07)


### Bug Fixes

* **docs:** wrap code blocks with raw tags to fix Jekyll Liquid build ([#192](https://github.com/sho7650/obsidian-AI-exporter/issues/192)) ([74efc5b](https://github.com/sho7650/obsidian-AI-exporter/commit/74efc5b54d813ff7512ee890e6355c0ad2d7e33b))

## [0.20.1](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.20.0...v0.20.1) (2026-04-07)


### Miscellaneous

* **deps-dev:** Bump vite from 6.4.1 to 6.4.2 ([#188](https://github.com/sho7650/obsidian-AI-exporter/issues/188)) ([76c66e5](https://github.com/sho7650/obsidian-AI-exporter/commit/76c66e5338e61952609a81f641ae269d6a4b01af))

## [0.20.0](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.19.8...v0.20.0) (2026-04-07)


### Features

* **template:** add optional `## ` question headers for TOC navigation ([#189](https://github.com/sho7650/obsidian-AI-exporter/issues/189)) ([de6d382](https://github.com/sho7650/obsidian-AI-exporter/commit/de6d3824809a2285cb2acf4ba03b90d81e08e792)), closes [#187](https://github.com/sho7650/obsidian-AI-exporter/issues/187)

## [0.19.8](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.19.7...v0.19.8) (2026-03-29)


### Documentation

* add Perplexity Deep Research, timezone, remove stale CWS note ([#183](https://github.com/sho7650/obsidian-AI-exporter/issues/183)) ([dd96b8f](https://github.com/sho7650/obsidian-AI-exporter/commit/dd96b8f9ffa444663eba96d9fb986f6c715083ad))

## [0.19.7](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.19.6...v0.19.7) (2026-03-29)


### Documentation

* add missing commands to CLAUDE.md (test, build:zip, format:check) ([1f9bf63](https://github.com/sho7650/obsidian-AI-exporter/commit/1f9bf638cda5257ff0e7ff5f349921587a1a066b))

## [0.19.6](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.19.5...v0.19.6) (2026-03-29)


### Code Refactoring

* DRY improvements for ObsidianApiClient and popup validation ([#180](https://github.com/sho7650/obsidian-AI-exporter/issues/180)) ([02db2a0](https://github.com/sho7650/obsidian-AI-exporter/commit/02db2a02c9da7d8f6ab84744269256557c2be581))

## [0.19.5](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.19.4...v0.19.5) (2026-03-28)


### Bug Fixes

* address static analysis findings — security hardening, dead code removal, type safety ([#178](https://github.com/sho7650/obsidian-AI-exporter/issues/178)) ([971c0b5](https://github.com/sho7650/obsidian-AI-exporter/commit/971c0b52551b8478593bca355381786ad17dfc50))

## [0.19.4](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.19.3...v0.19.4) (2026-03-27)


### Code Refactoring

* extract magic number to constant and split extractToolContent into helpers ([#176](https://github.com/sho7650/obsidian-AI-exporter/issues/176)) ([e9bc155](https://github.com/sho7650/obsidian-AI-exporter/commit/e9bc155068b4b3b3e5c8c6f407d2a70b2e46a009))

## [0.19.3](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.19.2...v0.19.3) (2026-03-26)


### Bug Fixes

* handle ChatGPT CodeMirror code blocks and Claude empty row-start-2 ([#174](https://github.com/sho7650/obsidian-AI-exporter/issues/174)) ([14897a4](https://github.com/sho7650/obsidian-AI-exporter/commit/14897a4c9d43e132723e4004f94f81a47508f32e))

## [0.19.2](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.19.1...v0.19.2) (2026-03-26)


### Miscellaneous

* upgrade eslint to v10 to fix brace-expansion vulnerability ([#172](https://github.com/sho7650/obsidian-AI-exporter/issues/172)) ([1d6459c](https://github.com/sho7650/obsidian-AI-exporter/commit/1d6459c11e34d48fb34b66948019a93e26be26b8))

## [0.19.1](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.19.0...v0.19.1) (2026-03-26)


### Miscellaneous

* **deps:** Bump picomatch ([#170](https://github.com/sho7650/obsidian-AI-exporter/issues/170)) ([43f8106](https://github.com/sho7650/obsidian-AI-exporter/commit/43f8106be65fc543956b608f4476e21120793bb0))

## [0.19.0](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.18.3...v0.19.0) (2026-03-24)


### Features

* add configurable timezone for frontmatter dates ([#168](https://github.com/sho7650/obsidian-AI-exporter/issues/168)) ([17e24d2](https://github.com/sho7650/obsidian-AI-exporter/commit/17e24d2743c11d548fd5b1006801b78f211486fb))

## [0.18.3](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.18.2...v0.18.3) (2026-03-23)


### Bug Fixes

* load .env.local in CDP daemon config so KEEP_ALIVE_INTERVAL_MIN is respected ([#166](https://github.com/sho7650/obsidian-AI-exporter/issues/166)) ([3d7bf82](https://github.com/sho7650/obsidian-AI-exporter/commit/3d7bf82a6b5e6ecff2ce729dd1c68928526f1888))

## [0.18.2](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.18.1...v0.18.2) (2026-03-23)


### Code Refactoring

* remove unused exports and dead TabInfo interface ([#164](https://github.com/sho7650/obsidian-AI-exporter/issues/164)) ([f9527cf](https://github.com/sho7650/obsidian-AI-exporter/commit/f9527cf6798a63e03114b4942d9417934c38e7fd))

## [0.18.1](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.18.0...v0.18.1) (2026-03-23)


### Bug Fixes

* update Gemini Deep Research title selector for new DOM structure ([#162](https://github.com/sho7650/obsidian-AI-exporter/issues/162)) ([60d0cf9](https://github.com/sho7650/obsidian-AI-exporter/commit/60d0cf9856fa28cb1719a41b1f161c1f618caca0))

## [0.18.0](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.17.2...v0.18.0) (2026-03-23)


### Features

* add CDP daemon for persistent browser sessions in E2E tests ([#160](https://github.com/sho7650/obsidian-AI-exporter/issues/160)) ([b41665a](https://github.com/sho7650/obsidian-AI-exporter/commit/b41665aee8c5f51dda9a4f95163e5fd983ae5fca))

## [0.17.2](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.17.1...v0.17.2) (2026-03-22)


### Bug Fixes

* replace broken globalTeardown with custom Playwright reporter ([#151](https://github.com/sho7650/obsidian-AI-exporter/issues/151)) ([#158](https://github.com/sho7650/obsidian-AI-exporter/issues/158)) ([4b38148](https://github.com/sho7650/obsidian-AI-exporter/commit/4b38148a87853907de49293bfa3ca7d73f93c6e5))

## [0.17.1](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.17.0...v0.17.1) (2026-03-22)


### Miscellaneous

* **deps-dev:** Bump flatted from 3.4.1 to 3.4.2 ([#150](https://github.com/sho7650/obsidian-AI-exporter/issues/150)) ([4f17c00](https://github.com/sho7650/obsidian-AI-exporter/commit/4f17c00ae03d4f2282ff9d057824979bf4399d28))

## [0.17.0](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.16.2...v0.17.0) (2026-03-22)


### Features

* add live selector validation with Playwright smoke tests ([#154](https://github.com/sho7650/obsidian-AI-exporter/issues/154)) ([28363c0](https://github.com/sho7650/obsidian-AI-exporter/commit/28363c0ada68b94ab80e3f1154fc1d24b6c8e1b0))

## [0.16.2](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.16.1...v0.16.2) (2026-03-21)


### Bug Fixes

* update ChatGPT selectors from article to section for DOM change ([#148](https://github.com/sho7650/obsidian-AI-exporter/issues/148)) ([fdd28ed](https://github.com/sho7650/obsidian-AI-exporter/commit/fdd28edfc5528592d92e6ed0f7aa9d0838debe9a))

## [0.16.1](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.16.0...v0.16.1) (2026-03-17)


### Bug Fixes

* resolve 2 QA issues - immutability and race condition ([#145](https://github.com/sho7650/obsidian-AI-exporter/issues/145)) ([44622a0](https://github.com/sho7650/obsidian-AI-exporter/commit/44622a07d9793fdb8e13cf351e270c8cdc2d22e0))
* resolve 2 QA issues - immutability and race condition [round 1] ([44622a0](https://github.com/sho7650/obsidian-AI-exporter/commit/44622a07d9793fdb8e13cf351e270c8cdc2d22e0))

## [0.16.0](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.15.5...v0.16.0) (2026-03-17)


### Features

* extract Perplexity Deep Research reports and fix popup input styling ([#143](https://github.com/sho7650/obsidian-AI-exporter/issues/143)) ([61acd7a](https://github.com/sho7650/obsidian-AI-exporter/commit/61acd7a26803ee95dbe10e4479dab73e120ac40d))

## [0.15.5](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.15.4...v0.15.5) (2026-03-17)


### Code Refactoring

* remove dead code, unused exports, and redundant @types/dompurify ([#141](https://github.com/sho7650/obsidian-AI-exporter/issues/141)) ([0d71263](https://github.com/sho7650/obsidian-AI-exporter/commit/0d7126389da5f90964301a1df1c827997a370509))

## [0.15.4](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.15.3...v0.15.4) (2026-03-17)


### Bug Fixes

* strengthen validation, extract constants, and resolve type issues ([#139](https://github.com/sho7650/obsidian-AI-exporter/issues/139)) ([568bb02](https://github.com/sho7650/obsidian-AI-exporter/commit/568bb02b52a166020b758fc59a7bc4749e7708b7))

## [0.15.3](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.15.2...v0.15.3) (2026-03-16)


### Miscellaneous

* regenerate improve skill and add gemini2obsidian-patterns skill ([#137](https://github.com/sho7650/obsidian-AI-exporter/issues/137)) ([0ea57a8](https://github.com/sho7650/obsidian-AI-exporter/commit/0ea57a83d5c8c01fe5e1df511bf9efa6c9c5fdec))

## [0.15.2](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.15.1...v0.15.2) (2026-03-16)


### Security

* redact API key from content scripts and harden input validation ([#134](https://github.com/sho7650/obsidian-AI-exporter/issues/134)) ([641a0bd](https://github.com/sho7650/obsidian-AI-exporter/commit/641a0bdca014935dc3c308957842207c37733c0e))


### Miscellaneous

* add security type to release-please changelog sections ([#135](https://github.com/sho7650/obsidian-AI-exporter/issues/135)) ([54700cd](https://github.com/sho7650/obsidian-AI-exporter/commit/54700cd7e195515416d477c380b7d295ad9719a8))

## [0.15.1](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.15.0...v0.15.1) (2026-03-16)


### Miscellaneous

* regenerate improve skill with current project toolchain ([#132](https://github.com/sho7650/obsidian-AI-exporter/issues/132)) ([4258068](https://github.com/sho7650/obsidian-AI-exporter/commit/4258068e466d817b3ed5fcc52acab7dbc11394e2))

## [0.15.0](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.14.0...v0.15.0) (2026-03-16)


### Features

* support full URL input for Obsidian API (HTTPS & LAN) ([#130](https://github.com/sho7650/obsidian-AI-exporter/issues/130)) ([8931e9f](https://github.com/sho7650/obsidian-AI-exporter/commit/8931e9f492c2ff49c27da4a3a2e15f1df8a8fc28))

## [0.14.0](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.13.9...v0.14.0) (2026-03-15)


### Features

* add append mode to preserve existing notes and append only new messages ([ae34366](https://github.com/sho7650/obsidian-AI-exporter/commit/ae34366f577bff7e1ab9e0eca1fa40763238fed7))
* add append mode to preserve existing notes and append only new messages ([77db89c](https://github.com/sho7650/obsidian-AI-exporter/commit/77db89c34909252abe9950d0d8b0caba39ccbb1b))
* add auto-scroll for Gemini long conversations with settings toggle ([4d28e2d](https://github.com/sho7650/obsidian-AI-exporter/commit/4d28e2da5858c7324d201efd7788ce4c1c2109eb))
* add auto-scroll for Gemini long conversations with settings toggle ([a587fd8](https://github.com/sho7650/obsidian-AI-exporter/commit/a587fd8a602a56cbadde3bfb2b785cf4529b920f))
* add autonomous improvement loop skill for Claude Code ([3cc360c](https://github.com/sho7650/obsidian-AI-exporter/commit/3cc360cc58545468b56e5e93c985ef99e89bba74))
* add Perplexity AI conversation extractor ([c3bb22b](https://github.com/sho7650/obsidian-AI-exporter/commit/c3bb22b306e2749510fc0a201b3511c5d12b46ec))
* add Perplexity AI conversation extractor ([6182092](https://github.com/sho7650/obsidian-AI-exporter/commit/6182092dce65661c8d53987408ec07203746e9f0))
* add platform lint script and update docs for Perplexity support ([c0861eb](https://github.com/sho7650/obsidian-AI-exporter/commit/c0861eb03594b1a0721e5d9e93b0388fceb6c395))
* add platform lint script and update docs for Perplexity support ([df32c06](https://github.com/sho7650/obsidian-AI-exporter/commit/df32c061b7eccc3c9dd4ddecca4d59d63ef9d647))
* add security utility libraries ([0ccb036](https://github.com/sho7650/obsidian-AI-exporter/commit/0ccb036f0005e32355c9153976fdd3761826c530))
* redesign popup with toggle switches and collapsible advanced settings ([34c211b](https://github.com/sho7650/obsidian-AI-exporter/commit/34c211ba0ccbec71871af32fcd75d28c20a7ec81))
* redesign popup with toggle switches and collapsible advanced settings ([e89ab95](https://github.com/sho7650/obsidian-AI-exporter/commit/e89ab95945759283e7058459b494c50371664318))
* **security:** add CSP, sender validation, sanitization, and input validation ([86c28db](https://github.com/sho7650/obsidian-AI-exporter/commit/86c28db858aea919707573ea7d05f28d3a4ae6fc))
* separate tool-use content into collapsible [!ABSTRACT] callout ([#93](https://github.com/sho7650/obsidian-AI-exporter/issues/93)) ([892cce2](https://github.com/sho7650/obsidian-AI-exporter/commit/892cce2ac6a631a4ddabb72284b99f614f9aca28))
* **storage:** implement secure storage separation (C-01) ([bba8326](https://github.com/sho7650/obsidian-AI-exporter/commit/bba832646dff7ed5264b1b1692447a0c3b2f0635))
* support {platform} template variable in vault path ([88ab2eb](https://github.com/sho7650/obsidian-AI-exporter/commit/88ab2eb89de496486308e34546c15a8ac8edba99))
* support {platform} template variable in vault path ([#46](https://github.com/sho7650/obsidian-AI-exporter/issues/46)) ([bbec9b7](https://github.com/sho7650/obsidian-AI-exporter/commit/bbec9b7b091aa21ee0c453a87b293c4c0aac092e))


### Bug Fixes

* 🔧 update commitlint config for Release Please compatibility ([c95f9c9](https://github.com/sho7650/obsidian-AI-exporter/commit/c95f9c9e1323b804d5bb3ae5817dafc35a5e8509))
* 🔧 update commitlint config for Release Please compatibility ([87637e6](https://github.com/sho7650/obsidian-AI-exporter/commit/87637e6dac4b7250f6cbdd130204ffa3daeceaa3))
* address security and code quality issues from full project review ([#121](https://github.com/sho7650/obsidian-AI-exporter/issues/121)) ([ad4af93](https://github.com/sho7650/obsidian-AI-exporter/commit/ad4af93e71a16bf07a2d3d28cc35f4562d2d709c))
* address security gaps, error handling, and dead code from analysis report ([#82](https://github.com/sho7650/obsidian-AI-exporter/issues/82)) ([950673a](https://github.com/sho7650/obsidian-AI-exporter/commit/950673a9ea907752c404855117324a96ccb217a5))
* bump undici to &gt;=7.24.0 via npm overrides to resolve security vulnerabilities ([#125](https://github.com/sho7650/obsidian-AI-exporter/issues/125)) ([be52b61](https://github.com/sho7650/obsidian-AI-exporter/commit/be52b611d2a4b7b85af8d652af30cdd348c5c960))
* disable bump-patch-for-minor-pre-major for proper semver feat bumps ([c1ea1b5](https://github.com/sho7650/obsidian-AI-exporter/commit/c1ea1b54e732d1d948faef871fbc11278382ab6a))
* escape angle brackets in Markdown output ([#83](https://github.com/sho7650/obsidian-AI-exporter/issues/83)) ([#87](https://github.com/sho7650/obsidian-AI-exporter/issues/87)) ([a9fb81e](https://github.com/sho7650/obsidian-AI-exporter/commit/a9fb81ed185fd8bd7938df496882579afe5d82d0))
* extract LaTeX from standard KaTeX for Perplexity/ChatGPT/Claude ([#85](https://github.com/sho7650/obsidian-AI-exporter/issues/85)) ([f0f8af3](https://github.com/sho7650/obsidian-AI-exporter/commit/f0f8af3480fc4bf4835a715ebd85d98fdabb5104))
* extract LaTeX from standard KaTeX for Perplexity/ChatGPT/Claude ([#85](https://github.com/sho7650/obsidian-AI-exporter/issues/85)) ([6533866](https://github.com/sho7650/obsidian-AI-exporter/commit/65338661cadd8fa2ade88888bd58dea8e8bbbaf1))
* guard against extension context invalidation in sendMessage ([#127](https://github.com/sho7650/obsidian-AI-exporter/issues/127)) ([c758302](https://github.com/sho7650/obsidian-AI-exporter/commit/c758302abc9028b4ba7449f1f9995672c8b22c22)), closes [#123](https://github.com/sho7650/obsidian-AI-exporter/issues/123)
* guard against unhandled rejections in background and content scripts ([#100](https://github.com/sho7650/obsidian-AI-exporter/issues/100)) ([2e5c948](https://github.com/sho7650/obsidian-AI-exporter/commit/2e5c94857be785087d14adb8d1d301861bebeff9))
* improve Gemini title extraction using document.title ([#47](https://github.com/sho7650/obsidian-AI-exporter/issues/47)) ([0e5e0e1](https://github.com/sho7650/obsidian-AI-exporter/commit/0e5e0e19283e08a04866eb7d9e6b6ffc0f5d4bea))
* improve Gemini title extraction with top bar selector ([f878a6b](https://github.com/sho7650/obsidian-AI-exporter/commit/f878a6ba7955eeb64fa517bfb3eb2ccbc93b5907))
* migrate to ESLint 9 + typescript-eslint v8 to resolve npm audit vulnerabilities ([#107](https://github.com/sho7650/obsidian-AI-exporter/issues/107)) ([7abf4fd](https://github.com/sho7650/obsidian-AI-exporter/commit/7abf4fd661a1ebc1410970ce42d0693e572cb953))
* **popup:** compact layout with sticky footer and reorganized settings ([#119](https://github.com/sho7650/obsidian-AI-exporter/issues/119)) ([442823c](https://github.com/sho7650/obsidian-AI-exporter/commit/442823cd95887c15dfba9b1452e05e120f8883d6))
* preserve Gemini KaTeX math blocks as LaTeX in Obsidian output ([8dfa467](https://github.com/sho7650/obsidian-AI-exporter/commit/8dfa4674697d995cd0bf5e0dd1ce19e715f4df8d))
* preserve Gemini KaTeX math blocks as LaTeX in Obsidian output ([ac67045](https://github.com/sho7650/obsidian-AI-exporter/commit/ac67045e63c7afee45ae49572c5bceea92c2858a))
* release-please versioning and add Perplexity docs ([d3c11d0](https://github.com/sho7650/obsidian-AI-exporter/commit/d3c11d0762c091e6b62209e400468e8dbeb3b4db))
* remove duplicate .md extension in file download ([57eb01d](https://github.com/sho7650/obsidian-AI-exporter/commit/57eb01d5d4b1fa2dc01cc67d997a1b9dce5e38a8))
* remove duplicate .md extension in file download ([4857cb8](https://github.com/sho7650/obsidian-AI-exporter/commit/4857cb8c50c41fcbecd8ce7981bfb83f76f80ed4))
* skip Extended Thinking content in Claude assistant extraction ([#50](https://github.com/sho7650/obsidian-AI-exporter/issues/50)) ([c2825d2](https://github.com/sho7650/obsidian-AI-exporter/commit/c2825d249ee267345bcc3b2c3dc12fb69b38ec58))
* update conversation ID extraction for new Gemini and ChatGPT URL patterns ([b88968b](https://github.com/sho7650/obsidian-AI-exporter/commit/b88968b463afb48753e12cac871629d724d85224))
* update conversation ID extraction for new URL patterns ([e616386](https://github.com/sho7650/obsidian-AI-exporter/commit/e61638671ce7f36980628df43ea52492f35bf898))
* use MAX_DEEP_RESEARCH_TITLE_LENGTH in Claude getDeepResearchTitle ([3ee6002](https://github.com/sho7650/obsidian-AI-exporter/commit/3ee600297a09d3d68f73b41dd8a9cfa0f3965385))
* use top bar selector for Gemini title extraction ([#47](https://github.com/sho7650/obsidian-AI-exporter/issues/47)) ([8d3cf27](https://github.com/sho7650/obsidian-AI-exporter/commit/8d3cf2798ddc57376218b49e0db492d394121dc5))


### Code Refactoring

* add template method extract() with hooks to BaseExtractor ([b61bb97](https://github.com/sho7650/obsidian-AI-exporter/commit/b61bb97e89d3f080b1f139777d26fbe766b63971))
* centralize error utilities and security constants ([#42](https://github.com/sho7650/obsidian-AI-exporter/issues/42)) ([cc5454b](https://github.com/sho7650/obsidian-AI-exporter/commit/cc5454b56572f66585745c09aab638b5bb2d1daf))
* code quality improvements and dead code removal ([66322a1](https://github.com/sho7650/obsidian-AI-exporter/commit/66322a110f5fdc969f2bd49f670df8abba277776))
* deduplicate citation callback and API key guard ([4071894](https://github.com/sho7650/obsidian-AI-exporter/commit/407189467ddc0c0a9abb3f1bc71d02ed43f984ae))
* extract AIPlatform type alias ([e8b5e6f](https://github.com/sho7650/obsidian-AI-exporter/commit/e8b5e6fc9d8ba50577bfeed4b84d47e3bab9f34e))
* extract common extractor logic and remove dead code ([08446db](https://github.com/sho7650/obsidian-AI-exporter/commit/08446dbebcef1b27838b8f4e238e9c4a16eb124f))
* extract common extractor logic and remove dead code ([37098ce](https://github.com/sho7650/obsidian-AI-exporter/commit/37098ce295fa3a4cea785697ec3319730d3fe5d8))
* fix selector priority in queryWithFallback and harden URL sanitization ([2b3176a](https://github.com/sho7650/obsidian-AI-exporter/commit/2b3176a1c33fe7d9567b023bbbf1658879b20853))
* fix selector priority in queryWithFallback and harden URL sanitization ([f63e69e](https://github.com/sho7650/obsidian-AI-exporter/commit/f63e69ef6c68be2d5d6d58a198bf8d121686f612))
* improve code quality and add rate limiting ([afbbc53](https://github.com/sho7650/obsidian-AI-exporter/commit/afbbc53fc5cbf559b653c5d775c9f899f57036af))
* improve code quality and cleanup project structure ([ee0b70e](https://github.com/sho7650/obsidian-AI-exporter/commit/ee0b70e93e7c0e48f5c29b28954bfdcdc87b731f))
* improve code quality and cleanup project structure ([49b42b0](https://github.com/sho7650/obsidian-AI-exporter/commit/49b42b0c9b1f4124663e35200ed4fc94149dc000))
* improve code quality and remove dead code ([7d811b0](https://github.com/sho7650/obsidian-AI-exporter/commit/7d811b0077137ea6f68753e40ebca6530db0058e))
* improve type safety and reduce nesting in background handlers ([#114](https://github.com/sho7650/obsidian-AI-exporter/issues/114)) ([712918b](https://github.com/sho7650/obsidian-AI-exporter/commit/712918b9500c6145af1337097a5e495604db8308))
* reduce duplication, remove dead code, and shrink public API surface ([f2ed454](https://github.com/sho7650/obsidian-AI-exporter/commit/f2ed454f7c34075d08d25aa35a90fbeadad48a4b))
* reduce duplication, remove dead code, and shrink public API surface ([fff4008](https://github.com/sho7650/obsidian-AI-exporter/commit/fff400820966f871e295628bec1dc9fbeef0180b))
* reduce extractor code complexity and redundancy ([dedc58e](https://github.com/sho7650/obsidian-AI-exporter/commit/dedc58e770ca48c498c12d28023a78765368f424))
* replace innerHTML with safe DOM API and optimize hot-path patterns ([aa76785](https://github.com/sho7650/obsidian-AI-exporter/commit/aa7678535a382ec270df0dafd79fcef1cf53caa9))
* replace innerHTML with safe DOM API and optimize hot-path patterns ([5586dd4](https://github.com/sho7650/obsidian-AI-exporter/commit/5586dd4abd7318eee5c859ac96f09e416f20d24a))
* simplify extractor subclasses using template method ([3ee6002](https://github.com/sho7650/obsidian-AI-exporter/commit/3ee600297a09d3d68f73b41dd8a9cfa0f3965385))
* split background/index.ts into focused modules ([44f07f3](https://github.com/sho7650/obsidian-AI-exporter/commit/44f07f34e5bccc0476f081971cc1a409e3d399ee))
* split background/index.ts into focused modules ([d177164](https://github.com/sho7650/obsidian-AI-exporter/commit/d177164adce61d658c15ad47be2ec15a50ed4d13))
* split markdown.ts, extract scroll manager, add polymorphic extractor settings ([#104](https://github.com/sho7650/obsidian-AI-exporter/issues/104)) ([442c322](https://github.com/sho7650/obsidian-AI-exporter/commit/442c32236f7066ed15260dbf32911c9ec123c5d4))


### Documentation

* add ADR-001 for code quality improvements ([95019d5](https://github.com/sho7650/obsidian-AI-exporter/commit/95019d54e0b9a5c97e0d210b1ec173e9c2541b03))
* add Perplexity extractor design, requirements, and workflow docs ([6f60dba](https://github.com/sho7650/obsidian-AI-exporter/commit/6f60dba20ec5d873b633f2b286dfeebf316b4b93))
* add tool content feature to README (en/ja) ([#95](https://github.com/sho7650/obsidian-AI-exporter/issues/95)) ([3e562c6](https://github.com/sho7650/obsidian-AI-exporter/commit/3e562c640abf169dbdb0435f68f8c6ee0f7def96))
* update documentation for v0.8.1–v0.9.0 changes ([d3d94ad](https://github.com/sho7650/obsidian-AI-exporter/commit/d3d94adc9bc4ab3ee41c5a71e570f212412f4c49))
* update documentation for v0.8.1–v0.9.0 changes ([733211d](https://github.com/sho7650/obsidian-AI-exporter/commit/733211d95fa15c497de1931c24cf3bf30e182f3a))
* update store descriptions with LaTeX and tool content features ([#102](https://github.com/sho7650/obsidian-AI-exporter/issues/102)) ([f49c542](https://github.com/sho7650/obsidian-AI-exporter/commit/f49c5429e9b9d2f28b2898bed1ca75b33e22733c))
* update web store descriptions with Perplexity and new features ([c9a5e4a](https://github.com/sho7650/obsidian-AI-exporter/commit/c9a5e4a056f1d371b55229a21f8bf36a121700f9))
* update web store descriptions with Perplexity and new features ([da9efbb](https://github.com/sho7650/obsidian-AI-exporter/commit/da9efbb720720f365e795710b099c9d393ee468a))


### Styles

* fix prettier formatting in gemini extractor ([24c4793](https://github.com/sho7650/obsidian-AI-exporter/commit/24c4793c37e7d2739bff12bcaffbcc2bb7d08e4a))
* fix trailing blank line in constants.ts ([859a5b2](https://github.com/sho7650/obsidian-AI-exporter/commit/859a5b2f653719bba8679d484506be182fd98c03))


### Tests

* add e2e test system with HTML fixtures (DES-004) ([fb41863](https://github.com/sho7650/obsidian-AI-exporter/commit/fb418636aaa5a5aa9ca752ababa623d075afdccf))
* add e2e test system with HTML fixtures (DES-004) ([d231d51](https://github.com/sho7650/obsidian-AI-exporter/commit/d231d513fcd9363a7dabf1583c4933a3a350d172))
* add edge case coverage for ChatGPT and Perplexity extractors ([f2c08df](https://github.com/sho7650/obsidian-AI-exporter/commit/f2c08dfffff19076e51c129a4a7f0e8d0317834d))
* add edge case coverage for ChatGPT and Perplexity extractors ([afb8d1c](https://github.com/sho7650/obsidian-AI-exporter/commit/afb8d1c683131335434ba84d92accb3cac1284a3))
* add reproduction tests for issue [#96](https://github.com/sho7650/obsidian-AI-exporter/issues/96) (Perplexity LaTeX in code blocks) ([#98](https://github.com/sho7650/obsidian-AI-exporter/issues/98)) ([2f6d387](https://github.com/sho7650/obsidian-AI-exporter/commit/2f6d3874b762ff876f185d7622d718a778d37969))
* add template method and utility tests to BaseExtractor ([01ce497](https://github.com/sho7650/obsidian-AI-exporter/commit/01ce4970fb2e6de1bd4eaedca7134b10df55018f))
* increase test coverage to 96% stmts / 90% branch ([cfbb604](https://github.com/sho7650/obsidian-AI-exporter/commit/cfbb604ca497d07b5ab96b5524e64e11ff570bf4))
* increase test coverage to 96% stmts / 90% branch ([8a65c96](https://github.com/sho7650/obsidian-AI-exporter/commit/8a65c964c80d811ba105fb4e078184731b2dbbef))


### Miscellaneous

* add .improvement-state to gitignore ([#109](https://github.com/sho7650/obsidian-AI-exporter/issues/109)) ([dfbd15d](https://github.com/sho7650/obsidian-AI-exporter/commit/dfbd15d9cdb68ee91f7c25c87503f548653cf72c))
* **deps:** Bump dompurify from 3.3.1 to 3.3.2 ([#113](https://github.com/sho7650/obsidian-AI-exporter/issues/113)) ([bd7d22a](https://github.com/sho7650/obsidian-AI-exporter/commit/bd7d22a3d586f073ae609b27814e545f8b6a8bda))
* fix npm audit vulnerabilities ([1039c74](https://github.com/sho7650/obsidian-AI-exporter/commit/1039c7400a0491a155bd36204a3c6ddd058f1e6d))
* fix npm audit vulnerabilities ([122611a](https://github.com/sho7650/obsidian-AI-exporter/commit/122611aa768a1c7cdfde6c9482fe0de7bacc307b))
* **main:** release 0.10.0 ([53f69e5](https://github.com/sho7650/obsidian-AI-exporter/commit/53f69e5be9c63d1b3e810c57a8847deb37dceb0b))
* **main:** release 0.10.0 ([97b1cab](https://github.com/sho7650/obsidian-AI-exporter/commit/97b1cab94990e8182b2d01c91a5428fcbb73ec3d))
* **main:** release 0.10.1 ([48e1ecb](https://github.com/sho7650/obsidian-AI-exporter/commit/48e1ecb8fee773a409d8dacc359348083833e540))
* **main:** release 0.10.1 ([fbfcec4](https://github.com/sho7650/obsidian-AI-exporter/commit/fbfcec4a5027b08c9c4df0ab5847a97c7c8e0fb2))
* **main:** release 0.10.2 ([320adae](https://github.com/sho7650/obsidian-AI-exporter/commit/320adae8d049c5097d4b80b3a30e51366c7bd323))
* **main:** release 0.10.2 ([d6741f6](https://github.com/sho7650/obsidian-AI-exporter/commit/d6741f64043411869a90a6b4fdc405f7c8e95d8b))
* **main:** release 0.10.3 ([8f76103](https://github.com/sho7650/obsidian-AI-exporter/commit/8f7610329cc5b4540af4868a9b66a8b157efe8d4))
* **main:** release 0.10.3 ([1000000](https://github.com/sho7650/obsidian-AI-exporter/commit/1000000ff9dee81b82ab19dc8da9015996b8545e))
* **main:** release 0.10.4 ([2a23eb6](https://github.com/sho7650/obsidian-AI-exporter/commit/2a23eb64ae0f3db2289d8d9bb6d5963a0cbb9c0b))
* **main:** release 0.10.4 ([2d77e18](https://github.com/sho7650/obsidian-AI-exporter/commit/2d77e1872fbd9ad49bac6f5b3cce34dbb5619e3f))
* **main:** release 0.10.5 ([04cf680](https://github.com/sho7650/obsidian-AI-exporter/commit/04cf680925c3aa0e17be58cd5d4b573fc3172fdc))
* **main:** release 0.10.5 ([9b08954](https://github.com/sho7650/obsidian-AI-exporter/commit/9b089544ab989b6d6c9f2f86c3e493042f360f17))
* **main:** release 0.10.6 ([38198e9](https://github.com/sho7650/obsidian-AI-exporter/commit/38198e95dc9d5c1241bd77e91edb07a5c09cbc57))
* **main:** release 0.10.6 ([6018f98](https://github.com/sho7650/obsidian-AI-exporter/commit/6018f9888f76f1c5c94aa88ee3703417a3f3dc13))
* **main:** release 0.10.7 ([d4a8796](https://github.com/sho7650/obsidian-AI-exporter/commit/d4a8796c49b97b63f7e84d5adbc16b409f37b755))
* **main:** release 0.10.7 ([8cf75b4](https://github.com/sho7650/obsidian-AI-exporter/commit/8cf75b44fa54ff340daa9ead49d3ec646bf5b79c))
* **main:** release 0.10.8 ([4da289f](https://github.com/sho7650/obsidian-AI-exporter/commit/4da289f7c730bec9505298fc7884a1015864e512))
* **main:** release 0.10.8 ([48b355d](https://github.com/sho7650/obsidian-AI-exporter/commit/48b355ded9c1cc9b59bc90045631aa6916fb9fba))
* **main:** release 0.10.9 ([a2a846e](https://github.com/sho7650/obsidian-AI-exporter/commit/a2a846e0baa4ec97cd2e977612c6b7a0f4e93c86))
* **main:** release 0.10.9 ([93293b1](https://github.com/sho7650/obsidian-AI-exporter/commit/93293b1417517c708ee0a0eaeacb2c4d9e2ecd60))
* **main:** release 0.11.0 ([2b39d06](https://github.com/sho7650/obsidian-AI-exporter/commit/2b39d06952b0add6d8368ca208da0ad822378153))
* **main:** release 0.11.0 ([0bae616](https://github.com/sho7650/obsidian-AI-exporter/commit/0bae616ff36af84adc6064c4d4cec4188ca3c0a1))
* **main:** release 0.11.1 ([#86](https://github.com/sho7650/obsidian-AI-exporter/issues/86)) ([72ba1c5](https://github.com/sho7650/obsidian-AI-exporter/commit/72ba1c5a4da591d188aafd194d9f3f7ddf497d46))
* **main:** release 0.11.2 ([0d41a20](https://github.com/sho7650/obsidian-AI-exporter/commit/0d41a20f3104f031db9d946e922e9ea89872cf59))
* **main:** release 0.11.2 ([00bc4ba](https://github.com/sho7650/obsidian-AI-exporter/commit/00bc4ba6c8caa94b3c95defd122ad7b04cff2f94))
* **main:** release 0.11.3 ([4ca383c](https://github.com/sho7650/obsidian-AI-exporter/commit/4ca383c8d96d5898772714eb2f465b315f3cc227))
* **main:** release 0.11.3 ([66a2932](https://github.com/sho7650/obsidian-AI-exporter/commit/66a2932af6f2c7f3b2c2fcce047a6dee7b97e4d9))
* **main:** release 0.12.0 ([#94](https://github.com/sho7650/obsidian-AI-exporter/issues/94)) ([8835036](https://github.com/sho7650/obsidian-AI-exporter/commit/88350362d07981e818ac27fe324cabec73b2fcc5))
* **main:** release 0.12.1 ([#97](https://github.com/sho7650/obsidian-AI-exporter/issues/97)) ([ed2cf49](https://github.com/sho7650/obsidian-AI-exporter/commit/ed2cf49dbdb34f30609eef8bdb24f0dd6db4d059))
* **main:** release 0.12.2 ([#99](https://github.com/sho7650/obsidian-AI-exporter/issues/99)) ([06e0d1b](https://github.com/sho7650/obsidian-AI-exporter/commit/06e0d1b0df4682d8220c02a4147345d1e2f5150e))
* **main:** release 0.12.3 ([#101](https://github.com/sho7650/obsidian-AI-exporter/issues/101)) ([e23f7ee](https://github.com/sho7650/obsidian-AI-exporter/commit/e23f7ee8359ec4df62b7e619d99d973607af914b))
* **main:** release 0.12.4 ([#103](https://github.com/sho7650/obsidian-AI-exporter/issues/103)) ([07e945c](https://github.com/sho7650/obsidian-AI-exporter/commit/07e945c863fb48ac112cc8d4c8be784d6580e52c))
* **main:** release 0.12.5 ([#105](https://github.com/sho7650/obsidian-AI-exporter/issues/105)) ([be13c62](https://github.com/sho7650/obsidian-AI-exporter/commit/be13c627ea6bf07b6e0f3731657a6c7b0a121e4b))
* **main:** release 0.13.0 ([#106](https://github.com/sho7650/obsidian-AI-exporter/issues/106)) ([0ada2bd](https://github.com/sho7650/obsidian-AI-exporter/commit/0ada2bd545bad6a30aa35d68377cf6a26d103830))
* **main:** release 0.13.1 ([#108](https://github.com/sho7650/obsidian-AI-exporter/issues/108)) ([8d728fc](https://github.com/sho7650/obsidian-AI-exporter/commit/8d728fc4092d6dfc27e09e356aee7cf1c8813bfe))
* **main:** release 0.13.2 ([#110](https://github.com/sho7650/obsidian-AI-exporter/issues/110)) ([3bde5bf](https://github.com/sho7650/obsidian-AI-exporter/commit/3bde5bfe112ebf4613f15f8d5fdb4392d6b2fe48))
* **main:** release 0.13.3 ([#112](https://github.com/sho7650/obsidian-AI-exporter/issues/112)) ([87ad1a2](https://github.com/sho7650/obsidian-AI-exporter/commit/87ad1a225dac9e81b8f414088fea7e878d1afc7d))
* **main:** release 0.13.4 ([#115](https://github.com/sho7650/obsidian-AI-exporter/issues/115)) ([77957bf](https://github.com/sho7650/obsidian-AI-exporter/commit/77957bfb610edf0fbb46ff441ec8f7de17320323))
* **main:** release 0.13.5 ([#116](https://github.com/sho7650/obsidian-AI-exporter/issues/116)) ([38be7fb](https://github.com/sho7650/obsidian-AI-exporter/commit/38be7fb0daec4b8f622bd9d9f0bc309fcbbd3d2d))
* **main:** release 0.13.6 ([#120](https://github.com/sho7650/obsidian-AI-exporter/issues/120)) ([f3e8dc1](https://github.com/sho7650/obsidian-AI-exporter/commit/f3e8dc19b531674c194b02d705b410761d518f5f))
* **main:** release 0.13.7 ([#122](https://github.com/sho7650/obsidian-AI-exporter/issues/122)) ([7ebb477](https://github.com/sho7650/obsidian-AI-exporter/commit/7ebb4772ad8acd395f82925ed139d8e922f0ae0d))
* **main:** release 0.13.8 ([#126](https://github.com/sho7650/obsidian-AI-exporter/issues/126)) ([d021530](https://github.com/sho7650/obsidian-AI-exporter/commit/d021530945c28f34ee31fbf5c910210d7ab1bc5a))
* **main:** release 0.13.9 ([#128](https://github.com/sho7650/obsidian-AI-exporter/issues/128)) ([d014e1e](https://github.com/sho7650/obsidian-AI-exporter/commit/d014e1e8a69a640ffa6759dd517b2fa495edb173))
* **main:** release 0.6.10 ([ff809ae](https://github.com/sho7650/obsidian-AI-exporter/commit/ff809ae38bc8c5bb3a3a6cc1a8708347cf29f42a))
* **main:** release 0.6.10 ([af52d51](https://github.com/sho7650/obsidian-AI-exporter/commit/af52d51525714f8b96e462ab852607f0b0862858))
* **main:** release 0.6.11 ([90789c3](https://github.com/sho7650/obsidian-AI-exporter/commit/90789c326abd8ddf8082b09dec0256b6dfb403f8))
* **main:** release 0.6.11 ([9e09a65](https://github.com/sho7650/obsidian-AI-exporter/commit/9e09a6548e69ceb5937f6cfef026c532f55d6026))
* **main:** release 0.6.3 ([01e336d](https://github.com/sho7650/obsidian-AI-exporter/commit/01e336dbe4bb1c4be3dd1039182219e35990b8d9))
* **main:** release 0.6.3 ([ea7ee61](https://github.com/sho7650/obsidian-AI-exporter/commit/ea7ee610eec44b604b3d916ba2ce575a53ed2709))
* **main:** release 0.6.4 ([2dd5a9d](https://github.com/sho7650/obsidian-AI-exporter/commit/2dd5a9d110f7e4ae4b97fdba95bb4e9bf0eb12b0))
* **main:** release 0.6.4 ([d71bc49](https://github.com/sho7650/obsidian-AI-exporter/commit/d71bc49d87ebb6338b6c7e8d7f26d633e7d91817))
* **main:** release 0.6.5 ([18d88a8](https://github.com/sho7650/obsidian-AI-exporter/commit/18d88a89aaa3ab73024596d68e3742b1158be53f))
* **main:** release 0.6.5 ([9743117](https://github.com/sho7650/obsidian-AI-exporter/commit/9743117e3e98309efd3d9c70c90c1b44279f9460))
* **main:** release 0.6.6 ([1661da2](https://github.com/sho7650/obsidian-AI-exporter/commit/1661da292e0e09d74b3a8516001b6b811a59b7f8))
* **main:** release 0.6.6 ([0e12184](https://github.com/sho7650/obsidian-AI-exporter/commit/0e12184f98d293f20be9e9fec9aa8defc3f7e8db))
* **main:** release 0.6.7 ([59cda9b](https://github.com/sho7650/obsidian-AI-exporter/commit/59cda9b6d98184f402999f61524d26c3c9eee807))
* **main:** release 0.6.7 ([036ddab](https://github.com/sho7650/obsidian-AI-exporter/commit/036ddabe1aaff1e179f4afd68ab78ae451eff4ec))
* **main:** release 0.6.8 ([5a7162c](https://github.com/sho7650/obsidian-AI-exporter/commit/5a7162cd0c2e1e372a76ccaf205e4020877f5a9a))
* **main:** release 0.6.8 ([4cb4c95](https://github.com/sho7650/obsidian-AI-exporter/commit/4cb4c9547d88ab0b34f45fd9b208a6c333280eeb))
* **main:** release 0.6.9 ([394891e](https://github.com/sho7650/obsidian-AI-exporter/commit/394891e66fe21781cb4d65be9ecbea93cfe96221))
* **main:** release 0.6.9 ([7670054](https://github.com/sho7650/obsidian-AI-exporter/commit/76700545d90fbea1d9a207c5ba11e0d3c6edf9d4))
* **main:** release 0.7.0 ([64becb6](https://github.com/sho7650/obsidian-AI-exporter/commit/64becb6a2d45e866b803660bb612b54cd7026aeb))
* **main:** release 0.7.0 ([9ad648f](https://github.com/sho7650/obsidian-AI-exporter/commit/9ad648fa4beb02ea907931a75aba41e7d4514eb5))
* **main:** release 0.7.1 ([5172d59](https://github.com/sho7650/obsidian-AI-exporter/commit/5172d596f4edcd528975ac8d0b7c17ed2b3460b6))
* **main:** release 0.7.1 ([00b5e4d](https://github.com/sho7650/obsidian-AI-exporter/commit/00b5e4d1ccb6be4854d5ab22dbb73d8942334ab1))
* **main:** release 0.7.2 ([352bc38](https://github.com/sho7650/obsidian-AI-exporter/commit/352bc38fc79be446098cf61ca5b4f7ad2347623e))
* **main:** release 0.7.2 ([825fa47](https://github.com/sho7650/obsidian-AI-exporter/commit/825fa4749c8f852ed7a17564d5a9bf660bae011b))
* **main:** release 0.7.3 ([#43](https://github.com/sho7650/obsidian-AI-exporter/issues/43)) ([3c94416](https://github.com/sho7650/obsidian-AI-exporter/commit/3c9441645b112ece3ca9eddf0f1405af2f33c048))
* **main:** release 0.7.4 ([308ecb6](https://github.com/sho7650/obsidian-AI-exporter/commit/308ecb678fd062c2d9a83c2dc62be0b0d0f7f6c8))
* **main:** release 0.7.4 ([ddeb551](https://github.com/sho7650/obsidian-AI-exporter/commit/ddeb5514d8f2f809d5c304101e7b4ea6ac3202a6))
* **main:** release 0.8.0 ([aba15a1](https://github.com/sho7650/obsidian-AI-exporter/commit/aba15a128bb8857ff3f35c244c2affa19301dca7))
* **main:** release 0.8.0 ([4f6f21f](https://github.com/sho7650/obsidian-AI-exporter/commit/4f6f21fcde7df836677888a74ea7dd02238f87fd))
* **main:** release 0.8.1 ([bad1c42](https://github.com/sho7650/obsidian-AI-exporter/commit/bad1c42a171cd3f26659841078b38b7af2e4daaf))
* **main:** release 0.8.1 ([046a265](https://github.com/sho7650/obsidian-AI-exporter/commit/046a265adfdee88031ee753518ebdbb389c7a2d8))
* **main:** release 0.9.0 ([6544d19](https://github.com/sho7650/obsidian-AI-exporter/commit/6544d19287eaa5a7eddad1fa9c2fcf2fd24b4063))
* **main:** release 0.9.0 ([7ecc309](https://github.com/sho7650/obsidian-AI-exporter/commit/7ecc309d76b292b6eb1d89a50f53d35b02d68b36))
* regenerate improvement loop skill with simplified templates ([#111](https://github.com/sho7650/obsidian-AI-exporter/issues/111)) ([7f5755f](https://github.com/sho7650/obsidian-AI-exporter/commit/7f5755f81472e23f38bae41f4722578d6866c2f4))

## [0.13.9](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.13.8...v0.13.9) (2026-03-15)


### Bug Fixes

* guard against extension context invalidation in sendMessage ([#127](https://github.com/sho7650/obsidian-AI-exporter/issues/127)) ([c758302](https://github.com/sho7650/obsidian-AI-exporter/commit/c758302abc9028b4ba7449f1f9995672c8b22c22)), closes [#123](https://github.com/sho7650/obsidian-AI-exporter/issues/123)

## [0.13.8](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.13.7...v0.13.8) (2026-03-15)


### Bug Fixes

* bump undici to &gt;=7.24.0 via npm overrides to resolve security vulnerabilities ([#125](https://github.com/sho7650/obsidian-AI-exporter/issues/125)) ([be52b61](https://github.com/sho7650/obsidian-AI-exporter/commit/be52b611d2a4b7b85af8d652af30cdd348c5c960))

## [0.13.7](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.13.6...v0.13.7) (2026-03-13)


### Bug Fixes

* address security and code quality issues from full project review ([#121](https://github.com/sho7650/obsidian-AI-exporter/issues/121)) ([ad4af93](https://github.com/sho7650/obsidian-AI-exporter/commit/ad4af93e71a16bf07a2d3d28cc35f4562d2d709c))

## [0.13.6](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.13.5...v0.13.6) (2026-03-12)


### Bug Fixes

* **popup:** compact layout with sticky footer and reorganized settings ([#119](https://github.com/sho7650/obsidian-AI-exporter/issues/119)) ([442823c](https://github.com/sho7650/obsidian-AI-exporter/commit/442823cd95887c15dfba9b1452e05e120f8883d6))

## [0.13.5](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.13.4...v0.13.5) (2026-03-08)


### Miscellaneous

* **deps:** Bump dompurify from 3.3.1 to 3.3.2 ([#113](https://github.com/sho7650/obsidian-AI-exporter/issues/113)) ([bd7d22a](https://github.com/sho7650/obsidian-AI-exporter/commit/bd7d22a3d586f073ae609b27814e545f8b6a8bda))

## [0.13.4](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.13.3...v0.13.4) (2026-03-08)


### Code Refactoring

* improve type safety and reduce nesting in background handlers ([#114](https://github.com/sho7650/obsidian-AI-exporter/issues/114)) ([712918b](https://github.com/sho7650/obsidian-AI-exporter/commit/712918b9500c6145af1337097a5e495604db8308))

## [0.13.3](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.13.2...v0.13.3) (2026-03-07)


### Miscellaneous

* regenerate improvement loop skill with simplified templates ([#111](https://github.com/sho7650/obsidian-AI-exporter/issues/111)) ([7f5755f](https://github.com/sho7650/obsidian-AI-exporter/commit/7f5755f81472e23f38bae41f4722578d6866c2f4))

## [0.13.2](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.13.1...v0.13.2) (2026-03-05)


### Miscellaneous

* add .improvement-state to gitignore ([#109](https://github.com/sho7650/obsidian-AI-exporter/issues/109)) ([dfbd15d](https://github.com/sho7650/obsidian-AI-exporter/commit/dfbd15d9cdb68ee91f7c25c87503f548653cf72c))

## [0.13.1](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.13.0...v0.13.1) (2026-03-05)


### Bug Fixes

* migrate to ESLint 9 + typescript-eslint v8 to resolve npm audit vulnerabilities ([#107](https://github.com/sho7650/obsidian-AI-exporter/issues/107)) ([7abf4fd](https://github.com/sho7650/obsidian-AI-exporter/commit/7abf4fd661a1ebc1410970ce42d0693e572cb953))

## [0.13.0](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.12.5...v0.13.0) (2026-03-05)


### Features

* add autonomous improvement loop skill for Claude Code ([3cc360c](https://github.com/sho7650/obsidian-AI-exporter/commit/3cc360cc58545468b56e5e93c985ef99e89bba74))

## [0.12.5](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.12.4...v0.12.5) (2026-03-03)


### Code Refactoring

* split markdown.ts, extract scroll manager, add polymorphic extractor settings ([#104](https://github.com/sho7650/obsidian-AI-exporter/issues/104)) ([442c322](https://github.com/sho7650/obsidian-AI-exporter/commit/442c32236f7066ed15260dbf32911c9ec123c5d4))

## [0.12.4](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.12.3...v0.12.4) (2026-03-01)


### Documentation

* update store descriptions with LaTeX and tool content features ([#102](https://github.com/sho7650/obsidian-AI-exporter/issues/102)) ([f49c542](https://github.com/sho7650/obsidian-AI-exporter/commit/f49c5429e9b9d2f28b2898bed1ca75b33e22733c))

## [0.12.3](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.12.2...v0.12.3) (2026-03-01)


### Bug Fixes

* guard against unhandled rejections in background and content scripts ([#100](https://github.com/sho7650/obsidian-AI-exporter/issues/100)) ([2e5c948](https://github.com/sho7650/obsidian-AI-exporter/commit/2e5c94857be785087d14adb8d1d301861bebeff9))

## [0.12.2](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.12.1...v0.12.2) (2026-03-01)


### Tests

* add reproduction tests for issue [#96](https://github.com/sho7650/obsidian-AI-exporter/issues/96) (Perplexity LaTeX in code blocks) ([#98](https://github.com/sho7650/obsidian-AI-exporter/issues/98)) ([2f6d387](https://github.com/sho7650/obsidian-AI-exporter/commit/2f6d3874b762ff876f185d7622d718a778d37969))

## [0.12.1](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.12.0...v0.12.1) (2026-03-01)


### Documentation

* add tool content feature to README (en/ja) ([#95](https://github.com/sho7650/obsidian-AI-exporter/issues/95)) ([3e562c6](https://github.com/sho7650/obsidian-AI-exporter/commit/3e562c640abf169dbdb0435f68f8c6ee0f7def96))

## [0.12.0](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.11.3...v0.12.0) (2026-02-28)


### Features

* separate tool-use content into collapsible [!ABSTRACT] callout ([#93](https://github.com/sho7650/obsidian-AI-exporter/issues/93)) ([892cce2](https://github.com/sho7650/obsidian-AI-exporter/commit/892cce2ac6a631a4ddabb72284b99f614f9aca28))

## [0.11.3](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.11.2...v0.11.3) (2026-02-28)


### Bug Fixes

* extract LaTeX from standard KaTeX for Perplexity/ChatGPT/Claude ([#85](https://github.com/sho7650/obsidian-AI-exporter/issues/85)) ([f0f8af3](https://github.com/sho7650/obsidian-AI-exporter/commit/f0f8af3480fc4bf4835a715ebd85d98fdabb5104))
* extract LaTeX from standard KaTeX for Perplexity/ChatGPT/Claude ([#85](https://github.com/sho7650/obsidian-AI-exporter/issues/85)) ([6533866](https://github.com/sho7650/obsidian-AI-exporter/commit/65338661cadd8fa2ade88888bd58dea8e8bbbaf1))

## [0.11.2](https://github.com/sho7650/obsidian-AI-exporter/compare/v0.11.1...v0.11.2) (2026-02-27)


### Bug Fixes

* escape angle brackets in Markdown output ([#83](https://github.com/sho7650/obsidian-AI-exporter/issues/83)) ([#87](https://github.com/sho7650/obsidian-AI-exporter/issues/87)) ([a9fb81e](https://github.com/sho7650/obsidian-AI-exporter/commit/a9fb81ed185fd8bd7938df496882579afe5d82d0))

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
