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
import { flowSummary, tableSummary } from "../../engine/forms";
import { FORM_LABEL, ISLAND_KINDS, type Block, type ChartData, type Draft, type TableData } from "../../engine/model";

export interface EditorCallbacks {
  /** Enter on an empty wet line: the paragraph is finished. */
  onParagraphEnd(): void;
  /** Caret moved to a different block (or left the page). */
  onCaretBlock(id: string | null): void;
  onPaste(e: ClipboardEvent): boolean;
  onUndo(): void;
  onRedo(): void;
  /** "/" typed at the start of a line: show the forms menu (query = text after "/"), or null to hide. */
  onSlash?(id: string | null, query: string): void;
  /** Lets an open menu claim arrow/enter/escape keys. Return true if handled. */
  onMenuKey?(e: KeyboardEvent): boolean;
  /** Fold or unfold a heading's content (Phlo's toggle). */
  onFold?(id: string): void;
  /** An island asked to become another form (e.g. a chart's "Edit as table"). */
  onTurnInto?(id: string, kind: Block["kind"]): void;
  /** The + beside a line: open Add after it. */
  onAddAfter?(id: string): void;
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
    // Table cells edit the table's data, not text: handle them before the page sync.
    root.addEventListener(
      "input",
      (e) => {
        const cell = (e.target as HTMLElement)?.closest?.("td,th,[data-step],[data-when]") as HTMLElement | null;
        if (cell) {
          e.stopImmediatePropagation();
          if (cell.dataset.step !== undefined) this.onStepInput(cell);
          else if (cell.dataset.when !== undefined) this.onWhenInput(cell);
          else this.onCellInput(cell);
        }
      },
      true,
    );
    root.addEventListener("mousedown", (e) => {
      const t = e.target as HTMLElement;
      const fold = t.closest?.(".fold") as HTMLElement | null;
      if (fold) {
        e.preventDefault();
        const id = fold.closest<HTMLElement>(".blk")?.dataset.id;
        if (id) this.cb.onFold?.(id);
      }
    });
    root.addEventListener("input", () => {
      if (this.composing) return;
      this.syncFromDom();
      this.checkSlash();
    });
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
    let sub = 0;
    let step = 0;
    let foldLevel = 0;
    let prev: HTMLElement | null = null;
    for (const b of draft.blocks) {
      if (!inPage(b)) continue;
      step = b.kind === "numbered" ? step + 1 : 0;
      const lvl = b.kind === "heading" ? (b.level ?? 1) : 0;
      if (lvl && foldLevel && lvl <= foldLevel) foldLevel = 0;
      const hidden = foldLevel > 0;
      seen.add(b.id);
      let el = this.els.get(b.id);
      if (!el) {
        el = document.createElement("div");
        el.className = "blk";
        el.dataset.id = b.id;
        this.els.set(b.id, el);
      }
      let label: string | undefined;
      if (b.kind === "heading" && !NEXT.test(b.text)) {
        if (lvl === 1) {
          num++;
          sub = 0;
          label = `${String(num).padStart(2, "0")} · ${b.text}`;
        } else {
          sub++;
          label = `${String(Math.max(num, 1)).padStart(2, "0")}.${sub} · ${b.text}`;
        }
      } else if (b.kind === "heading") label = "";
      if (b.kind === "heading" && b.collapsed && !hidden) foldLevel = lvl;
      setAttr(el, "data-n", b.kind === "numbered" ? String(step) : undefined);
      setAttr(el, "data-hidden", hidden ? "1" : undefined);
      setAttr(el, "data-level", lvl === 2 ? "2" : undefined);
      setAttr(el, "data-collapsed", b.kind === "heading" && b.collapsed ? "1" : undefined);
      this.paint(el, b, label, opts.dim?.has(b.id) ?? false);
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

  // ------------------------------------------------------------------ tables

  /** A table is an island: its cells are editable, its meaning lives in block.data. */
  private paintTable(el: HTMLElement, b: Block) {
    el.contentEditable = "false";
    const data: TableData = b.data ?? { columns: ["Item"], rows: [[""]] };
    const sig = JSON.stringify(data);
    if (el.dataset.sig === sig) return;
    const active = document.activeElement as HTMLElement | null;
    const focusAt = active && el.contains(active) ? { r: active.dataset.r, c: active.dataset.c } : null;
    el.dataset.sig = sig;
    el.textContent = "";
    const table = document.createElement("table");
    table.className = "tbl";
    const head = table.createTHead().insertRow();
    data.columns.forEach((col, c) => {
      const th = document.createElement("th");
      th.contentEditable = "true";
      th.dataset.r = "-1";
      th.dataset.c = String(c);
      th.textContent = col;
      head.appendChild(th);
    });
    const body = table.createTBody();
    data.rows.forEach((row, r) => {
      const tr = body.insertRow();
      data.columns.forEach((_, c) => {
        const td = tr.insertCell();
        td.contentEditable = "true";
        td.dataset.r = String(r);
        td.dataset.c = String(c);
        td.textContent = row[c] ?? "";
      });
    });
    const tools = document.createElement("div");
    tools.className = "tbl-tools";
    for (const [label, fn] of [
      ["+ Row", (d: TableData) => ({ ...d, rows: [...d.rows, d.columns.map(() => "")] })],
      ["+ Column", (d: TableData) => ({ columns: [...d.columns, `Column ${d.columns.length + 1}`], rows: d.rows.map((r) => [...r, ""]) })],
    ] as const) {
      const btn = document.createElement("button");
      btn.className = "label";
      btn.textContent = label;
      btn.addEventListener("mousedown", (e) => e.preventDefault());
      btn.addEventListener("click", () => this.updateTable(b.id, fn));
      tools.appendChild(btn);
    }
    el.append(table, tools);
    if (focusAt) {
      const cell = el.querySelector<HTMLElement>(`[data-r="${focusAt.r}"][data-c="${focusAt.c}"]`);
      if (cell) placeCaretEnd(cell);
    }
  }

  // ------------------------------------------------------------------ flows

  /**
   * Flow, columns and timeline share one shape (ordered items): cards with arrows
   * (flow), cards side by side (columns), or dated moments on a line (timeline).
   * Every item is editable in place.
   */
  private paintFlow(el: HTMLElement, b: Block) {
    el.contentEditable = "false";
    const variant = b.kind as "flow" | "columns" | "timeline";
    const steps = b.steps?.length ? b.steps : [""];
    const when = b.when ?? [];
    const sig = JSON.stringify([variant, steps, when, b.trail?.at(-1) ?? ""]);
    if (el.dataset.sig === sig) return;
    const active = document.activeElement as HTMLElement | null;
    const focusAt = active && el.contains(active) ? (active.dataset.step ?? undefined) : undefined;
    el.dataset.sig = sig;
    el.textContent = "";
    const row = document.createElement("div");
    row.className = variant === "flow" ? "flow" : variant === "columns" ? "cols" : "timeline";
    row.setAttribute("role", "list");
    row.style.setProperty("--n", String(steps.length));
    steps.forEach((text, i) => {
      if (i && variant === "flow") {
        const arrow = document.createElement("span");
        arrow.className = "flow-arrow";
        arrow.setAttribute("aria-hidden", "true");
        row.appendChild(arrow);
      }
      const card = document.createElement("div");
      card.className = variant === "timeline" ? "moment" : "flow-step";
      card.setAttribute("role", "listitem");
      if (variant === "flow") {
        const n = document.createElement("span");
        n.className = "flow-n";
        n.textContent = String(i + 1).padStart(2, "0");
        card.appendChild(n);
      }
      if (variant === "timeline") {
        const w = document.createElement("div");
        w.className = "moment-when";
        w.contentEditable = "true";
        w.dataset.when = String(i);
        w.dataset.placeholder = "When";
        w.textContent = when[i] ?? "";
        const dot = document.createElement("span");
        dot.className = "moment-dot";
        dot.setAttribute("aria-hidden", "true");
        card.append(w, dot);
      }
      const t = document.createElement("div");
      t.className = "flow-text";
      t.contentEditable = "true";
      t.dataset.step = String(i);
      t.textContent = text;
      card.appendChild(t);
      row.appendChild(card);
    });
    const tools = document.createElement("div");
    tools.className = "tbl-tools";
    const add = document.createElement("button");
    add.className = "label";
    add.textContent = variant === "flow" ? "+ Step" : variant === "columns" ? "+ Column" : "+ Moment";
    add.addEventListener("mousedown", (e) => e.preventDefault());
    add.addEventListener("click", () => {
      if (variant === "columns" && steps.length >= 4) return;
      this.updateFlow(b.id, (st) => [...st, ""]);
      requestAnimationFrame(() => this.focusStep(b.id, steps.length));
    });
    tools.appendChild(add);
    el.append(row, tools);
    if (b.trail?.length) {
      const t = document.createElement("span");
      t.className = "trail";
      t.dataset.ui = "1";
      t.textContent = b.trail[b.trail.length - 1];
      t.title = b.trail.join("  ·  ");
      el.appendChild(t);
    }
    if (focusAt !== undefined) this.focusStep(b.id, Number(focusAt));
  }

  // ------------------------------------------------------------------ charts

  /** Charts are drawn from data with tokens: idea colors only, hairlines, mono labels. */
  private paintChart(el: HTMLElement, b: Block) {
    el.contentEditable = "false";
    const c = b.chart;
    const sig = JSON.stringify(c ?? null);
    if (el.dataset.sig === sig) return;
    el.dataset.sig = sig;
    el.textContent = "";
    if (!c) return;
    const fig = document.createElement("figure");
    fig.className = "chart";
    fig.innerHTML = renderChartSvg(c);
    const cap = document.createElement("figcaption");
    cap.className = "chart-cap";
    const meta = document.createElement("span");
    meta.className = "label";
    meta.textContent = [`${c.type} chart`, c.series.length > 1 ? c.series.map((x) => x.name).join(" · ") : "", c.unit ?? "", c.source ? `Source: ${c.source}` : "No source yet"].filter(Boolean).join(" · ");
    cap.appendChild(meta);
    const tools = document.createElement("span");
    tools.className = "chart-tools";
    for (const [label, kind] of [["Edit as table", "table"]] as const) {
      const btn = document.createElement("button");
      btn.className = "label";
      btn.textContent = label;
      btn.addEventListener("mousedown", (e) => e.preventDefault());
      btn.addEventListener("click", () => this.cb.onTurnInto?.(b.id, kind));
      tools.appendChild(btn);
    }
    for (const t of ["bar", "line", "histogram"] as const) {
      if (t === c.type || (t === "histogram") !== (c.type === "histogram")) continue;
      const btn = document.createElement("button");
      btn.className = "label";
      btn.textContent = t === "bar" ? "Bars" : "Line";
      btn.addEventListener("mousedown", (e) => e.preventDefault());
      btn.addEventListener("click", () => this.commit([{ t: "update", id: b.id, patch: { chart: { ...c, type: t } } }], "Chart type"));
      tools.appendChild(btn);
    }
    cap.appendChild(tools);
    fig.appendChild(cap);
    el.appendChild(fig);
  }

  // ------------------------------------------------------------------ media

  private paintImage(el: HTMLElement, b: Block) {
    el.contentEditable = "false";
    const m = b.media;
    const sig = JSON.stringify([m?.src?.slice(0, 64), m?.src?.length, m?.credit, b.text]);
    if (el.dataset.sig === sig) return;
    el.dataset.sig = sig;
    el.textContent = "";
    if (!m) return;
    const fig = document.createElement("figure");
    fig.className = "media";
    const img = document.createElement("img");
    img.src = m.src;
    img.alt = m.alt ?? b.text ?? "";
    img.loading = "lazy";
    img.decoding = "async";
    fig.appendChild(img);
    const cap = document.createElement("figcaption");
    const words = document.createElement("span");
    words.className = "media-caption";
    words.textContent = b.text && !/^Image ·/.test(b.text) ? b.text : "";
    cap.appendChild(words);
    const credit = document.createElement("span");
    credit.className = "label";
    if (m.via === "generated") credit.textContent = "Generated";
    else if (m.credit) {
      if (m.creditUrl) {
        const a = document.createElement("a");
        a.href = m.creditUrl;
        a.target = "_blank";
        a.rel = "noreferrer";
        a.textContent = m.credit;
        credit.appendChild(a);
      } else credit.textContent = m.credit;
    }
    cap.appendChild(credit);
    fig.appendChild(cap);
    el.appendChild(fig);
  }

  private paintEmbed(el: HTMLElement, b: Block) {
    el.contentEditable = "false";
    const sig = JSON.stringify([b.url]);
    if (el.dataset.sig === sig) return;
    el.dataset.sig = sig;
    el.textContent = "";
    if (!b.url) return;
    const src = embedSrc(b.url);
    if (src) {
      const box = document.createElement("div");
      box.className = "embed";
      const frame = document.createElement("iframe");
      frame.src = src;
      frame.title = b.text || "Embedded video";
      frame.loading = "lazy";
      frame.allow = "accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen";
      frame.referrerPolicy = "strict-origin-when-cross-origin";
      frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-presentation allow-popups");
      box.appendChild(frame);
      el.appendChild(box);
    }
    const cap = document.createElement("a");
    cap.className = "label embed-link";
    cap.href = b.url;
    cap.target = "_blank";
    cap.rel = "noreferrer";
    cap.textContent = src ? hostOf(b.url) : `${hostOf(b.url)} · Open`;
    el.appendChild(cap);
  }

  private focusStep(id: string, i: number) {
    const s = this.els.get(id)?.querySelector<HTMLElement>(`[data-step="${i}"]`);
    if (s) placeCaretEnd(s);
    return !!s;
  }

  private updateFlow(id: string, fn: (steps: string[]) => string[], coalesce?: string) {
    const b = this.engine().block(id);
    if (!b?.steps) return;
    const steps = fn([...b.steps]);
    const when = b.kind === "timeline" ? steps.map((_, i) => b.when?.[i] ?? "") : undefined;
    const text = b.kind === "columns" ? `Columns · ${steps.join(" | ")}` : b.kind === "timeline" ? `Timeline · ${steps.map((st, i) => `${when![i] ? `${when![i]}: ` : ""}${st}`).join(" · ")}` : flowSummary(steps);
    this.commit([{ t: "update", id, patch: { steps, text, ...(when ? { when } : {}) } }], "Edit flow", coalesce);
  }

  private onStepInput(cell: HTMLElement) {
    const el = cell.closest<HTMLElement>(".blk");
    const id = el?.dataset.id;
    if (!el || !id) return;
    const i = Number(cell.dataset.step);
    const text = (cell.textContent ?? "").replace(/\n/g, " ");
    const b0 = this.engine().block(id);
    this.updateFlow(
      id,
      (st) => {
        st[i] = text;
        el.dataset.sig = JSON.stringify([b0?.kind, st, b0?.when ?? [], b0?.trail?.at(-1) ?? ""]);
        return st;
      },
      `step:${id}:${i}`,
    );
  }

  private onWhenInput(cell: HTMLElement) {
    const el = cell.closest<HTMLElement>(".blk");
    const id = el?.dataset.id;
    const b = id ? this.engine().block(id) : undefined;
    if (!el || !id || !b?.steps) return;
    const i = Number(cell.dataset.when);
    const when = [...(b.when ?? b.steps.map(() => ""))];
    when[i] = (cell.textContent ?? "").replace(/\n/g, " ");
    el.dataset.sig = JSON.stringify([b.kind, b.steps, when, b.trail?.at(-1) ?? ""]);
    this.commit([{ t: "update", id, patch: { when, text: `Timeline · ${b.steps.map((st, k) => `${when[k] ? `${when[k]}: ` : ""}${st}`).join(" · ")}` } }], "Edit timeline", `when:${id}:${i}`);
  }

  private flowKey(e: KeyboardEvent, cell: HTMLElement): boolean {
    const id = cell.closest<HTMLElement>(".blk")!.dataset.id!;
    const i = Number(cell.dataset.step);
    const b = this.engine().block(id);
    if (!b?.steps) return false;
    if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
      e.preventDefault();
      const next = i + (e.shiftKey ? -1 : 1);
      if (!this.focusStep(id, next) && !e.shiftKey) {
        this.updateFlow(id, (st) => [...st.slice(0, i + 1), "", ...st.slice(i + 1)]);
        requestAnimationFrame(() => this.focusStep(id, i + 1));
      }
      return true;
    }
    return false;
  }

  private updateTable(id: string, fn: (d: TableData) => TableData, coalesce?: string) {
    const b = this.engine().block(id);
    if (!b?.data) return;
    const data = fn(structuredClone(b.data));
    this.commit([{ t: "update", id, patch: { data, text: tableSummary(data) } }], "Edit table", coalesce);
  }

  private onCellInput(cell: HTMLElement) {
    const el = cell.closest<HTMLElement>(".blk");
    const id = el?.dataset.id;
    if (!el || !id) return;
    const r = Number(cell.dataset.r);
    const c = Number(cell.dataset.c);
    const text = (cell.textContent ?? "").replace(/\n/g, " ");
    this.updateTable(
      id,
      (d) => {
        if (r < 0) d.columns[c] = text;
        else d.rows[r][c] = text;
        // Keep the painted signature in step so typing never rebuilds the table under the caret.
        el.dataset.sig = JSON.stringify(d);
        return d;
      },
      `cell:${id}:${r}:${c}`,
    );
  }

  /** Tab moves between cells; Enter goes down a row, adding one at the end. */
  private tableKey(e: KeyboardEvent, cell: HTMLElement): boolean {
    const el = cell.closest<HTMLElement>(".blk")!;
    const id = el.dataset.id!;
    const r = Number(cell.dataset.r);
    const c = Number(cell.dataset.c);
    const b = this.engine().block(id);
    if (!b?.data) return false;
    const cols = b.data.columns.length;
    const go = (rr: number, cc: number) => {
      const next = el.querySelector<HTMLElement>(`[data-r="${rr}"][data-c="${cc}"]`);
      if (next) placeCaretEnd(next);
      return !!next;
    };
    if (e.key === "Tab") {
      e.preventDefault();
      const idx = (r + 1) * cols + c + (e.shiftKey ? -1 : 1);
      const rr = Math.floor(idx / cols) - 1;
      const cc = ((idx % cols) + cols) % cols;
      if (!go(rr, cc) && !e.shiftKey) {
        this.updateTable(id, (d) => ({ ...d, rows: [...d.rows, d.columns.map(() => "")] }));
        requestAnimationFrame(() => go(b.data!.rows.length, 0));
      }
      return true;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!go(r + 1, c)) {
        this.updateTable(id, (d) => ({ ...d, rows: [...d.rows, d.columns.map(() => "")] }));
        requestAnimationFrame(() => go(r + 1, c));
      }
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ slash menu

  private checkSlash() {
    const c = this.caret();
    const b = c ? this.engine().block(c.id) : null;
    if (b && b.kind !== "table" && b.kind !== "heading" && /^\/[\w ]{0,20}$/.test(b.text) && c!.offset === b.text.length) {
      this.cb.onSlash?.(b.id, b.text.slice(1).trim().toLowerCase());
    } else this.cb.onSlash?.(null, "");
  }

  private paint(el: HTMLElement, b: Block, label: string | undefined, dim: boolean) {
    el.dataset.kind = b.kind;
    el.classList.toggle("wet", b.wet);
    setAttr(el, "data-theme", b.kind === "heading" ? b.theme : undefined);
    setAttr(el, "data-tab", b.tab);
    const isNext = b.kind === "heading" && NEXT.test(b.text);
    setAttr(el, "data-label", b.kind === "heading" ? (isNext ? "" : (label ?? "")) : undefined);
    el.classList.toggle("next", isNext);
    setAttr(el, "data-dim", dim ? "1" : undefined);
    el.style.setProperty("--depth", String(b.depth ?? 0));
    if (b.kind === "heading") el.setAttribute("role", "heading");
    else el.removeAttribute("role");
    setAttr(el, "data-form", FORM_LABEL[b.kind]);

    if (b.kind === "table") {
      this.paintTable(el, b);
      return;
    }
    if (b.kind === "flow" || b.kind === "columns" || b.kind === "timeline") {
      this.paintFlow(el, b);
      return;
    }
    if (b.kind === "chart") {
      this.paintChart(el, b);
      return;
    }
    if (b.kind === "image") {
      this.paintImage(el, b);
      return;
    }
    if (b.kind === "embed") {
      this.paintEmbed(el, b);
      return;
    }
    if (el.dataset.sig !== undefined) {
      // Was a table: back to an editable text block.
      el.removeAttribute("contenteditable");
      delete el.dataset.sig;
      el.textContent = "";
    }

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

    // Every heading can fold what's under it: Phlo's toggle.
    let fold = el.querySelector<HTMLElement>(":scope > .fold");
    if (b.kind === "heading" && !NEXT.test(b.text)) {
      if (!fold) {
        fold = document.createElement("span");
        fold.className = "fold";
        fold.dataset.ui = "1";
        fold.contentEditable = "false";
        fold.setAttribute("role", "button");
        fold.title = "Fold";
        el.appendChild(fold);
      }
      fold.setAttribute("aria-expanded", String(!b.collapsed));
    } else fold?.remove();

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
        if (ISLAND_KINDS.includes(b.kind)) {
          prevId = id;
          continue;
        }
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
    if (this.cb.onMenuKey?.(e)) return;
    const step = (e.target as HTMLElement)?.closest?.("[data-step],[data-when]") as HTMLElement | null;
    if (step) {
      if (step.dataset.step !== undefined && this.flowKey(e, step)) return;
      if (e.key !== "z") return;
    }
    const cell = (e.target as HTMLElement)?.closest?.("td,th") as HTMLElement | null;
    if (cell && this.tableKey(e, cell)) return;
    if (cell && e.key !== "z") return;
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

export function embedSrc(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    let id: string | null = null;
    if (host === "youtu.be") id = u.pathname.slice(1);
    else if (host.endsWith("youtube.com")) id = u.searchParams.get("v") ?? (u.pathname.match(/\/(?:embed|shorts|live)\/([\w-]{6,})/)?.[1] ?? null);
    if (id && /^[\w-]{6,20}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}`;
    const loom = host === "loom.com" && u.pathname.match(/\/share\/([\w-]+)/)?.[1];
    if (loom) return `https://www.loom.com/embed/${loom}`;
    if (host === "vimeo.com" && /^\/\d+/.test(u.pathname)) return `https://player.vimeo.com/video${u.pathname}`;
    if (host === "figma.com" || host.endsWith(".figma.com")) return `https://www.figma.com/embed?embed_host=phlo&url=${encodeURIComponent(url)}`;
  } catch {
    /* not a URL */
  }
  return null;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const SERIES_COLORS = ["var(--cobalt)", "var(--teal)", "var(--saffron)"];

function fmt(v: number, unit?: string): string {
  const abs = Math.abs(v);
  const n = abs >= 1e6 ? `${+(v / 1e6).toFixed(1)}M` : abs >= 1e4 ? `${+(v / 1e3).toFixed(1)}k` : `${+v.toFixed(2)}`;
  return unit === "$" ? `$${n}` : unit === "%" ? `${n}%` : n;
}

function esc(t: string): string {
  return t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** Bar, line and histogram as SVG, from tokens only. One series highlighted (cobalt), up to three. */
export function renderChartSvg(c: ChartData): string {
  const W = 640;
  const H = 260;
  const L = 48;
  const R = 12;
  const T = 16;
  const B = 36;
  let labels = c.labels;
  let series = c.series;
  if (c.type === "histogram") {
    const vals = c.series[0].values;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const bins = Math.max(4, Math.min(12, Math.round(Math.sqrt(vals.length))));
    const w = (max - min) / bins || 1;
    const counts = Array(bins).fill(0);
    for (const v of vals) counts[Math.min(bins - 1, Math.floor((v - min) / w))]++;
    labels = counts.map((_, i) => fmt(min + i * w));
    series = [{ name: "Count", values: counts }];
  }
  const all = series.flatMap((x) => x.values);
  const maxV = Math.max(0, ...all);
  const minV = Math.min(0, ...all);
  const span = maxV - minV || 1;
  const nice = (v: number) => {
    const p = 10 ** Math.floor(Math.log10(Math.abs(v) || 1));
    return Math.ceil(v / p) * p;
  };
  const top = nice(maxV) || 1;
  const yScale = (v: number) => T + (H - T - B) * (1 - (v - minV) / (Math.max(top, maxV) - minV || span));
  const plotW = W - L - R;
  const parts: string[] = [];
  for (let g = 0; g <= 4; g++) {
    const v = minV + ((Math.max(top, maxV) - minV) * g) / 4;
    const y = yScale(v);
    parts.push(`<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="var(--hairline)" stroke-width="1"/>`);
    parts.push(`<text x="${L - 8}" y="${y + 4}" text-anchor="end" class="ax">${esc(fmt(v, c.unit))}</text>`);
  }
  const n = labels.length;
  const slot = plotW / Math.max(1, n);
  if (c.type === "line") {
    series.forEach((sr, k) => {
      const pts = sr.values.map((v, i) => `${L + slot * (i + 0.5)},${yScale(v)}`).join(" ");
      parts.push(`<polyline points="${pts}" fill="none" stroke="${SERIES_COLORS[k % 3]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`);
      sr.values.forEach((v, i) => parts.push(`<circle cx="${L + slot * (i + 0.5)}" cy="${yScale(v)}" r="3.5" fill="var(--paper)" stroke="${SERIES_COLORS[k % 3]}" stroke-width="2"><title>${esc(`${labels[i]}: ${fmt(v, c.unit)}`)}</title></circle>`));
    });
  } else {
    const gap = c.type === "histogram" ? 1 : Math.min(18, slot * 0.28);
    const bw = (slot - gap) / series.length;
    series.forEach((sr, k) => {
      sr.values.forEach((v, i) => {
        const x = L + slot * i + gap / 2 + bw * k;
        const y = yScale(Math.max(v, 0));
        const h = Math.abs(yScale(v) - yScale(0));
        parts.push(`<rect x="${x}" y="${y}" width="${Math.max(1, bw)}" height="${Math.max(0, h)}" rx="1" fill="${SERIES_COLORS[k % 3]}"><title>${esc(`${labels[i]}: ${fmt(v, c.unit)}`)}</title></rect>`);
        if (c.type === "bar" && series.length === 1 && n <= 12) parts.push(`<text x="${x + bw / 2}" y="${y - 6}" text-anchor="middle" class="val">${esc(fmt(v, c.unit))}</text>`);
      });
    });
  }
  parts.push(`<line x1="${L}" x2="${W - R}" y1="${yScale(0)}" y2="${yScale(0)}" stroke="var(--ink-muted)" stroke-width="1"/>`);
  const every = Math.ceil(n / 12);
  labels.forEach((l, i) => {
    if (i % every) return;
    parts.push(`<text x="${L + slot * (i + 0.5)}" y="${H - B + 20}" text-anchor="middle" class="ax">${esc(l.length > 14 ? `${l.slice(0, 13)}…` : l)}</text>`);
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${c.type} chart: ${labels.map((l, i) => `${l} ${series.map((x) => fmt(x.values[i], c.unit)).join("/")}`).join(", ")}`)}">${parts.join("")}</svg>`;
}

function placeCaretEnd(el: HTMLElement) {
  el.focus();
  const sel = document.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
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
