import { afterEach, describe, expect, it } from 'vite-plus/test'
import { createEditor, type Editor } from '../src/editor'
import { sidePlacement } from '../src/placement'
let editor: Editor | undefined
let frame: HTMLIFrameElement | undefined
afterEach(() => { editor?.destroy(); frame?.remove(); document.body.replaceChildren(); window.getSelection()?.removeAllRanges() })
describe('an editor in another document', () => {
  it('keeps text selection, native input, menus and dismissal in its own frame', () => {
    const outside = document.createElement('p'); outside.textContent = 'Outside'; document.body.append(outside)
    const parentRange = document.createRange(); parentRange.selectNodeContents(outside); window.getSelection()!.addRange(parentRange)
    frame = document.createElement('iframe'); document.body.append(frame)
    const doc = frame.contentDocument!, view = frame.contentWindow!
    const host = doc.createElement('div'); doc.body.append(host)
    editor = createEditor(host, { value:'Alpha\n\nBeta', toolbar:true })
    editor.selectRange(0,5)
    expect(doc.getSelection()?.toString()).toBe('Alpha')
    expect(window.getSelection()?.toString()).toBe('Outside')
    editor.selectRange(5)
    const block = host.querySelector<HTMLElement>('.aa-block')!
    block.textContent = 'Changed'
    block.dispatchEvent(new InputEvent('input', { bubbles:true, inputType:'insertText', data:'d' }))
    expect(editor.value).toContain('Changed')
    expect(doc.querySelector('aa-toolbar')).not.toBeNull()
    expect(document.querySelector('aa-toolbar')).toBeNull()
    editor.selectRange(0,7)
    view.dispatchEvent(new KeyboardEvent('keydown',{ key:'Escape', bubbles:true }))
    editor.blur()
    expect(window.getSelection()?.toString()).toBe('Outside')
  })
  it('uses the canonical bounded side target and ignores the carried block or centre', () => {
    const rects = [{left:0,right:400,top:0,bottom:20,width:400,height:20},{left:0,right:400,top:40,bottom:60,width:400,height:20}]
    expect(sidePlacement(rects,1,{x:395,y:10})).toMatchObject({index:0,at:'end'})
    expect(sidePlacement(rects,1,{x:-20,y:10})).toMatchObject({index:0,at:'start'})
    expect(sidePlacement(rects,1,{x:200,y:10})).toBeNull()
    expect(sidePlacement(rects,1,{x:0,y:45})).toBeNull()
    expect(sidePlacement(rects,1,{x:-21,y:10})).toBeNull()
  })
})
