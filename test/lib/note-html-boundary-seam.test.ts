/**
 * Seam test for the note-body HTML boundary (DES-019 §5.2, Q12).
 *
 * Contract (DES-019 §2): text derived from a platform page never becomes live
 * HTML in a note body. Two layers enforce it, and each is tested at its own
 * seam:
 *
 * - Fidelity layer: per-path escaping, observed through `conversationToNote()`
 *   (behind the real extractor wherever an extractor writes the Markdown). The
 *   body it builds must already be safe, so the final gate has nothing to do.
 * - Boundary: `generateNoteContent()`, fed raw payloads that bypass the
 *   fidelity layer, must still emit no raw HTML.
 *
 * The oracle is a markdown-it instance defined HERE that collects raw-HTML
 * tokens, so neither layer is graded by its own code. Like the gate it
 * collects before `footnote_tail`, which drops unreferenced definitions and
 * moves inline footnotes out of the main stream; Obsidian renders both.
 *
 * Alt and title are attributes, which no renderer parses as HTML, so for them
 * the §2 mechanical form is checked on the Markdown source instead.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import MarkdownIt, { type PluginSimple } from 'markdown-it';
import footnote from 'markdown-it-footnote';
import { conversationToNote } from '../../src/content/markdown';
import { ClaudeExtractor } from '../../src/content/extractors/claude';
import { NotebookLMExtractor } from '../../src/content/extractors/notebooklm';
import { PerplexityExtractor } from '../../src/content/extractors/perplexity';
import { neutralizeLiveHtml } from '../../src/lib/html-gate';
import { generateNoteContent } from '../../src/lib/note-generator';
import { MAX_MATH_LENGTH } from '../../src/lib/constants';
import { DEFAULT_SYNC_SETTINGS } from '../../src/lib/settings-schema';
import { PLATFORM_REGISTRY } from '../../src/lib/platform-registry';
import type {
  AIPlatform,
  ConversationData,
  ConversationMessage,
  ExtensionSettings,
  ExtractionResult,
  ObsidianNote,
  TemplateOptions,
} from '../../src/lib/types';
import { clearFixture, resetLocation } from '../fixtures/dom-helpers';
import { createClaudeHubPage } from '../fixtures/claude-hub-dom';
import {
  createNotebookLMPage,
  createPerplexityInlineCitation,
  createPerplexityPage,
} from '../fixtures/dom-helpers';

type Token = ReturnType<MarkdownIt['parse']>[number];

interface OracleEnv {
  html: string[];
  footnotes?: { list?: Array<{ tokens?: Token[] }> };
}

function collectHtml(tokens: readonly Token[] | null | undefined, out: string[]): void {
  for (const token of tokens ?? []) {
    if (token.type === 'html_block' || token.type === 'html_inline') out.push(token.content);
    collectHtml(token.children, out);
  }
}

// Type-only cast, as in src/lib/html-gate.ts: the footnote plugin's types
// reference the CommonJS declarations of markdown-it.
const oracle = new MarkdownIt({ html: true }).use(footnote as unknown as PluginSimple);
oracle.core.ruler.before('footnote_tail', 'seam_raw_html', state => {
  const env = state.env as OracleEnv;
  collectHtml(state.tokens, env.html);
  for (const entry of env.footnotes?.list ?? []) collectHtml(entry.tokens, env.html);
});

/** Every raw-HTML token in `body`, as markdown-it (and so Obsidian) reads it. */
function rawHtml(body: string): string[] {
  const env: OracleEnv = { html: [] };
  oracle.parse(body, env);
  return env.html;
}

// ---------------------------------------------------------------------------
// Payloads (DES-019 §5.2)
// ---------------------------------------------------------------------------

const F3 = '`'.repeat(3);

const BASES: ReadonlyArray<[string, string]> = [
  ['iframe', '<iframe src="https://evil.example/">'],
  ['img', '<img src=//evil/x>'],
];

type Form = readonly [string, (payload: string) => string];

/** Single-line placements: usable in any field, attributes included. */
const LINE_FORMS: readonly Form[] = [
  ['plain', p => `before ${p} after`],
  ['one backslash', p => `\\${p}`],
  ['two backslashes', p => `\\\\${p}`],
  ['literal backticks', p => `\`${p}\``],
  ['escaped backticks', p => `\\\`${p}\\\``],
  ['code span holding a backtick', p => `\`\`a\`${p}\`\``],
  ['wikilink in backticks', p => `\`[[x]] ${p}\``],
  ['wikilink alias', p => `[[x|${p}]]`],
];

/** Placements whose meaning depends on block structure across lines. */
const BLOCK_FORMS: readonly Form[] = [
  ['backtick pair across lines', p => `\`a\n${p}\``],
  ['two list items', p => `- \`open\n- ${p}\``],
  ['heading and the next line', p => `# \`a\n${p}\``],
  ['table row', p => `| a | b |\n| --- | --- |\n| \`a | ${p}\` |`],
  ['over-indented quote fences', p => `>     ${F3}\n> ${p}\n>     ${F3}`],
  ['column 0 after a list-item fence', p => `- item\n\n  ${F3}\n  code\n${p}\n  ${F3}`],
];

interface Payload {
  name: string;
  text: string;
}

function payloads(forms: readonly Form[]): Payload[] {
  return BASES.flatMap(([base, payload]) =>
    forms.map(([form, place]) => ({ name: `${base} / ${form}`, text: place(payload) }))
  );
}

const LINE_PAYLOADS = payloads(LINE_FORMS);
const TEXT_PAYLOADS = payloads([...LINE_FORMS, ...BLOCK_FORMS]);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FORMATS: ReadonlyArray<TemplateOptions['messageFormat']> = ['callout', 'blockquote', 'plain'];

const BASE_OPTIONS: TemplateOptions = {
  includeId: true,
  includeTitle: true,
  includeTags: true,
  includeSource: true,
  includeDates: true,
  includeMessageCount: true,
  messageFormat: 'callout',
  userCalloutType: 'QUESTION',
  assistantCalloutType: 'NOTE',
};

const PLATFORMS = Object.keys(PLATFORM_REGISTRY) as AIPlatform[];

/** Text as the DOM holds it in element content. */
function toHtmlText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Text as the DOM holds it in a double-quoted attribute. */
function toHtmlAttr(text: string): string {
  return toHtmlText(text).replace(/"/g, '&quot;');
}

type MessageInput = Pick<ConversationMessage, 'role' | 'content'> & Partial<ConversationMessage>;

function conversation(
  messages: readonly MessageInput[],
  overrides: Partial<ConversationData> = {}
): ConversationData {
  return {
    id: 'seam539',
    title: 'Boundary seam',
    url: 'https://gemini.google.com/app/seam539',
    source: 'gemini',
    messages: messages.map((message, index) => ({ id: `m${index}`, index, ...message })),
    extractedAt: new Date('2026-10-24T00:00:00Z'),
    metadata: {
      messageCount: messages.length,
      userMessageCount: 1,
      assistantMessageCount: 1,
      hasCodeBlocks: false,
    },
    ...overrides,
  };
}

function bodyOf(data: ConversationData, options: TemplateOptions): string {
  return conversationToNote(data, options).body;
}

/** Body of a question followed by one assistant answer holding `html`. */
function assistantBody(
  html: string,
  options: TemplateOptions,
  source: AIPlatform = 'gemini'
): string {
  return bodyOf(
    conversation(
      [
        { role: 'user', content: 'question' },
        { role: 'assistant', content: html },
      ],
      { source }
    ),
    options
  );
}

async function extractedBody(
  extract: () => Promise<ExtractionResult>,
  options: TemplateOptions
): Promise<string> {
  const result = await extract();
  expect(result.success).toBe(true);
  return bodyOf(result.data as ConversationData, options);
}

/** The fidelity-layer verdict: no raw HTML, so the gate has nothing to change. */
function expectNoLiveHtml(body: string): void {
  expect(rawHtml(body)).toEqual([]);
  expect(neutralizeLiveHtml(body)).toBe(body);
}

// ---------------------------------------------------------------------------
// Seam 1: fidelity layer
// ---------------------------------------------------------------------------

describe.each(FORMATS)('fidelity layer — %s format', messageFormat => {
  const options: TemplateOptions = { ...BASE_OPTIONS, messageFormat };

  beforeEach(() => clearFixture());
  afterEach(() => {
    clearFixture();
    resetLocation();
  });

  describe.each(PLATFORMS)('assistant HTML text on %s', source => {
    it.each(TEXT_PAYLOADS)('$name', ({ text }) => {
      const html = `<p>${text.split('\n').map(toHtmlText).join('<br>')}</p>`;
      expectNoLiveHtml(assistantBody(html, options, source));
    });
  });

  describe('assistant HTML constructs', () => {
    it.each(LINE_PAYLOADS)('inline code — $name', ({ text }) => {
      expectNoLiveHtml(assistantBody(`<p>x <code>${toHtmlText(text)}</code> y</p>`, options));
    });

    it.each(LINE_PAYLOADS)('link and image attributes — $name', ({ text }) => {
      const attr = toHtmlAttr(text);
      const html =
        `<p><a href="https://example.com/a b${attr}" title="${attr}">link</a> ` +
        `<img src="https://example.com/i.png" alt="${attr}" title="${attr}"></p>`;
      const body = assistantBody(html, options);
      expectNoLiveHtml(body);
      expectAttributesEscaped(body);
    });

    it.each(LINE_PAYLOADS)('table cell — $name', ({ text }) => {
      const html =
        '<table><thead><tr><th>h</th></tr></thead>' +
        `<tbody><tr><td>${toHtmlText(text)}</td></tr></tbody></table>`;
      expectNoLiveHtml(assistantBody(html, options));
    });

    it.each(LINE_PAYLOADS)('image marker alt — $name', ({ text }) => {
      const html = `<p><img data-g2o-image="img-1" src="data:," alt="${toHtmlAttr(text)}"></p>`;
      const body = assistantBody(html, options);
      expectNoLiveHtml(body);
      expectAttributesEscaped(body);
    });

    it.each(LINE_PAYLOADS)('math, rendered and both fallbacks — $name', ({ text }) => {
      // The KaTeX child matters: Turndown hands an empty element to its blank
      // rule before any custom rule, so childless math never reaches formatMath.
      const katex = '<span class="katex">rendered</span>';
      const html = [text, `${text} $`, `${text}${'x'.repeat(MAX_MATH_LENGTH)}`]
        .map(latex => {
          const attr = toHtmlAttr(latex);
          return `<p>m <span data-math="${attr}">${katex}</span></p><div data-math="${attr}">${katex}</div>`;
        })
        .join('');
      const body = assistantBody(html, options);
      expect(body).not.toContain('rendered');
      expectNoLiveHtml(body);
    });
  });

  describe('user plain text', () => {
    it.each(TEXT_PAYLOADS)('$name', ({ text }) => {
      const data = conversation([
        { role: 'user', content: text },
        { role: 'assistant', content: '<p>answer</p>' },
      ]);
      expectNoLiveHtml(bodyOf(data, options));
    });

    it.each(TEXT_PAYLOADS)('with a question header — $name', ({ text }) => {
      const data = conversation([
        { role: 'user', content: text },
        { role: 'assistant', content: '<p>answer</p>' },
      ]);
      expectNoLiveHtml(bodyOf(data, { ...options, includeQuestionHeaders: true }));
    });
  });

  describe('Claude extractor', () => {
    it.each(TEXT_PAYLOADS)('user HTML — $name', async ({ text }) => {
      createClaudeHubPage('seam-user', [
        { role: 'user', text: toHtmlText(text) },
        { role: 'assistant', parts: [{ kind: 'text', html: '<p>answer</p>' }] },
      ]);
      expectNoLiveHtml(await extractedBody(() => new ClaudeExtractor().extract(), options));
    });

    it.each(LINE_PAYLOADS)('Tool activity label — $name', async ({ text }) => {
      createClaudeHubPage('seam-tool', [
        { role: 'user', text: 'Research this' },
        {
          role: 'assistant',
          parts: [
            { kind: 'tool', label: toHtmlAttr(text) },
            { kind: 'text', html: '<p>Done.</p>' },
          ],
        },
      ]);
      const extractor = new ClaudeExtractor();
      extractor.enableToolContent = true;
      const body = await extractedBody(() => extractor.extract(), options);
      expect(body).toContain('Done.');
      expectNoLiveHtml(body);
    });
  });

  describe('footnote definitions', () => {
    it.each(LINE_PAYLOADS)('Perplexity Source title — $name', async ({ text }) => {
      // The fixture escapes the title for element content only, which a `"`
      // in the payload would break out of, so the attribute value goes in here.
      const citation = createPerplexityInlineCitation(
        'https://example.com/source',
        'example',
        'TITLE_SLOT'
      ).replace('TITLE_SLOT', toHtmlAttr(text));
      createPerplexityPage('seam-slug', [
        { role: 'user', content: 'question' },
        { role: 'assistant', content: `<p>Claim.${citation}</p>` },
      ]);
      const body = await extractedBody(() => new PerplexityExtractor().extract(), options);
      expect(body).toContain('[^m1-1]:');
      expectNoLiveHtml(body);
    });

    it.each(LINE_PAYLOADS)('NotebookLM citation title — $name', async ({ text }) => {
      createNotebookLMPage('seam-notebook', [
        { role: 'user', content: 'question' },
        {
          role: 'assistant',
          content: `
            <labs-tailwind-structural-element-view-v2>
              <paragraph-element-view>
                <div class="paragraph is-rich-chat-ui normal">
                  <span>Cite</span>
                  <span><button class="citation-marker"><span aria-label="1: ${toHtmlAttr(text)}">1</span></button></span>
                </div>
              </paragraph-element-view>
            </labs-tailwind-structural-element-view-v2>`,
        },
      ]);
      const body = await extractedBody(() => new NotebookLMExtractor().extract(), options);
      // NotebookLM numbers labels by assistant message, not by message index.
      expect(body).toContain('[^m0-1]:');
      expectNoLiveHtml(body);
    });
  });

  // Assistant HTML with no citations (Claude) still keeps these attributes
  // through sanitizeHtml(), so the page can supply them itself. `absent` is
  // what an unvalidated label, URL or id would put in the body.
  describe('forged placeholders (P13)', () => {
    it.each([
      {
        name: 'empty footnote-def label',
        html: '<p data-footnote-def="">&lt;iframe src="https://evil.example/"&gt;</p>',
        absent: '[^]:',
      },
      {
        name: 'footnote def with an invalid label and a javascript: URL',
        html: '<p data-footnote-def="x y" data-footnote-url="javascript:x">&lt;img src=//evil/x&gt;</p>',
        absent: 'javascript:',
      },
      {
        name: 'footnote ref with a crafted label',
        html: '<p>a<span data-footnote-ref="a]b&lt;img src=//evil/x&gt;">REF</span></p>',
        absent: '[^a',
      },
      {
        name: 'image marker with an invalid id',
        html: '<p><img data-g2o-image="x)(y" src="data:," alt="<img src=//evil/x>"></p>',
        absent: 'g2o-image://',
      },
    ])('$name', ({ html, absent }) => {
      const body = assistantBody(html, options, 'claude');
      expectNoLiveHtml(body);
      expect(body).not.toContain(absent);
    });
  });
});

describe.each(['gemini', 'claude'] as const)('fidelity layer — Deep Research on %s', source => {
  function reportBody(text: string, url: string): string {
    const data = conversation([{ role: 'assistant', content: `<p>${toHtmlText(text)}</p>` }], {
      source,
      type: 'deep-research',
      links: { sources: [{ index: 0, url, title: text, domain: 'example.com' }] },
    });
    return bodyOf(data, BASE_OPTIONS);
  }

  it.each(TEXT_PAYLOADS)('report text and Source title — $name', ({ text }) => {
    const body = reportBody(text, 'https://example.com/source');
    expect(body).toContain('# References');
    expectNoLiveHtml(body);
  });

  it.each([
    'https://example.com/a)<img src=//evil/x>',
    'https://example.com/a b\\<iframe src=//evil\\>',
    'https://u)ser@example.com/<img src=//evil/x>',
    'https://[::1]:8080/a(<img src=//evil/x>)',
    'javascript:alert(1)',
  ])('Source URL %s', url => {
    expectNoLiveHtml(reportBody('Title', url));
  });
});

// ---------------------------------------------------------------------------
// Seam 2: boundary
// ---------------------------------------------------------------------------

const SETTINGS: ExtensionSettings = {
  ...DEFAULT_SYNC_SETTINGS,
  obsidianApiKey: 'test-key',
  templateOptions: BASE_OPTIONS,
};

function noteWithBody(body: string): ObsidianNote {
  return {
    fileName: 'seam.md',
    frontmatter: {
      id: 'gemini_seam539',
      title: 'Boundary seam',
      source: 'gemini',
      url: 'https://gemini.google.com/app/seam539',
      created: '2026-10-24T00:00:00Z',
      modified: '2026-10-24T00:00:00Z',
      tags: ['ai-conversation'],
      message_count: 2,
    },
    body,
    contentHash: 'seam',
    images: [],
  };
}

/** The written body: everything after the closing frontmatter fence. */
function writtenBody(body: string): string {
  const content = generateNoteContent(noteWithBody(body), SETTINGS);
  const fence = '\n---\n';
  return content.slice(content.indexOf(fence) + fence.length);
}

/** Frames the raw payload as the extension would place a message line. */
const FRAMES: readonly Form[] = [
  ['bare', p => p],
  [
    'callout',
    p =>
      `> [!NOTE] Gemini\n${p
        .split('\n')
        .map(line => `> ${line}`)
        .join('\n')}`,
  ],
  ['referenced footnote definition', p => `a[^1]\n\n[^1]: ${p}`],
  ['unreferenced footnote definition', p => `[^1]: ${p}`],
  ['inline footnote', p => `before ^[a ${p}] after`],
  ['inline footnote in an image alt', p => `![a ^[${p}]](u)`],
  ['nested inline footnote', p => `a ^[x ^[${p}]] b`],
];

/**
 * How a renderer that keeps what markdown-it loses would read the body.
 * markdown-it-footnote 4.0.0 drops a nested inline footnote's content, so the
 * oracle alone could never see it; read unnested, it is part of the outer one.
 */
function keepNestedFootnote(body: string): string {
  return body.replace('a ^[x ^[', 'a ^[x ').replace(/\]\] b/, '] b');
}
describe.each(FRAMES)(
  'boundary — raw payload, %s, through generateNoteContent()',
  (_frame, place) => {
    it.each(TEXT_PAYLOADS)('$name', ({ text }) => {
      expect(rawHtml(keepNestedFootnote(writtenBody(place(text))))).toEqual([]);
    });
  }
);

// ---------------------------------------------------------------------------
// Seam 3: alt and title, the §2 mechanical form
// ---------------------------------------------------------------------------

/** True when every `<` and `>` is preceded by an odd run of backslashes. */
function isMechanicallyEscaped(source: string): boolean {
  return [...source.matchAll(/(\\*)[<>]/g)].every(([, run]) => run.length % 2 === 1);
}

function countAttributeTokens(tokens: readonly Token[] | null | undefined): number {
  let count = 0;
  for (const token of tokens ?? []) {
    if (token.type === 'image') count++;
    if ((token.type === 'image' || token.type === 'link_open') && token.attrGet('title') !== null)
      count++;
    count += countAttributeTokens(token.children);
  }
  return count;
}

/**
 * Assert the mechanical form on the Markdown source of every image alt and
 * every link or image title. The spans are read from the source; the token
 * stream proves the reader found exactly the attributes markdown-it parsed.
 */
function expectAttributesEscaped(body: string): void {
  const alts = [...body.matchAll(/!\[((?:\\.|[^\\\]])*)\]\(/g)].map(([, alt]) => alt);
  const titles = [...body.matchAll(/ "((?:\\.|[^\\"])*)"\)/g)].map(([, title]) => title);
  const spans = [...alts, ...titles];
  expect(spans.length).toBe(countAttributeTokens(oracle.parse(body, { html: [] })));
  for (const span of spans) expect(isMechanicallyEscaped(span), span).toBe(true);
}
