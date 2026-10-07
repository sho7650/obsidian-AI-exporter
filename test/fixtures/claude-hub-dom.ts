/**
 * Claude transcript DOM as rendered from 2026-10 (the "hub" layout).
 *
 * Reduced from the live page captured on 2026-10-07: `.font-claude-response`
 * is gone, and each answer is a single
 * `[data-testid="assistant-message"][data-cds="AssistantMessage"][data-is-streaming]`
 * element that also holds a screen-reader heading and the message actions bar.
 */

import { loadFixture, setClaudeLocation } from './dom-helpers';

/** One block inside an assistant answer, in render order */
type ClaudeHubPart = { kind: 'text'; html: string } | { kind: 'thinking'; label: string };

export type ClaudeHubMessage =
  { role: 'user'; text: string } | { role: 'assistant'; parts: ClaudeHubPart[]; heading?: string };

const TURN_KEY = '019edd2f-75f4-7a6d-9e39-f76fa5afb3db';

function renderStatus(itemKey: string, label: string): string {
  return `
    <div data-closed="" data-cds="TurnStatus" data-item-key="${TURN_KEY}-hub-reply:grp:${itemKey}" data-find-omitted="" data-state="done" class="group/status flex w-full min-w-0 flex-col">
      <div data-cds-row="" class="flex min-w-0 gap-xs" title="${label}">
        <span class="flex min-w-0 gap-xs items-center"><span class="group/morph inline-grid">
          <span data-morph-key="done|${label}" class="col-start-1 row-start-1 flex min-w-0"><span class="text-muted"><bdi>${label}</bdi></span></span>
        </span></span>
        <button type="button" data-cds-row-toggle="" aria-expanded="false"></button>
      </div>
      <span class="sr-only" role="status" aria-live="polite">${label}</span>
    </div>`;
}

function renderText(html: string): string {
  return `
    <div data-transcript-engine-root="" class="contents">
      <div data-cds="Prose" data-size="sm" class="prose">
        <div data-perf-reply-text="" class="_blocks_4za3l_47 standard-markdown grid-cols-1 grid">${html}</div>
      </div>
    </div>`;
}

function renderPart(part: ClaudeHubPart, index: number): string {
  return part.kind === 'text' ? renderText(part.html) : renderStatus(`th${index}`, part.label);
}

function renderUser(text: string): string {
  return `
    <h2 data-find-omitted="" class="sr-only select-none">You said: ${text}</h2>
    <div data-user-scope="" class="group group/message-row min-w-0">
      <div data-cds="UserMessage" data-turn-key="${TURN_KEY}">
        <div class="cds-user-message-body">
          <div data-testid="user-message" class="relative grid min-w-0 grid-cols-1 gap-2">
            <div class="contents"><p class="whitespace-pre-wrap break-words" dir="ltr">${text}</p></div>
          </div>
        </div>
        <div data-cds="MessageActions" data-deferred="" data-size="xs"></div>
      </div>
    </div>`;
}

function renderAssistant(parts: ClaudeHubPart[], heading: string): string {
  return `
    <div data-reply-scope="" class="group group/message-row min-w-0">
      <div data-cds="AssistantMessage" class="group/message-row relative flex w-full min-w-0 flex-col" data-testid="assistant-message" data-turn-key="${TURN_KEY}-hub-reply" data-is-streaming="false">
        <h2 data-find-omitted="" class="sr-only select-none">Claude responded: ${heading}</h2>
        <div class="flex min-w-0 flex-col gap-5">${parts.map(renderPart).join('')}</div>
        <div class="print:mt-xs">
          <div data-cds="MessageActions" role="toolbar" aria-label="Message actions" data-testid="message-actions">
            <button type="button" aria-label="Copy"></button>
            <time data-cds="RelativeTime" datetime="2026-06-19T00:02:19.557Z">Jun 19</time>
          </div>
        </div>
      </div>
    </div>`;
}

function renderRow(message: ClaudeHubMessage, index: number): string {
  const body =
    message.role === 'user'
      ? renderUser(message.text)
      : renderAssistant(message.parts, message.heading ?? 'answer');
  return `
    <div data-rs-index="${index}" data-index="${index}" data-testid="transcript-row" data-perf-row="${message.role === 'user' ? 'human' : 'assistant'}">
      <div role="article" aria-label="Message ${index + 1}">
        <div class="contents"><div data-transcript-row="">${body}</div></div>
      </div>
    </div>`;
}

/** Load a 2026-10 Claude conversation page into the document */
export function createClaudeHubPage(conversationId: string, messages: ClaudeHubMessage[]): void {
  setClaudeLocation(conversationId);
  loadFixture(`
    <div data-testid="bardhub-claudechat-root">
      <div data-autoscroll-container="true" class="overflow-y-auto overflow-x-hidden flex-1">
        <div role="feed" data-perf-region="transcript" aria-label="Chat messages">
          <div data-testid="transcript-sizer">${messages.map(renderRow).join('')}</div>
        </div>
      </div>
    </div>`);
}
