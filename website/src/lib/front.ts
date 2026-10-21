import { createEditor, imageAtom, memoryCommentStore, type Editor } from '../../../src/index';
import { diagramAtom } from '../../../src/diagram';
import { correct, prompt } from '../../../playground-ai';

const IMAGES = 'https://designsystem1.com/examples/images';

/** A page written as Notion's are: a picture, a callout, a table, boxes, a toggle, pictures in columns and a diagram. */
export const PAGE = `# A week in the north

![A mountain reflected in a still lake](${IMAGES}/lake.jpg)

> [!tip] How this page works
> Every piece is a block. Press a picture or a paragraph, hold it still, and carry it somewhere else. Carry a picture to another's side to stand them in columns.

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
const anchor = (quote: string) => { const from = PAGE.indexOf(quote); return { from, to: from + quote.length, quote }; };
const hour = 3_600_000, now = Date.now();

/** The advanced example: the whole editor, its bar of Read only, Undo and Redo, and Open comments. */
export function mountFront(root: HTMLElement) {
  const host = root.querySelector<HTMLElement>('.front-editor')!;
  const stored = root.querySelector<HTMLElement>('.front-source')!;
  const panel = root.querySelector<HTMLElement>('.front-comments')!;
  const comments = memoryCommentStore({
    me, people: [me, ann, bo], delay: 150,
    threads: [
      { id: 'car', ...anchor('Rent a car'), createdAt: now - 20 * hour, updatedAt: now - 2 * hour, comments: [
        { id: 'c1', author: ann, body: 'I can drive the first day.', createdAt: now - 20 * hour },
        { id: 'c2', author: bo, body: '@Ann Lund then I take the coast road.', createdAt: now - 2 * hour, mentions: [ann] },
      ] },
      { id: 'farm', ...anchor('The old farm'), createdAt: now - 30 * hour, updatedAt: now - 30 * hour, comments: [
        { id: 'c3', author: bo, body: 'They take cards now.', createdAt: now - 30 * hour },
      ] },
    ],
  });
  let editor: Editor;
  const make = (value: string) => createEditor(host, {
    value, toolbar: true, atoms: [imageAtom, diagramAtom], comments, prompt, correct,
    onChange: markdown => { stored.textContent = markdown; },
    onFiles: async files => {
      for (const file of files) {
        const at = editor.selection();
        if (!at || editor.readOnly) return;
        const url = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
        editor.replace(at.start, at.end, `\n\n${/^(image|audio|video)\//.test(file.type) ? '!' : ''}[${file.name.replace(/[\[\]\n]/g, '')}](${url})\n\n`);
      }
    },
  });
  editor = make(PAGE);
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
