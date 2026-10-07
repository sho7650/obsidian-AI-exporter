# Obsidian AI Exporter

Exports conversations held on AI chat platforms into Obsidian notes.

## Language

**Message**:
One speaker's contribution to a conversation — a single user prompt or a single assistant answer. The unit a note is built from.
_Avoid_: turn (when you mean one speaker's contribution)

**Turn**:
The platform's own conversation-unit container, named as that platform names it. Its granularity is platform-specific: on Gemini and (since 2026-09) ChatGPT one Turn holds a user prompt and its answer; elsewhere a Turn may hold a single Message.
_Avoid_: using Turn as a synonym for Message in cross-platform code

**Tool activity**:
An action the assistant took while composing an answer — a web search, creating a file — as the platform summarises it in the answer (e.g. "Searched the web"). What counts as Tool activity is the platform's own classification: a step the platform files with the reasoning (Claude's "Loaded skill") is not Tool activity. Exported only when the user opts into tool output.
_Avoid_: tool result (the platform may show only the summary, not the results)

**Thinking summary**:
The one-line digest of the assistant's reasoning shown above an answer (e.g. "Planned how to explain…"). Not part of the answer and not Tool activity; never exported.
_Avoid_: thinking (when you mean the full reasoning text)

## Relationships

- A **Turn** contains one or more **Messages**; how many, and of which roles, depends on the platform
- A note is an ordered list of **Messages**, never of **Turns**

## Flagged ambiguities

- "turn" was used for one Message on ChatGPT (pre-2026-09 `section[data-turn-id]`) and for a prompt+answer pair on Gemini — resolved: Turn stays platform-native; cross-platform reasoning is in terms of Messages (#515).
