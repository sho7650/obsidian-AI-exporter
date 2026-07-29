# Chrome Web Store dashboard fields

The Privacy tab of the Chrome Web Store Developer Dashboard holds free text that
no build step reads. It rots silently, and the damage surfaces only at review
time. Two instances landed on the same day (2026-07-29):

- the host permission justification still said "Seven host permissions" and
  named only `notebooklm.google.com`, a full release after the rebrand;
- the single purpose description had listed four platforms ever since NotebookLM
  shipped in [#206](https://github.com/sho7650/obsidian-AI-exporter/pull/206)
  (2026-04-09), while the manifest requested host permissions for five.

**This file is the source of truth. The dashboard is synced _from_ it, never the
other way round.** `test/arch/store-listing-fields.test.ts` proves each field
fits its limit, that every manifest permission is justified and nothing else is,
that the host justification names every host in the manifest, and that the
single purpose covers every registered platform.

## Why the single purpose matters more than it looks

The dashboard states: _"Remove any permissions that are not necessary for your
extension's single purpose. If you request unnecessary permissions, this version
will be rejected."_ Whether a permission is *necessary* is judged against the
single purpose, so a platform missing from that sentence turns its host
permission into an unjustified one.

## How to update

1. Edit the field below. Keep the fenced block byte-exact — it is pasted verbatim.
2. Run `npm run test -- store-listing` and fix anything it reports.
3. Paste each changed field into the dashboard.
4. Confirm the dashboard's character counter matches the count noted here. A
   mismatch means the paste was truncated.
5. Update **Last synced** below.

**Last synced:** 2026-07-29, extension v2.4.1 — except `single_purpose`, which
is corrected here and **still needs pasting into the dashboard**. The live value
omits Gemini Notebook.

---

## Single purpose description

Dashboard field: 単一用途の説明 / "Single purpose description". Limit 1000.

<!-- field: single_purpose, limit: 1000 -->

```text
Export and save Gemini, Claude, ChatGPT, Perplexity AI, and Gemini Notebook conversations locally as Markdown notes - to Obsidian, as files, or to clipboard.
```

157 characters. The live dashboard value is 140 characters and names only four
platforms; this corrected text adds Gemini Notebook.

---

## Permission justifications

One per entry in `manifest.permissions`. Limit 1000 each.

### `storage`

<!-- field: permission.storage, limit: 1000 -->

```text
The extension uses chrome.storage to save user preferences:
- chrome.storage.local: Stores the Obsidian API key securely on the user's device only (never synced)
- chrome.storage.sync: Stores non-sensitive settings (vault path, template preferences) to sync across the user's Chrome browsers

No conversation content and no personal data are stored here, and none are sent to any third-party service.
```

400 characters — matches the live dashboard value.

### `downloads`

<!-- field: permission.downloads, limit: 1000 -->

```text
The extension allows users to download conversation exports as local files when Obsidian is not available. This provides a fallback option to save conversations as .md (Markdown) files directly to the user's computer. Downloads are user-initiated only.
```

252 characters — matches the live dashboard value.

### `offscreen`

<!-- field: permission.offscreen, limit: 1000 -->

```text
The extension uses the offscreen API to process clipboard operations in the background when the user chooses to copy conversation content. This is required because clipboard access from service workers requires an offscreen document. Used only for user-initiated copy actions.
```

276 characters — matches the live dashboard value.

### `clipboardWrite`

<!-- field: permission.clipboardWrite, limit: 1000 -->

```text
The extension allows users to copy exported conversation content to their clipboard as an alternative output option. This is entirely user-initiated via a "Copy to Clipboard" button. No automatic clipboard access occurs.
```

220 characters — matches the live dashboard value.

---

## Host permission justification

Dashboard field: ホスト権限が必要な理由 / "Host permission justification". Limit 1000.

Must name every entry in `manifest.host_permissions`. The `127.0.0.1` HTTP and
HTTPS entries are one justification; the numbering is for the reviewer, not the
manifest.

<!-- field: host_permissions, limit: 1000 -->

```text
Eight host permissions are required:

1. gemini.google.com - inject the "Sync to Obsidian" button and read conversation content from Gemini pages. Read-only.
2-6. claude.ai, chatgpt.com, www.perplexity.ai, notebook.google.com (Gemini Notebook) and notebooklm.google.com (its former host, still redirected there) - the same button and read-only access, on those sites.

7. *.googleusercontent.com - download AI-generated images so they can be saved with the conversation, when the user turns on image export. This is the same Google image CDN the AI page already loads them from; Chrome blocks the page from fetching them, so the extension does it. Images only: no conversation content or user data is sent.

8. 127.0.0.1 (localhost, HTTP and HTTPS) - communicate with Obsidian's Local REST API plugin on the user's own machine, saving conversations to their vault.

Conversation content is never sent to a third party; it goes only to the user's own Obsidian instance. No analytics or telemetry.
```

995 characters — matches the live dashboard value. Only 5 characters of headroom
remain: adding a host will require compressing this text, not just appending to
it.

---

## Privacy policy

<https://sho7650.github.io/obsidian-AI-exporter/privacy.html> — published from
[`docs/privacy.html`](../privacy.html).

---

## Not yet captured

These dashboard fields are **not** recorded here because their current values
have not been read. They are deliberately left blank rather than guessed, since
a wrong value here would be pasted into a review submission.

- **Remote code** (リモートコード) — the declared answer and any justification.
- **Data usage** (データ使用) — which data-type checkboxes are ticked, and the
  compliance certifications.
- **Store listing tab** — category, screenshots, promo assets. Only the long
  descriptions are tracked, in `description_en.md` / `description_ja.md`.

Capture them the next time the dashboard is open, then extend
`test/arch/store-listing-fields.test.ts` to cover whatever gains a length limit.
