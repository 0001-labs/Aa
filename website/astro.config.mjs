// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// Aa's documentation, drawn as Design system 1's is: the features down the left in groups, each
// page a feature with the editor itself to try, and the Markdown it stores beside it.
// Built into dist/, then copied into ../site with the playground under /playground/ (`vp run site:build`).
export default defineConfig({
  site: "https://aa.0001.dev",
  // Design system 1's root stylesheet and faces, copied with Sync 1 into the package's public/ds1.
  publicDir: "../public",
  devToolbar: { enabled: false },
  vite: {
    // The examples run the editor from its own source, in ../src.
    server: { port: 5196, fs: { allow: [".."] } },
  },
  integrations: [
    starlight({
      title: "Aa",
      description: "Aa, a text editor for apps: formatted text, stored as Markdown, drawn as Design system 1's prose.",
      pagefind: false,
      expressiveCode: {
        // Long lines wrap: nothing in the docs scrolls inside itself.
        defaultProps: { wrap: true },
        // Code frames draw themselves: keep Design system 1's prose sheet out of them.
        plugins: [
          {
            name: "Not prose",
            hooks: {
              postprocessRenderedBlock: ({ renderData }) => {
                renderData.blockAst.properties.dataDsNotProse = "";
              },
            },
          },
        ],
      },
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/0001-labs/Aa" }],
      components: {
        Head: "./src/components/Head.astro",
        Header: "./src/components/Header.astro",
        Sidebar: "./src/components/Sidebar.astro",
        MarkdownContent: "./src/components/MarkdownContent.astro",
        PageTitle: "./src/components/Heading.astro",
      },
      customCss: ["./src/styles/custom.css"],
      sidebar: [
        {
          label: "Start here",
          items: [
            { label: "Overview", link: "/" },
            { label: "Install", slug: "start-here/install" },
            { label: "React", slug: "start-here/react" },
            { label: "Design system 1", slug: "start-here/design-system-1" },
          ],
        },
        {
          label: "Writing",
          items: [
            { label: "Formatting", slug: "writing/formatting" },
            { label: "Links", slug: "writing/links" },
            { label: "Headings and paragraphs", slug: "writing/headings" },
            { label: "Lists and boxes", slug: "writing/lists" },
            { label: "Quotes and code", slug: "writing/quotes-and-code" },
            { label: "Callouts and toggles", slug: "writing/callouts" },
            { label: "Tables", slug: "writing/tables" },
            { label: "Columns", slug: "writing/columns" },
            { label: "Equations", slug: "writing/equations" },
            { label: "Pictures and media", slug: "writing/media" },
          ],
        },
        {
          label: "Editing",
          items: [
            { label: "Toolbar", slug: "editing/toolbar" },
            { label: "Slash and block menus", slug: "editing/menus" },
            { label: "Selecting and moving", slug: "editing/selecting" },
            { label: "Undo", slug: "editing/undo" },
            { label: "Find and replace", slug: "editing/find" },
            { label: "Keyboard", slug: "editing/keyboard" },
            { label: "On a phone", slug: "editing/phone" },
          ],
        },
        {
          label: "AI",
          items: [
            { label: "Asking AI", slug: "ai/asking" },
            { label: "Correction while writing", slug: "ai/correction" },
          ],
        },
        {
          label: "Together",
          items: [
            { label: "Comments", slug: "together/comments" },
            { label: "Shared editing", slug: "together/shared-editing" },
          ],
        },
        {
          label: "Diagrams",
          items: [
            { label: "Diagrams", slug: "diagrams/diagrams" },
            { label: "Drawing on the board", slug: "diagrams/board" },
            { label: "The language", slug: "diagrams/language" },
          ],
        },
        {
          label: "Building",
          items: [
            { label: "Options", slug: "building/options" },
            { label: "Methods and events", slug: "building/methods" },
            { label: "Atoms", slug: "building/atoms" },
            { label: "Commands", slug: "building/commands" },
            { label: "Decorations", slug: "building/decorations" },
            { label: "Styling", slug: "building/styling" },
            { label: "Plain text", slug: "building/plain-text" },
          ],
        },
        { label: "Playground", link: "/playground/" },
      ],
    }),
  ],
});
