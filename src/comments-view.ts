/**
 * Comments drawn: the commented words marked in the text (a decoration layer
 * of their own, `comments`), and the threads on Design system 1's squares, in
 * a popover at the range or in a panel the product gives. One square a row,
 * the words on the sixteen; a 16px round avatar with the person's initial in
 * their colour; the name in the medium weight, the time relative and muted;
 * the body on 20px lines indented one square. The composer is one square high
 * and grows as a reply is written: Enter sends, Shift-Enter breaks a line,
 * and `@` opens the people menu in the Context face. Everything stands over
 * the page, as Aa's other floating pieces do, and moves by transform and
 * opacity alone.
 */

import { anchorThreads, applyEdit, commentsLabel, countThreads, initialOf, mapRange, mentionQuery, mentionsIn, movedThreads, personColour, REACTION_EMOJIS, relativeTime, relocate, sortThreads, textChange, threadsAt, type AnchoredThread, type Comment, type CommentMove, type CommentPerson, type CommentRange, type CommentStore, type CommentThread } from './comments'
import type { Decoration } from './render'
import { icons } from './icons'

export type CommentsViewOptions = {
  store: CommentStore
  /** The Markdown now. */
  value: () => string
  /** The selection as offsets into the Markdown; null when it is not in the editor. */
  selection: () => { start: number; end: number } | null
  /** Draw these on the `comments` layer. */
  decorate: (ranges: readonly Decoration[]) => void
  selectRange: (start: number, end?: number) => void
  readOnly: () => boolean
  root?: Element
}

export type CommentsView = {
  /** Open a thread: in the popover at its words, or expanded in the panel. */
  open(threadId: string): void
  /** Start a thread on the selected words; false with nothing selected or nobody to write as. */
  start(): boolean
  /** Put the popover away, or fold the panel's open thread; true when something was open. */
  close(): boolean
  /** The text changed: the anchors follow it. */
  changed(): void
  readonly threads: readonly AnchoredThread[]
  destroy(): void
}

/** How long moved anchors wait before they are given to the store, so a sentence typed is one move. */
const MOVE_DELAY = 800

const icon = (name: string): HTMLSpanElement => {
  const picture = document.createElement('span')
  picture.className = 'aa-icon'
  const svg = icons[`./icons/${name}.svg`]
  if (svg) picture.style.maskImage = `url("data:image/svg+xml,${encodeURIComponent(svg.replace(/currentColor/g, 'black'))}")`
  return picture
}

const iconButton = (label: string, name: string, action: () => void): HTMLButtonElement => {
  const node = document.createElement('button')
  node.type = 'button'; node.className = 'aa-comments-button'; node.title = label; node.setAttribute('aria-label', label)
  node.append(icon(name))
  node.addEventListener('click', event => { event.preventDefault(); action() })
  return node
}

const textButton = (label: string, action: () => void, className = ''): HTMLButtonElement => {
  const node = document.createElement('button')
  node.type = 'button'; node.className = `aa-comments-word ${className}`.trim(); node.textContent = label
  node.addEventListener('click', event => { event.preventDefault(); action() })
  return node
}

/** A person's mark: Design system 1's avatar, round and one control high, the initial lettered in their ink inside a ring of it. */
export const avatar = (person: CommentPerson): HTMLSpanElement => {
  const mark = document.createElement('span')
  mark.className = 'aa-avatar ds-avatar ds-avatar--outlined'
  mark.textContent = initialOf(person.name)
  mark.style.setProperty('--aa-person', personColour(person))
  mark.setAttribute('aria-hidden', 'true')
  return mark
}

export function createCommentsView(host: HTMLElement, options: CommentsViewOptions): CommentsView {
  const { store } = options
  const doc = host.ownerDocument, view = doc.defaultView!
  const root = options.root ?? host.closest('dialog') ?? doc.body
  const panel = store.panel ?? null
  let stored: readonly CommentThread[] = []
  let placed: AnchoredThread[] = []
  let lastValue = options.value()
  let openId: string | null = null
  /** A thread the caret left after Escape closed it: not opened again until the caret has been outside it. */
  let dismissed: string | null = null
  let draft: CommentRange | null = null
  /** A thread just added, to open once the store gives it back. */
  let awaiting: CommentRange | null = null
  let destroyed = false
  let frame = 0
  let moveTimer: ReturnType<typeof setTimeout> | undefined
  let pendingMoves = new Map<string, CommentMove>()
  let popover: HTMLElement | null = null
  let menu: HTMLElement | null = null
  const errors = new Map<string, string>()
  const busy = new Set<string>()
  /** Composers keep their words while the threads are drawn again. */
  const drafts = new Map<string, string>()
  let editing: string | null = null
  let confirming: string | null = null

  const canWrite = () => !!store.me && !options.readOnly()
  const openThread = () => placed.find(thread => thread.id === openId) ?? null

  // ----- the marks -----

  const decorate = () => {
    const ranges: Decoration[] = []
    for (const thread of placed) {
      if (thread.orphaned || thread.resolvedAt) continue
      const classes = ['aa-comment', thread.id === openId ? 'aa-comment--open' : '', thread.unread ? 'aa-comment--unread' : ''].filter(Boolean).join(' ')
      ranges.push({ from: thread.from, to: thread.to, className: classes, attributes: { 'data-comment': thread.id } })
    }
    if (draft) ranges.push({ from: draft.from, to: draft.to, className: 'aa-comment aa-comment--open aa-comment--draft', attributes: { 'data-comment': 'draft' } })
    options.decorate(ranges)
  }

  /** The boxes of a thread's words on screen. */
  const rectsOf = (id: string): DOMRect[] => Array.from(host.querySelectorAll<HTMLElement>('[data-comment]')).filter(span => (span.getAttribute('data-comment') ?? '').split(' ').includes(id)).flatMap(span => Array.from(span.getClientRects()))

  // ----- the store -----

  const queueMoves = (moves: readonly CommentMove[]) => {
    if (!store.move || !moves.length) return
    for (const move of moves) pendingMoves.set(move.id, move)
    clearTimeout(moveTimer)
    moveTimer = setTimeout(() => {
      const sending = [...pendingMoves.values()]
      pendingMoves = new Map()
      // What the store is told is what it has, so the same move is not sent twice.
      stored = stored.map(thread => { const move = sending.find(each => each.id === thread.id); return move ? { ...thread, ...move } : thread })
      void Promise.resolve(store.move!(sending)).catch(() => {})
    }, MOVE_DELAY)
  }

  const receive = (threads: readonly CommentThread[]) => {
    if (destroyed) return
    stored = threads
    placed = anchorThreads(threads, options.value())
    if (openId && !placed.some(thread => thread.id === openId)) openId = null
    if (awaiting) {
      const arrived = placed.find(thread => thread.from === awaiting!.from && thread.to === awaiting!.to && !thread.resolvedAt)
      if (arrived) { awaiting = null; draft = null; openId = arrived.id; void store.seen?.(arrived.id) }
    }
    queueMoves(movedThreads(stored, placed))
    decorate()
    render()
  }

  // ----- the text -----

  const changed = () => {
    if (destroyed) return
    const value = options.value()
    if (value === lastValue) return
    const edit = textChange(lastValue, value)
    lastValue = value
    // An orphaned thread's words may be back (undone, or the whole document come from outside): it is looked for again where the store has it.
    placed = applyEdit(placed, edit, value).map(thread => {
      if (!thread.orphaned) return thread
      const kept = stored.find(each => each.id === thread.id)
      const found = kept && relocate(kept, value)
      return found ? { ...thread, ...found, quote: kept!.quote, orphaned: false } : thread
    })
    if (draft) { const mapped = mapRange(draft, edit); draft = mapped ? { ...mapped, quote: value.slice(mapped.from, mapped.to) } : null; if (!draft) closeDraft() }
    queueMoves(movedThreads(stored, placed))
    decorate()
    render()
  }

  // ----- the caret -----

  const moved = () => {
    if (destroyed) return
    const selection = options.selection()
    if (!selection) return
    if (selection.start !== selection.end) return
    const here = threadsAt(placed, selection.start)
    if (!here.length) { dismissed = null; if (openId && !panel && !draft) { openId = null; decorate(); render() }; return }
    if (openId && here.some(thread => thread.id === openId)) return
    if (here[0].id === dismissed) return
    open(here[0].id)
  }
  const onSelectionChange = () => moved()
  const onPress = (event: Event) => {
    const target = event.target as HTMLElement | null
    const span = target?.closest?.('[data-comment]') as HTMLElement | null
    if (!span || !host.contains(span)) return
    const id = (span.getAttribute('data-comment') ?? '').split(' ').find(each => each !== 'draft')
    if (id) open(id)
  }
  host.addEventListener('aa-selectionchange', onSelectionChange)
  host.addEventListener('aa-change', changed)
  host.addEventListener('click', onPress)

  // ----- opening and closing -----

  const open = (id: string) => {
    const thread = placed.find(each => each.id === id)
    if (!thread) return
    if (draft) { draft = null; drafts.delete('draft') }
    openId = id
    dismissed = null
    editing = null; confirming = null
    if (thread.unread) void Promise.resolve(store.seen?.(id)).catch(() => {})
    decorate()
    render()
    if (panel) popover?.querySelector<HTMLElement>(`[data-thread="${id}"]`)?.scrollIntoView({ block: 'nearest' })
  }

  const closeDraft = () => { draft = null; drafts.delete('draft'); awaiting = null }

  const close = (): boolean => {
    const was = !!openId || !!draft
    if (openId) dismissed = openId
    const back = openThread()?.to ?? draft?.to
    openId = null
    closeDraft()
    editing = null; confirming = null
    hideMenu(); hidePicker()
    decorate()
    render()
    if (was && back !== undefined && !host.contains(doc.activeElement)) options.selectRange(back)
    return was
  }

  const start = (): boolean => {
    if (!canWrite()) return false
    const selection = options.selection()
    if (!selection || selection.start === selection.end) return false
    const value = options.value()
    const from = Math.min(selection.start, selection.end), to = Math.max(selection.start, selection.end)
    const quote = value.slice(from, to)
    if (!quote.trim()) return false
    openId = null
    draft = { from, to, quote }
    editing = null; confirming = null
    decorate()
    render()
    popover?.querySelector<HTMLTextAreaElement>('textarea')?.focus()
    return true
  }

  // ----- writing -----

  const refused = (key: string, error: unknown) => {
    errors.set(key, error instanceof Error && error.message ? error.message : 'Not saved')
    render()
    setTimeout(() => { if (errors.get(key)) { errors.delete(key); render() } }, 4000)
  }
  const write = async (key: string, action: () => Promise<unknown> | unknown, then?: () => void) => {
    if (busy.has(key)) return
    busy.add(key); render()
    try { await action(); then?.() } catch (error) { refused(key, error) } finally { busy.delete(key); render() }
  }

  const people = new Map<string, CommentPerson>()
  const send = (key: string, body: string) => {
    const words = body.trim()
    if (!words || !canWrite()) return
    const mentions = mentionsIn(words, [...people.values()])
    if (key === 'draft') {
      if (!draft) return
      const range = draft
      // The thread may come back from the store before `add` answers: it is awaited from now.
      awaiting = range
      void write(key, () => store.add(range, words, mentions), () => { drafts.delete('draft'); draft = null; decorate(); render() }).then(() => { if (errors.has('draft')) awaiting = null })
    } else void write(key, () => store.reply(key, words, mentions), () => { drafts.delete(key); render() })
  }

  // ----- the people menu -----

  const hideMenu = () => { menu?.remove(); menu = null }
  let menuChoices: CommentPerson[] = []
  let menuActive = 0
  let menuField: HTMLTextAreaElement | null = null
  let menuQuery: { start: number; query: string } | null = null
  let menuRequest = 0
  const choose = (person: CommentPerson) => {
    if (!menuField || !menuQuery) return
    people.set(person.id, person)
    const field = menuField, { start } = menuQuery
    const caret = field.selectionStart ?? field.value.length
    field.value = `${field.value.slice(0, start)}@${person.name} ${field.value.slice(caret)}`
    const at = start + person.name.length + 2
    field.setSelectionRange(at, at)
    field.dispatchEvent(new Event('input', { bubbles: true }))
    hideMenu()
    field.focus()
  }
  const paintMenu = () => {
    if (!menu) return
    menu.replaceChildren(...menuChoices.map((person, index) => {
      const row = doc.createElement('button')
      row.type = 'button'; row.setAttribute('role', 'option'); row.className = 'note-menu-row'
      row.setAttribute('aria-selected', String(index === menuActive))
      row.toggleAttribute('data-current', index === menuActive)
      const name = doc.createElement('span'); name.textContent = person.name
      row.append(avatar(person), name)
      row.addEventListener('pointerdown', event => event.preventDefault())
      row.addEventListener('click', () => choose(person))
      return row
    }))
    if (!menuChoices.length) { const empty = doc.createElement('span'); empty.className = 'aa-menu-empty'; empty.textContent = 'Nobody to mention'; menu.append(empty) }
  }
  const placeMenu = () => {
    if (!menu || !menuField) return
    const rect = menuField.getBoundingClientRect(), square = 20 * (parseFloat(getComputedStyle(host).getPropertyValue('--aa-sf')) || 1)
    const height = Math.max(1, Math.min(menuChoices.length, 8)) * square
    const under = rect.bottom + square / 2
    menu.style.left = `${Math.max(0, Math.min(rect.left, view.innerWidth - 8 * square))}px`
    menu.style.top = `${under + height <= view.innerHeight ? under : Math.max(0, rect.top - square / 2 - height)}px`
  }
  const askPeople = (field: HTMLTextAreaElement) => {
    if (!store.people) return
    const found = mentionQuery(field.value, field.selectionStart ?? field.value.length)
    if (!found) { hideMenu(); return }
    menuField = field; menuQuery = found
    const request = ++menuRequest
    void Promise.resolve(store.people(found.query)).then(list => {
      if (destroyed || request !== menuRequest || !menuField || menuField !== field) return
      menuChoices = list.slice(0, 8)
      for (const person of menuChoices) people.set(person.id, person)
      if (!menu) {
        menu = doc.createElement('div')
        menu.className = 'aa-controls aa-menu aa-comments-people'
        menu.setAttribute('role', 'listbox'); menu.setAttribute('aria-label', 'People to mention')
        root.append(menu)
      }
      menuActive = Math.min(menuActive, Math.max(0, menuChoices.length - 1))
      paintMenu(); placeMenu()
    }).catch(() => hideMenu())
  }
  /** The menu's keys come before the composer's: Enter chooses rather than sending. */
  const menuKeys = (event: KeyboardEvent): boolean => {
    if (!menu) return false
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); menuActive = (menuActive + (event.key === 'ArrowDown' ? 1 : menuChoices.length - 1)) % Math.max(1, menuChoices.length); paintMenu(); return true }
    if ((event.key === 'Enter' || event.key === 'Tab') && menuChoices.length) { event.preventDefault(); choose(menuChoices[menuActive]); return true }
    if (event.key === 'Escape') { event.preventDefault(); hideMenu(); return true }
    return false
  }

  // ----- drawing -----

  const grow = (field: HTMLTextAreaElement) => { field.style.height = '0px'; const height = field.scrollHeight; field.style.height = height ? `${height}px` : '' }

  const composer = (key: string, placeholder: string): HTMLElement => {
    const form = doc.createElement('form')
    form.className = 'aa-composer'
    form.setAttribute('aria-label', placeholder)
    if (store.me) form.append(avatar(store.me))
    const field = doc.createElement('textarea')
    field.rows = 1; field.placeholder = placeholder; field.setAttribute('aria-label', placeholder)
    field.value = drafts.get(key) ?? ''
    field.disabled = busy.has(key)
    field.addEventListener('input', () => { drafts.set(key, field.value); grow(field); askPeople(field) })
    field.addEventListener('keydown', event => {
      if (menuKeys(event)) return
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); send(key, field.value) }
      if (event.key === 'Escape') { event.preventDefault(); close() }
    })
    field.addEventListener('blur', () => setTimeout(() => { if (menuField === field && !menu?.contains(doc.activeElement)) hideMenu() }, 120))
    // A short arrow up, so the send reads as a press and not as a way up the page.
    const post = iconButton(key === 'draft' ? 'Comment' : 'Reply', 'send', () => send(key, field.value))
    post.classList.add('aa-composer-send')
    post.disabled = busy.has(key)
    form.append(field, post)
    form.addEventListener('submit', event => { event.preventDefault(); send(key, field.value) })
    // The field takes its height from its words once it stands on the page.
    view.requestAnimationFrame(() => grow(field))
    return form
  }

  const commentRow = (thread: AnchoredThread, comment: Comment): HTMLElement => {
    const row = doc.createElement('div')
    row.className = 'aa-comment-entry'
    const meta = doc.createElement('div')
    meta.className = 'aa-comment-meta'
    const name = doc.createElement('span'); name.className = 'aa-comment-author'; name.textContent = comment.author.name
    const time = doc.createElement('time'); time.className = 'aa-comment-time'; time.dateTime = new Date(comment.createdAt).toISOString()
    time.textContent = `${relativeTime(comment.createdAt)}${comment.editedAt ? ' · Edited' : ''}`
    time.title = new Date(comment.createdAt).toLocaleString()
    meta.append(avatar(comment.author), name, time)
    const own = !!store.me && comment.author.id === store.me.id
    if (own && store.edit && canWrite() && !thread.resolvedAt && editing !== comment.id) meta.append(textButton('Edit', () => { editing = comment.id; drafts.set(`edit:${comment.id}`, comment.body); render(); popover?.querySelector<HTMLTextAreaElement>(`[data-edit="${comment.id}"]`)?.focus() }, 'aa-comment-edit'))
    row.append(meta)
    if (editing === comment.id) {
      const field = doc.createElement('textarea')
      field.className = 'aa-comment-body aa-comment-editing'; field.setAttribute('aria-label', 'Edit comment'); field.dataset.edit = comment.id
      field.value = drafts.get(`edit:${comment.id}`) ?? comment.body
      field.rows = Math.max(1, field.value.split('\n').length)
      const save = () => { const words = field.value.trim(); if (!words) return; void write(`edit:${comment.id}`, () => store.edit!(comment.id, words), () => { editing = null; drafts.delete(`edit:${comment.id}`) }) }
      field.addEventListener('input', () => { drafts.set(`edit:${comment.id}`, field.value); grow(field) })
      field.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); save() }
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); editing = null; drafts.delete(`edit:${comment.id}`); render() }
      })
      row.append(field)
      view.requestAnimationFrame(() => grow(field))
    } else {
      const body = doc.createElement('p')
      body.className = 'aa-comment-body'
      // The people named are set in their colour, as Link's mentions are.
      const names = (comment.mentions ?? []).filter(person => person.name.trim()).sort((a, b) => b.name.length - a.name.length)
      let rest = comment.body
      const pieces: (string | HTMLElement)[] = []
      const pattern = names.length ? new RegExp(names.map(person => `@${person.name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).join('|'), 'g') : null
      if (pattern) {
        let last = 0
        for (const match of rest.matchAll(pattern)) {
          pieces.push(rest.slice(last, match.index))
          const mention = doc.createElement('span'); mention.className = 'aa-comment-mention'; mention.textContent = match[0]
          const person = names.find(each => `@${each.name.trim()}` === match[0])
          if (person) mention.style.setProperty('--aa-person', personColour(person))
          pieces.push(mention)
          last = match.index + match[0].length
        }
        pieces.push(rest.slice(last))
      } else pieces.push(rest)
      body.append(...pieces)
      row.append(body)
    }
    // The reactions it has, each a chip with its count (pressed where the person reading gave it), and one more to give.
    const canReact = !!store.react && canWrite() && !thread.resolvedAt
    if (comment.reactions?.length || canReact) {
      const line = doc.createElement('div')
      line.className = 'aa-comment-reactions'
      for (const reaction of comment.reactions ?? []) {
        const chip = doc.createElement('button')
        chip.type = 'button'; chip.className = 'aa-reaction'
        chip.setAttribute('aria-pressed', String(reaction.reacted))
        chip.setAttribute('aria-label', `${reaction.emoji} ${reaction.count}${reaction.names.length ? `, from ${reaction.names.join(', ')}` : ''}${reaction.reacted ? ', you too' : ''}`)
        chip.title = [...reaction.names, ...(reaction.reacted ? ['You'] : [])].join(', ')
        chip.append(Object.assign(doc.createElement('span'), { className: 'aa-reaction-emoji', textContent: reaction.emoji }), Object.assign(doc.createElement('span'), { className: 'aa-reaction-count', textContent: String(reaction.count) }))
        chip.disabled = !canReact
        chip.addEventListener('click', event => { event.preventDefault(); void write(`react:${comment.id}`, () => store.react!(comment.id, reaction.emoji)) })
        line.append(chip)
      }
      if (canReact) {
        const more = iconButton('Add reaction', 'plus', () => openPicker(more, comment.id))
        more.classList.add('aa-reaction-add')
        line.append(more)
      }
      row.append(line)
    }
    const error = errors.get(`edit:${comment.id}`) ?? errors.get(`react:${comment.id}`)
    if (error) { const line = doc.createElement('p'); line.className = 'aa-comments-error'; line.setAttribute('role', 'alert'); line.textContent = error; row.append(line) }
    return row
  }

  // ----- the reactions on offer -----

  let picker: HTMLElement | null = null
  const hidePicker = () => { picker?.remove(); picker = null }
  /** The sixteen, in the Context face under the button, eight a row; a press gives one and the picker goes. */
  const openPicker = (button: HTMLElement, commentId: string) => {
    hidePicker()
    picker = doc.createElement('div')
    picker.className = 'aa-controls aa-menu aa-reaction-picker'
    picker.setAttribute('role', 'menu'); picker.setAttribute('aria-label', 'Reactions')
    for (const emoji of REACTION_EMOJIS) {
      const cell = doc.createElement('button')
      cell.type = 'button'; cell.setAttribute('role', 'menuitem'); cell.textContent = emoji; cell.setAttribute('aria-label', `React with ${emoji}`)
      cell.addEventListener('pointerdown', event => event.preventDefault())
      cell.addEventListener('click', event => { event.preventDefault(); hidePicker(); void write(`react:${commentId}`, () => store.react!(commentId, emoji)) })
      picker.append(cell)
    }
    picker.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); hidePicker(); button.focus() } })
    root.append(picker)
    const rect = button.getBoundingClientRect(), square = 20 * (parseFloat(getComputedStyle(host).getPropertyValue('--aa-sf')) || 1)
    const width = 8 * square, height = 2 * square
    picker.style.left = `${Math.max(0, Math.min(rect.left, view.innerWidth - width))}px`
    picker.style.top = `${rect.bottom + square / 2 + height <= view.innerHeight ? rect.bottom + square / 2 : Math.max(0, rect.top - square / 2 - height)}px`
    picker.querySelector<HTMLButtonElement>('button')?.focus()
  }

  const threadElement = (thread: AnchoredThread, expanded: boolean): HTMLElement => {
    const article = doc.createElement('article')
    article.className = 'aa-thread'
    article.dataset.thread = thread.id
    article.toggleAttribute('data-open', expanded)
    article.toggleAttribute('data-resolved', !!thread.resolvedAt)
    article.toggleAttribute('data-orphaned', thread.orphaned)
    article.toggleAttribute('data-unread', !!thread.unread)
    const head = doc.createElement(panel ? 'button' : 'div')
    head.className = 'aa-thread-head'
    if (head instanceof HTMLButtonElement) { head.type = 'button'; head.setAttribute('aria-expanded', String(expanded)); head.addEventListener('click', () => { if (expanded) { openId = null; decorate(); render() } else { open(thread.id); options.selectRange(thread.from, thread.to) } }) }
    // The words themselves are right over a popover, so it names them only in a panel, or when they are gone.
    const named = !!panel || thread.orphaned
    if (named) {
      const quote = doc.createElement('span')
      quote.className = 'aa-thread-quote'
      quote.textContent = thread.orphaned ? `“${thread.quote}” is no longer in the text` : thread.quote.replace(/\s+/g, ' ')
      quote.title = thread.quote
      head.append(quote)
    }
    if (!expanded) { const count = doc.createElement('span'); count.className = 'aa-thread-count'; count.textContent = String(thread.comments.length); head.append(count) }
    article.append(head)
    if (!expanded) return article
    const actions = doc.createElement('div')
    actions.className = 'aa-thread-actions'
    // With more open threads in the text, a popover steps to the one before and the one after, in the order of the words.
    const openOnes = sortThreads(placed).filter(each => !each.orphaned && !each.resolvedAt)
    const at = openOnes.findIndex(each => each.id === thread.id)
    if (!panel && openOnes.length > 1 && at >= 0) {
      const step = (by: number) => { const next = openOnes[(at + by + openOnes.length) % openOnes.length]; options.selectRange(next.from); open(next.id) }
      actions.append(iconButton('Previous comment', 'up', () => step(-1)), iconButton('Next comment', 'down', () => step(1)))
    }
    if (canWrite()) {
      if (thread.resolvedAt) actions.append(textButton('Reopen', () => void write(`resolve:${thread.id}`, () => store.resolve(thread.id, false)), 'aa-thread-reopen'))
      else actions.append(iconButton('Resolve', 'check', () => void write(`resolve:${thread.id}`, () => store.resolve(thread.id, true), () => { if (!panel) close() })))
      if (store.remove && thread.canDelete) {
        const remove = confirming === thread.id
          ? textButton('Delete?', () => void write(`remove:${thread.id}`, () => store.remove!(thread.id), () => { confirming = null; if (openId === thread.id) openId = null }), 'aa-thread-delete')
          : iconButton('Delete thread', 'delete', () => { confirming = thread.id; render() })
        actions.append(remove)
      }
    }
    // The thread's own row, above its comments: the controls on the sixteen at its end.
    head.append(actions)
    for (const comment of thread.comments) article.append(commentRow(thread, comment))
    const error = errors.get(`resolve:${thread.id}`) ?? errors.get(`remove:${thread.id}`) ?? errors.get(thread.id)
    if (error) { const line = doc.createElement('p'); line.className = 'aa-comments-error'; line.setAttribute('role', 'alert'); line.textContent = error; article.append(line) }
    if (thread.resolvedAt) {
      const note = doc.createElement('p')
      note.className = 'aa-thread-resolved'
      note.textContent = `Resolved${thread.resolvedBy ? ` by ${thread.resolvedBy.name}` : ''}.`
      article.append(note)
    } else if (canWrite()) article.append(composer(thread.id, 'Reply'))
    return article
  }

  const draftElement = (): HTMLElement => {
    const article = doc.createElement('article')
    article.className = 'aa-thread'
    article.dataset.thread = 'draft'
    article.setAttribute('data-open', '')
    const field = composer('draft', 'Add a comment')
    if (panel) {
      const head = doc.createElement('div'); head.className = 'aa-thread-head'
      const quote = doc.createElement('span'); quote.className = 'aa-thread-quote'; quote.textContent = draft!.quote.replace(/\s+/g, ' ')
      head.append(quote)
      article.append(head, field)
    } else article.append(field) // The selected words stand right over it: one row; a press outside or Escape puts it away.
    const error = errors.get('draft')
    if (error) { const line = doc.createElement('p'); line.className = 'aa-comments-error'; line.setAttribute('role', 'alert'); line.textContent = error; article.append(line) }
    return article
  }

  const ensurePopover = () => {
    if (popover) return popover
    popover = panel ?? doc.createElement('div')
    popover.classList.add('aa-comments')
    popover.dataset.mode = panel ? 'panel' : 'popover'
    popover.setAttribute('role', panel ? 'region' : 'dialog')
    popover.setAttribute('aria-label', 'Comments')
    popover.addEventListener('keydown', event => { if (event.key === 'Escape' && !menu && !picker && !editing) { event.preventDefault(); close() } })
    // A press inside is its own: the editor's selection is left alone.
    if (!panel) root.append(popover)
    return popover
  }

  /** What is drawn: in a panel every thread, open ones first; in a popover the open thread or the draft alone. */
  const render = () => {
    if (destroyed) return
    const focused = popover?.contains(doc.activeElement) ? doc.activeElement as HTMLElement : null
    const focusedKey = focused?.closest<HTMLElement>('[data-thread]')?.dataset.thread, focusedField = focused instanceof HTMLTextAreaElement ? { start: focused.selectionStart, end: focused.selectionEnd, edit: focused.dataset.edit } : null
    if (panel) {
      const element = ensurePopover()
      const sorted = sortThreads(placed)
      const counts = countThreads(placed)
      const title = doc.createElement('h2')
      title.className = 'aa-comments-title'
      title.textContent = commentsLabel(counts.open, counts.resolved)
      const children: HTMLElement[] = [title]
      if (draft) children.push(draftElement())
      let heading = false
      for (const thread of sorted) {
        if (thread.resolvedAt && !heading) { heading = true; const group = doc.createElement('h3'); group.className = 'aa-comments-group'; group.textContent = 'Resolved'; children.push(group) }
        children.push(threadElement(thread, thread.id === openId))
      }
      if (!sorted.length && !draft) { const empty = doc.createElement('p'); empty.className = 'aa-comments-empty'; empty.textContent = canWrite() ? 'Select words and press Comment to start a thread.' : 'No comments yet.'; children.push(empty) }
      element.replaceChildren(...children)
    } else {
      const thread = openThread()
      if (!thread && !draft) { popover?.remove(); popover = null; hideMenu(); return }
      const element = ensurePopover()
      element.replaceChildren(draft ? draftElement() : threadElement(thread!, true))
      place()
    }
    // The composer or field that had the keys keeps them.
    if (focusedKey) {
      const again = popover?.querySelector<HTMLTextAreaElement>(focusedField?.edit ? `[data-edit="${focusedField.edit}"]` : `[data-thread="${focusedKey}"] .aa-composer textarea`)
      if (again && focusedField) { again.focus({ preventScroll: true }); try { again.setSelectionRange(focusedField.start, focusedField.end) } catch { /* a field without a selection */ } }
    }
  }

  /** The popover half a square under the words, its start at theirs, kept in the window; over them when there is no room under. */
  const place = () => {
    frame = 0
    if (!popover || panel) return
    const id = draft ? 'draft' : openId
    const rects = id ? rectsOf(id) : []
    const square = 20 * (parseFloat(getComputedStyle(host).getPropertyValue('--aa-sf')) || 1)
    const width = Math.min(16 * square, view.innerWidth - 2 * square)
    popover.style.width = `${width}px`
    const box = rects.length ? { left: Math.min(...rects.map(rect => rect.left)), top: Math.min(...rects.map(rect => rect.top)), bottom: Math.max(...rects.map(rect => rect.bottom)) } : (() => { const now = host.getBoundingClientRect(); return { left: now.left, top: now.top, bottom: now.top } })()
    const height = popover.offsetHeight
    const left = Math.max(square, Math.min(box.left, view.innerWidth - width - square))
    const under = box.bottom + square / 2
    const top = under + height <= view.innerHeight - square / 2 || box.top - square / 2 - height < square / 2 ? under : box.top - square / 2 - height
    popover.style.left = `${left}px`
    popover.style.top = `${Math.max(square / 2, Math.min(top, view.innerHeight - height - square / 2))}px`
  }
  const schedule = () => { if (!frame && popover && !panel) frame = view.requestAnimationFrame(place) }
  const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
  resize?.observe(host)
  view.addEventListener('scroll', schedule, true)
  view.addEventListener('resize', schedule)
  /** A press anywhere but the popover, the menu or the commented words puts the popover away. */
  const outside = (event: Event) => {
    if (!popover || panel || !(event.target instanceof Node)) return
    if (picker && !picker.contains(event.target)) hidePicker()
    if (popover.contains(event.target) || menu?.contains(event.target) || picker?.contains(event.target)) return
    if (host.contains(event.target)) return
    close()
  }
  doc.addEventListener('pointerdown', outside, true)

  // The threads come with the first `receive`; the text is marked then.
  const stop = store.subscribe(receive)

  return {
    open, start, close, changed,
    get threads() { return placed },
    destroy() {
      destroyed = true
      stop()
      clearTimeout(moveTimer)
      if (frame) view.cancelAnimationFrame(frame)
      resize?.disconnect()
      view.removeEventListener('scroll', schedule, true)
      view.removeEventListener('resize', schedule)
      doc.removeEventListener('pointerdown', outside, true)
      host.removeEventListener('aa-selectionchange', onSelectionChange)
      host.removeEventListener('aa-change', changed)
      host.removeEventListener('click', onPress)
      hideMenu(); hidePicker()
      if (panel) { panel.replaceChildren(); panel.classList.remove('aa-comments') } else popover?.remove()
      popover = null
      options.decorate([])
    },
  }
}
