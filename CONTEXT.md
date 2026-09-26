# Obsidian AI Exporter

Exports conversations held on AI chat platforms into Obsidian notes.

## Language

**Message**:
One speaker's contribution to a conversation — a single user prompt or a single assistant answer. The unit a note is built from.
_Avoid_: turn (when you mean one speaker's contribution)

**Turn**:
The platform's own conversation-unit container, named as that platform names it. Its granularity is platform-specific: on Gemini and (since 2026-09) ChatGPT one Turn holds a user prompt and its answer; elsewhere a Turn may hold a single Message.
_Avoid_: using Turn as a synonym for Message in cross-platform code

## Relationships

- A **Turn** contains one or more **Messages**; how many, and of which roles, depends on the platform
- A note is an ordered list of **Messages**, never of **Turns**

## Flagged ambiguities

- "turn" was used for one Message on ChatGPT (pre-2026-09 `section[data-turn-id]`) and for a prompt+answer pair on Gemini — resolved: Turn stays platform-native; cross-platform reasoning is in terms of Messages (#515).
