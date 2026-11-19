/**
 * The page editor. One contenteditable surface (so selection and arrow keys are
 * native), with one element per block keyed by the block's stable id.
 *
 * DOM -> model: after each input event, changed block text is committed to the
 * engine as a coalesced typing transaction. Structural keys (Enter, Backspace at
 * a block start, Tab) are handled explicitly so ids never get duplicated.
 * Model -> DOM: keyed reconcile. A block's text is only rewritten when it differs
 * from what is on screen, so the caret never jumps under your fingers.
 */
import type { DocEngine, Op } from "../../engine/engine";
import { newId } from "../../engine/ids";
import type { Block, Draft } from "../../engine/model";

export interface EditorCallbacks {
  /** Enter on an empty wet line: the paragraph is finished. */
  onParagraphEnd(): void;
  /** Caret moved to a different block (or left the page). */
  onCaretBlock(id: string | null): void;
  onPaste(e: ClipboardEvent): boolean;
  onUndo(): void;
  onRedo(): void;
}

/** Motion comes from the tokens, never from component code. */
function motion() {
  const cs = getComputedStyle(document.documentElement);
  const ms = (v: string, d: number) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : d;
  };
  return {
    ease: cs.getPropertyValue("--ease-settle").trim() || "ease-out",
    color: ms(cs.getPropertyValue("--dur-settle-color"), 280),
    move: ms(cs.getPropertyValue("--dur-settle-move"), 420),
  };
}

/** Blocks shown in the page flow. Tangents live in the margin. */
export function inPage(b: Block): boolean {
  return b.tab !== "tangent";
}

const NEXT = /^next( steps)?$/i;

export function textOf(el: Element): string {
  let s = "";
  el.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) s += n.textContent ?? "";
    else if (n instanceof HTMLElement && !n.dataset.ui) {
      if (n.tagName === "BR") return;
      s += textOf(n);
    }
  });
  return s.replace(/​/g, "");
}

export class Editor {
  private els = new Map<string, HTMLElement>();
  private lastCaret: string | null = null;
  private composing = false;
  reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  constructor(
    readonly root: HTMLElement,
    private engine: () => DocEngine,
    private cb: EditorCallbacks,
  ) {
    root.contentEditable = "true";
    root.spellcheck = true;
    root.setAttribute("role", "textbox");
    root.setAttribute("aria-multiline", "true");
    root.setAttribute("aria-label", "Draft");
    root.addEventListener("keydown", (e) => this.onKeyDown(e));
    root.addEventListener("beforeinput", (e) => this.onBeforeInput(e as InputEvent));
    root.addEventListener("input", () => !this.composing && this.syncFromDom());
    root.addEventListener("compositionstart", () => (this.composing = true));
    root.addEventListener("compositionend", () => {
      this.composing = false;
      this.syncFromDom();
    });
    root.addEventListener("paste", (e) => {
      if (this.cb.onPaste(e)) return;
      e.preventDefault();
      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (text) this.insertText(text);
    });
    document.addEventListener("selectionchange", () => {
      const id = this.caret()?.id ?? null;
      if (id !== this.lastCaret) {
        this.lastCaret = id;
        this.cb.onCaretBlock(id);
      }
    });
  }

  // ------------------------------------------------------------------ caret

  blockElOf(node: Node | null): HTMLElement | null {
    let n: Node | null = node;
    while (n && n !== this.root) {
      if (n instanceof HTMLElement && n.dataset.id && n.parentElement === this.root) return n;
      n = n.parentNode;
    }
    return null;
  }

  caret(): { id: string; offset: number; collapsed: boolean } | null {
    const sel = document.getSelection();
    if (!sel || !sel.rangeCount || !this.root.contains(sel.anchorNode)) return null;
    const el = this.blockElOf(sel.focusNode);
    if (!el) return null;
    const r = sel.getRangeAt(0);
    const pre = document.createRange();
    pre.selectNodeContents(el);
    pre.setEnd(sel.focusNode!, sel.focusOffset);
    const offset = textOfFragment(pre.cloneContents()).length;
    return { id: el.dataset.id!, offset, collapsed: r.collapsed };
  }

  setCaret(id: string, offset: number) {
    const el = this.els.get(id);
    if (!el) return;
    const sel = document.getSelection();
    if (!sel) return;
    let remaining = offset;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => ((n.parentElement as HTMLElement)?.closest("[data-ui]") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    let node = walker.nextNode();
    while (node) {
      const len = node.textContent?.length ?? 0;
      if (remaining <= len) {
        sel.collapse(node, remaining);
        return;
      }
      remaining -= len;
      node = walker.nextNode();
    }
    sel.collapse(el, el.childNodes.length ? Math.min(el.childNodes.length, firstUiIndex(el)) : 0);
  }

  focusEnd() {
    const blocks = this.engine().state.blocks.filter(inPage);
    const last = blocks[blocks.length - 1];
    this.root.focus();
    if (last) this.setCaret(last.id, last.text.length);
  }

  // ------------------------------------------------------------------ render

  render(draft: Draft, opts: { settled?: string[]; dim?: Set<string> } = {}) {
    const animate = !!opts.settled?.length && !this.reduceMotion;
    const before = new Map<string, number>();
    if (animate) for (const [id, el] of this.els) before.set(id, el.getBoundingClientRect().top);

    const focusedId = this.caret()?.id ?? null;
    const caretSave = focusedId ? this.caret() : null;
    const seen = new Set<string>();
    let num = 0;
    let prev: HTMLElement | null = null;
    for (const b of draft.blocks) {
      if (!inPage(b)) continue;
      seen.add(b.id);
      let el = this.els.get(b.id);
      if (!el) {
        el = document.createElement("div");
        el.className = "blk";
        el.dataset.id = b.id;
        this.els.set(b.id, el);
      }
      if (b.kind === "heading" && !NEXT.test(b.text)) num++;
      this.paint(el, b, num, opts.dim?.has(b.id) ?? false);
      let want: ChildNode | null = prev ? prev.nextSibling : this.root.firstChild;
      // Interface elements (live words, PHLO ASKS) may sit between blocks: step over them.
      while (want && want !== el && want instanceof HTMLElement && want.dataset.ui) want = want.nextSibling;
      if (want !== el) this.root.insertBefore(el, want);
      prev = el;
    }
    for (const [id, el] of this.els) {
      if (!seen.has(id)) {
        el.remove();
        this.els.delete(id);
      }
    }
    // Stray nodes (browser-inserted) are swept; syncFromDom adopts real text first.
    Array.from(this.root.childNodes).forEach((n) => {
      if (n instanceof HTMLElement && n.dataset.ui) return;
      if (!(n instanceof HTMLElement && n.dataset.id && this.els.get(n.dataset.id) === n)) n.remove();
    });

    if (caretSave && this.els.has(caretSave.id) && document.activeElement === this.root) {
      const cur = this.caret();
      if (!cur || cur.id !== caretSave.id || cur.offset !== caretSave.offset) this.setCaret(caretSave.id, caretSave.offset);
    }

    if (animate) this.glide(before, new Set(opts.settled));
  }

  elementOf(id: string): HTMLElement | undefined {
    return this.els.get(id);
  }

  private paint(el: HTMLElement, b: Block, num: number, dim: boolean) {
    el.dataset.kind = b.kind;
    el.classList.toggle("wet", b.wet);
    setAttr(el, "data-theme", b.kind === "heading" ? b.theme : undefined);
    setAttr(el, "data-tab", b.tab);
    const isNext = b.kind === "heading" && NEXT.test(b.text);
    setAttr(el, "data-label", b.kind === "heading" ? (isNext ? "" : `${String(num).padStart(2, "0")} · ${b.text}`) : undefined);
    el.classList.toggle("next", isNext);
    setAttr(el, "data-dim", dim ? "1" : undefined);
    el.style.setProperty("--depth", String(b.depth ?? 0));
    if (b.kind === "heading") el.setAttribute("role", "heading");
    else el.removeAttribute("role");

    if (textOf(el) !== b.text) {
      // Rewrite text but keep UI children (trail) intact.
      Array.from(el.childNodes).forEach((n) => {
        if (!(n instanceof HTMLElement && n.dataset.ui)) n.remove();
      });
      el.insertBefore(document.createTextNode(b.text), el.firstChild);
    }
    if (!b.text) {
      // An empty block still needs height for the caret.
      if (!el.querySelector("br:not([data-ui])")) el.insertBefore(document.createElement("br"), el.firstChild);
    } else {
      el.querySelectorAll(":scope > br").forEach((br) => br.remove());
    }

    const trail = el.querySelector<HTMLElement>(":scope > .trail");
    if (b.trail?.length) {
      el.classList.add("has-trail");
      const t = trail ?? Object.assign(document.createElement("span"), { className: "trail" });
      t.dataset.ui = "1";
      t.contentEditable = "false";
      t.textContent = b.trail[b.trail.length - 1];
      t.title = b.trail.join("  ·  ");
      if (!trail) el.appendChild(t);
    } else {
      el.classList.remove("has-trail");
      trail?.remove();
    }
  }

  /** Ink settling: color to ink (280ms), then glide into place (420ms). No bounce. */
  private glide(before: Map<string, number>, settled: Set<string>) {
    const m = motion();
    if (m.move === 0) return; // reduced motion: color still changes, no glide
    const total = m.color + m.move;
    for (const [id, el] of this.els) {
      const was = before.get(id);
      if (was === undefined) {
        if (settled.has(id)) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: m.move, easing: m.ease });
        continue;
      }
      const dy = was - el.getBoundingClientRect().top;
      if (Math.abs(dy) < 1) continue;
      if (settled.has(id)) {
        el.animate(
          [
            { transform: `translateY(${dy}px)` },
            { transform: `translateY(${dy}px)`, offset: m.color / total },
            { transform: "translateY(0)" },
          ],
          { duration: total, easing: m.ease },
        );
      } else {
        el.animate([{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }], { duration: m.move, easing: m.ease });
      }
    }
  }

  // ------------------------------------------------------------------ input

  private commit(ops: Op[], label = "Typing", coalesce?: string) {
    if (!ops.length) return;
    this.engine().commit({ id: newId("tx"), actor: "user", label, ops, coalesce });
  }

  /** Read the DOM and commit any differences. The DOM is the user's truth while typing. */
  syncFromDom() {
    const eng = this.engine();
    const model = new Map(eng.state.blocks.map((b) => [b.id, b]));
    const ops: Op[] = [];
    let prevId: string | null = null;
    const domIds = new Set<string>();
    const strays: string[] = [];

    for (const n of Array.from(this.root.childNodes)) {
      if (n instanceof HTMLElement && n.dataset.id && model.has(n.dataset.id) && !domIds.has(n.dataset.id)) {
        const id = n.dataset.id;
        domIds.add(id);
        const b = model.get(id)!;
        const text = textOf(n);
        if (text !== b.text) {
          const shortcut = markdownShortcut(b, text);
          ops.push({ t: "update", id, patch: shortcut ?? { text } });
        }
        prevId = id;
      } else if (n instanceof HTMLElement && n.dataset.ui) {
        continue;
      } else {
        const text = n instanceof HTMLElement ? textOf(n) : (n.textContent ?? "");
        if (text.trim()) strays.push(text);
      }
    }
    for (const b of eng.state.blocks) if (inPage(b) && !domIds.has(b.id)) ops.push({ t: "delete", id: b.id });
    let after = prevId ?? (eng.state.blocks.length ? eng.state.blocks[eng.state.blocks.length - 1].id : null);
    for (const s of strays) {
      const id = newId("b");
      ops.push({ t: "insert", block: { id, kind: "paragraph", text: s, wet: true, rev: 0, origin: "typed" }, after });
      after = id;
    }
    const c = this.caret();
    this.commit(ops, "Typing", c ? `type:${c.id}` : "type");
  }

  private onBeforeInput(e: InputEvent) {
    if (e.inputType === "historyUndo") {
      e.preventDefault();
      this.cb.onUndo();
    } else if (e.inputType === "historyRedo") {
      e.preventDefault();
      this.cb.onRedo();
    } else if (e.inputType === "insertParagraph" || e.inputType === "insertLineBreak") {
      e.preventDefault();
    } else if (e.inputType === "formatBold" || e.inputType === "formatItalic" || e.inputType === "formatUnderline") {
      e.preventDefault(); // plain text in this pass
    }
  }

  private onKeyDown(e: KeyboardEvent) {
    if (e.isComposing) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      this.syncFromDom();
      if (e.shiftKey) this.cb.onRedo();
      else this.cb.onUndo();
      return;
    }
    if (e.key === "Enter" && !mod && !e.altKey) {
      e.preventDefault();
      this.syncFromDom();
      this.enter(e.shiftKey);
      return;
    }
    if (e.key === "Backspace" && !mod) {
      const c = this.caret();
      if (c && c.collapsed && c.offset === 0) {
        e.preventDefault();
        this.syncFromDom();
        this.backspaceAtStart(c.id);
      }
      return;
    }
    if (e.key === "Tab") {
      const c = this.caret();
      const b = c && this.engine().block(c.id);
      if (b && (b.kind === "bullet" || b.kind === "paragraph")) {
        e.preventDefault();
        const depth = Math.max(0, Math.min(4, (b.depth ?? 0) + (e.shiftKey ? -1 : 1)));
        if (b.kind === "paragraph" && e.shiftKey) return;
        this.commit([{ t: "update", id: b.id, patch: { kind: "bullet", depth: b.kind === "paragraph" ? 0 : depth } }], "Indent");
        this.setCaret(b.id, c.offset);
      }
    }
  }

  private enter(soft: boolean) {
    const c = this.caret();
    const eng = this.engine();
    if (!c) return;
    const b = eng.block(c.id);
    if (!b) return;

    // Enter twice: an empty wet line ends the paragraph and settles it.
    if (!soft && b.wet && !b.text.trim()) {
      const visible = eng.state.blocks.filter(inPage);
      const idx = visible.findIndex((x) => x.id === b.id);
      const prev = visible[idx - 1];
      if (prev?.wet) {
        this.cb.onParagraphEnd();
        return;
      }
    }
    // Empty bullet: outdent / end the list.
    if (b.kind === "bullet" && !b.text.trim()) {
      this.commit([{ t: "update", id: b.id, patch: { kind: "paragraph", depth: undefined } }], "End list");
      this.setCaret(b.id, 0);
      return;
    }

    const head = b.text.slice(0, c.offset);
    const tail = b.text.slice(c.offset);
    const id = newId("b");
    const kind = b.kind === "bullet" ? "bullet" : "paragraph";
    // New lines you type are yours to shape: they start wet.
    const block: Block = { id, kind, text: tail, wet: true, rev: 0, origin: "typed", depth: kind === "bullet" ? b.depth : undefined };
    const ops: Op[] = [];
    if (tail || head !== b.text) ops.push({ t: "update", id: b.id, patch: { text: head } });
    ops.push({ t: "insert", block, after: b.id });
    this.commit(ops, "New line");
    this.render(eng.state);
    this.setCaret(id, 0);
  }

  private backspaceAtStart(id: string) {
    const eng = this.engine();
    const blocks = eng.state.blocks.filter(inPage);
    const i = blocks.findIndex((b) => b.id === id);
    const b = blocks[i];
    if (!b) return;
    if (b.kind !== "paragraph") {
      this.commit([{ t: "update", id, patch: { kind: "paragraph", depth: undefined } }], "Plain text");
      this.render(eng.state);
      this.setCaret(id, 0);
      return;
    }
    const prev = blocks[i - 1];
    if (!prev) return;
    const join = prev.text.length;
    this.commit(
      [
        { t: "update", id: prev.id, patch: { text: prev.text + b.text, wet: prev.wet || b.wet } },
        { t: "delete", id },
      ],
      "Join lines",
    );
    this.render(eng.state);
    this.setCaret(prev.id, join);
  }

  insertText(text: string) {
    this.syncFromDom();
    const c = this.caret();
    const eng = this.engine();
    const lines = text.replace(/\r\n?/g, "\n").split(/\n+/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    if (!c) {
      const last = eng.state.blocks[eng.state.blocks.length - 1] ?? null;
      const ops: Op[] = [];
      let after = last?.id ?? null;
      for (const l of lines) {
        const id = newId("b");
        ops.push({ t: "insert", block: { id, kind: "paragraph", text: l, wet: true, rev: 0, origin: "typed" }, after });
        after = id;
      }
      this.commit(ops, "Paste");
      this.render(eng.state);
      return;
    }
    const b = eng.block(c.id)!;
    const head = b.text.slice(0, c.offset);
    const tail = b.text.slice(c.offset);
    if (lines.length === 1) {
      this.commit([{ t: "update", id: b.id, patch: { text: head + lines[0] + tail } }], "Paste");
      this.render(eng.state);
      this.setCaret(b.id, head.length + lines[0].length);
      return;
    }
    const ops: Op[] = [{ t: "update", id: b.id, patch: { text: head + lines[0] } }];
    let after = b.id;
    let lastId = b.id;
    lines.slice(1).forEach((l, k) => {
      const id = newId("b");
      const isLast = k === lines.length - 2;
      ops.push({ t: "insert", block: { id, kind: "paragraph", text: isLast ? l + tail : l, wet: true, rev: 0, origin: "typed" }, after });
      after = id;
      lastId = id;
    });
    this.commit(ops, "Paste");
    this.render(eng.state);
    this.setCaret(lastId, (lines[lines.length - 1] ?? "").length);
  }
}

function setAttr(el: HTMLElement, name: string, v: string | undefined) {
  if (v === undefined) el.removeAttribute(name);
  else if (el.getAttribute(name) !== v) el.setAttribute(name, v);
}

function firstUiIndex(el: HTMLElement): number {
  const i = Array.from(el.childNodes).findIndex((n) => n instanceof HTMLElement && (n.dataset.ui || n.tagName === "BR"));
  return i < 0 ? el.childNodes.length : i;
}

function textOfFragment(f: DocumentFragment): string {
  const d = document.createElement("div");
  d.appendChild(f);
  return textOf(d);
}

/** "# " -> heading, "- " -> bullet, "? " -> question. Typed structure is settled immediately. */
function markdownShortcut(b: Block, text: string): Partial<Block> | null {
  if (b.kind !== "paragraph") return null;
  if (/^#{1,3}\s/.test(text)) return { kind: "heading", text: text.replace(/^#{1,3}\s/, ""), wet: false };
  if (/^[-*]\s/.test(text)) return { kind: "bullet", text: text.slice(2), depth: 0 };
  if (/^\?\s/.test(text)) return { kind: "question", text: text.slice(2) };
  return null;
}
