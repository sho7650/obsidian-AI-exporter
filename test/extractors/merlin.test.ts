import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MerlinExtractor } from '../../src/content/extractors/merlin';
import { conversationToNote } from '../../src/content/markdown';
import { resolveArtifacts } from '../../src/lib/artifact-output';
import { DEFAULT_SYNC_SETTINGS, DEFAULT_TEMPLATE_OPTIONS } from '../../src/lib/settings-schema';
import type { ConversationData, ExtractionResult, SyncSettings } from '../../src/lib/types';
import { clearFixture, defineLocation, resetLocation } from '../fixtures/dom-helpers';
import {
  MERLIN_CONVERSATION_ID,
  SPONSORED_BOX,
  createMerlinPage,
  installCraftPanel,
  merlinAssistantArticle,
  merlinCodeBlock,
  merlinImageWidget,
  merlinKatex,
  merlinTable,
  merlinUserArticle,
  setMerlinLocation,
} from '../fixtures/merlin-dom';

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const IMAGE_URL = 'https://storage.googleapis.com/dall-e-images/user%2Fabc.png';

function settings(overrides: Partial<SyncSettings> = {}): SyncSettings {
  return { ...DEFAULT_SYNC_SETTINGS, ...overrides };
}

function stubImageFetch(): ReturnType<typeof vi.fn> {
  const spy = vi.fn().mockResolvedValue({
    ok: true,
    blob: () =>
      Promise.resolve({
        size: PNG_BYTES.byteLength,
        type: 'image/png',
        arrayBuffer: () => Promise.resolve(PNG_BYTES.buffer),
      }),
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

function noteOf(data: ConversationData): string {
  return conversationToNote(data, DEFAULT_TEMPLATE_OPTIONS).body;
}

async function run(extractor: MerlinExtractor, overrides: Partial<SyncSettings> = {}) {
  extractor.applySettings(settings(overrides));
  return extractor.extract();
}

function dataOf(result: ExtractionResult): ConversationData {
  expect(result.success, result.error).toBe(true);
  return result.data!;
}

describe('MerlinExtractor', () => {
  let extractor: MerlinExtractor;

  beforeEach(() => {
    extractor = new MerlinExtractor();
    clearFixture();
    setMerlinLocation();
  });

  afterEach(() => {
    clearFixture();
    resetLocation();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // ========== Platform detection / id / title ==========
  describe('platform', () => {
    it('identifies as merlin', () => {
      expect(extractor.platform).toBe('merlin');
    });

    it('extracts only on www.getmerlin.in', () => {
      expect(extractor.canExtract()).toBe(true);
      defineLocation('www.getmerlin.in.attacker.com', '/chat/abc');
      expect(extractor.canExtract()).toBe(false);
      defineLocation('getmerlin.in', '/chat/abc');
      expect(extractor.canExtract()).toBe(false);
      defineLocation('sub.www.getmerlin.in', '/chat/abc');
      expect(extractor.canExtract()).toBe(false);
    });

    it('reads the conversation id from /chat/{uuid}', () => {
      expect(extractor.getConversationId()).toBe(MERLIN_CONVERSATION_ID);
      defineLocation('www.getmerlin.in', '/chat/projects');
      expect(extractor.getConversationId()).toBeNull();
    });

    it('falls back to a generated id when the URL has none', async () => {
      defineLocation('www.getmerlin.in', '/');
      createMerlinPage([
        merlinUserArticle('u1', 'hi'),
        merlinAssistantArticle('a1', { bodies: ['<p>yo</p>'] }),
      ]);
      const data = dataOf(await run(extractor));
      expect(data.id).toMatch(/^merlin-\d+$/);
    });
  });

  describe('getTitle', () => {
    it('uses the last breadcrumb item, not the generic document title', () => {
      document.title = 'Chat - Merlin AI';
      createMerlinPage([merlinUserArticle('u1', 'hello')], {
        breadcrumb: ['Projects', 'Test', 'Progetto in Merlin Cosa Posso Fare'],
      });
      expect(extractor.getTitle()).toBe('Progetto in Merlin Cosa Posso Fare');
    });

    it('does not export the project name', async () => {
      createMerlinPage(
        [merlinUserArticle('u1', 'q'), merlinAssistantArticle('a1', { bodies: ['<p>a</p>'] })],
        { breadcrumb: ['Projects', 'SecretProject', 'The chat'] }
      );
      const data = dataOf(await run(extractor));
      const note = conversationToNote(data, DEFAULT_TEMPLATE_OPTIONS);
      expect(data.title).toBe('The chat');
      expect(JSON.stringify(note.frontmatter)).not.toContain('SecretProject');
      expect(Object.keys(note.frontmatter)).not.toContain('project');
    });

    it('falls back to the first user message, truncated', () => {
      createMerlinPage([merlinUserArticle('u1', 'x'.repeat(300))], { breadcrumb: [] });
      document.querySelector('nav')?.remove();
      expect(extractor.getTitle()).toHaveLength(100);
    });

    it('has a default title when there is nothing to read', () => {
      document.body.innerHTML = '<main></main>';
      expect(extractor.getTitle()).toBe('Untitled Merlin Conversation');
    });
  });

  // ========== Messages ==========
  describe('extractMessages', () => {
    it('extracts user and assistant messages in order, without chrome', () => {
      createMerlinPage([
        merlinUserArticle('u1', 'first question'),
        merlinAssistantArticle('a1', { bodies: ['<p>first answer</p>'] }),
        merlinUserArticle('u2', 'second question'),
        merlinAssistantArticle('a2', { bodies: ['<p>second answer</p>'] }),
      ]);

      const messages = extractor.extractMessages();

      expect(messages.map(m => [m.role, m.index])).toEqual([
        ['user', 0],
        ['assistant', 1],
        ['user', 2],
        ['assistant', 3],
      ]);
      expect(messages[0].content).toBe('first question');
      expect(messages[1].content).toContain('first answer');
      for (const message of messages) {
        expect(message.content).not.toContain('71');
        expect(message.content).not.toContain('Copy');
        expect(message.content).not.toContain('ai model');
      }
    });

    it('extracts the last turn nested in a wrapper', () => {
      createMerlinPage(
        [
          merlinUserArticle('u1', 'old'),
          merlinAssistantArticle('a1', { bodies: ['<p>old answer</p>'] }),
          merlinUserArticle('u2', 'last question'),
          merlinAssistantArticle('a2', { bodies: ['<p>last answer</p>'] }),
        ],
        { nestLastTurn: true }
      );
      expect(document.querySelector('.chat-messages-area > article')).not.toBeNull();
      expect(document.querySelector('.chat-messages-area > div article')).not.toBeNull();

      const messages = extractor.extractMessages();

      expect(messages).toHaveLength(4);
      expect(messages[3].content).toContain('last answer');
    });

    it('preserves multi-line user text', () => {
      createMerlinPage([merlinUserArticle('u1', 'line one\nline two')]);
      expect(extractor.extractMessages()[0].content).toBe('line one\nline two');
    });

    it('does not export user attachments', () => {
      const attachment =
        '<div class="attachment"><img alt="photo.png" src="https://files.example.test/photo.png"><span>report.pdf</span></div>';
      createMerlinPage([merlinUserArticle('u1', 'see attached', attachment)]);

      const [message] = extractor.extractMessages();

      expect(message.content).toBe('see attached');
    });

    it('labels every assistant response "Merlin" whatever model the header shows', async () => {
      createMerlinPage([
        merlinUserArticle('u1', 'q'),
        merlinAssistantArticle('a1', { bodies: ['<p>one</p>'], label: 'GPT 6 Luna' }),
        merlinUserArticle('u2', 'q2'),
        merlinAssistantArticle('a2', { bodies: ['<p>two</p>'], label: 'Claude Sonnet 5.5' }),
      ]);

      const messages = extractor.extractMessages();
      const body = noteOf(dataOf(await run(extractor)));

      expect(messages.map(m => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
      expect(body).toContain('> [!NOTE] Merlin');
      expect(body).not.toContain('GPT 6 Luna');
      expect(body).not.toContain('Claude Sonnet');
      expect(body.match(/\[!NOTE\] Merlin/g)).toHaveLength(2);
    });

    it('skips an empty response', () => {
      createMerlinPage([
        merlinUserArticle('u1', 'q'),
        merlinAssistantArticle('a1', { bodies: ['', ''] }),
        merlinUserArticle('u2', 'q2'),
        merlinAssistantArticle('a2', { bodies: ['<p>answer</p>'] }),
      ]);

      const messages = extractor.extractMessages();

      expect(messages.map(m => m.role)).toEqual(['user', 'user', 'assistant']);
    });

    it('joins the non-empty response bodies and ignores the empty ones', () => {
      createMerlinPage([
        merlinUserArticle('u1', 'q'),
        merlinAssistantArticle('a1', { bodies: ['', '<p>part one</p>', '<p>part two</p>'] }),
      ]);

      const [, assistant] = extractor.extractMessages();

      expect(assistant.content).toContain('part one');
      expect(assistant.content).toContain('part two');
    });

    it('excludes agent steps, the version pager and credits', () => {
      const steps =
        '<h3><button>Merlin Magic</button></h3><h3><button>Saving handshake-http.html</button></h3>';
      const pager = '<div class="select-none items-center text-sm">‹ 1 / 2 ›</div>';
      createMerlinPage([
        merlinUserArticle('u1', 'q'),
        merlinAssistantArticle('a1', { bodies: ['<p>answer</p>'], beside: steps + pager }),
      ]);

      const [, assistant] = extractor.extractMessages();

      expect(assistant.content).not.toContain('Merlin Magic');
      expect(assistant.content).not.toContain('Saving');
      expect(assistant.content).not.toContain('1 / 2');
    });

    it('removes the empty citation markers', () => {
      createMerlinPage([
        merlinUserArticle('u1', 'q'),
        merlinAssistantArticle('a1', {
          bodies: [
            '<ul><li>fact<sup class="not-prose citation-shimmer inline-block"></sup></li></ul>',
          ],
        }),
      ]);

      const [, assistant] = extractor.extractMessages();

      expect(assistant.content).not.toContain('sup');
      expect(assistant.content).not.toContain('citation');
      expect(assistant.content).toContain('fact');
    });

    it('returns no messages (and a failed extraction) on an empty page', async () => {
      document.body.innerHTML = '<main></main>';
      expect(extractor.extractMessages()).toEqual([]);
      expect((await run(extractor)).success).toBe(false);
    });

    it('ignores an article that is neither a user nor an assistant message', () => {
      createMerlinPage([
        '<article data-message-id="x"><div>banner</div></article>',
        merlinUserArticle('u1', 'q'),
      ]);
      expect(extractor.extractMessages().map(m => m.role)).toEqual(['user']);
    });

    it('extracts a long conversation completely', () => {
      const articles: string[] = [];
      for (let i = 0; i < 16; i++) {
        articles.push(merlinUserArticle(`u${i}`, `question ${i}`));
        articles.push(
          merlinAssistantArticle(`a${i}`, {
            bodies: [
              `<p>answer ${i}</p>` +
                Array.from({ length: 4 }, (_, n) =>
                  merlinCodeBlock('bash', [`echo ${i}-${n}`])
                ).join(''),
            ],
          })
        );
      }
      createMerlinPage(articles);

      const messages = extractor.extractMessages();

      expect(messages).toHaveLength(32);
      expect(
        messages.filter(m => m.role === 'assistant').every(m => m.content.includes('echo'))
      ).toBe(true);
      const html = messages.map(m => m.content).join('');
      expect(html.match(/<pre>/g)).toHaveLength(64);
    });
  });

  // ========== Sponsored box ==========
  describe('sponsored box', () => {
    it('is absent from the note on a freshly received response', async () => {
      createMerlinPage([
        merlinUserArticle('u1', 'q'),
        merlinAssistantArticle('a1', { bodies: ['<p>fresh answer</p>'], after: SPONSORED_BOX }),
      ]);

      const body = noteOf(dataOf(await run(extractor)));

      expect(body).toContain('fresh answer');
      for (const leaked of [
        'Sponsored',
        'Webz',
        'trygravity',
        'advertiser-logo',
        'visualizations',
      ]) {
        expect(body).not.toContain(leaked);
      }
    });

    it('is removed even when Merlin renders it inside the response body', async () => {
      const fetchSpy = stubImageFetch();
      createMerlinPage([
        merlinUserArticle('u1', 'q'),
        merlinAssistantArticle('a1', { bodies: ['<p>answer</p>' + SPONSORED_BOX] }),
      ]);

      const data = dataOf(await run(extractor));
      const body = noteOf(data);

      expect(body).toContain('answer');
      expect(body).not.toContain('Sponsored');
      expect(body).not.toContain('trygravity');
      expect(body).not.toContain('advertiser-logo');
      expect(data.images).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('never captures the advertiser logo even inside an image-like wrapper', async () => {
      const fetchSpy = stubImageFetch();
      const wrapped = `<div class="not-prose"><button>${SPONSORED_BOX}</button></div>`;
      createMerlinPage([
        merlinUserArticle('u1', 'q'),
        merlinAssistantArticle('a1', { bodies: ['<p>answer</p>' + wrapped] }),
      ]);

      const body = noteOf(dataOf(await run(extractor)));

      expect(body).not.toContain('advertiser-logo');
      expect(body).not.toContain('g2o-image');
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  // ========== Images ==========
  describe('generated images', () => {
    function imagePage(): void {
      createMerlinPage([
        merlinUserArticle('u1', 'draw it'),
        merlinAssistantArticle('msg-a1', {
          bodies: [
            merlinImageWidget(IMAGE_URL, 'Diagramma TCP') +
              '<p>Ecco il diagramma in formato PNG.</p>',
          ],
        }),
      ]);
    }

    it('captures the image as base64 from the page and leaves a placeholder', async () => {
      const fetchSpy = stubImageFetch();
      const sendMessage = vi.fn();
      vi.stubGlobal('chrome', { runtime: { sendMessage } });
      imagePage();

      const data = dataOf(await run(extractor));

      expect(fetchSpy).toHaveBeenCalledWith(IMAGE_URL);
      expect(sendMessage).not.toHaveBeenCalled();
      expect(data.images).toHaveLength(1);
      expect(data.images![0]).toMatchObject({
        mimeType: 'image/png',
        alt: 'Diagramma TCP',
        sourceUrl: IMAGE_URL,
      });
      expect(data.images![0].id).toContain('msg-a1');
      expect(noteOf(data)).toContain(`![Diagramma TCP](g2o-image://${data.images![0].id})`);
    });

    it('removes the "Generato con <model>" line but keeps other bold paragraphs', async () => {
      stubImageFetch();
      createMerlinPage([
        merlinUserArticle('u1', 'draw it'),
        merlinAssistantArticle('a1', {
          bodies: [
            merlinImageWidget(IMAGE_URL, 'alt', 'Seedream 5.0 Lite') +
              '<p><strong>Generato con nota</strong></p><p>Testo</p>' +
              '<p><span data-streamdown="strong">Generato con in prosa</span></p>',
          ],
        }),
      ]);

      const body = noteOf(dataOf(await run(extractor)));

      expect(body).not.toContain('Seedream');
      expect(body).toContain('Generato con nota');
      expect(body).toContain('Generato con in prosa');
    });

    it('does not export the model icon nor the widget buttons', async () => {
      stubImageFetch();
      imagePage();

      const data = dataOf(await run(extractor));

      expect(data.images).toHaveLength(1);
      expect(noteOf(data)).not.toContain('jsdelivr');
      expect(noteOf(data)).not.toContain('merlin.webp');
    });

    it('keeps the stable id when the message is read twice', () => {
      imagePage();
      const first = extractor.extractMessages()[1].content;
      const second = extractor.extractMessages()[1].content;
      expect(first).toBe(second);
    });

    it('exports a message that holds only an image', async () => {
      stubImageFetch();
      createMerlinPage([
        merlinUserArticle('u1', 'q'),
        merlinAssistantArticle('a1', { bodies: [merlinImageWidget(IMAGE_URL, 'only')] }),
      ]);

      const messages = extractor.extractMessages();

      expect(messages.map(m => m.role)).toEqual(['user', 'assistant']);
    });

    it('drops the image and its credit line when image export is off', async () => {
      const fetchSpy = stubImageFetch();
      imagePage();

      const data = dataOf(await run(extractor, { enableImageExport: false }));
      const body = noteOf(data);

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(data.images).toEqual([]);
      expect(body).not.toContain('g2o-image');
      expect(body).not.toContain('Generato con');
      expect(body).toContain('Ecco il diagramma');
    });

    it('warns and still saves the note when the capture fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
      vi.stubGlobal('chrome', {
        runtime: {
          sendMessage: vi.fn().mockResolvedValue({ success: false, error: 'not allowed' }),
        },
      });
      imagePage();

      const result = await run(extractor);

      expect(result.success).toBe(true);
      expect(result.data?.images).toEqual([]);
      expect(result.warnings?.join(' ')).toContain('image(s) could not be captured');
    });
  });

  // ========== Code, tables, math ==========
  describe('markdown content', () => {
    it('renders inline code blocks as fenced blocks with their language', async () => {
      createMerlinPage([
        merlinUserArticle('u1', 'q'),
        merlinAssistantArticle('a1', {
          bodies: [
            '<p>Run:</p>' +
              merlinCodeBlock('bash', ['sudo a2enmod ssl', 'sudo systemctl restart apache2']),
          ],
        }),
      ]);

      const body = noteOf(dataOf(await run(extractor)));

      expect(body).toContain('```bash');
      expect(body).toContain('sudo a2enmod ssl\n> sudo systemctl restart apache2');
      expect(body).not.toContain('Copy Code');
      expect(body).not.toContain('Download file');
    });

    it('rebuilds code lines per span, so a block with innerText of "" still has its content', async () => {
      const block = merlinCodeBlock('sql', ['SELECT 1;', 'SELECT 2;']);
      createMerlinPage([
        merlinUserArticle('u1', 'q'),
        merlinAssistantArticle('a1', { bodies: [block] }),
      ]);
      // jsdom has no layout, so innerText is undefined/empty exactly like an off-screen
      // `content-visibility: auto` block: only a textContent-based read can pass.
      const codeBlock = document.querySelector<HTMLElement>('[data-streamdown="code-block"]')!;
      expect(codeBlock.style.contentVisibility).toBe('auto');

      const body = noteOf(dataOf(await run(extractor)));

      expect(body).toContain('SELECT 1;');
      expect(body).toContain('SELECT 2;');
    });

    it('exports a table as a Markdown table without the toolbar', async () => {
      createMerlinPage([
        merlinUserArticle('u1', 'q'),
        merlinAssistantArticle('a1', {
          bodies: [
            merlinTable(
              ['Pezzo', 'Dimensione'],
              [
                ['1', '10'],
                ['2', '20'],
              ]
            ),
          ],
        }),
      ]);

      const body = noteOf(dataOf(await run(extractor)));

      expect(body).toContain('| Pezzo | Dimensione |');
      expect(body).toContain('| --- | --- |');
      expect(body).toContain('| 1 | 10 |');
      expect(body).not.toContain('Copy table');
      expect(body).not.toContain('Download table');
      expect(body).not.toContain('fullscreen');
    });

    it('exports display formulas with their TeX source', async () => {
      createMerlinPage([
        merlinUserArticle('u1', 'q'),
        merlinAssistantArticle('a1', {
          bodies: [
            `<p>Risultato:</p>${merlinKatex('\\frac{20}{2} + \\frac{10}{2} = 15 \\text{ mm}', true)}`,
          ],
        }),
      ]);

      const body = noteOf(dataOf(await run(extractor)));

      expect(body).toContain('$$\n> \\frac{20}{2} + \\frac{10}{2} = 15 \\text{ mm}\n> $$');
    });

    const TEX = ['2x = 6', 'x = \\frac{6}{2}', 'a_1 * b_2', '\\text{se } x \\neq 0'];

    it.each(TEX)('gives raw "$$…$$" and rendered KaTeX the same inline output: %s', async tex => {
      createMerlinPage([
        merlinUserArticle('u1', 'q'),
        merlinAssistantArticle('raw', { bodies: [`<p>Quindi $$${tex}$$ fine</p>`] }),
        merlinUserArticle('u2', 'q'),
        merlinAssistantArticle('rendered', {
          bodies: [`<p>Quindi ${merlinKatex(tex, false)} fine</p>`],
        }),
      ]);

      const messages = extractor.extractMessages();
      const [raw, rendered] = messages
        .filter(m => m.role === 'assistant')
        .map(m => noteOf({ ...baseData(), messages: [{ ...m, index: 0 }] }));

      expect(raw).toBe(rendered);
      expect(raw).toContain(`$${tex}$`);
      expect(raw).not.toContain('$$');
    });

    it('converts every $$…$$ in a paragraph, around a <br>', async () => {
      createMerlinPage([
        merlinUserArticle('u1', 'q'),
        merlinAssistantArticle('a1', {
          bodies: ['<p>Sottrai 3: $$2x + 3 - 3 = 9 - 3$$<br>quindi $$2x = 6$$</p>'],
        }),
      ]);

      const body = noteOf(dataOf(await run(extractor)));

      expect(body).toContain('$2x + 3 - 3 = 9 - 3$');
      expect(body).toContain('$2x = 6$');
      expect(body).not.toContain('$$');
    });

    it('leaves a $$ inside a code block alone', async () => {
      createMerlinPage([
        merlinUserArticle('u1', 'q'),
        merlinAssistantArticle('a1', { bodies: [merlinCodeBlock('bash', ['echo $$ && true'])] }),
      ]);

      const body = noteOf(dataOf(await run(extractor)));

      expect(body).toContain('echo $$ && true');
    });

    it('leaves an unpaired $$ as text', async () => {
      createMerlinPage([
        merlinUserArticle('u1', 'q'),
        merlinAssistantArticle('a1', { bodies: ['<p>costs $$ only</p>'] }),
      ]);

      const body = noteOf(dataOf(await run(extractor)));

      expect(body).toContain('costs $$ only');
    });
  });

  // ========== Crafts ==========
  describe('crafts', () => {
    const HTML_SOURCE = {
      language: 'html',
      lines: ['<!DOCTYPE html>', '<html>', '  <body>x</body>', '</html>'],
    };
    const MMD_SOURCE = { language: 'mermaid', lines: ['flowchart TD', '    A[Start] --> B[End]'] };

    function craftPage(crafts: string[]): void {
      createMerlinPage([
        merlinUserArticle('u1', 'make files'),
        merlinAssistantArticle('a1', { bodies: ['<p>Ecco i file.</p>'], crafts }),
      ]);
    }

    it('reads each craft with the exact source, newlines preserved, and links it', async () => {
      const { log, uninstall } = installCraftPanel({
        'handshake-http.html': HTML_SOURCE,
        'flow.mmd': MMD_SOURCE,
      });
      craftPage(['handshake-http.html', 'flow.mmd']);

      const data = dataOf(await run(extractor, { enableToolContent: true }));
      uninstall();

      expect(data.artifacts).toEqual([
        {
          id: 'craft-1',
          name: 'handshake-http.html',
          language: 'html',
          content: HTML_SOURCE.lines.join('\n'),
        },
        {
          id: 'craft-2',
          name: 'flow.md',
          language: 'markdown',
          content: '\n```mermaid\nflowchart TD\n    A[Start] --> B[End]\n```\n',
        },
      ]);
      expect(log.clickedTabs).toEqual(['code', 'code']);

      const note = conversationToNote(data, DEFAULT_TEMPLATE_OPTIONS);
      const resolved = resolveArtifacts(note.body, note.artifacts ?? [], 'note');
      expect(resolved.body).toContain('[[note-handshake-http.html]]');
      expect(resolved.body).toContain('[[note-flow.md]]');
      expect(resolved.body).not.toContain('Click to open craft');
      expect(resolved.files.map(f => f.fileName)).toEqual([
        'note-handshake-http.html',
        'note-flow.md',
      ]);
      expect(resolved.files[1].content).toBe(
        '\n```mermaid\nflowchart TD\n    A[Start] --> B[End]\n```\n'
      );
    });

    it('keeps a Mermaid diagram written in the message inline, as a fenced block', async () => {
      createMerlinPage([
        merlinUserArticle('u1', 'q'),
        merlinAssistantArticle('a1', {
          bodies: ['<p>Ecco:</p>' + merlinCodeBlock('mermaid', ['graph TD', '  A --> B'])],
        }),
      ]);

      const body = noteOf(dataOf(await run(extractor)));

      expect(body).toContain('```mermaid\n> graph TD\n>   A --> B\n> ```');
    });

    it('suffixes duplicate names so every craft is kept', async () => {
      const { uninstall } = installCraftPanel({ 'diagram.mmd': MMD_SOURCE });
      craftPage(['diagram.mmd', 'diagram.mmd']);

      const data = dataOf(await run(extractor, { enableToolContent: true }));
      uninstall();

      const note = conversationToNote(data, DEFAULT_TEMPLATE_OPTIONS);
      const resolved = resolveArtifacts(note.body, note.artifacts ?? [], 'note');
      expect(data.artifacts).toHaveLength(2);
      expect(resolved.files.map(f => f.fileName)).toEqual(['note-diagram.md', 'note-diagram-2.md']);
    });

    it('reads no craft and writes no reference when enableToolContent is off', async () => {
      const { log, uninstall } = installCraftPanel({ 'handshake-http.html': HTML_SOURCE });
      craftPage(['handshake-http.html']);

      const data = dataOf(await run(extractor, { enableToolContent: false }));
      uninstall();

      expect(log.openedTitles).toEqual([]);
      expect(data.artifacts ?? []).toEqual([]);
      const body = noteOf(data);
      expect(body).not.toContain('g2o-craft');
      expect(body).not.toContain('handshake-http');
      expect(document.querySelector('[data-test-craft-panel]')).toBeNull();
    });

    it('leaves the panel closed and the page usable after reading', async () => {
      const { uninstall } = installCraftPanel({ 'a.html': HTML_SOURCE });
      craftPage(['a.html']);

      await run(extractor, { enableToolContent: true });
      uninstall();

      expect(document.querySelector('[data-test-craft-panel]')).toBeNull();
      expect(document.querySelector('button.not-prose p')?.textContent).toBe('Click to open craft');
    });

    it('never selects the Edit tab', async () => {
      const { log, uninstall } = installCraftPanel({ 'a.html': HTML_SOURCE });
      craftPage(['a.html']);

      await run(extractor, { enableToolContent: true });
      uninstall();

      expect(log.clickedTabs).not.toContain('edit');
    });

    it('saves the note with a warning when a craft cannot be read', async () => {
      const { uninstall } = installCraftPanel(
        { 'good.html': HTML_SOURCE, 'stuck.html': HTML_SOURCE },
        { neverOpens: ['stuck.html'] }
      );
      craftPage(['good.html', 'stuck.html']);
      vi.useFakeTimers();

      const pending = run(extractor, { enableToolContent: true });
      await vi.advanceTimersByTimeAsync(60_000);
      const result = await pending;
      vi.useRealTimers();
      uninstall();

      expect(result.success).toBe(true);
      expect(result.warnings?.join(' ')).toContain('stuck.html');
      const note = conversationToNote(result.data!, DEFAULT_TEMPLATE_OPTIONS);
      expect(note.body).toContain('Ecco i file.');
      // The unread craft's placeholder is resolved away, the read one is not required.
      const resolved = resolveArtifacts(note.body, note.artifacts ?? [], 'note');
      expect(resolved.body).not.toContain('g2o-craft');
      expect(resolved.body).not.toContain('stuck.html');
    });

    it('exports at most 20 crafts per note and warns about the rest', async () => {
      const names = Array.from({ length: 22 }, (_, i) => `f${i}.md`);
      const { uninstall } = installCraftPanel(
        Object.fromEntries(names.map(n => [n, { language: 'markdown', lines: ['# x'] }]))
      );
      craftPage(names);

      const result = await run(extractor, { enableToolContent: true });
      uninstall();

      expect(result.data?.artifacts).toHaveLength(20);
      expect(result.warnings?.join(' ')).toContain('more than 20');
    });
  });
});

function baseData(): ConversationData {
  return {
    id: 'x',
    title: 't',
    url: 'https://www.getmerlin.in/chat/x',
    source: 'merlin',
    messages: [],
    extractedAt: new Date('2026-11-24T00:00:00Z'),
    metadata: {
      messageCount: 0,
      userMessageCount: 0,
      assistantMessageCount: 0,
      hasCodeBlocks: false,
    },
  };
}
