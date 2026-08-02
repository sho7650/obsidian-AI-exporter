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
will be rejected."_ Whether a permission is _necessary_ is judged against the
single purpose, so a platform missing from that sentence turns its host
permission into an unjustified one.

## How to update

1. Edit the field below. Keep the fenced block byte-exact — it is pasted verbatim.
2. Run `npm run test -- store-listing` and fix anything it reports.
3. Paste each changed field into the dashboard.
4. Confirm the dashboard's character counter matches the count noted here. A
   mismatch means the paste was truncated.
5. Update **Last synced** below.

**Last synced:** 2026-08-02, extension v2.5.0. Every field below matches the
dashboard, each verified against its character counter after pasting.

---

## Single purpose description

Dashboard field: 単一用途の説明 / "Single purpose description". Limit 1000.

<!-- field: single_purpose, limit: 1000 -->

```text
Export and save Gemini, Claude, ChatGPT, Perplexity AI, and Gemini Notebook conversations locally as Markdown notes - to Obsidian, as files, or to clipboard.
```

157 characters. Replaced the previous 140-character text, which named only four
platforms and had been stale since NotebookLM shipped in #206 (2026-04-09).

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

## Remote code

Dashboard field: リモートコード / "Remote code".

<!-- declaration: remote_code, value: no -->

Selected: **"No, I am not using remote code."** The justification textarea is
empty (0/1000).

Manifest V3 cannot execute remotely hosted code at all, and the extension does
not try to: `content_security_policy.extension_pages` pins `script-src 'self'`,
so no external origin can supply a script. `store-listing-fields.test.ts` derives
this answer from that CSP rather than trusting the line above.

---

## Data usage

Dashboard section: データ使用 / "Data usage". Both groups are recorded, including
the boxes that are **not** ticked — an unrecorded category reads exactly like an
unticked one, and "we collect nothing" has to be a claim someone made on purpose.

### Data types collected

The Chrome Web Store's definition of _handle_ is broader than everyday usage:

> Generally, by "handle" we mean collecting, transmitting, using, or sharing user
> data. […] Extensions are required to disclose how they handle user data, **even
> when data is processed or stored locally on a user's device and is not
> transmitted to external servers or third parties.**

So "it never leaves the device" is not an exemption. Every extractor reads
conversation text out of the page, which is website content, and that is
disclosed accordingly.

| Dashboard label                                                                                                                          | Ticked  |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 個人を特定できる情報 / Personally identifiable information <!-- declaration: data.personally_identifiable_information, value: no -->     | No      |
| 健康に関する情報 / Health information <!-- declaration: data.health_information, value: no -->                                           | No      |
| 財務状況や支払いに関する情報 / Financial and payment information <!-- declaration: data.financial_and_payment_information, value: no --> | No      |
| 認証に関する情報 / Authentication information <!-- declaration: data.authentication_information, value: no -->                           | No      |
| 個人的コミュニケーション / Personal communications <!-- declaration: data.personal_communications, value: no -->                         | No      |
| 位置情報 / Location <!-- declaration: data.location, value: no -->                                                                       | No      |
| ウェブ履歴 / Web history <!-- declaration: data.web_history, value: no -->                                                               | No      |
| ユーザーのアクティビティ / User activity <!-- declaration: data.user_activity, value: no -->                                             | No      |
| **ウェブサイトのコンテンツ / Website content** <!-- declaration: data.website_content, value: yes -->                                    | **Yes** |

The Obsidian API key is user-supplied configuration held in `chrome.storage.local`,
not data gathered about the user, so it is not an authentication-information
disclosure. Nothing is gathered about the user's identity, location, browsing or
input.

`個人的コミュニケーション` stays unticked: its examples are mail and chat messages
between people, and the dashboard does not define whether a conversation with a
model counts. The category is treated as out of scope rather than guessed at.

### Certifications

All three are ticked, and all three hold — no user data reaches a third party,
nothing is used outside the stated purpose, and nothing touches creditworthiness
or lending.

<!-- declaration: certification.no_third_party_transfer, value: yes -->
<!-- declaration: certification.purpose_limited_use, value: yes -->
<!-- declaration: certification.no_creditworthiness_use, value: yes -->

| Certification                                                                           | Agreed |
| --------------------------------------------------------------------------------------- | ------ |
| Not selling or transferring user data to third parties beyond approved uses             | Yes    |
| Not using or transferring user data for purposes unrelated to the item's single purpose | Yes    |
| Not using or transferring user data to determine creditworthiness or for lending        | Yes    |

---

## Privacy policy

<!-- declaration: privacy_policy_url, value: https://sho7650.github.io/obsidian-AI-exporter/privacy.html -->

<https://sho7650.github.io/obsidian-AI-exporter/privacy.html> — published from
[`docs/privacy.html`](../privacy.html) and cross-checked against the link in
README.md.

The dashboard states that publishing the item asserts these disclosures reflect
the current privacy policy, so `docs/privacy.html` and this file have to move
together. It already documents that conversation content is processed, which is
what the website-content disclosure above declares.

---

## Not captured here

- **Store listing tab** — category, screenshots, promo assets. Only the long
  descriptions are tracked, in `description_en.md` / `description_ja.md`.
