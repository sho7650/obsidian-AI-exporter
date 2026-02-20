/**
 * DOM Fixture Helpers for Gemini Extractor Testing
 */

/**
 * Load HTML fixture into document body
 */
export function loadFixture(html: string): void {
  document.body.innerHTML = html;
}

/**
 * Clear document body
 */
export function clearFixture(): void {
  document.body.innerHTML = '';
}

/**
 * Message structure for creating Gemini conversation DOM
 */
interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Create minimal Gemini conversation DOM structure
 * Replicates the Angular component structure used by Gemini
 */
export function createGeminiConversationDOM(
  messages: ConversationMessage[]
): string {
  const turns: string[] = [];

  for (let i = 0; i < messages.length; i += 2) {
    const userMsg = messages[i];
    const assistantMsg = messages[i + 1];

    if (userMsg?.role !== 'user') continue;

    const userHtml = `
      <user-query>
        <div class="query-content">
          ${userMsg.content
            .split('\n')
            .map((line) => `<p class="query-text-line">${line}</p>`)
            .join('\n          ')}
        </div>
      </user-query>
    `;

    const assistantHtml = assistantMsg
      ? `
      <model-response>
        <div class="response-content">
          <div class="markdown markdown-main-panel">${assistantMsg.content}</div>
        </div>
      </model-response>
    `
      : '';

    turns.push(`
      <div class="conversation-container" data-turn-index="${Math.floor(i / 2)}">
        ${userHtml}
        ${assistantHtml}
      </div>
    `);
  }

  return `
    <div class="conversation-thread">
      ${turns.join('\n')}
    </div>
  `;
}

/**
 * Create a single conversation turn DOM
 */
export function createConversationTurn(
  userContent: string,
  assistantContent: string,
  index = 0
): string {
  return createGeminiConversationDOM([
    { role: 'user', content: userContent },
    { role: 'assistant', content: assistantContent },
  ]);
}

/**
 * Create conversation with code block
 */
export function createConversationWithCode(
  userQuery: string,
  codeLanguage: string,
  codeContent: string,
  explanation = ''
): string {
  const codeBlock = `<pre><code class="language-${codeLanguage}">${escapeHtml(codeContent)}</code></pre>`;
  const assistantContent = explanation
    ? `<p>${explanation}</p>${codeBlock}`
    : codeBlock;

  return createGeminiConversationDOM([
    { role: 'user', content: userQuery },
    { role: 'assistant', content: assistantContent },
  ]);
}

/**
 * Set window.location for Gemini URL testing
 */
export function setGeminiLocation(conversationId: string): void {
  Object.defineProperty(window, 'location', {
    value: {
      hostname: 'gemini.google.com',
      pathname: `/app/${conversationId}`,
      href: `https://gemini.google.com/app/${conversationId}`,
      origin: 'https://gemini.google.com',
      protocol: 'https:',
      host: 'gemini.google.com',
      search: '',
      hash: '',
    },
    writable: true,
    configurable: true,
  });
}

/**
 * Set window.location for non-Gemini URL
 */
export function setNonGeminiLocation(hostname: string, pathname = '/'): void {
  Object.defineProperty(window, 'location', {
    value: {
      hostname,
      pathname,
      href: `https://${hostname}${pathname}`,
      origin: `https://${hostname}`,
      protocol: 'https:',
      host: hostname,
      search: '',
      hash: '',
    },
    writable: true,
    configurable: true,
  });
}

/**
 * Reset window.location to default
 */
export function resetLocation(): void {
  Object.defineProperty(window, 'location', {
    value: {
      hostname: 'localhost',
      pathname: '/',
      href: 'http://localhost/',
      origin: 'http://localhost',
      protocol: 'http:',
      host: 'localhost',
      search: '',
      hash: '',
    },
    writable: true,
    configurable: true,
  });
}

/**
 * Create title element for Gemini page
 */
export function setGeminiTitle(title: string): void {
  // Remove existing title elements
  document.querySelectorAll('title, [data-test-title]').forEach((el) => el.remove());

  // Create title element
  const titleEl = document.createElement('title');
  titleEl.textContent = title;
  document.head.appendChild(titleEl);

  // Also create the Gemini-specific title element structure
  const geminiTitle = document.createElement('div');
  geminiTitle.setAttribute('data-test-title', 'true');
  geminiTitle.className = 'conversation-title';
  geminiTitle.textContent = title;
  document.body.insertBefore(geminiTitle, document.body.firstChild);
}

/**
 * Escape HTML entities
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Wait for DOM to update (useful for async operations)
 */
export function waitForDom(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Query element with assertion
 */
export function queryRequired<T extends Element>(
  selector: string,
  parent: Element | Document = document
): T {
  const element = parent.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Required element not found: ${selector}`);
  }
  return element;
}

/**
 * Create a minimal valid Gemini page structure
 */
export function createMinimalGeminiPage(conversationId: string, title: string): void {
  setGeminiLocation(conversationId);
  setGeminiTitle(title);
  loadFixture(`
    <div class="app-container">
      <div class="conversation-thread" data-conversation-id="${conversationId}">
      </div>
    </div>
  `);
}

/**
 * Create a complete Gemini conversation page
 */
export function createGeminiPage(
  conversationId: string,
  title: string,
  messages: ConversationMessage[]
): void {
  setGeminiLocation(conversationId);
  setGeminiTitle(title);
  loadFixture(`
    <div class="app-container">
      ${createGeminiConversationDOM(messages)}
    </div>
  `);
}


/**
 * Create Deep Research パネル DOM 構造
 */
export function createDeepResearchDOM(title: string, content: string): string {
  return `
    <deep-research-immersive-panel class="ng-star-inserted">
      <toolbar>
        <div class="toolbar has-title">
          <div class="left-panel">
            <h2 class="title-text gds-title-s">${title}</h2>
          </div>
        </div>
      </toolbar>
      <div class="container">
        <response-container>
          <structured-content-container data-test-id="message-content">
            <message-content id="extended-response-message-content">
              <div id="extended-response-markdown-content" 
                   class="markdown markdown-main-panel">
                ${content}
              </div>
            </message-content>
          </structured-content-container>
        </response-container>
      </div>
    </deep-research-immersive-panel>
  `;
}


/**
 * Creates Deep Research DOM with inline citations and source list
 */
export function createDeepResearchDOMWithLinks(
  title: string,
  contentWithCitations: string,
  sources: Array<{ url: string; title: string; domain: string }>
): string {
  // Generate source list HTML
  const sourceListHtml = sources
    .map(
      (source, i) => `
      <a data-test-id="browse-web-item-link"
         href="${source.url}"
         target="_blank" rel="noopener">
        <span data-test-id="title" class="sub-title">${source.title}</span>
        <span data-test-id="domain-name" class="display-name">${source.domain}</span>
      </a>
    `
    )
    .join('\n');

  return `
    <deep-research-immersive-panel class="ng-star-inserted">
      <toolbar>
        <div class="toolbar has-title">
          <div class="left-panel">
            <h2 class="title-text gds-title-s">${title}</h2>
          </div>
        </div>
      </toolbar>
      <div class="container">
        <response-container>
          <structured-content-container data-test-id="message-content">
            <message-content id="extended-response-message-content">
              <div id="extended-response-markdown-content"
                   class="markdown markdown-main-panel">
                ${contentWithCitations}
              </div>
            </message-content>
          </structured-content-container>
        </response-container>
      </div>
    </deep-research-immersive-panel>
    <deep-research-source-lists>
      <collapsible-button data-test-id="used-sources-button">
        <span class="gds-title-m">レポートに使用されているソース</span>
      </collapsible-button>
      <div id="used-sources-list">
        ${sourceListHtml}
      </div>
    </deep-research-source-lists>
  `;
}

/**
 * Create inline citation HTML element
 */
/**
 * Create inline citation element
 * 
 * Note: data-turn-source-index is 1-based (verified 2025-01-12)
 * Mapping: sources[N] -> data-turn-source-index = N + 1
 * 
 * @param arrayIndex 0-based index in sources array
 * @returns HTML string with 1-based data-turn-source-index
 */
export function createInlineCitation(arrayIndex: number): string {
  const turnSourceIndex = arrayIndex + 1; // Convert to 1-based
  return `<source-footnote class="ng-star-inserted"><sup class="superscript" data-turn-source-index="${turnSourceIndex}"></sup></source-footnote>`;
}

/**
 * Create パネルのみ（コンテンツなし）の DOM
 */
export function createEmptyDeepResearchPanel(): string {
  return `
    <deep-research-immersive-panel class="ng-star-inserted">
      <toolbar>
        <div class="toolbar has-title">
          <div class="left-panel">
            <h2 class="title-text gds-title-s">Test Report</h2>
          </div>
        </div>
      </toolbar>
      <div class="container">
        <response-container>
        </response-container>
      </div>
    </deep-research-immersive-panel>
  `;
}


// ========== Claude DOM Helpers ==========

/**
 * Message structure for creating Claude conversation DOM
 */
interface ClaudeConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  thinking?: string[];  // Extended Thinking chunks (assistant only)
}

/**
 * Create Extended Thinking assistant response DOM
 *
 * Generates the grid layout with .row-start-1 (thinking) and .row-start-2 (response)
 * @see docs/investigation/claude-extended-thinking-dom.md
 */
function createClaudeExtendedThinkingResponse(
  content: string,
  thinkingChunks: string[],
  collapsed: boolean = true
): string {
  const gridRows = collapsed ? '0fr_1fr' : '1fr_1fr';
  const thinkingMarkdown = thinkingChunks
    .map(chunk => `<div class="standard-markdown">${chunk}</div>`)
    .join('\n                            ');

  return `
    <div class="grid grid-rows-[${gridRows}]">
      <div class="row-start-1">
        <div style="overflow:hidden; min-height:0;">
          <div class="group/thinking border rounded">
            <div>
              <button>Claude's Thoughts</button>
              <div>
                <div>
                  <div class="grid">
                    ${thinkingMarkdown}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="row-start-2">
        <div>
          <div class="standard-markdown">
            ${content}
          </div>
        </div>
      </div>
    </div>`;
}

/**
 * Create Claude conversation DOM structure
 *
 * Replicates the structure used by Claude AI
 * @see docs/design/DES-002-claude-extractor.md Section 5.7.1
 */
export function createClaudeConversationDOM(messages: ClaudeConversationMessage[]): string {
  const blocks: string[] = [];

  messages.forEach((msg, index) => {
    if (msg.role === 'user') {
      blocks.push(`
        <div data-test-render-count="2" class="group" style="height: auto;">
          <div class="bg-bg-300 rounded-xl pl-2.5 py-2.5">
            <div data-testid="user-message">
              <p class="whitespace-pre-wrap break-words">${escapeHtmlForClaude(msg.content)}</p>
            </div>
            <span class="text-text-500 text-xs" data-state="closed">Dec 6, 2025</span>
          </div>
        </div>
      `);
    } else {
      const responseInner = msg.thinking
        ? createClaudeExtendedThinkingResponse(msg.content, msg.thinking)
        : `<div class="standard-markdown">
              ${msg.content}
            </div>`;
      blocks.push(`
        <div data-test-render-count="2" class="group" style="height: auto;">
          <div class="font-claude-response" data-is-streaming="false">
            ${responseInner}
          </div>
        </div>
      `);
    }
  });

  return `
    <div class="conversation-thread">
      ${blocks.join('\n')}
    </div>
  `;
}

/**
 * Create Claude Deep Research DOM structure
 *
 * @see docs/design/DES-002-claude-extractor.md Section 5.7.2
 */
export function createClaudeDeepResearchDOM(
  title: string,
  content: string,
  citations?: Array<{ url: string; title: string }>
): string {
  // Generate inline citations if provided
  let contentWithCitations = content;
  if (citations && citations.length > 0) {
    citations.forEach((citation, index) => {
      const citationHtml = createClaudeInlineCitation(citation.url, citation.title);
      // Append citation markers to content (for testing)
      contentWithCitations += `<p>Reference ${index + 1}: ${citationHtml}</p>`;
    });
  }

  return `
    <div id="markdown-artifact" class="font-claude-response">
      <div class="standard-markdown">
        <h1 class="text-text-100">${escapeHtmlForClaude(title)}</h1>
        ${contentWithCitations}
      </div>
    </div>
  `;
}

/**
 * Set window.location for Claude URL testing
 *
 * @param conversationId UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 */
export function setClaudeLocation(conversationId: string): void {
  Object.defineProperty(window, 'location', {
    value: {
      hostname: 'claude.ai',
      pathname: `/chat/${conversationId}`,
      href: `https://claude.ai/chat/${conversationId}`,
      origin: 'https://claude.ai',
      protocol: 'https:',
      host: 'claude.ai',
      search: '',
      hash: '',
    },
    writable: true,
    configurable: true,
  });
}

/**
 * Set window.location for non-Claude URL (security testing)
 *
 * Used to test hostname validation against subdomain attacks
 */
export function setNonClaudeLocation(hostname: string, pathname = '/'): void {
  Object.defineProperty(window, 'location', {
    value: {
      hostname,
      pathname,
      href: `https://${hostname}${pathname}`,
      origin: `https://${hostname}`,
      protocol: 'https:',
      host: hostname,
      search: '',
      hash: '',
    },
    writable: true,
    configurable: true,
  });
}

/**
 * Create Claude inline citation element
 *
 * @param url Source URL
 * @param title Link text/title
 */
export function createClaudeInlineCitation(url: string, title: string): string {
  // Note: URL is not escaped to preserve the href^="http" selector compatibility
  return `
    <span class="inline-flex">
      <a href="${url}" target="_blank" rel="noopener">
        <span class="text-text-300">${escapeHtmlForClaude(title)}</span>
      </a>
    </span>
  `;
}

/**
 * Create a complete Claude conversation page
 */
export function createClaudePage(
  conversationId: string,
  messages: ClaudeConversationMessage[]
): void {
  setClaudeLocation(conversationId);
  loadFixture(`
    <div class="app-container">
      ${createClaudeConversationDOM(messages)}
    </div>
  `);
}

/**
 * Create a Claude Deep Research page
 */
export function createClaudeDeepResearchPage(
  conversationId: string,
  title: string,
  content: string,
  citations?: Array<{ url: string; title: string }>
): void {
  setClaudeLocation(conversationId);
  loadFixture(`
    <div class="app-container">
      ${createClaudeDeepResearchDOM(title, content, citations)}
    </div>
  `);
}

/**
 * Create empty Claude Deep Research panel (no content)
 */
export function createEmptyClaudeDeepResearchPanel(): string {
  return `
    <div id="markdown-artifact" class="font-claude-response">
      <div class="standard-markdown">
        <h1 class="text-text-100">Test Report</h1>
      </div>
    </div>
  `;
}

/**
 * Escape HTML entities for Claude DOM helpers
 */
function escapeHtmlForClaude(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}


// ========== ChatGPT DOM Helpers ==========

/**
 * Message structure for creating ChatGPT conversation DOM
 */
interface ChatGPTConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  id?: string;
}

/**
 * Create ChatGPT conversation DOM structure
 *
 * Replicates the structure used by ChatGPT
 * @see docs/design/DES-003-chatgpt-extractor.md Section 5.8.1
 */
export function createChatGPTConversationDOM(messages: ChatGPTConversationMessage[]): string {
  const turns: string[] = [];

  messages.forEach((msg, index) => {
    const turnId = msg.id || `turn-${index}`;
    const messageId = `msg-${index}`;

    if (msg.role === 'user') {
      turns.push(`
        <article
          data-turn-id="${turnId}"
          data-testid="conversation-turn-${index + 1}"
          data-turn="user"
        >
          <div data-message-author-role="user"
               data-message-id="${messageId}">
            <div class="whitespace-pre-wrap">
              ${escapeHtmlForChatGPT(msg.content)}
            </div>
          </div>
        </article>
      `);
    } else {
      turns.push(`
        <article
          data-turn-id="${turnId}"
          data-testid="conversation-turn-${index + 1}"
          data-turn="assistant"
        >
          <div data-message-author-role="assistant"
               data-message-id="${messageId}"
               data-message-model-slug="gpt-5-2">
            <div class="markdown prose dark:prose-invert w-full break-words light markdown-new-styling">
              ${msg.content}
            </div>
          </div>
        </article>
      `);
    }
  });

  return `
    <div class="flex flex-col text-sm pb-25">
      ${turns.join('\n')}
    </div>
  `;
}

/**
 * Set window.location for ChatGPT URL testing
 *
 * @param conversationId UUID format or custom ID
 * @param prefix URL prefix: 'c' for regular chat, 'g' for custom GPT mode
 *
 * URL formats:
 *   prefix='c': https://chatgpt.com/c/{conversationId}
 *   prefix='g': https://chatgpt.com/g/{gptSlug}/c/{conversationId}
 */
export function setChatGPTLocation(conversationId: string, prefix: 'c' | 'g' = 'c'): void {
  const gptSlug = 'g-abc123-test-gpt';
  const pathname =
    prefix === 'g'
      ? `/g/${gptSlug}/c/${conversationId}`
      : `/c/${conversationId}`;
  Object.defineProperty(window, 'location', {
    value: {
      hostname: 'chatgpt.com',
      pathname,
      href: `https://chatgpt.com${pathname}`,
      origin: 'https://chatgpt.com',
      protocol: 'https:',
      host: 'chatgpt.com',
      search: '',
      hash: '',
    },
    writable: true,
    configurable: true,
  });
}

/**
 * Set window.location for non-ChatGPT URL (security testing)
 *
 * Used to test hostname validation against subdomain attacks
 */
export function setNonChatGPTLocation(hostname: string, pathname = '/'): void {
  Object.defineProperty(window, 'location', {
    value: {
      hostname,
      pathname,
      href: `https://${hostname}${pathname}`,
      origin: `https://${hostname}`,
      protocol: 'https:',
      host: hostname,
      search: '',
      hash: '',
    },
    writable: true,
    configurable: true,
  });
}

/**
 * Create ChatGPT inline citation element
 *
 * @param url Source URL (with or without utm_source)
 * @param displayText Link display text
 */
export function createChatGPTInlineCitation(url: string, displayText: string): string {
  return `
    <span class="" data-state="closed">
      <span class="ms-1 inline-flex max-w-full items-center select-none relative top-[-0.094rem]"
            data-testid="webpage-citation-pill">
        <a href="${url}"
           target="_blank"
           rel="noopener"
           class="flex h-4.5 overflow-hidden rounded-xl px-2 text-[9px] font-medium">
          <span class="max-w-[15ch] grow truncate overflow-hidden text-center">
            ${escapeHtmlForChatGPT(displayText)}
          </span>
        </a>
      </span>
    </span>
  `;
}

/**
 * Create a complete ChatGPT conversation page
 */
export function createChatGPTPage(
  conversationId: string,
  messages: ChatGPTConversationMessage[],
  prefix: 'c' | 'g' = 'c'
): void {
  setChatGPTLocation(conversationId, prefix);
  loadFixture(`
    <div class="app-container">
      ${createChatGPTConversationDOM(messages)}
    </div>
  `);
}

/**
 * Escape HTML entities for ChatGPT DOM helpers
 */
function escapeHtmlForChatGPT(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}


// ========== Perplexity DOM Helpers ==========

/**
 * Message structure for creating Perplexity conversation DOM
 */
interface PerplexityConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Create Perplexity conversation DOM structure
 *
 * Replicates the structure used by Perplexity AI
 * @see docs/design/DES-004-perplexity-extractor.md Section 4.2
 */
export function createPerplexityConversationDOM(messages: PerplexityConversationMessage[]): string {
  const blocks: string[] = [];
  let responseIndex = 0;

  messages.forEach((msg) => {
    if (msg.role === 'user') {
      blocks.push(`
        <div class="group/query">
          <div class="bg-offset rounded-2xl">
            <span class="select-text">${escapeHtmlForPerplexity(msg.content)}</span>
          </div>
        </div>
      `);
    } else {
      blocks.push(`
        <div id="markdown-content-${responseIndex}" class="markdown-content">
          <div class="prose dark:prose-invert">
            ${msg.content}
          </div>
        </div>
      `);
      responseIndex++;
    }
  });

  return `
    <div class="max-w-threadContentWidth">
      ${blocks.join('\n')}
    </div>
  `;
}

/**
 * Set window.location for Perplexity URL testing
 *
 * @param slug Full URL slug from /search/{slug}
 */
export function setPerplexityLocation(slug: string): void {
  Object.defineProperty(window, 'location', {
    value: {
      hostname: 'www.perplexity.ai',
      pathname: `/search/${slug}`,
      href: `https://www.perplexity.ai/search/${slug}`,
      origin: 'https://www.perplexity.ai',
      protocol: 'https:',
      host: 'www.perplexity.ai',
      search: '',
      hash: '',
    },
    writable: true,
    configurable: true,
  });
}

/**
 * Set window.location for non-Perplexity URL (security testing)
 *
 * Used to test hostname validation against subdomain attacks
 */
export function setNonPerplexityLocation(hostname: string, pathname = '/'): void {
  Object.defineProperty(window, 'location', {
    value: {
      hostname,
      pathname,
      href: `https://${hostname}${pathname}`,
      origin: `https://${hostname}`,
      protocol: 'https:',
      host: hostname,
      search: '',
      hash: '',
    },
    writable: true,
    configurable: true,
  });
}

/**
 * Create Perplexity inline citation element
 *
 * @param url Source URL
 * @param displayText Link display text
 */
export function createPerplexityInlineCitation(url: string, displayText: string): string {
  return `
    <span class="citation inline" data-pplx-citation="" data-pplx-citation-url="${url}">
      <a href="${url}">
        <span>${escapeHtmlForPerplexity(displayText)}</span>
      </a>
    </span>
  `;
}

/**
 * Create a complete Perplexity conversation page
 */
export function createPerplexityPage(
  slug: string,
  messages: PerplexityConversationMessage[]
): void {
  setPerplexityLocation(slug);
  loadFixture(`
    <div class="app-container">
      ${createPerplexityConversationDOM(messages)}
    </div>
  `);
}

/**
 * Escape HTML entities for Perplexity DOM helpers
 */
function escapeHtmlForPerplexity(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
