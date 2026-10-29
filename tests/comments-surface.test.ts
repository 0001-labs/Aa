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

test('shadow-root popup keeps focus on refresh and accepts a composed pointer press', async () => {
 const host=document.createElement('article'), portal=document.createElement('section')
 host.textContent='Cloud models'; document.body.append(host,portal)
 const shadow=portal.attachShadow({mode:'open'}), root=document.createElement('div');shadow.append(root)
 const store=memoryCommentStore({me:{id:'owner',name:'Owner'}})
 const view=createCommentsView(host,{store,root,value:()=>host.textContent!,selection:()=>({start:0,end:5}),selectRange:()=>{},decorate:()=>{},readOnly:()=>false})
 try {
  expect(view.start()).toBe(true)
  let field=root.querySelector('textarea')!
  field.value='Keep them private';field.dispatchEvent(new Event('input',{bubbles:true}));field.focus();field.setSelectionRange(4,4)
  store.put({id:'existing',from:6,to:12,quote:'models',comments:[],createdAt:1,updatedAt:1})
  field=root.querySelector('textarea')!
  expect(shadow.activeElement).toBe(field)
  expect(field.selectionStart).toBe(4)
  const send=root.querySelector<HTMLButtonElement>('[aria-label="Comment"]')!
  send.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,composed:true}))
  expect(send.isConnected).toBe(true)
  send.click()
  await new Promise(resolve=>setTimeout(resolve,20))
  expect(store.threads.some(thread=>thread.comments.some(comment=>comment.body==='Keep them private'))).toBe(true)
 } finally {view.destroy();host.remove();portal.remove()}
})

test.each(['article', 'body'] as const)('pressing unmarked content in the %s closes the comment popover', tag => {
 const host=tag === 'body' ? document.body : document.createElement('article')
 const content=document.createElement('p'); content.textContent='Cloud models'; host.append(content)
 if (tag !== 'body') document.body.append(host)
 const store=memoryCommentStore({me:{id:'owner',name:'Owner'}})
 const view=createCommentsView(host,{store,value:()=>content.textContent!,selection:()=>({start:0,end:5}),selectRange:()=>{},decorate:()=>{},readOnly:()=>false})
 try {
  expect(view.start()).toBe(true)
  expect(document.querySelector('.aa-comments')).not.toBeNull()
  content.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,composed:true}))
  expect(document.querySelector('.aa-comments')).toBeNull()
 } finally {view.destroy();content.remove();if(tag !== 'body') host.remove()}
})
