import { afterEach, expect, test } from 'vite-plus/test'
import { createEditor, type Editor } from '../src/editor'
let editor: Editor | undefined
afterEach(() => { editor?.destroy(); document.body.replaceChildren() })
test.each([false, true])('Escape leaves vanilla text editing with toolbar=%s', toolbar => {
 const host=document.createElement('div');document.body.append(host)
 editor=createEditor(host,{value:'Keep these words',toolbar,menus:false})
 editor.selectRange(4)
 const block=host.querySelector<HTMLElement>('.aa-block')!;block.focus()
 const event=new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true});block.dispatchEvent(event)
 expect(event.defaultPrevented).toBe(true)
 expect(host.contains(document.activeElement)).toBe(false)
 expect(window.getSelection()?.rangeCount).toBe(0)
 expect(editor.value).toBe('Keep these words')
 editor.undo();expect(editor.value).toBe('Keep these words')
})
test('Escape does not interfere with IME composition', () => {
 const host=document.createElement('div');document.body.append(host)
 editor=createEditor(host,{value:'Keep these words',toolbar:false,menus:false});editor.selectRange(4)
 const block=host.querySelector<HTMLElement>('.aa-block')!;block.focus()
 const event=new KeyboardEvent('keydown',{key:'Escape',isComposing:true,bubbles:true,cancelable:true});block.dispatchEvent(event)
 expect(event.defaultPrevented).toBe(false);expect(document.activeElement).toBe(block)
})
