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
