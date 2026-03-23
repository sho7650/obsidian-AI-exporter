# ADR-007: CDP Daemon for Persistent Browser Sessions

## Status

Accepted (2026-03-23)

## Context

The live selector validation system (DES-015) uses `storageState` injection: `e2e:auth` exports cookies/localStorage to `state.json`, and `e2e:selectors` injects them into a new Playwright-controlled browser via `chromium.launch({ channel: 'chrome' })`.

This approach has two fundamental problems that prevent automated periodic testing:

1. **Claudeflare bot detection (claude.ai)**: Playwright-launched browsers set automation flags (`navigator.webdriver=true`, `--enable-automation`). Claude's Cloudflare configuration (Claudeflare) detects these and triggers a human verification challenge after ~30 minutes. This occurs even with `channel: 'chrome'` (real Chrome binary) and `headless: false`.

2. **Short-lived access tokens (chatgpt.com)**: ChatGPT's access tokens expire within ~30 minutes. In a real browser session, the SPA refreshes tokens via background requests. In the storageState approach, the injected tokens are a static snapshot — no background refresh mechanism runs, so tokens expire without renewal.

Both issues make it impossible to run selector validation on a schedule (1-2x daily) without manual re-authentication each time.

## Decision

Replace the storageState injection approach with a **persistent Chrome CDP daemon**:

1. A non-Playwright Chrome process runs continuously with `--remote-debugging-port=9222` and `--user-data-dir=e2e/auth/profiles`
2. Tests connect via `chromium.connectOverCDP()` and operate in the **existing default browser context** (which carries real session cookies)
3. A keep-alive mechanism periodically reloads platform tabs to prevent session timeout
4. Re-authentication is done by stopping the daemon, running headed Chrome for manual login (existing `e2e:auth` flow), and restarting the daemon

### Why CDP connection avoids bot detection

When Chrome is launched as a normal process (not by Playwright):
- `navigator.webdriver` is `false`
- No `--enable-automation` flag
- Browser fingerprint matches a regular Chrome installation
- Playwright's `connectOverCDP()` merely attaches to the existing instance — it does not modify browser-level properties

### Architecture

```
Chrome (24/7, headless)  ←── CDP port 9222
  --user-data-dir=e2e/auth/profiles
  Tab1-4: platform pages (keep-alive reload every 15min)
      │
      ├── daemon.ts     (Node wrapper: spawn Chrome + keep-alive loop)
      ├── e2e:selectors  (connectOverCDP → new pages → test → close)
      └── e2e:auth       (daemon stop → headed auth → daemon start)
```

### Files

| Action | File |
|--------|------|
| Create | `e2e/shared/chrome-finder.ts` (extracted from setup-profile.ts) |
| Create | `e2e/shared/cdp-utils.ts` (extracted from setup-profile.ts) |
| Create | `e2e/daemon/config.ts` |
| Create | `e2e/daemon/types.ts` |
| Create | `e2e/daemon/pid-manager.ts` |
| Create | `e2e/daemon/chrome-launcher.ts` |
| Create | `e2e/daemon/keep-alive.ts` |
| Create | `e2e/daemon/daemon.ts` (CLI entry point) |
| Create | `e2e/selectors/browser-provider.ts` (CDP/standalone auto-switch) |
| Modify | `e2e/auth/setup-profile.ts` (use shared modules, daemon check) |
| Modify | `e2e/selectors/smoke-test.spec.ts` (use browser-provider) |

## Alternatives Considered

### A: `launchPersistentContext()` with shared profile

Use Playwright's persistent context API with the same `user-data-dir`. Rejected because Playwright still sets automation flags when launching, which triggers Claudeflare.

### B: Pre-test session refresh

Before each test run, launch Chrome with the profile to refresh tokens, re-export storageState, then run tests with the fresh state. Rejected because the refresh step itself would trigger Claudeflare (still Playwright-launched).

### C: Two-tier strategy (stable/fragile platforms)

Run Gemini/Perplexity automatically, Claude/ChatGPT only after manual auth. Rejected because the user requires equal coverage across all 4 platforms.

## Risks

| Risk | Mitigation |
|------|------------|
| `--headless=new` detected by Claudeflare | Fallback: headed Chrome with off-screen window position |
| Chrome crashes overnight | Daemon detects crash via PID check, user notified via Obsidian |
| Session cookies lost on Chrome restart | Persistent cookies survive in profile; session-only cookies refreshed by SPA on page load |
| CDP `connectOverCDP` lower fidelity | Acceptable: tests only use `page.evaluate()` for `querySelectorAll`, no complex interaction |

## Consequences

### Positive

- Automated 1-2x daily testing without manual re-authentication
- Sessions maintained indefinitely via keep-alive reloads
- Backward compatible: existing `e2e:auth` + `e2e:selectors` standalone mode still works
- Re-authentication flow is simple: stop daemon, run existing auth, restart daemon

### Negative

- Chrome process runs 24/7 (~500MB-1GB memory)
- Additional infrastructure to manage (daemon lifecycle, PID files)
- CDP connection has lower fidelity than native Playwright protocol
- Headless mode may need empirical validation against Claudeflare

### Future: Linux (Debian) Deployment

Document but do not implement yet:
- systemd service for Chrome daemon
- Xvfb virtual display if headless detection is an issue
- `CHROME_PATH` for Chromium binary on Linux
