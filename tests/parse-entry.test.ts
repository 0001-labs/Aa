// @vitest-environment node
import { test, expect } from 'vite-plus/test'
import { execFileSync } from 'node:child_process'
test('built parser loads without browser globals and strips private comment metadata', () => {
  const result = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import {parseBlocks, blockRuns, exportMarkdown} from './dist/parse.js';
    if (typeof HTMLElement !== 'undefined') throw new Error('Unexpected DOM');
    const source = '**Hello**';
    const block = parseBlocks(source)[0];
    console.log(JSON.stringify({kind:block.kind,bold:blockRuns(block).some(r=>r.bold),clean:exportMarkdown(source)}));
  `], { cwd: process.cwd(), encoding:'utf8' })
  expect(JSON.parse(result)).toEqual({kind:'paragraph',bold:true,clean:'**Hello**'})
})
