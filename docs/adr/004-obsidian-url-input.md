# ADR-004: Replace Port Input with Full URL Input for Obsidian API

## Status
Accepted

## Context
The extension previously only supported HTTP connections to the Obsidian Local REST API on `127.0.0.1` via a port number input (default: 27123). Users requested HTTPS support and the ability to connect to non-localhost hosts (e.g., LAN Obsidian instances). See [#90](https://github.com/sho7650/obsidian-AI-exporter/issues/90).

Key constraints:
- Obsidian Local REST API uses self-signed certificates for HTTPS
- Chrome extensions' service workers require OS-level certificate trust (browser-level "proceed anyway" exceptions do not apply)
- Certificate SAN is scoped to `127.0.0.1` by default

## Decision
Replace the numeric port input with a full URL text input field.

### Interface change
- `SyncSettings.obsidianPort: number` → `SyncSettings.obsidianUrl: string`
- Default: `http://127.0.0.1:27123` (backward compatible)
- `ObsidianApiClient` constructor: `(port: number, apiKey)` → `(baseUrl: string, apiKey)`

### URL validation (`validateObsidianUrl`)
- Scheme: `http` or `https` only
- Port (if explicit): 1024–65535
- Returns normalized origin (no path, no trailing slash)

### Manifest permissions
- `host_permissions`: `http://127.0.0.1/*` + `https://127.0.0.1/*` (any port on localhost)
- `optional_host_permissions`: `http://*/*` + `https://*/*` (for non-localhost, requested at runtime)
- `minimum_chrome_version`: bumped from 88 to 96 (`optional_host_permissions` requires 96+)
- CSP `connect-src`: extended to include `https://127.0.0.1:*`

### Migration
Existing users with `obsidianPort` in sync storage are auto-migrated to `obsidianUrl` via `getSettings()`:
```
obsidianPort: 28000 → obsidianUrl: "http://127.0.0.1:28000"
```

## Alternatives Considered

### A. Protocol toggle + port input
Separate HTTPS toggle switch alongside the port number input.
Rejected: More complex UI with less flexibility. Cannot handle non-localhost hosts.

### B. Keep port, add protocol dropdown
Dropdown for http/https + existing port input.
Rejected: Still cannot handle non-localhost hosts without additional host input.

## Consequences

### Positive
- Users can use HTTPS with self-signed certificates (after OS-level trust)
- Users can connect to Obsidian on LAN hosts
- Simpler, more flexible single-input UI
- Backward compatible via auto-migration

### Negative
- HTTPS with self-signed certs requires users to import the certificate into their OS trust store (not just browser-level acceptance)
- If Obsidian regenerates its certificate, users must re-import the new certificate
- `minimum_chrome_version` bumped from 88 to 96 (Chrome 96 released Nov 2021)

## HTTPS Certificate Setup (for documentation)
For HTTPS connections with Obsidian's self-signed certificate on macOS:
1. Extract: `openssl s_client -connect 127.0.0.1:<port> -showcerts </dev/null 2>/dev/null | openssl x509 -outform PEM > obsidian-cert.pem`
2. Import: `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain obsidian-cert.pem`
3. Restart Chrome completely (Cmd+Q → relaunch)
4. Reload the extension from `chrome://extensions`
