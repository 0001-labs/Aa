import { createEditor, imageAtom, memoryCommentStore, type Editor } from '../../../src/index';
import { SAMPLE } from '../../../playground-sample';
import { diagramAtom } from '../../../src/diagram';
import { correct, prompt } from '../../../playground-ai';

const IMAGES = 'https://designsystem1.com/examples/images';

/** The advanced page: a picture, a callout, a table, boxes, a toggle, pictures in columns to put in order, and a diagram. */
export const PAGE = `# A week in the north

![A mountain reflected in a still lake](${IMAGES}/lake.jpg)

> [!tip] How this page works
> Every piece is a block. Press a picture or a paragraph, hold it still, and carry it somewhere else. Carry a picture to another's side to stand them in columns, and from one column to another's side to put them in order.

## The plan

| Day | Where | Stay |
| --- | --- | --- |
| Monday | The fjord | A cabin by the water |
| Wednesday | The forest | The old farm |
| Friday | The coast | Back in town |

## Before we go

- [x] Book the cabin
- [ ] Rent a car
  - [ ] Ask for snow tyres
- [ ] Pack the headphones and a book

> [!note]- What it costs
> About 900 a head, the car shared. The cabin is paid; the farm is paid on arrival.

## What it looks like

<columns>
<column>
![Sunlight falling across a forest path](${IMAGES}/forest.webp)
</column>
<column>
![A wooden chair in a bright white room](${IMAGES}/room.jpg)
</column>
<column>
![Blue headphones on a pink and mint background](${IMAGES}/headphones.jpg)
</column>
</columns>

## The route

\`\`\`diagram
[Fjord] @ 0 0
[Forest] @ 6 0
[Coast] @ 12 0
Fjord -> Forest -> Coast
\`\`\`

> Go slowly; the light stays late.`;

const me = { id: 'you', name: 'You' }, ann = { id: 'ann', name: 'Ann Lund' }, bo = { id: 'bo', name: 'Bo Ek' };
const hour = 3_600_000, now = Date.now();
type Thread = { quote: string; comments: { author: typeof ann; body: string; hours: number }[]; resolved?: boolean };

/** Each tab's page and the threads already on its words. */
const PAGES: Record<string, { markdown: string; threads: Thread[] }> = {
  playground: {
    markdown: SAMPLE,
    threads: [
      { quote: 'Each paragraph is a block of its own', comments: [
        { author: ann, body: 'Should this say what a block is for a reader who has never used one?', hours: 26 },
        { author: bo, body: 'I would keep it: the next sentence shows it.', hours: 3 },
      ] },
      { quote: 'Drag a block up or down to move it', resolved: true, comments: [{ author: bo, body: 'Say that a still press lifts it first.', hours: 50 }] },
    ],
  },
  advanced: {
    markdown: PAGE,
    threads: [
      { quote: 'Rent a car', comments: [
        { author: ann, body: 'I can drive the first day.', hours: 20 },
        { author: bo, body: 'Then I take the coast road.', hours: 2 },
      ] },
      { quote: 'The old farm', comments: [{ author: bo, body: 'They take cards now.', hours: 30 }] },
    ],
  },
};

/** One tab: the editor, its bar of Read only, Undo and Redo, and Open comments, and the Markdown beside it. */
function mountPage(root: HTMLElement, name: string) {
  const { markdown, threads } = PAGES[name];
  const host = root.querySelector<HTMLElement>('.front-editor')!;
  const stored = root.querySelector<HTMLElement>('.front-source')!;
  const panel = root.querySelector<HTMLElement>('.front-comments')!;
  const comments = memoryCommentStore({
    me, people: [me, ann, bo], delay: 150,
    threads: threads.map((thread, index) => {
      const from = markdown.indexOf(thread.quote), first = now - thread.comments[0].hours * hour, last = now - thread.comments[thread.comments.length - 1].hours * hour;
      return { id: `${name}-${index}`, from, to: from + thread.quote.length, quote: thread.quote, createdAt: first, updatedAt: last,
        comments: thread.comments.map((comment, at) => ({ id: `${name}-${index}-${at}`, author: comment.author, body: comment.body, createdAt: now - comment.hours * hour })),
        ...(thread.resolved ? { resolvedAt: last, resolvedBy: me } : {}) };
    }),
  });
  let editor: Editor;
  const make = (value: string) => createEditor(host, {
    value, toolbar: true, atoms: [imageAtom, diagramAtom], comments, prompt, correct, drawEquation,
    onChange: next => { stored.textContent = next; },
    onFiles: async files => {
      for (const file of files) {
        const at = editor.selection();
        if (!at || editor.readOnly) return;
        const url = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
        editor.replace(at.start, at.end, `\n\n${/^(image|audio|video)\//.test(file.type) ? '!' : ''}[${file.name.replace(/[\[\]\n]/g, '')}](${url})\n\n`);
      }
    },
  });
  editor = make(markdown);
  stored.textContent = editor.value;

  const readOnly = root.querySelector<HTMLButtonElement>('[data-front="readonly"]')!;
  readOnly.addEventListener('click', () => { editor.readOnly = !editor.readOnly; readOnly.setAttribute('aria-pressed', String(editor.readOnly)); });
  root.querySelector('[data-front="undo"]')!.addEventListener('click', () => { editor.undo(); stored.textContent = editor.value; });
  root.querySelector('[data-front="redo"]')!.addEventListener('click', () => { editor.redo(); stored.textContent = editor.value; });
  // Open comments: the threads in a panel beside the text, the editor made again around the same store.
  const open = root.querySelector<HTMLButtonElement>('[data-front="comments"]')!;
  open.addEventListener('click', () => {
    const on = open.getAttribute('aria-pressed') !== 'true';
    open.setAttribute('aria-pressed', String(on));
    panel.hidden = !on;
    comments.panel = on ? panel : undefined;
    const value = editor.value;
    editor.destroy();
    editor = make(value);
  });
}

/** Equations drawn with KaTeX, loaded only when the page has one. */
const drawEquation = (element: HTMLElement, tex: string, displayMode: boolean) => {
  let active = true;
  element.textContent = tex;
  void Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([{ default: katex }]) => {
    if (active) katex.render(tex, element, { displayMode, throwOnError: false, trust: false });
  }).catch(() => { /* The TeX source stays visible if the renderer cannot load. */ });
  return () => { active = false; };
};

/** Two editors sharing one document, as two people would, through a transport kept in the tab. */
function mountShared(root: HTMLElement) {
  const button = root.querySelector<HTMLButtonElement>('[data-front="share"]');
  button?.addEventListener('click', async () => {
    button.disabled = true;
    const [{ connectCollaboration }, Y] = await Promise.all([import('../../../src/collaboration'), import('yjs')]);
    const doc = new Y.Doc(), listeners = new Set<(state: Uint8Array) => void>();
    let initialized = false;
    const transport = {
      initialize: async (markdown: string) => { if (!initialized) { doc.getText('markdown').insert(0, markdown); initialized = true; } return Y.encodeStateAsUpdate(doc); },
      subscribe: (receive: (state: Uint8Array) => void) => { listeners.add(receive); return () => { listeners.delete(receive); }; },
      send: async (update: Uint8Array) => { Y.applyUpdate(doc, update); const state = Y.encodeStateAsUpdate(doc); listeners.forEach(receive => receive(state)); },
    };
    const first = createEditor(root.querySelector<HTMLElement>('.front-shared-first')!, { value: 'Write here; the second editor follows. Undo keeps the other editor’s changes.', toolbar: true });
    const second = createEditor(root.querySelector<HTMLElement>('.front-shared-second')!, { toolbar: true });
    await Promise.all([connectCollaboration(first, transport, { id: 'first' }).ready, connectCollaboration(second, transport, { id: 'second' }).ready]);
  });
}

/** The front page's tabs: each page drawn the first time its tab is chosen, and kept after. */
export function mountFront(root: HTMLElement) {
  const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  const panels = Array.from(root.querySelectorAll<HTMLElement>('[role="tabpanel"]'));
  const drawn = new Set<string>();
  const choose = (tab: HTMLButtonElement, focus = false) => {
    for (const other of tabs) { const on = other === tab; other.setAttribute('aria-selected', String(on)); other.tabIndex = on ? 0 : -1; }
    for (const panel of panels) panel.hidden = panel.id !== tab.getAttribute('aria-controls');
    const panel = panels.find(element => element.id === tab.getAttribute('aria-controls'))!;
    const name = panel.dataset.page!;
    if (!drawn.has(name)) { drawn.add(name); mountPage(panel, name); }
    if (focus) tab.focus();
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => choose(tab));
    tab.addEventListener('keydown', event => {
      const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      event.preventDefault();
      choose(tabs[(index + step + tabs.length) % tabs.length], true);
    });
  });
  mountShared(root);
  choose(tabs[0]);
}
