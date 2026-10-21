import type { ExampleSpec } from '../example';

// Every diagram here is written in the language of src/diagram-language.ts, as its tests write it.
export default {
  // Diagrams
  'diagram-start': {
    title: 'A diagram among the writing',
    hint: 'Press the diagram for its squares and its tools; the Markdown beside it changes as you draw.',
    diagram: true,
    markdown: 'A diagram stands among the writing as any block does.\n\n```diagram\n[Idea]\n[Plan] @ 6 0\nIdea -> Plan\n```\n\nThe writing goes on under it.',
  },
  'diagram-loop': {
    title: 'Groups, boxes and a line',
    hint: 'A title, a group of three boxes, a lone box and a group under it, joined by a line.',
    diagram: true,
    markdown: '```diagram\n# Writing a page\n\nSources @ 0 3\n  Notes\n  Interviews\n  Figures\n\n[Draft] @ 6 3\n\nReview @ 6 6\n  Editor\n\nDraft -- Review\n```',
  },
  'diagram-wrap': {
    title: 'Fit the width',
    hint: 'Written with wrap, the row is laid out again in strips that fit the width it is read in.',
    diagram: true,
    markdown: '```diagram wrap\n[Write] @ 0 0\n[Check] @ 6 0\n[Correct] @ 12 0\n[Publish] @ 18 0\n[Share] @ 24 0\nWrite -> Check -> Correct -> Publish -> Share\n```',
  },
  'diagram-chart': {
    title: 'A chart and a month in marker',
    hint: 'Charts and squares coloured with a marker load their drawing only when a diagram has one.',
    diagram: true,
    markdown: '```diagram\nRain and sun (chart 12x6) @ 0 0\n  Jan Dec\n  0 50 100\n  light-blue 80 62 41 30 45 92\n  orange 40 35 20 12 18 50\n```\n\n```diagram\nOctober (2026-10 marker) @ 0 0\n  M T W T F S S\n  pink 1 5 8 12\n  yellow 19-23\n```',
  },

  // Drawing on the board
  'board-draw': {
    title: 'Drawing by hand',
    hint: 'Carry Item or Note out of the tools onto a square, drag a box to move it, and pull a chosen box’s grip to widen it.',
    diagram: true,
    markdown: '```diagram\n[Idea] @ 0 0\n[Plan] @ 6 0\nIdea -> Plan\n```',
  },
  'board-lines': {
    title: 'Lines, arrows and colour',
    hint: 'Press Arrow and drag from Review to Print; choose the line from Draft and press Line to make it plain; choose a box and press Colour.',
    diagram: true,
    markdown: '```diagram\n[Draft] @ 0 0\n[Review] @ 6 0\n[Print] @ 12 0\nDraft -> Review\n```',
  },
  'board-keys': {
    title: 'Drawing from the keys',
    hint: 'Bring the caret into the diagram, then Tab through it: the arrows move, Alt and the arrows size, Enter names, I adds an item.',
    diagram: true,
    markdown: 'The diagram under this line takes the keys when the caret comes into it.\n\n```diagram\nWeek @ 0 0\n  Write\n  Edit\n[Print] @ 6 0\nWeek -> Print\n```\n\nArrows with nothing chosen go on through the writing.',
  },
  'board-ask': {
    title: 'Asking AI on a diagram',
    hint: 'Press the diagram, then Space, and ask, for example, “add a step for printing after Review”.',
    diagram: true,
    ai: true,
    markdown: '```diagram\n[Draft] @ 0 0\n[Review] @ 6 0\nDraft -> Review\n```',
  },

  // The language
  'language-groups': {
    title: 'Groups and boxes',
    hint: 'A title, a group named over its boxes, and a lone box in brackets, each placed with @.',
    diagram: true,
    markdown: '```diagram\n# Groups and boxes\n\nKitchen @ 0 3\n  Kettle\n  Toaster\n\n[Pantry] @ 6 3\n```',
  },
  'language-flow': {
    title: 'Groups with no place',
    hint: 'Without @ each group takes the next column along, and the row starts again under the tallest.',
    diagram: true,
    markdown: '```diagram\n// No places: each group takes the next column along.\nMonday\n  Write\n  Edit\nTuesday\n  Print\nWednesday\n  Post\n```',
  },
  'language-lines': {
    title: 'Lines and arrows',
    hint: 'Two dashes join, -> ends in an arrow and <-> in two.',
    diagram: true,
    markdown: '```diagram\n[Request] @ 0 0\n[Server] @ 6 0\n[Cache] @ 12 0\n[Database] @ 6 4\nRequest -> Server\nServer <-> Cache\nServer -- Database\n```',
  },
  'language-names': {
    title: 'One box among two of a name',
    hint: 'Group.Box names one box where two groups hold boxes called the same; <- points back.',
    diagram: true,
    markdown: '```diagram\nBefore @ 0 0\n  Draft\nAfter @ 8 0\n  Draft\nAfter.Draft <- Before.Draft\n```',
  },
  'language-colours': {
    title: 'Colours',
    hint: 'A colour after a name fills a group’s boxes; one as a box’s last word fills that box alone.',
    diagram: true,
    markdown: '```diagram\nSign-in @ 0 0 white\n  Email light-green\n  Passkeys yellow\n  Phone red\n  Pink\n[Done] @ 6 0 light-green\n[Waiting] @ 6 2 yellow\n[Missing] @ 6 4 red\n```',
  },
  'language-sizes': {
    title: 'Widths',
    hint: 'A box is an item, four squares across; w8 makes it two items and w12 three.',
    diagram: true,
    markdown: '```diagram\n[One item] @ 0 0\n[Two items] @ 0 2 w8\nWide @ 0 4 w12\n  Three items across\n```',
  },
  'language-post-it': {
    title: 'A post-it',
    hint: 'Braces make a post-it, twelve squares a side, holding the groups placed on it.',
    diagram: true,
    markdown: '```diagram\n{Ship} @ 0 0 pink\nProducts @ 1 3\n  Website\n  Shop\nHosting @ 6 3\n  Workers\nProducts -> Hosting\n```',
  },
  'language-month': {
    title: 'A month',
    hint: 'A day a square from Monday, its days named on a row of their own, and the days that wear a colour.',
    diagram: true,
    markdown: '```diagram\nOctober (2026-10) @ 0 0\n  Mo Tu We Th Fr Sa Su\n  pink 1 5 8 12 15\n  yellow 19-23\n```',
  },
  'language-grid': {
    title: 'A grid of squares',
    hint: 'Five columns of three rows, the columns named over them and the lines named down the side.',
    diagram: true,
    markdown: '```diagram\nWeek (5x3) @ 0 0\n  Mon Tue Wed Thu Fri\n  09 12 15 18\n  light-green 1-2 4\n  pink 3:2-3\n  light-blue 5:1\n```',
  },
  'language-grid-states': {
    title: 'Long column names',
    hint: 'A column’s name longer than three letters slants up and to the right, so its column stays one square wide.',
    diagram: true,
    markdown: '```diagram\n(3x2) @ 0 0\n  Website Phone Watch\n  light-green 1\n  yellow 2:1\n  red 3:2\n```',
  },
  'language-chart': {
    title: 'A line chart',
    hint: 'The names along its foot, the values ruled across it, then one line a colour, a value a point.',
    diagram: true,
    markdown: '```diagram\nReaders a week (chart 12x6) @ 0 0\n  May Oct\n  0 10 20\n  orange 3.4 3.8 6 11 17.9\n  light-blue 5.4 5 4.2 4 3.9\n```',
  },
  'language-marker': {
    title: 'Squares in marker',
    hint: 'marker inside the brackets colours the squares in with a felt tip rather than as chips.',
    diagram: true,
    markdown: '```diagram\nSeptember (12x4 marker) @ 0 0\n  pink 1-4 7-9\n  light-green 5:1-2 6\n```',
  },
} satisfies Record<string, ExampleSpec>;
