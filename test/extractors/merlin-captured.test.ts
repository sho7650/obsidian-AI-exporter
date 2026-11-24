/**
 * The project chat `/chat/776397b1-…` as captured from the live site on
 * 2026-11-24 (REQ-merlin-extractor §3.9–§3.12, acceptance criterion "no project
 * field … empty first response skipped … no empty citation markers"). Utility
 * classes and svg bodies are stripped; the structure is verbatim, including the
 * agent-step accordion that sits between the response bodies.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MerlinExtractor } from '../../src/content/extractors/merlin';
import { conversationToNote } from '../../src/content/markdown';
import { DEFAULT_SYNC_SETTINGS, DEFAULT_TEMPLATE_OPTIONS } from '../../src/lib/settings-schema';
import { clearFixture, resetLocation } from '../fixtures/dom-helpers';
import { setMerlinLocation } from '../fixtures/merlin-dom';

const ICON = (model: string): string =>
  `<img alt="${model} ai model's icon" loading="lazy" src="https://cdn.jsdelivr.net/gh/foyer-work/cdn-files@latest/models/companies/openai.webp">`;

const PROJECT_CHAT = `
<nav aria-label="breadcrumb" data-slot="breadcrumb"><ol data-slot="breadcrumb-list">
  <li data-slot="breadcrumb-item"><a href="/chat/projects"><span>Projects</span></a></li>
  <li data-slot="breadcrumb-item"><a href="/chat/projects/05e78bf4"><span>Test</span></a></li>
  <li data-slot="breadcrumb-item"><span data-slot="breadcrumb-page" role="link" aria-disabled="true" aria-current="page"><span><div><div class="items-center"><span class="text-sm">Progetto in Merlin Cosa Posso Fare</span><svg></svg></div></div></span><span></span></span></li>
</ol></nav>
<div class="chat-messages-area">
<article data-message-id="373b830e" class="ml-auto grid"><div class="grid"><div class="ml-auto grid"><div><p class="whitespace-pre-wrap"><span>Cosa posso fare con un progetto in Merlin?</span></p></div></div><div class="select-none"><button><svg></svg></button></div></div></article>
<article data-message-id="60a3dcda" class="grid"><div class="items-center"><span class="items-center">${ICON('claude-sonnet-5.5')}<span class="text-sm">Claude Sonnet 5.5</span></span></div><div class="grid"><div><div><div class="chat-reply-markdown"></div></div><div class="select-none mt-2 items-center"><div class="select-none items-center text-sm"><button disabled=""><svg></svg></button><span class="items-center">1<span>/</span>2</span><button><svg></svg></button></div></div></div></div></article>
<article data-message-id="b873170c" class="ml-auto grid"><div class="grid"><div class="ml-auto grid"><div><p class="whitespace-pre-wrap"><span>cosa si può fare con i progetti in un chatbot?</span></p></div></div></div></article>
<article data-message-id="7d23ffd2" class="grid"><div class="items-center"><span class="items-center">${ICON('gpt-6-luna')}<span class="text-sm">GPT 6 Luna</span></span></div><div class="grid"><div><div><div class="chat-reply-markdown"><div><p>Con un progetto puoi tenere insieme <span class="font-semibold" data-streamdown="strong">file, istruzioni e memoria condivisa</span> per lavorare su un tema.</p></div></div></div><div class="select-none mt-2 items-center"><button>1</button></div></div></div></article>
<article data-message-id="cbcf2c34" class="ml-auto grid"><div class="grid"><div class="ml-auto grid"><div><p class="whitespace-pre-wrap"><span>trovami sul web qualche esempio e dammi le citazioni</span></p></div></div></div></article>
<article data-message-id="066f00e6" class="grid"><div class="items-center"><span class="items-center">${ICON('gpt-6-luna')}<button class="items-center" aria-expanded="true"><span class="text-sm">GPT 6 Luna</span><svg></svg></button></span></div><div class="grid"><div><div>
  <div class="grid"></div><div class="chat-reply-markdown"></div>
  <div class="grid"><div data-slot="chat-accordion" class="select-none"><div data-state="open" data-slot="chat-accordion-item"><h3><button data-slot="chat-accordion-trigger" class="items-center text-sm"><span><span class="text-sm" torph-root=""><span torph-item="">Searched</span><span torph-item="">&nbsp;</span><span torph-item="">the</span><span torph-item="">&nbsp;</span><span torph-item="">web</span></span></span></button></h3><div data-state="open" role="region" data-slot="chat-accordion-content" class="text-sm"><span class="text-sm">Merlin AI Projects feature files</span><button class="select-none items-center">5 Results</button><a rel="noopener noreferrer nofollow" target="_blank" href="https://help.openai.com/en/articles/10169521-projects-in-chatgpt"><span>Projects in ChatGPT | OpenAI Help Center</span><span>help.openai.com</span></a></div></div></div></div>
  <div class="grid"><div data-slot="chat-accordion" class="select-none"><div data-state="closed" data-slot="chat-accordion-item"><h3><button data-slot="chat-accordion-trigger" class="items-center text-sm"><span class="text-sm">Thought</span></button></h3></div></div></div>
  <div class="chat-reply-markdown"></div>
  <div class="chat-reply-markdown"><div><p>Ho trovato una <span class="font-semibold" data-streamdown="strong">pagina ufficiale di Merlin</span> e una guida:</p><ul data-streamdown="unordered-list">
<li data-streamdown="list-item"><span class="font-semibold" data-streamdown="strong">Merlin Projects — panoramica:</span> presenta i Progetti come uno spazio per file. <sup class="not-prose citation-shimmer select-none"></sup></li>
<li data-streamdown="list-item"><span class="font-semibold" data-streamdown="strong">Guida Merlin:</span> spiega i Vaults e i Projects. <sup class="not-prose citation-shimmer select-none"></sup></li>
</ul><p>In breve: carichi materiali e poi chiedi al chatbot di riassumerli.</p></div></div>
</div></div></div></article>
<div><div>
<article data-message-id="a65fb620" class="ml-auto grid"><div class="grid"><div class="ml-auto grid"><div><p class="whitespace-pre-wrap"><span>scrivimi i passaggi per la risoluzione dell’equazione 2x +3 = 9</span></p></div></div></div></article>
<article data-message-id="d31786e8" class="grid"><div class="items-center"><span class="items-center">${ICON('gpt-6-luna')}<span class="text-sm">GPT 6 Luna</span></span></div><div class="grid"><div><div><div class="chat-reply-markdown"><div><ol data-streamdown="ordered-list">
<li data-streamdown="list-item">
<p>Sottrai 3 da entrambi i membri: $$2x + 3 - 3 = 9 - 3$$<br>
quindi $$2x = 6$$</p>
</li>
<li data-streamdown="list-item">
<p>Dividi entrambi i membri per 2: $$x = \\frac{6}{2}$$</p>
</li>
<li data-streamdown="list-item">
<p><span class="font-semibold" data-streamdown="strong">Risultato:</span> $$x = 3$$</p>
</li>
</ol></div></div></div><div class="select-none mt-2 items-center"><button>1</button></div></div></div></article>
</div><div>Merlin can make mistakes. See <button>Cookie Preferences.</button></div></div>
</div>`;

describe('MerlinExtractor on a captured project chat', () => {
  beforeEach(() => {
    clearFixture();
    setMerlinLocation('776397b1-e100-44c7-a1bd-20f72ca9f76b');
    document.body.innerHTML = PROJECT_CHAT;
  });

  afterEach(() => {
    clearFixture();
    resetLocation();
  });

  async function exportNote() {
    const extractor = new MerlinExtractor();
    extractor.applySettings(DEFAULT_SYNC_SETTINGS);
    const result = await extractor.extract();
    expect(result.success, result.error).toBe(true);
    return conversationToNote(result.data!, DEFAULT_TEMPLATE_OPTIONS);
  }

  it('titles the note after the chat and exports no project field', async () => {
    const note = await exportNote();

    expect(note.frontmatter.title).toBe('Progetto in Merlin Cosa Posso Fare');
    expect(note.frontmatter.source).toBe('merlin');
    expect(note.frontmatter.id).toBe('merlin_776397b1-e100-44c7-a1bd-20f72ca9f76b');
    expect(Object.keys(note.frontmatter)).not.toContain('project');
    expect(JSON.stringify(note.frontmatter)).not.toContain('Test');
  });

  it('extracts every message, skipping the empty first response', async () => {
    const note = await exportNote();

    expect(note.frontmatter.message_count).toBe(7); // 4 user + 3 assistant (1 empty skipped)
    expect(note.body.match(/\[!QUESTION\] User/g)).toHaveLength(4);
    expect(note.body.match(/\[!NOTE\] Merlin/g)).toHaveLength(3);
  });

  it('labels every response "Merlin", whatever model the header shows', async () => {
    const { body } = await exportNote();

    expect(body).not.toContain('GPT 6 Luna');
    expect(body).not.toContain('Claude Sonnet');
  });

  it('leaves out the agent steps, their sources and the version pager', async () => {
    const { body } = await exportNote();

    expect(body).not.toContain('Searched');
    expect(body).not.toContain('Thought');
    expect(body).not.toContain('Results');
    expect(body).not.toContain('help.openai.com');
    expect(body).not.toContain('1/2');
    expect(body).toContain('Ho trovato una **pagina ufficiale di Merlin**');
  });

  it('leaves no empty citation markers behind', async () => {
    const { body } = await exportNote();

    expect(body).not.toContain('citation');
    expect(body).toContain('presenta i Progetti come uno spazio per file.');
  });

  it('exports the four raw $$…$$ formulas of the last turn as inline math, TeX verbatim', async () => {
    const { body } = await exportNote();

    expect(body).toContain('$2x + 3 - 3 = 9 - 3$');
    expect(body).toContain('$2x = 6$');
    expect(body).toContain('$x = \\frac{6}{2}$');
    expect(body).toContain('$x = 3$');
    expect(body).not.toContain('$$');
  });

  it('keeps the cookie footer out of the note', async () => {
    const { body } = await exportNote();

    expect(body).not.toContain('Cookie');
    expect(body).not.toContain('can make mistakes');
  });
});
