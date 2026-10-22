import { createEditor, imageAtom, memoryCommentStore, type Atom, type EditorOptions } from '../../../src/index';
import { correct, prompt } from '../../../playground-ai';
import type { ExampleSpec } from './example';

const me = { id: 'you', name: 'You' };
const people = [me, { id: 'ann', name: 'Ann Lund' }, { id: 'bo', name: 'Bo Ek' }];

/** Equations drawn with KaTeX, loaded only when an example has one. */
const drawEquation: EditorOptions['drawEquation'] = (element, tex, displayMode) => {
  let active = true;
  element.textContent = tex;
  void Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([{ default: katex }]) => {
    if (active) katex.render(tex, element, { displayMode, throwOnError: false, trust: false });
  }).catch(() => { /* The TeX source stays visible if the renderer cannot load. */ });
  return () => { active = false; };
};

/** Pictures dropped or pasted are kept in the page as data addresses: the docs have no uploads. */
function keepFiles(editor: () => ReturnType<typeof createEditor> | undefined): EditorOptions['onFiles'] {
  return async files => {
    const instance = editor();
    if (!instance) return;
    for (const file of files) {
      const selection = instance.selection();
      if (!selection || instance.readOnly) return;
      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const name = file.name.replace(/[\[\]\n]/g, '');
      const before = instance.value.slice(0, selection.start), after = instance.value.slice(selection.end);
      instance.replace(selection.start, selection.end, `${before && !before.endsWith('\n\n') ? '\n\n' : ''}${/^(image|audio|video)\//.test(file.type) ? '!' : ''}[${name}](${url})${after && !after.startsWith('\n\n') ? '\n\n' : ''}`);
    }
  };
}

async function mount(figure: HTMLElement) {
  const spec = JSON.parse(figure.dataset.aaExample!) as Omit<ExampleSpec, 'title' | 'hint' | 'source'>;
  const host = figure.querySelector<HTMLElement>('.aa-example-editor')!;
  const stored = figure.querySelector<HTMLElement>('.aa-example-source');
  const atoms: Atom[] = [imageAtom];
  if (spec.diagram || /```diagram/.test(spec.markdown)) atoms.push((await import('../../../src/diagram')).diagramAtom);
  let comments: ReturnType<typeof memoryCommentStore> | undefined;
  if (spec.comments) {
    const now = Date.now();
    comments = memoryCommentStore({
      me, people, delay: 150,
      threads: spec.comments.map((thread, index) => {
        const from = spec.markdown.indexOf(thread.quote);
        const author = people.find(person => person.name === thread.author) ?? people[1];
        const at = now - (index + 2) * 3_600_000;
        return { id: `t${index}`, from, to: from + thread.quote.length, quote: thread.quote, createdAt: at, updatedAt: at,
          comments: [{ id: `c${index}`, author, body: thread.body, createdAt: at }],
          ...(thread.resolved ? { resolvedAt: at, resolvedBy: me } : {}) };
      }),
    });
    const panel = figure.querySelector<HTMLElement>('.aa-example-comments');
    if (spec.commentsPanel && panel) { panel.hidden = false; comments.panel = panel; }
  }
  let editor: ReturnType<typeof createEditor> | undefined;
  editor = createEditor(host, {
    partials: true,
    value: spec.markdown,
    toolbar: spec.toolbar ?? true,
    readOnly: spec.readOnly,
    placeholder: spec.placeholder,
    atoms,
    comments,
    drawEquation,
    onFiles: keepFiles(() => editor),
    ...(spec.ai ? { prompt, correct } : { correcting: false }),
    onChange: markdown => { if (stored) stored.textContent = markdown; },
  });
  if (stored) stored.textContent = editor.value;
}

/** Puts the editor into every example on the page, once. */
export function mountExamples() {
  for (const figure of document.querySelectorAll<HTMLElement>('[data-aa-example]:not([data-mounted])')) {
    figure.dataset.mounted = '';
    void mount(figure);
  }
}
