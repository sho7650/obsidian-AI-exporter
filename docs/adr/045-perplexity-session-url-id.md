# ADR-045: The Perplexity conversation id is the last URL segment, so it becomes the session uuid

- Status: Accepted
- Date: 2026-11-08
- Related: [REQ-perplexity-session-url](../requirements/REQ-perplexity-session-url.md) (the
  measurements this rests on), [PLAN-perplexity-session-url](../design/PLAN-perplexity-session-url.md),
  [ADR-016](016-e2e-baseline-contract-and-reporting.md) (the E2E auth pre-flight)

## Context

Perplexity used to serve a conversation at `/search/{slug}`, where the slug is the title
romanized plus a random tail (`amerikate-macbook-womai-tutaho-vRujSvdQSHuGQNJJESP8uw`). The
extension used that slug as the conversation id.

In 2026-11 Perplexity moved conversations to `/session/{uuid}` and redirects the old URL there.
Measured live on 2026-11-08:

- `/search/{slug}` redirects to `/session/{uuid}`, and the conversation renders there.
- Sidebar links are all `/session/{uuid}`. The HTML contains no `/search/` string.
- `link[rel=canonical]` and `og:url` point to the site root, not to the conversation.

`getConversationId()` matched only `/search/`, so on every current conversation it returned
`null`. The base extractor then used `perplexity-${Date.now()}`: a new id on every save, so
every save made a new note and append mode never found the existing one. The E2E auth
pre-flight matched only `/search/` too, so a healthy conversation was reported as
`test_data_missing`.

## Decision

**The conversation id is the last segment of `/session/{id}` or `/search/{id}`.** On current
pages that is the uuid; on a legacy URL that is still on screen it is the slug. The E2E
pre-flight accepts both shapes and still requires the id segment, so a bare `/session/` stays
`test_data_missing`.

## Consequences

- Notes saved from a `/session/` page are keyed `perplexity_{uuid}`. Saving the same
  conversation again finds the same note.
- Existing notes are keyed `perplexity_{slug}`. They are not matched by the new id, so the first
  save of each such conversation after this change creates one new note instead of appending.
  Existing notes are not migrated.
- The filename suffix is the first 8 characters of the id. For a slug those came from the
  title, which is why identical titles collided (#327). For a uuid they are random hex, so that
  cause of collisions goes away; the collision fallback (`filename-collision.ts`) is unchanged.
- Any other conversation URL shape (for example a share link) still yields `null` and the
  timestamp fallback, as before.

## Alternatives considered

- **Keep the slug as the id.** Rejected: the `/session/` page does not expose it anywhere
  (DOM, canonical, `og:url`), so it cannot be read.
- **Match existing notes by title.** Rejected: titles can change, and matching on them would
  bring back the identical-title collisions fixed in #327.
- **Migrate existing notes to the uuid.** Rejected for now: the old slug cannot be mapped to a
  uuid from the extension without opening each conversation.

## Files

- `src/content/extractors/perplexity.ts` — `CONVERSATION_PATH`, `getConversationId()`
- `e2e/selectors/auth-check.ts` — `AUTH_URL_PATTERNS.perplexity`
- `e2e/.env.local.example` — the pinned test URL shape
