import { describe, expect, it } from 'vitest'
import { layoutDiagram } from '../src/diagram-language'
import { addGroup, addJoin, colorTarget, deleteTarget, freeName, moveGroup, referenceOf, renameTarget } from '../src/diagram-edit'

const SOURCE = '# Flow\n\n[Idea] @ 0 3\n\nWork @ 6 3 pink\n  Plan\n  Build light-blue\n\nIdea -> Work\nIdea -> Plan -> Build'

describe('a diagram written back from its drawing', () => {
  it('says where each group and line is written', () => {
    const diagram = layoutDiagram(SOURCE)
    expect(diagram.groups.map(({ kind, line, end, name }) => ({ kind, line, end, name }))).toEqual([
      { kind: 'box', line: 3, end: 3, name: undefined },
      { kind: 'stack', line: 5, end: 7, name: 'Work' },
    ])
    expect(diagram.groups[1].boxes).toEqual([{ text: 'Plan', line: 6 }, { text: 'Build', line: 7, color: 'light-blue' }])
    expect(diagram.groups[1]).toMatchObject({ x: 6, y: 3, w: 4, h: 3, placed: true, color: 'pink' })
    expect(diagram.joins).toEqual([
      { line: 9, from: 'Idea', to: 'Work' },
      { line: 10, from: 'Idea', to: 'Plan' },
      { line: 10, from: 'Plan', to: 'Build' },
    ])
    expect(layoutDiagram('[A]').groups[0]).toMatchObject({ placed: false, x: 0, y: 0 })
  })

  it('moves a group by writing its place, and nothing else', () => {
    const diagram = layoutDiagram(SOURCE)
    expect(moveGroup(SOURCE, diagram, 0, 2, 8).split('\n')[2]).toBe('[Idea] @ 2 8')
    expect(moveGroup(SOURCE, diagram, 1, 10, 3).split('\n')[4]).toBe('Work @ 10 3 pink')
    const flowing = '[A]\n[B]'
    expect(moveGroup(flowing, layoutDiagram(flowing), 1, 4, 6)).toBe('[A]\n[B] @ 4 6')
    const month = 'Oct (2026-10) @ 0 0\n  pink 1 2'
    expect(moveGroup(month, layoutDiagram(month), 0, 8, 2)).toBe('Oct (2026-10) @ 8 2\n  pink 1 2')
  })

  it('adds a box or a post-it after the groups, under the title of an empty one', () => {
    const diagram = layoutDiagram(SOURCE)
    const name = freeName(diagram, 'Idea')
    expect(name).toBe('Idea 2')
    expect(addGroup(SOURCE, diagram, 'box', name, 0, 8).split('\n')[7]).toBe('[Idea 2] @ 0 8')
    expect(addGroup('# Only a title', layoutDiagram('# Only a title'), 'post-it', 'Note', 0, 2)).toBe('# Only a title\n{Note} @ 0 2 w8')
    expect(addGroup('', layoutDiagram(''), 'box', 'Box', 2, 2)).toBe('[Box] @ 2 2')
    expect(layoutDiagram(addGroup(SOURCE, diagram, 'box', name, 0, 8)).boxes.map(box => box.text)).toContain('Idea 2')
  })

  it('draws a line as words at the end', () => {
    expect(addJoin('[A]\n[B] @ 6 0\n', 'A', 'B')).toBe('[A]\n[B] @ 6 0\nA -> B')
    expect(addJoin('[A]', 'A', 'B', '--')).toBe('[A]\nA -- B')
  })

  it('renames a box, a stack or a lone box, and the lines that reach it', () => {
    const diagram = layoutDiagram(SOURCE)
    const lone = renameTarget(SOURCE, diagram, { group: 0 }, 'Thought').split('\n')
    expect(lone[2]).toBe('[Thought] @ 0 3')
    expect(lone.slice(8)).toEqual(['Thought -> Work', 'Thought -> Plan -> Build'])
    const box = renameTarget(SOURCE, diagram, { group: 1, box: 1 }, 'Ship').split('\n')
    expect(box[6]).toBe('  Ship light-blue')
    expect(box[9]).toBe('Idea -> Plan -> Ship')
    const stack = renameTarget('Work @ 0 0\n  a\n[B] @ 6 0\nWork.a -> B', layoutDiagram('Work @ 0 0\n  a\n[B] @ 6 0\nWork.a -> B'), { group: 0 }, 'Job')
    expect(stack).toBe('Job @ 0 0\n  a\n[B] @ 6 0\nJob.a -> B')
  })

  it('colours a group, one box of a stack, or takes the colour off', () => {
    const diagram = layoutDiagram(SOURCE)
    expect(colorTarget(SOURCE, diagram, { group: 0 }, 'yellow').split('\n')[2]).toBe('[Idea] @ 0 3 yellow')
    const all = colorTarget(SOURCE, diagram, { group: 1 }, 'orange').split('\n')
    expect(all.slice(4, 7)).toEqual(['Work @ 6 3 orange', '  Plan', '  Build'])
    expect(colorTarget(SOURCE, diagram, { group: 1, box: 0 }, 'red').split('\n')[5]).toBe('  Plan red')
    expect(colorTarget(SOURCE, diagram, { group: 1 }, null).split('\n')[4]).toBe('Work @ 6 3')
    expect(layoutDiagram(colorTarget(SOURCE, diagram, { group: 0 }, 'yellow')).boxes[0].color).toBe('yellow')
  })

  it('takes a group away with every line that reached it, keeping the rest of a chain', () => {
    const diagram = layoutDiagram(SOURCE)
    expect(deleteTarget(SOURCE, diagram, { group: 0 })).toBe('# Flow\n\n\nWork @ 6 3 pink\n  Plan\n  Build light-blue\n\nPlan -> Build')
    const box = deleteTarget(SOURCE, diagram, { group: 1, box: 1 })
    expect(box).toBe('# Flow\n\n[Idea] @ 0 3\n\nWork @ 6 3 pink\n  Plan\n\nIdea -> Work\nIdea -> Plan')
    expect(layoutDiagram(box).unread).toEqual([])
  })

  it('takes one line away, either way round', () => {
    const diagram = layoutDiagram(SOURCE)
    expect(deleteTarget(SOURCE, diagram, { join: 0 }).split('\n').slice(-1)).toEqual(['Idea -> Plan -> Build'])
    expect(deleteTarget(SOURCE, diagram, { join: 1 }).split('\n').at(-1)).toBe('Plan -> Build')
    const both = '[A]\n[B] @ 6 0\nA <-> B'
    expect(deleteTarget(both, layoutDiagram(both), { join: 1 })).toBe('[A]\n[B] @ 6 0')
  })

  it('names what a line reaches', () => {
    const diagram = layoutDiagram(SOURCE)
    expect(referenceOf(diagram, { group: 0 })).toBe('Idea')
    expect(referenceOf(diagram, { group: 1 })).toBe('Work')
    expect(referenceOf(diagram, { group: 1, box: 0 })).toBe('Plan')
    const twice = 'A @ 0 0\n  x\nB @ 6 0\n  x'
    expect(referenceOf(layoutDiagram(twice), { group: 1, box: 0 })).toBe('B.x')
  })
})
