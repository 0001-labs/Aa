import { expect, test } from 'vite-plus/test'
import { createCommentsView, memoryCommentStore } from '../src/index'

test('comments on a read-only host surface without enabling document editing', async () => {
 const host=document.createElement('article'), panel=document.createElement('section')
 host.textContent='Cloud models'; document.body.append(host,panel)
 const store=memoryCommentStore({me:{id:'owner',name:'Owner'},panel})
 const view=createCommentsView(host,{store,value:()=>host.textContent!,selection:()=>({start:0,end:5}),selectRange:()=>{},decorate:()=>{},readOnly:()=>false})
 expect(view.start()).toBe(true)
 const field=panel.querySelector('textarea')!
 field.value='Keep them private';field.dispatchEvent(new Event('input',{bubbles:true}))
 field.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))
 await new Promise(resolve=>setTimeout(resolve,20))
 expect(store.threads[0]?.quote).toBe('Cloud')
 expect(host.textContent).toBe('Cloud models')
 expect(host.isContentEditable).toBe(false)
 view.destroy();expect(panel.children.length).toBe(0);host.remove();panel.remove()
})
