// @vitest-environment node
import { expect, test } from 'vite-plus/test';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const { default: exports } = await import(pathToFileURL(resolve('sync.exports.mjs')).href);
const entries = ['react', 'collaboration', 'convex', 'diagram', 'partial-reader', 'comments-markdown', 'parse'];
function files(script: string) {
  return exports.exports.build.files({
    options: { entries }, exists: () => true,
    read: (path: string) => path.endsWith('.js') ? Buffer.from(script) : Buffer.from(path),
    tree: (path: string) => path === 'dist' ? new Map([['index.d.ts', 'export interface Editor {}']]) : new Map([['context.css', ':root { color: inherit; }']]),
  });
}
const hashes = (output: Map<string, string | Buffer>) => [...output].map(([path, data]) => [path, createHash('sha256').update(data).digest('hex')]);
test('all exported entry hashes agree across physical and symlinked dependency paths', () => {
  const physical = '//#region node_modules/.pnpm/lit@1/node_modules/lit/index.js\nconst value = 1;\n//#endregion\n';
  expect(hashes(files(physical.replace('//#region node_modules/', '//#region ../../../Aa/node_modules/')))).toEqual(hashes(files(physical)));
});
test('keeps license comments, source regions and executable literal contents byte-for-byte', () => {
  const content = '/*! @license keep ../Aa/node_modules/LICENSE */\n//#region src/editor.ts\nconst text = `\n//#region ../../../Aa/node_modules/lit/index.js\n`;\nconst quoted = "//#region ../../../Aa/node_modules/lit/index.js";\n// A source comment about ../../../Aa/node_modules stays.\n//#endregion\n';
  expect(files(content).get('aa.js')).toBe(content);
});
test('normalizes each dependency region without changing its package-relative identity', () => {
  const content = '//#region ../../../Aa/node_modules/.pnpm/a@1/node_modules/a/index.js\nconst a = 1;\n//#endregion\n//#region ../../node_modules/b/index.js\nconst b = 2;\n//#endregion\n';
  expect(files(content).get('aa.js')).toBe(content.replace('../../../Aa/', '').replace('../../node_modules/', 'node_modules/'));
});
test('retains existing map removal and local optional-entry imports', () => {
  const content = 'export { editor } from "@0001-labs/aa";\n//# sourceMappingURL=entry.js.map\n';
  expect(files(content).get('react.js')).toBe('export { editor } from "./aa.js";\n');
  expect(files(content).get('fonts/LICENSE.md')).toEqual(Buffer.from('src/fonts/LICENSE.md'));
});
