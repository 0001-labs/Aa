/**
 * What a product copies from Aa with Sync 1 (`sync1`): the built editor, its
 * styles and types, into a folder the copy owns whole. Aa is built first.
 * aa.css comes with the Design system 1 sheets it imports, in ds1/.
 * `entries` adds the optional builds: react, collaboration, convex, diagram.
 * A diagram brings its language (diagram-language.js, which a page or a
 * server can read alone) and its marker drawing (marker.js) with it.
 */
const optional = ['react', 'collaboration', 'convex', 'diagram', 'diagram-language', 'marker']
// The maps are not copied, so the lines pointing at them go too, and the
// optional entries import the core from beside them rather than the package.
const script = text => text.toString().replace(/\n?\/\/# sourceMappingURL=\S*\s*$/, '\n').replace(/from\s*["']@0001(?:-labs)?\/aa["']/g, 'from "./aa.js"')
const types = text => text.toString().replace(/from\s*["']@0001(?:-labs)?\/aa["']/g, 'from "./index"')

export default {
  exports: {
    build: {
      owned: true,
      build: ({ run }) => run('vp', ['run', 'build']),
      files({ read, tree, exists, options }) {
        const entries = [...(options.entries ?? [])]
        if (entries.includes('diagram')) for (const part of ['diagram-language', 'marker']) if (!entries.includes(part)) entries.push(part)
        for (const entry of entries) if (!optional.includes(entry)) throw new Error(`Aa has no entry "${entry}"; it has ${optional.join(', ')}`)
        if (!exists('dist/aa.js')) throw new Error('Aa is not built: run vp run build in Aa')
        const files = new Map([
          ['aa.js', script(read('dist/aa.js'))],
          ['aa.css', read('src/aa.css')],
          ['fonts/aa-mono.woff2', read('src/fonts/aa-mono.woff2')],
          ['fonts/inter-arrows.woff2', read('src/fonts/inter-arrows.woff2')],
          ['fonts/LICENSE.md', read('src/fonts/LICENSE.md')],
          ['aa.d.ts', "export * from './index';\n"],
        ])
        // aa.css imports Design system 1's context bar from beside it.
        for (const [file, content] of tree('src/ds1', { only: /^[^/]+\.css$/ })) files.set(`ds1/${file}`, content)
        for (const entry of entries) files.set(`${entry}.js`, script(read(`dist/${entry}.js`)))
        const skipped = optional.filter(entry => !entries.includes(entry)).map(entry => `${entry}.d.ts`)
        for (const [file, content] of tree('dist', { only: /^[^/]+\.d\.ts$/ })) if (!skipped.includes(file)) files.set(file, types(content))
        if (exists('LICENSE')) files.set('LICENSE', read('LICENSE'))
        return files
      },
    },
  },
}
