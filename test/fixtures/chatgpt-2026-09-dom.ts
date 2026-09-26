/**
 * Builders for ChatGPT's 2026-09 conversation DOM (issue #515).
 *
 * Shapes follow the live measurements in
 * docs/investigation/chatgpt-dom-2026-09.md: one `div[data-turn-key]` holds a
 * user prompt AND its answer; roles are marked by the user bubble and an
 * `h4.sr-only[data-conversation-role="assistant"]`; the answer body is
 * `[data-markdown-text-style="assistant-message"]`; generated images are
 * `blob:` `<img>`s inside `[data-testid="generated-image-preview"]`, and an
 * image-only answer unit carries no `data-chatgpt-search-unit-key`.
 * Conversation text is invented.
 */

export interface PairTurn {
  /** `data-turn-key` — the user message id. */
  key: string;
  user: string;
  /** Answer blocks as HTML; one entry per markdown root. Omit for no prose. */
  answers?: readonly string[];
  /** Id listed on the answer unit's `data-chatgpt-search-message-ids`. */
  answerId?: string;
  /** Generated images: blob src values. */
  images?: readonly string[];
  /** Render a date separator at the top of the turn (e.g. "Thu, Jan 29 at 4:47 PM"). */
  dateSeparator?: string;
}

function answerUnit(turn: PairTurn, index: number): string {
  const answerId = turn.answerId ?? `${turn.key}-answer`;
  const hasProse = (turn.answers?.length ?? 0) > 0;
  const blocks = (turn.answers ?? [])
    .map(
      html => `<div data-chatgpt-selection-message-id="${answerId}">
        <div data-markdown-text-style="assistant-message" class="MarkdownRoot-rZKhxa">${html}</div>
      </div>`
    )
    .join('');
  const gallery = (turn.images ?? []).length
    ? `<div data-testid="generated-image-gallery">${(turn.images ?? [])
        .map(
          (src, i) => `<div data-image-transparency-backdrop-scope="">
            <button type="button" data-testid="generated-image-preview" aria-hidden="false">
              <img src="${src}" alt="Generated image ${i + 1}" class="image-transparency-backdrop">
            </button>
          </div>`
        )
        .join('')}</div>`
    : '';
  // Image-only answer units carry no unit key (measured).
  const unitKey = hasProse
    ? ` data-chatgpt-search-unit-key="fallback-turn-${index}:1:assistant"`
    : '';
  return `<div${unitKey} data-chatgpt-search-message-ids="${answerId} ${answerId}">
    <h4 class="sr-only" data-conversation-role="assistant">ChatGPT said:</h4>
    ${blocks}${gallery}
  </div>`;
}

/** One turn: a user prompt and (optionally) its answer. */
export function renderPairTurn(turn: PairTurn, index: number): string {
  const separator = turn.dateSeparator
    ? `<div role="separator" aria-label="${turn.dateSeparator}"><span>${turn.dateSeparator}</span></div>`
    : '';
  const hasAnswer = (turn.answers?.length ?? 0) > 0 || (turn.images?.length ?? 0) > 0;
  return `<div class="[&_[data-virtualized-turn-content]]:[content-visibility:visible]" data-turn-key="${turn.key}">
    <div data-content-search-turn-key="fallback-turn-${index}">
      ${separator}
      <div data-chatgpt-search-unit-key="fallback-turn-${index}:0:user" data-chatgpt-search-message-ids="${turn.key}">
        <div data-content-search-unit-key="fallback-turn-${index}:0:user">
          <div data-user-message-bubble="true"><div class="text-size-chat whitespace-pre-wrap">${turn.user}</div></div>
        </div>
      </div>
      ${hasAnswer ? answerUnit(turn, index) : ''}
    </div>
  </div>`;
}

/**
 * The page shell: the sidebar decoy scroller plus the column-reverse thread
 * scroller holding the given turns, inside `main`.
 *
 * Only the scroll origin is reversed: the scroller's single child is a normal
 * `flex-col` and the turns sit in it oldest first, so document order is
 * conversation order (measured, docs/investigation/chatgpt-dom-2026-09.md).
 */
export function createChatGPT2026Page(turns: readonly PairTurn[]): string {
  return `<nav><div data-app-action-sidebar-scroll="" class="overflow-y-auto"></div></nav>
  <main>
    <div data-app-action-timeline-scroll="" role="presentation"
         class="thread-scroll-container overflow-x-hidden overflow-y-auto"
         style="display:flex;flex-direction:column-reverse">
      <div class="flex flex-col">${turns.map(renderPairTurn).join('')}</div>
    </div>
  </main>`;
}
