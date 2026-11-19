/**
 * Phlo renderer: the four screens from docs/design/phlo-handoff/screens
 * (Start, Talking, Room view, Sidebar open) as states of one Draft view.
 */
import { DocEngine, type Op } from "../engine/engine";
import { newId } from "../engine/ids";
import { emptyDraft, ISLAND_KINDS, sections, substantiveSectionCount, type Block, type Draft, type PublishedPiece, type Role } from "../engine/model";
import { buildRequest, compilePlan, contentWords, headingOf, type SettleResponse } from "../engine/settle";
import { host, HostError, type HostSettings } from "./bridge";
import { Editor, embedSrc, inPage } from "./editor/view";
import { chartSummary, FORM_OPTIONS, suggestForm, turnIntoOps, type FormOption, type MediaAction } from "../engine/forms";
import { parseVoiceIntent } from "../engine/intents";
import { BrowserSTT, browserSttAvailable, UtteranceSTT, type Stt } from "./voice/stt";

// ============================================================================ helpers

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text = ""): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text) el.textContent = text;
  return el;
}
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const day = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode */
    }
  },
};

// ============================================================================ markup

const app = $("app");
app.innerHTML = `
  <nav class="rail" aria-label="Main">
    <button class="symbol" id="open-side" aria-label="Open sidebar" title="Drafts (⌘\\)"><img src="./brand/phlo-symbol.svg" alt="" data-light="./brand/phlo-symbol.svg" data-dark="./brand/phlo-symbol-dark.svg"></button>
    <button class="round-btn" id="new-draft" aria-label="New draft" title="New draft">+</button>
  </nav>
  <nav class="sidebar" aria-label="Drafts and references">
    <div class="head">
      <span class="lockup"><img src="./brand/phlo-symbol.svg" alt="" data-light="./brand/phlo-symbol.svg" data-dark="./brand/phlo-symbol-dark.svg"><span class="wordmark">phlo</span></span>
      <button class="label" id="close-side" aria-label="Close sidebar">Close</button>
    </div>
    <div class="group"><div class="label">Drafts</div><div id="draft-list"></div><button class="side-link muted" id="new-draft-2">New draft</button></div>
    <div class="group"><div class="label" id="pub-label">Published</div><div id="pub-list"></div></div>
    <div class="group"><div class="label">References · this draft</div><div id="ref-list" style="display:flex;flex-direction:column;gap:8px"></div></div>
    <div class="foot"><button class="side-link" id="your-ai">Your AI</button></div>
  </nav>
  <main class="main" id="main">
    <header class="topbar">
      <div class="label crumb" id="crumb">Drafts / New</div>
      <div class="actions">
        <div class="role" role="group" aria-label="Phlo's role">
          <button id="role-partner" aria-pressed="true" title="Phlo helps you think">Partner</button>
          <button id="role-scribe" aria-pressed="false" title="Phlo organizes only your words">Scribe</button>
        </div>
        <button class="publish" id="publish">Publish</button>
        <button class="more" id="more" aria-label="More" aria-haspopup="menu">···</button>
      </div>
    </header>
    <div class="menu" id="menu" role="menu">
      <button role="menuitem" id="m-transcript">Transcript</button>
      <button role="menuitem" id="m-room">Room view <span class="meta">⌘⇧R</span></button>
      <button role="menuitem" id="m-theme">Sumi</button>
      <hr>
      <button role="menuitem" id="m-ai">Your AI</button>
    </div>
    <header class="room-head">
      <div class="label" id="room-title"></div>
      <div class="right"><span class="dot" aria-hidden="true"></span><span class="label" id="room-role">Scribe · your words only</span></div>
    </header>
    <div class="scroller" id="scroller">
      <article class="page page-draft" id="page">
        <section class="start" id="start">
          <div class="label" id="start-meta"></div>
          <h1>Start talking.</h1>
          <p>Or just type. Phlo will organize it as you go.</p>
          <div class="hints"><span class="label">Space · hold to talk</span><span class="label">⌘V · paste a reference</span></div>
        </section>
        <div class="head-block">
          <h1 class="title" id="title" contenteditable="true" spellcheck="true" data-placeholder="Untitled"></h1>
          <div class="label session" id="session"></div>
        </div>
        <div class="doc" id="doc"></div>
      </article>
      <section class="reader" id="reader"></section>
    </div>
    <aside class="tabs" id="tabs" aria-label="Tabs"><div class="label">Tabs</div></aside>
    <div class="voice-wrap">
      <button class="voice" id="voice" data-state="idle" aria-label="Talk"><span class="core"></span></button>
      <div class="label voice-label" id="voice-label">Hold space to talk</div>
    </div>
    <aside class="panel" id="transcript" aria-label="Transcript">
      <div class="head"><span class="label">Transcript</span><button class="label" id="close-transcript">Close</button></div>
      <div id="segments"></div>
    </aside>
    <div class="toast" id="toast" role="status"></div>
    <div class="forms-menu" id="forms-menu" role="listbox" aria-label="Forms"></div>
  </main>
  <dialog class="settings" id="settings">
    <form method="dialog">
      <h2>Your AI</h2>
      <label class="label">Settle with<select name="provider"><option value="chatgpt">ChatGPT · your plan, through Codex</option><option value="claude">Claude · API key</option><option value="compat">Open model · Ollama, LM Studio, OpenRouter…</option><option value="local">On this Mac only · fast rules</option></select></label>
      <p class="note" id="provider-note"></p>
      <div id="compat-fields">
        <div class="row-head"><span class="label" id="compat-title">Backup cloud model</span><button type="button" class="label linkish" id="use-openrouter">Use OpenRouter · GPT-6 Luna</button></div>
        <p class="note" id="compat-note">Used when your plan is signed out or at its limit. Any OpenAI-compatible service: OpenRouter, Groq, Together, or Ollama on this Mac.</p>
        <label class="label">Endpoint<input name="compatBaseUrl" autocomplete="off" placeholder="http://127.0.0.1:11434/v1" /></label>
        <label class="label">Model<input name="compatModel" autocomplete="off" placeholder="qwen3:8b" /></label>
        <label class="label">Model does<select name="compatMode"><option value="route">Placement only · fastest (Phlo cleans the words)</option><option value="full">Placement and wording</option></select></label>
        <label class="label">Key (hosted endpoints only)<input type="password" name="compatKey" autocomplete="off" placeholder="Leave empty for a model on this Mac" /></label>
      </div>
      <div id="claude-fields">
      <label class="label">Claude key<input type="password" name="claudeKey" autocomplete="off" placeholder="sk-ant-…" /></label>
      <p class="note" id="claude-note"></p>
      </div>
      <label class="label">Transcription key (OpenAI)<input type="password" name="openaiKey" autocomplete="off" placeholder="sk-…" /></label>
      <p class="note" id="openai-note"></p>
      <label class="label">Theme<select name="theme"><option value="system">System</option><option value="paper">Paper</option><option value="sumi">Sumi</option></select></label>
      <p class="note" id="storage-note"></p>
      <div class="row"><span class="meta" id="stats-meta"></span><button class="primary" value="save">Save</button></div>
    </form>
  </dialog>
`;

const titleEl = $<HTMLHeadingElement>("title");
const docEl = $<HTMLDivElement>("doc");
const voiceBtn = $<HTMLButtonElement>("voice");
const voiceLabel = $<HTMLDivElement>("voice-label");
const toastEl = $<HTMLDivElement>("toast");
const publishBtn = $<HTMLButtonElement>("publish");
const menuEl = $<HTMLDivElement>("menu");

const liveEl = h("div", { class: "live", "data-ui": "1", contenteditable: "false", "aria-live": "polite" });
const asksEl = h("div", { class: "asks", "data-ui": "1", contenteditable: "false" });
const hintEl = h("div", { class: "label hint-once", "data-ui": "1", contenteditable: "false" }, "Finish the paragraph to settle · ⌘↵ now");

if (host.platform() === "darwin") document.body.classList.add("desktop-mac");

// ============================================================================ state

let engine = new DocEngine(emptyDraft("boot"));
let unsubscribe: (() => void) | null = null;
let settings: HostSettings | null = null;
let currentHeading: string | null = null;
let caretBlock: string | null = null;
const recentSettled: string[] = [];
let lastVoiceBlock: string | null = null;
let published: PublishedPiece[] = [];

const editor = new Editor(docEl, () => engine, {
  onParagraphEnd: () => settler.request("paragraph"),
  onCaretBlock: (id) => {
    const prev = caretBlock;
    caretBlock = id;
    if (id) {
      const b = engine.block(id);
      currentHeading = b?.kind === "heading" ? b.id : headingOf(engine.state.blocks, id);
    }
    // The caret left a wet run: the block you left settles.
    const prevBlock = prev ? engine.block(prev) : null;
    const nowBlock = id ? engine.block(id) : null;
    if (prevBlock?.wet && !(nowBlock?.wet && sameWetRun(prev!, id!))) settler.request("caret-left", 250);
  },
  onPaste: (e) => handlePaste(e),
  onUndo: () => undo(),
  onRedo: () => void engine.redo(),
  onSlash: (id, query) => (id ? openForms(id, "add", query) : formsMode === "add" && !formsStage && closeForms()),
  onFold: (id) => {
    const b = engine.block(id);
    if (b) engine.commit({ id: newId("tx"), actor: "user", label: b.collapsed ? "Unfold" : "Fold", ops: [{ t: "update", id, patch: { collapsed: !b.collapsed } }] });
  },
  onTurnInto: (id, kind) => turnInto(id, kind),
  onMenuKey: (e) => formsKey(e),
});

function sameWetRun(a: string, b: string): boolean {
  const blocks = engine.state.blocks.filter(inPage);
  let i = blocks.findIndex((x) => x.id === a);
  let j = blocks.findIndex((x) => x.id === b);
  if (i < 0 || j < 0) return false;
  if (i > j) [i, j] = [j, i];
  for (let k = i; k <= j; k++) if (!blocks[k].wet) return false;
  return true;
}

const isEmptyDraft = () => !engine.state.title.trim() && !engine.state.blocks.some((b) => b.text.trim()) && !liveEl.textContent;

// ============================================================================ toast

let toastTimer = 0;
function toast(msg: string, action?: { label: string; run: () => void }, ms = 3200) {
  toastEl.textContent = msg;
  if (action) {
    const b = h("button", {}, action.label);
    b.onclick = () => {
      action.run();
      toastEl.classList.remove("show");
    };
    toastEl.appendChild(b);
  }
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove("show"), ms);
}

// ============================================================================ persistence

let saveTimer = 0;
let saving: Promise<void> = Promise.resolve();
function scheduleSave(delay = 500) {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => (saving = saving.then(saveNow)), delay);
}
async function saveNow() {
  const journal = engine.drainJournal();
  if (!journal.length) return;
  const snap = engine.snapshot();
  if (snap.id === "boot") return;
  try {
    await host.saveDraft(snap, journal);
  } catch (e) {
    if (e instanceof HostError && e.code === "VERSION_CONFLICT") {
      toast("This draft changed in another window.", { label: "Reload", run: () => void openDraft(snap.id) }, 8000);
    } else {
      toast("Couldn't save. Retrying.");
      scheduleSave(2000);
    }
  }
}
window.addEventListener("beforeunload", () => {
  clearTimeout(saveTimer);
  void saveNow();
});

// ============================================================================ render

function sessionCount(d: Draft): number {
  let n = 0;
  let last = 0;
  for (const s of d.transcript) {
    if (!last || s.at - last > 15 * 60_000) n++;
    last = s.at;
  }
  return n;
}

function render(settled?: string[]) {
  const d = engine.state;
  if (document.activeElement !== titleEl && titleEl.textContent !== d.title) titleEl.textContent = d.title;
  editor.render(d, { settled, dim: dimSet() });
  placeLive();
  document.body.classList.toggle("empty", isEmptyDraft());
  $("start-meta").textContent = `${day(d.createdAt)} · Draft`;
  const sessions = sessionCount(d);
  $("session").textContent = sessions ? `Session ${sessions} · ${talking ? "Talking" : "Paused"}` : `${day(d.createdAt)} · Draft`;
  $("crumb").textContent = `Drafts / ${d.title || (isEmptyDraft() ? "New" : "Untitled")}`;
  $("room-title").textContent = d.title || "Untitled";
  $("room-role").textContent = d.role === "scribe" ? "Scribe · your words only" : "Partner";
  publishBtn.classList.toggle("ready", substantiveSectionCount(d.blocks) >= 3);
  $("role-partner").setAttribute("aria-pressed", String(d.role === "partner"));
  $("role-scribe").setAttribute("aria-pressed", String(d.role === "scribe"));
  renderTabs();
  renderRefs();
  if ($("transcript").classList.contains("open")) renderTranscript();
}

/** Spotlight: while talking (and in Room view), the section being added to stays at 100%. */
function dimSet(): Set<string> {
  const out = new Set<string>();
  const on = talking || document.body.classList.contains("room");
  document.body.classList.toggle("spotlight", on && !!currentHeading);
  if (!on || !currentHeading) return out;
  let inSection = false;
  for (const b of engine.state.blocks) {
    if (b.kind === "heading") inSection = b.id === currentHeading;
    if (!inSection && !b.wet) out.add(b.id);
  }
  return out;
}

function repaintSpotlight() {
  editor.render(engine.state, { dim: dimSet() });
  placeLive();
}

const dismissedSuggestions = new Set<string>();

function renderTabs() {
  const box = $("tabs");
  box.querySelectorAll(".tab-card").forEach((n) => n.remove());
  const partner = engine.state.role === "partner";
  const tangents = partner ? engine.state.blocks.filter((b) => b.tab === "tangent" && !b.wet && b.text.trim()) : [];
  // Phlo suggests a form when the words already have its shape (Partner only, never mid-talk).
  const sug = partner && !talking ? suggestForm(engine.state.blocks.filter(inPage), dismissedSuggestions) : null;
  box.classList.toggle("has", tangents.length > 0 || !!sug);
  if (sug) {
    const card = h("div", { class: "tab-card suggest" });
    const actions = h("div", { class: "actions" });
    const yes = h("button", { class: "label linkish" }, sug.action);
    const no = h("button", { class: "label" }, "Not now");
    yes.onclick = () => {
      const conv = turnIntoOps(engine.state.blocks, sug.id, sug.kind);
      const txId = newId("tx");
      if (engine.commit({ id: txId, actor: "user", label: conv.label, ops: conv.ops }).ok) {
        render();
        toast(conv.label, { label: "Undo", run: () => void (engine.undo(txId), render()) });
      }
    };
    no.onclick = () => {
      dismissedSuggestions.add(sug.id);
      renderTabs();
    };
    actions.append(yes, no);
    card.append(h("div", { class: "label" }, "Phlo suggests"), h("p", {}, sug.text), actions);
    card.addEventListener("mouseenter", () => sug.ids.forEach((id) => editor.elementOf(id)?.classList.add("hint-target")));
    card.addEventListener("mouseleave", () => sug.ids.forEach((id) => editor.elementOf(id)?.classList.remove("hint-target")));
    box.appendChild(card);
  }
  for (const t of tangents.slice(-5)) {
    const card = h("button", { class: "tab-card", title: "Open it here" });
    card.append(h("div", { class: "label" }, "Tangent · later"), h("p", {}, t.text));
    card.onclick = () => openTangent(t.id);
    box.appendChild(card);
  }
}

/** Clicking a tab opens it in place: it joins the section you're in. */
function openTangent(id: string) {
  const blocks = engine.state.blocks;
  let after: string | null = blocks.filter(inPage).at(-1)?.id ?? null;
  if (currentHeading) {
    let i = blocks.findIndex((b) => b.id === currentHeading);
    while (i + 1 < blocks.length && blocks[i + 1].kind !== "heading") i++;
    after = blocks[i].id === id ? (blocks[i - 1]?.id ?? null) : blocks[i].id;
  }
  engine.commit({ id: newId("tx"), actor: "user", label: "Open tab", ops: [{ t: "update", id, patch: { tab: undefined } }, { t: "move", id, after }] });
  requestAnimationFrame(() => {
    editor.elementOf(id)?.scrollIntoView({ block: "center", behavior: "smooth" });
  });
}

function renderRefs() {
  const list = $("ref-list");
  list.innerHTML = "";
  const refs = engine.state.references;
  if (!refs.length) {
    list.appendChild(h("div", { class: "side-link muted" }, "Paste a link or screenshot."));
    return;
  }
  for (const r of refs.slice().reverse()) {
    const card = h("div", { class: `ref-card ${r.kind}` });
    card.appendChild(h("span", { class: "label" }, r.kind === "image" ? "Screenshot" : "Link"));
    if (r.kind === "image" && r.dataUrl) card.appendChild(h("img", { src: r.dataUrl, alt: r.title }));
    else if (r.url) {
      const a = h("a", { href: r.url, target: "_blank", rel: "noreferrer" }, r.title);
      card.appendChild(a);
    } else card.appendChild(h("div", {}, r.title));
    list.appendChild(card);
  }
}

function renderTranscript() {
  const box = $("segments");
  box.innerHTML = "";
  const segs = engine.state.transcript;
  if (!segs.length) {
    box.appendChild(h("p", { class: "empty-note" }, "Nothing said yet. Hold space to talk."));
    return;
  }
  const t0 = segs[0].at;
  for (const s of segs) {
    const secs = Math.round((s.at - t0) / 1000);
    const row = h("div", { class: "seg" });
    row.append(h("span", { class: "meta" }, `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`), h("span", {}, s.text));
    box.appendChild(row);
  }
}

// ============================================================================ drafts

async function openDraft(id?: string) {
  await saving;
  clearTimeout(saveTimer);
  await saveNow();
  load(await host.openDraft(id));
}

function load(d: Draft) {
  unsubscribe?.();
  stopTalking();
  engine = new DocEngine(d);
  recentSettled.length = 0;
  currentHeading = null;
  lastVoiceBlock = null;
  clearAsk();
  if (!d.blocks.some(inPage)) {
    engine.commit({
      id: newId("tx"),
      actor: "system",
      label: "Start",
      noHistory: true,
      ops: [{ t: "insert", block: { id: newId("b"), kind: "paragraph", text: "", wet: true, rev: 0, origin: "typed" }, after: null }],
    });
  }
  unsubscribe = engine.subscribe((_d, tx) => {
    if (tx?.actor !== "phlo") render();
    scheduleSave();
    refreshLists();
  });
  setView("draft");
  setRoom(false);
  render();
  refreshLists();
  // The caret is in the page, so typing works immediately. On an empty draft Space still talks.
  requestAnimationFrame(() => editor.focusEnd());
}

let listTimer = 0;
function refreshLists() {
  clearTimeout(listTimer);
  listTimer = window.setTimeout(async () => {
    const [list, pubs] = await Promise.all([host.listDrafts().catch(() => []), host.listPublished().catch(() => [])]);
    published = pubs;
    const el = $("draft-list");
    el.innerHTML = "";
    for (const s of list.slice(0, 40)) {
      const cur = s.id === engine.state.id;
      if (!cur && !s.words && !s.title) continue; // don't list empty drafts
      const b = h("button", { class: "side-link" });
      if (cur) {
        b.setAttribute("aria-current", "true");
        b.appendChild(h("span", { class: "now", "aria-hidden": "true" }));
      }
      b.appendChild(h("span", { class: "t" }, (cur ? engine.state.title : s.title) || "Untitled"));
      b.onclick = () => void openDraft(s.id);
      el.appendChild(b);
    }
    $("pub-label").textContent = `Published · ${pubs.length}`;
    const pl = $("pub-list");
    pl.innerHTML = "";
    for (const p of pubs.slice(0, 20)) {
      const b = h("button", { class: "side-link" });
      b.appendChild(h("span", { class: "t" }, p.title));
      b.onclick = () => showReader(p);
      pl.appendChild(b);
    }
  }, 250);
}

titleEl.addEventListener("input", () => {
  const text = (titleEl.textContent ?? "").replace(/\n/g, " ");
  engine.commit({ id: newId("tx"), actor: "user", label: "Title", coalesce: "title", ops: [{ t: "meta", patch: { title: text, titleAuto: !text.trim() } }] });
});
titleEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    editor.focusEnd();
  }
});
$("page").addEventListener("mousedown", (e) => {
  // Clicking the start screen puts you in the page.
  if (document.body.classList.contains("empty") && !(e.target as HTMLElement).closest(".doc,.title")) {
    e.preventDefault();
    editor.focusEnd();
  }
});

// ============================================================================ settle

/**
 * One request in flight per draft; words that arrive meanwhile fold into the
 * next. The block with the caret never moves (unless you press ⌘↵). A plan
 * that comes back after you typed into its words is rejected by the engine,
 * and we ask again with what's on the page now.
 */
class Settler {
  private inflight = false;
  private again = false;
  private force = false;
  private timer = 0;
  private conflicts = 0;

  get busy() {
    return this.inflight;
  }

  request(_reason: string, delay = 0, force = false) {
    if (force) this.force = true;
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.run(), delay);
  }

  private eligible(): string[] {
    const exclude = this.force ? null : caretBlock;
    return engine.state.blocks.filter((b) => b.wet && b.text.trim() && b.id !== exclude).map((b) => b.id);
  }

  private async run() {
    if (this.inflight) {
      this.again = true;
      return;
    }
    const ids = this.eligible();
    const force = this.force;
    this.force = false;
    if (!ids.length) return;
    this.inflight = true;
    setSettling(true);
    const req = buildRequest(engine.snapshot(), ids, { currentHeadingId: currentHeading, recent: recentSettled.slice(0, 5) });
    let res: SettleResponse | null = null;
    try {
      res = await host.settle(req);
    } catch (e) {
      if (!(e instanceof HostError && e.code === "SUPERSEDED")) toast("Phlo couldn't settle that. Your words are safe.");
    }
    if (res && engine.state.id === req.draftId) this.apply(req, res, force);
    this.inflight = false;
    setSettling(false);
    if (this.again) {
      this.again = false;
      this.request("again", 50);
    }
  }

  private apply(req: ReturnType<typeof buildRequest>, res: SettleResponse, force: boolean) {
    // Never move text under the caret: if you've since clicked into these words, wait.
    if (!force && caretBlock && req.wet.some((w) => w.id === caretBlock)) {
      this.again = false;
      return;
    }
    const compiled = compilePlan(engine.state, req, res.plan);
    const ops: Op[] = [...compiled.ops];
    // Sweep empty wet lines left behind (never the one you're on, never the last line).
    const visible = engine.state.blocks.filter(inPage);
    for (const b of visible) {
      if (b.wet && !b.text.trim() && b.id !== caretBlock && visible.length > 1 && !req.wet.some((w) => w.id === b.id)) {
        ops.push({ t: "delete", id: b.id, expectRev: b.rev });
      }
    }
    // The empty line you're on follows what just settled, so your next words land after it.
    const caret = caretBlock ? engine.block(caretBlock) : null;
    const lastPlaced = compiled.settledIds.filter((id) => engine.block(id)?.tab !== "tangent").at(-1);
    if (caret && caret.wet && !caret.text.trim() && lastPlaced && lastPlaced !== caret.id && !req.wet.some((w) => w.id === caret.id)) {
      ops.push({ t: "move", id: caret.id, after: lastPlaced });
    }
    const txId = newId("tx");
    const out = engine.commit({ id: txId, actor: "phlo", label: compiled.structural.length ? compiled.structural.join(" · ") : "Settle", ops });
    if (!out.ok) {
      if (++this.conflicts < 4) this.again = true;
      return;
    }
    this.conflicts = 0;
    for (const id of compiled.settledIds.slice().reverse()) recentSettled.unshift(id);
    recentSettled.splice(12);
    const placed = compiled.settledIds.filter((id) => engine.block(id)?.tab !== "tangent").at(-1);
    if (placed && talking) currentHeading = headingOf(engine.state.blocks, placed) ?? currentHeading;
    if (compiled.question && engine.state.role === "partner" && talking) showAsk(compiled.question);
    render(compiled.settledIds);
    // You asked for a structural change: say exactly what changed, with one-tap undo.
    if (compiled.structural.length) {
      toast(compiled.structural.join(" · "), {
        label: "Undo",
        run: () => {
          const r = engine.undo(txId);
          if (r && !r.ok) toast("That changed since. Nothing undone.");
          else render();
        },
      }, 6000);
    }
    if (caret && document.activeElement === docEl && engine.block(caret.id)) editor.setCaret(caret.id, 0);
    if (hintEl.isConnected && !engine.state.blocks.some((b) => b.wet && b.origin === "typed" && b.text.trim())) hintEl.remove();
    $("stats-meta").textContent = `${res.route === "model" ? (res.model ?? "Model") : res.route === "fallback" ? "Local fallback" : "Local"} · ${(res.latencyMs / 1000).toFixed(1)}s`.toUpperCase();
    // Say once when your plan isn't answering, and what's covering for it.
    if (res.note && !routeNoticeShown && /chatgpt|codex/i.test(res.note)) {
      routeNoticeShown = true;
      const via = res.route === "model" ? `your backup model (${res.model})` : "fast local rules";
      toast(`ChatGPT isn't answering, so Phlo is using ${via}.`, { label: "Your AI", run: () => void openSettings() }, 7000);
    }
  }
}
const settler = new Settler();
let routeNoticeShown = false;

function setSettling(on: boolean) {
  voiceBtn.classList.toggle("settling", on && !talking);
}

// ============================================================================ voice

let talking = false;
let locked = false;
let stt: Stt | null = null;
let interim = "";
let lastSpeechAt = 0;
let stallTimer = 0;

function chooseStt(): Stt | null {
  if (host.isDesktop()) return settings?.openai ? new UtteranceSTT() : browserSttAvailable() ? new BrowserSTT() : null;
  if (browserSttAvailable()) return new BrowserSTT();
  return settings?.openai ? new UtteranceSTT() : null;
}

/** Spoken words go to the end of the section you're in, else the end of the page (before Next). */
function voiceAnchor(): string | null {
  const blocks = engine.state.blocks.filter(inPage);
  if (lastVoiceBlock && blocks.some((b) => b.id === lastVoiceBlock && b.wet)) return lastVoiceBlock;
  if (currentHeading && blocks.some((b) => b.id === currentHeading)) {
    let i = blocks.findIndex((b) => b.id === currentHeading);
    while (i + 1 < blocks.length && blocks[i + 1].kind !== "heading") i++;
    return blocks[i].id;
  }
  const nextIdx = blocks.findIndex((b) => b.kind === "heading" && /^next( steps)?$/i.test(b.text));
  if (nextIdx > 0) return blocks[nextIdx - 1].id;
  return blocks.at(-1)?.id ?? null;
}

/** Live words show wet, right where Phlo will put them. */
function placeLive() {
  if (!liveEl.textContent) {
    liveEl.remove();
    return;
  }
  const anchor = voiceAnchor();
  const el = anchor ? editor.elementOf(anchor) : null;
  if (el) el.after(liveEl);
  else docEl.appendChild(liveEl);
  if (talking) liveEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function setVoiceLabel() {
  voiceLabel.textContent = !talking ? "Hold space to talk" : locked ? "Listening · tap space to stop" : "Listening · release space to stop";
}

/** Things you ask for aloud (an image, a chart, folding a section) happen directly and never become words on the page. */
function runIntent(clean: string): boolean {
  const intent = parseVoiceIntent(clean);
  if (!intent) return false;
  engine.commit({ id: newId("tx"), actor: "voice", label: "Speech", noHistory: true, ops: [{ t: "transcript", segment: { id: newId("t"), at: Date.now(), text: clean } }] });
  const anchor = voiceAnchor() ?? engine.state.blocks.at(-1)?.id ?? null;
  const add = (block: Block) => {
    if (!anchor) return;
    const txId = newId("tx");
    if (engine.commit({ id: txId, actor: "voice", label: `Add ${block.kind}`, ops: [{ t: "insert", block, after: anchor }] }).ok) {
      lastVoiceBlock = null;
      render([block.id]);
      editor.elementOf(block.id)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  };
  if (intent.type === "chart") {
    add({ id: newId("b"), kind: "chart", text: chartSummary(intent.chart), chart: intent.chart, wet: false, rev: 0, origin: "voice" });
    toast(`Made a ${intent.chart.type} chart${intent.title ? ` of ${intent.title.toLowerCase()}` : ""}. Say where the numbers come from to add a source.`, undefined, 5000);
  } else if (intent.type === "fold") {
    const want = contentWords(intent.name).join(" ");
    const h = engine.state.blocks.find((b) => b.kind === "heading" && (contentWords(b.text).join(" ") === want || b.text.toLowerCase().includes(intent.name.toLowerCase())));
    if (h) engine.commit({ id: newId("tx"), actor: "voice", label: intent.fold ? "Fold" : "Unfold", ops: [{ t: "update", id: h.id, patch: { collapsed: intent.fold } }] });
    else toast(`No section called “${intent.name}”.`);
  } else if (intent.type === "find-image") {
    toast(`Finding a photo of ${intent.query}…`, undefined, 8000);
    void host
      .findImages(intent.query)
      .then((found) => {
        const img = found[0];
        if (!img) return toast("No openly licensed photo found. Try other words.");
        add({ id: newId("b"), kind: "image", text: img.title, wet: false, rev: 0, origin: "voice", media: { src: img.url, alt: img.title, credit: img.credit, creditUrl: img.creditUrl, via: "web" } });
        toast("Added a photo, credited under it.");
      })
      .catch((e) => toast(e instanceof Error ? e.message : "Photo search failed."));
  } else if (intent.type === "generate-image") {
    toast(`Generating ${intent.prompt}…`, undefined, 30000);
    void host
      .generateImage(intent.prompt)
      .then((out) => {
        add({ id: newId("b"), kind: "image", text: intent.prompt, wet: false, rev: 0, origin: "voice", media: { src: out.dataUrl, alt: intent.prompt, via: "generated" } });
        toast("Image added.");
      })
      .catch((e) => toast(e instanceof Error ? e.message : "Image generation failed.", { label: "Your AI", run: () => void openSettings() }, 8000));
  }
  return true;
}

function addSpeech(text: string) {
  const clean = text.trim();
  if (!clean) return;
  if (runIntent(clean)) return;
  clearAsk();
  lastSpeechAt = performance.now();
  const blocks = engine.state.blocks;
  const segId = newId("t");
  const ops: Op[] = [{ t: "transcript", segment: { id: segId, at: Date.now(), text: clean } }];
  const visible = blocks.filter(inPage);
  const starter = visible.length === 1 && !visible[0].text ? visible[0] : null;
  // Talking takes your hands off the keyboard: a caret resting on an empty line lets go,
  // so spoken words there can settle.
  const resting = caretBlock ? engine.block(caretBlock) : null;
  if (resting && !resting.text.trim()) {
    docEl.blur();
    caretBlock = null;
  }
  let id: string;
  if (starter) {
    id = starter.id;
    ops.push({ t: "update", id, patch: { text: clean, origin: "voice", wet: true, sources: [segId] } });
  } else {
    id = newId("b");
    const block: Block = { id, kind: "paragraph", text: clean, wet: true, rev: 0, origin: "voice", sources: [segId] };
    ops.push({ t: "insert", block, after: voiceAnchor() });
  }
  engine.commit({ id: newId("tx"), actor: "voice", label: "Speech", ops });
  lastVoiceBlock = id;
  editor.elementOf(id)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  settler.request("speech", 900);
}

async function startTalking(lock = false) {
  if (talking) {
    if (lock) locked = true;
    setVoiceLabel();
    return;
  }
  if (!settings) settings = await host.getSettings().catch(() => null);
  stt = chooseStt();
  if (!stt) {
    toast("Add a transcription key in Your AI to talk.", { label: "Open", run: () => void openSettings() }, 6000);
    return;
  }
  talking = true;
  locked = lock;
  lastSpeechAt = performance.now();
  document.body.classList.add("talking");
  voiceBtn.dataset.state = "listening";
  voiceBtn.setAttribute("aria-label", "Stop talking");
  setVoiceLabel();
  render();
  repaintSpotlight();
  startStallWatch();
  try {
    await stt.start({
      onInterim: (t) => {
        interim = t;
        if (t) {
          clearAsk();
          lastSpeechAt = performance.now();
        }
        liveEl.textContent = t;
        placeLive();
        document.body.classList.toggle("empty", isEmptyDraft());
      },
      onFinal: (t) => {
        interim = "";
        liveEl.textContent = "";
        addSpeech(t);
      },
      onLevel: (l) => voiceBtn.style.setProperty("--level", String(1 + Math.min(0.25, l * 0.6))),
      onError: (m) => {
        toast(m, m.includes("Your AI") || m.includes("Settings") ? { label: "Open", run: () => void openSettings() } : undefined, 6000);
        stopTalking();
      },
    });
  } catch (e) {
    toast(e instanceof Error && e.name === "NotAllowedError" ? "Microphone access was blocked." : "Couldn't start the microphone.");
    stopTalking();
  }
}

function stopTalking() {
  if (!talking) return;
  talking = false;
  locked = false;
  stt?.stop();
  stt = null;
  if (interim) addSpeech(interim);
  interim = "";
  liveEl.textContent = "";
  clearTimeout(stallTimer);
  clearAsk();
  document.body.classList.remove("talking");
  voiceBtn.dataset.state = "idle";
  voiceBtn.setAttribute("aria-label", "Talk");
  voiceBtn.style.removeProperty("--level");
  setVoiceLabel();
  settler.request("stop", 150);
  render();
}

voiceBtn.addEventListener("click", () => (talking ? stopTalking() : void startTalking(true)));

// ---- PHLO ASKS: one question after ~8s of silence while Talk is locked on (Partner only)

function startStallWatch() {
  clearTimeout(stallTimer);
  stallTimer = window.setTimeout(async () => {
    if (!talking) return;
    const quiet = performance.now() - lastSpeechAt;
    if (locked && engine.state.role === "partner" && quiet >= 8000 && !asksEl.isConnected && !settler.busy && engine.state.blocks.some((b) => b.text.trim())) {
      const outline = engine.state.blocks
        .filter((b) => inPage(b) && !b.wet && b.text.trim())
        .map((b) => (b.kind === "heading" ? `## ${b.text}` : `- ${b.text}`))
        .join("\n");
      const section = currentHeading ? (engine.block(currentHeading)?.text ?? null) : null;
      const { question } = await host.ask({ draftId: engine.state.id, outline, section }).catch(() => ({ question: null }));
      if (question && talking && performance.now() - lastSpeechAt >= 8000) showAsk(question);
    }
    startStallWatch();
  }, 1000);
}

function showAsk(q: string) {
  asksEl.innerHTML = "";
  asksEl.append(h("span", { class: "label" }, "Phlo asks"), document.createTextNode(q));
  const blocks = engine.state.blocks.filter(inPage);
  let anchor = blocks.at(-1)?.id;
  if (currentHeading) {
    let i = blocks.findIndex((b) => b.id === currentHeading);
    while (i + 1 < blocks.length && blocks[i + 1].kind !== "heading") i++;
    anchor = blocks[i]?.id;
  }
  const el = anchor ? editor.elementOf(anchor) : null;
  if (el) {
    el.after(asksEl);
    asksEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}
function clearAsk() {
  asksEl.remove();
}

// ---- Space: hold to talk, release to stop. Tap twice to lock on. ⌥Space works anywhere.

let spaceDownAt = 0;
let spaceStops = false;
let tapTimer = 0;
let tapPending = false;

function caretInText(): boolean {
  const a = document.activeElement as HTMLElement | null;
  return !!a && (a.isContentEditable || a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT");
}
function spaceTalks(e: KeyboardEvent): boolean {
  if (document.body.classList.contains("view-reader") || (document.querySelector("dialog[open]") as HTMLElement | null)) return false;
  if (e.altKey || locked || tapPending) return true;
  if (!caretInText()) return true;
  // An empty draft has nothing to type a space into: Space talks.
  return document.activeElement === docEl && isEmptyDraft();
}
window.addEventListener(
  "keydown",
  (e) => {
    if (e.code !== "Space" || e.metaKey || e.ctrlKey) return;
    if (!spaceTalks(e)) return;
    e.preventDefault();
    if (e.repeat) return;
    if (tapPending) {
      // Second tap: lock talking on.
      tapPending = false;
      clearTimeout(tapTimer);
      locked = true;
      setVoiceLabel();
      spaceDownAt = 0;
      return;
    }
    if (talking && locked) {
      spaceStops = true;
      return;
    }
    spaceDownAt = performance.now();
    void startTalking(false);
  },
  true,
);
window.addEventListener(
  "keyup",
  (e) => {
    if (e.code !== "Space") return;
    if (spaceStops) {
      spaceStops = false;
      stopTalking();
      return;
    }
    if (!spaceDownAt) return;
    const held = performance.now() - spaceDownAt;
    spaceDownAt = 0;
    if (locked) return;
    if (held < 280) {
      // A tap: wait briefly for a second tap before stopping.
      tapPending = true;
      tapTimer = window.setTimeout(() => {
        tapPending = false;
        if (!locked) stopTalking();
      }, 320);
    } else stopTalking();
  },
  true,
);

// ============================================================================ paste: references

function handlePaste(e: ClipboardEvent): boolean {
  const items = Array.from(e.clipboardData?.items ?? []);
  const img = items.find((i) => i.type.startsWith("image/"));
  // Pasting into the page puts things where your caret is; pasting elsewhere files them in References.
  const inPageAt = docEl.contains(e.target as Node) ? caretBlock : null;
  const pasted = (e.clipboardData?.getData("text/plain") ?? "").trim();
  if (img && inPageAt) {
    e.preventDefault();
    const file = img.getAsFile();
    if (file) void insertImageFile(inPageAt, file, "Pasted image");
    return true;
  }
  if (inPageAt && /^https?:\/\/\S+$/.test(pasted) && embedSrc(pasted)) {
    e.preventDefault();
    insertEmbed(inPageAt, pasted);
    return true;
  }
  if (img) {
    e.preventDefault();
    const file = img.getAsFile();
    if (!file) return true;
    const reader = new FileReader();
    reader.onload = () => addReference({ kind: "image", title: `Screenshot ${engine.state.references.length + 1}`, dataUrl: String(reader.result) });
    reader.readAsDataURL(file);
    return true;
  }
  const text = (e.clipboardData?.getData("text/plain") ?? "").trim();
  if (/^https?:\/\/\S+$/.test(text)) {
    e.preventDefault();
    let title = text;
    try {
      const u = new URL(text);
      title = `${u.hostname.replace(/^www\./, "")}${u.pathname !== "/" ? ` · ${decodeURIComponent(u.pathname.split("/").filter(Boolean).at(-1) ?? "").replace(/[-_]/g, " ")}` : ""}`;
    } catch {
      /* keep raw */
    }
    addReference({ kind: "link", title, url: text });
    return true;
  }
  return false;
}
window.addEventListener("paste", (e) => {
  // ⌘V anywhere (outside the page) adds a reference.
  if (docEl.contains(e.target as Node) || titleEl.contains(e.target as Node) || caretInText()) return;
  handlePaste(e);
});

function addReference(r: { kind: "link" | "image"; title: string; url?: string; dataUrl?: string }) {
  engine.commit({ id: newId("tx"), actor: "user", label: "Add reference", ops: [{ t: "ref.add", ref: { id: newId("r"), addedAt: Date.now(), ...r } }] });
  toast(`Added to References · ${r.title}`);
}

// ============================================================================ typing hint (once, ever)

docEl.addEventListener("input", () => {
  if (store.get("phlo.hint.typing")) return;
  const c = caretBlock ? engine.block(caretBlock) : null;
  if (c && c.wet && c.origin === "typed" && c.text.length > 24) {
    editor.elementOf(c.id)?.after(hintEl);
    store.set("phlo.hint.typing", "1");
  }
});

// ============================================================================ forms: Add (/ or +) and Turn into (right-click)
//
// One menu, grouped Text · Thinking · Visual · Media. Type to filter. Media
// actions ask for one thing (search words, a description, a link) inside the
// same menu, so there are no dialogs. Everything here can also be said aloud.

const formsEl = $<HTMLDivElement>("forms-menu");
let formsMode: "add" | "turn" | null = null;
let formsTarget: string | null = null;
let formsIndex = 0;
let formsShown: FormOption[] = FORM_OPTIONS;
let formsStage: { action: MediaAction; busy?: boolean } | null = null;
const fileInput = Object.assign(document.createElement("input"), { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif", hidden: true });
document.body.appendChild(fileInput);

function matches(o: FormOption, q: string): boolean {
  if (!q) return true;
  const hay = `${o.label} ${o.id} ${o.keys ?? ""}`.toLowerCase();
  return hay.split(/\s+/).some((w) => w.startsWith(q)) || hay.includes(q);
}

function positionForms(id: string, height = 360) {
  const el = editor.elementOf(id);
  const main = $("main").getBoundingClientRect();
  const r = el?.getBoundingClientRect();
  if (!r) return;
  formsEl.style.left = `${Math.max(8, r.left - main.left)}px`;
  const below = r.bottom - main.top + 6;
  formsEl.style.top = `${below + height > main.height ? Math.max(8, r.top - main.top - height - 10) : below}px`;
}

function openForms(id: string, mode: "add" | "turn", query = "") {
  const b = engine.block(id);
  if (!b) return;
  formsMode = mode;
  formsTarget = id;
  formsStage = null;
  const q = query.toLowerCase().trim();
  formsShown = FORM_OPTIONS.filter((o) => {
    if (mode === "turn") {
      if (o.action) return false;
      if (o.kind === b.kind && (o.kind !== "heading" || (o.level ?? 1) === (b.level ?? 1))) return false;
      if (o.id === "toggle") return false;
      if ((b.kind === "image" || b.kind === "embed") && o.kind !== "paragraph") return false;
    }
    return matches(o, q);
  });
  if (!formsShown.length) return closeForms();
  formsIndex = Math.min(formsIndex, formsShown.length - 1);
  formsEl.innerHTML = "";
  formsEl.appendChild(h("div", { class: "label menu-title" }, mode === "add" ? "Add" : "Turn into"));
  let group = "";
  formsShown.forEach((o, i) => {
    if (o.group !== group) {
      group = o.group;
      formsEl.appendChild(h("div", { class: "label menu-group" }, group));
    }
    const row = h("button", { class: "form-row", role: "option", "aria-selected": String(i === formsIndex) });
    row.append(h("span", { class: "fname" }, o.label), h("span", { class: "meta" }, o.hint));
    row.addEventListener("mousedown", (e) => e.preventDefault());
    row.onclick = () => chooseForm(o);
    formsEl.appendChild(row);
  });
  positionForms(id);
  formsEl.classList.add("open");
  formsEl.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
}

function closeForms() {
  formsMode = null;
  formsTarget = null;
  formsIndex = 0;
  formsStage = null;
  formsEl.classList.remove("open");
}

/** The line that new things go into: reuse it when it's empty (or just "/query"), else add after it. */
function placeNew(id: string, block: Block): string | null {
  const b = engine.block(id);
  if (!b) return null;
  const empty = !b.text.trim() || /^\/[\w -]*$/.test(b.text);
  const ops: Op[] = [{ t: "insert", block, after: id }];
  if (empty && b.kind !== "heading" && !ISLAND_KINDS.includes(b.kind)) ops.push({ t: "delete", id });
  const txId = newId("tx");
  const out = engine.commit({ id: txId, actor: "user", label: `Add ${block.kind}`, ops });
  if (!out.ok) {
    toast("That changed since. Try again.");
    return null;
  }
  render();
  return txId;
}

function chooseForm(o: FormOption) {
  if (o.action) return startMedia(o.action);
  const id = formsTarget;
  const mode = formsMode;
  closeForms();
  if (!id || !o.kind) return;
  const b = engine.block(id);
  if (!b) return;
  if (mode === "add" && b.text.startsWith("/")) {
    // The "/query" was a command, not words.
    engine.commit({ id: newId("tx"), actor: "user", label: "Add", ops: [{ t: "update", id, patch: { text: "" } }] });
  }
  turnInto(id, o.kind, o.level, o.id === "toggle");
}

function turnInto(id: string, kind: Block["kind"], level?: 1 | 2, collapsible = false) {
  const conv = turnIntoOps(engine.state.blocks, id, kind, level);
  if (!conv.ops.length) {
    if (conv.label) toast(conv.label, undefined, 6000);
    return;
  }
  const txId = newId("tx");
  const out = engine.commit({ id: txId, actor: "user", label: conv.label || "Turn into", ops: conv.ops });
  if (!out.ok) return toast("That changed since. Try again.");
  if (collapsible) toast("Toggle: click the arrow beside it to fold what's under it.", undefined, 5000);
  render();
  if (conv.focus) {
    const fb = engine.block(conv.focus);
    const island = editor.elementOf(conv.focus)?.querySelector<HTMLElement>("td,th,[data-step],[data-when]");
    if (fb && ISLAND_KINDS.includes(fb.kind)) requestAnimationFrame(() => island?.focus());
    else if (fb) editor.setCaret(fb.id, fb.text.length);
  }
  if (conv.label) toast(conv.label, { label: "Undo", run: () => void (engine.undo(txId), render()) });
}

// ---- Media: one question, answered inside the menu

function startMedia(action: MediaAction) {
  const id = formsTarget;
  if (!id) return;
  if (action === "upload") {
    const target = id;
    closeForms();
    fileInput.onchange = async () => {
      const file = fileInput.files?.[0];
      fileInput.value = "";
      if (file) await insertImageFile(target, file);
    };
    fileInput.click();
    return;
  }
  formsStage = { action };
  const prompt = { "find-image": "Search openly licensed photos", "generate-image": "Describe the image", embed: "Paste a YouTube, Loom or Figma link" }[action as "embed"];
  formsEl.innerHTML = "";
  formsEl.appendChild(h("div", { class: "label menu-title" }, { "find-image": "Find a photo", "generate-image": "Generate image", embed: "Video or embed" }[action as "embed"]));
  const input = h("input", { class: "menu-input", placeholder: prompt, "aria-label": prompt });
  const results = h("div", { class: "menu-results" });
  formsEl.append(input, results);
  positionForms(id, 380);
  requestAnimationFrame(() => input.focus());
  input.addEventListener("keydown", async (e) => {
    e.stopPropagation();
    if (e.key === "Escape") return closeForms();
    if (e.key !== "Enter" || !input.value.trim() || formsStage?.busy) return;
    e.preventDefault();
    const value = input.value.trim();
    if (action === "embed") {
      closeForms();
      return void insertEmbed(id, value);
    }
    formsStage = { action, busy: true };
    results.textContent = action === "find-image" ? "Searching…" : "Generating… this takes a few seconds";
    results.className = "menu-results label";
    try {
      if (action === "find-image") {
        const found = await host.findImages(value);
        results.className = "menu-results grid";
        results.textContent = "";
        if (!found.length) results.appendChild(h("div", { class: "label" }, "Nothing found. Try other words."));
        for (const img of found.slice(0, 9)) {
          const pick = h("button", { class: "thumb", title: img.credit });
          pick.appendChild(Object.assign(document.createElement("img"), { src: img.thumb, alt: img.title, loading: "lazy" }));
          pick.addEventListener("mousedown", (ev) => ev.preventDefault());
          pick.onclick = () => {
            closeForms();
            const nid = newId("b");
            placeNew(id, { id: nid, kind: "image", text: img.title, wet: false, rev: 0, origin: "typed", media: { src: img.url, alt: img.title, credit: img.credit, creditUrl: img.creditUrl, via: "web" } });
          };
          results.appendChild(pick);
        }
      } else {
        const out = await host.generateImage(value);
        closeForms();
        placeNew(id, { id: newId("b"), kind: "image", text: value, wet: false, rev: 0, origin: "typed", media: { src: out.dataUrl, alt: value, via: "generated" } });
      }
    } catch (err) {
      results.className = "menu-results label";
      results.textContent = err instanceof Error ? err.message.replace(/^.*?:\s*/, "") : "That didn't work.";
    } finally {
      if (formsStage) formsStage.busy = false;
    }
  });
}

async function insertImageFile(id: string, file: File | Blob, name = "Image") {
  const dataUrl = await downscale(file);
  placeNew(id, { id: newId("b"), kind: "image", text: "", wet: false, rev: 0, origin: "typed", media: { src: dataUrl, alt: name, via: "upload" } });
}

function insertEmbed(id: string, url: string) {
  if (!/^https?:\/\//i.test(url)) return toast("That isn't a link.");
  placeNew(id, { id: newId("b"), kind: "embed", text: url, url, wet: false, rev: 0, origin: "typed" });
}

/** Keep drafts light: images over 1600px are scaled down before they're stored. */
function downscale(file: File | Blob, max = 1600): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const src = String(reader.result);
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        if (k === 1 && src.length < 1_500_000) return resolve(src);
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.86));
      };
      img.onerror = () => resolve(src);
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}

function formsKey(e: KeyboardEvent): boolean {
  if (!formsMode || formsStage) return false;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    formsIndex = (formsIndex + (e.key === "ArrowDown" ? 1 : -1) + formsShown.length) % formsShown.length;
    if (formsTarget) openForms(formsTarget, formsMode, formsMode === "add" ? (engine.block(formsTarget)?.text.slice(1) ?? "") : "");
    return true;
  }
  if (e.key === "Enter") {
    e.preventDefault();
    const o = formsShown[formsIndex];
    if (o) chooseForm(o);
    return true;
  }
  if (e.key === "Escape") {
    e.preventDefault();
    closeForms();
    return true;
  }
  return false;
}

docEl.addEventListener("contextmenu", (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>(".blk");
  if (!el?.dataset.id || (e.target as HTMLElement).closest("td,th,[data-step],[data-when]")) return;
  e.preventDefault();
  formsIndex = 0;
  openForms(el.dataset.id, "turn");
});
document.addEventListener("mousedown", (e) => {
  if (formsMode && !formsEl.contains(e.target as Node) && !(e.target as HTMLElement).closest?.(".add-handle")) closeForms();
});

// ---- The + beside the line you're hovering: Add after it

const addHandle = h("button", { class: "add-handle", "aria-label": "Add", title: "Add (or type / on a new line)" }, "+");
$("page").appendChild(addHandle);
let addFor: string | null = null;
docEl.addEventListener("mousemove", (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>(".blk");
  if (!el?.dataset.id || talking) return;
  addFor = el.dataset.id;
  const page = $("page").getBoundingClientRect();
  const r = el.getBoundingClientRect();
  addHandle.style.top = `${r.top - page.top + (el.dataset.kind === "heading" ? 24 : 0)}px`;
  addHandle.classList.add("show");
});
$("page").addEventListener("mouseleave", () => addHandle.classList.remove("show"));
addHandle.addEventListener("mousedown", (e) => e.preventDefault());
addHandle.addEventListener("click", () => {
  if (!addFor) return;
  // + is a shortcut for "/" on a new line: same menu, and typing filters it.
  const nid = newId("b");
  const out = engine.commit({ id: newId("tx"), actor: "user", label: "Add", noHistory: true, ops: [{ t: "insert", block: { id: nid, kind: "paragraph", text: "/", wet: true, rev: 0, origin: "typed" }, after: addFor }] });
  if (!out.ok) return;
  render();
  docEl.focus();
  editor.setCaret(nid, 1);
  formsIndex = 0;
  openForms(nid, "add");
});

// ---- Drop an image file anywhere on the page

docEl.addEventListener("dragover", (e) => {
  if (Array.from(e.dataTransfer?.items ?? []).some((i) => i.type.startsWith("image/"))) e.preventDefault();
});
docEl.addEventListener("drop", (e) => {
  const file = Array.from(e.dataTransfer?.files ?? []).find((f) => f.type.startsWith("image/"));
  if (!file) return;
  e.preventDefault();
  const el = (e.target as HTMLElement).closest<HTMLElement>(".blk") ?? editor.elementOf(engine.state.blocks.filter(inPage).at(-1)?.id ?? "");
  const id = el?.dataset.id;
  if (id) void insertImageFile(id, file, file.name);
});

// ============================================================================ undo

function undo() {
  const res = engine.undo();
  if (res && !res.ok) toast("That changed since. Nothing undone.");
  else if (res) render();
}

// ============================================================================ role, room, publish

function setRole(role: Role) {
  if (engine.state.role !== role) engine.commit({ id: newId("tx"), actor: "user", label: role === "scribe" ? "Scribe" : "Partner", ops: [{ t: "meta", patch: { role } }] });
  if (role === "scribe") setRoom(true);
}
$("role-partner").onclick = () => setRole("partner");
$("role-scribe").onclick = () => setRole("scribe");

/** Room view: Sumi, large type, zero chrome. Esc leaves; Scribe stays on. */
function setRoom(on: boolean) {
  document.body.classList.toggle("room", on);
  if (on) closeSidebar();
  applyTheme();
  render();
}

publishBtn.onclick = async () => {
  if (!publishBtn.classList.contains("ready")) {
    toast("Publish opens once the draft has three sections.");
    return;
  }
  await saveNow();
  const piece = await host.publish(engine.snapshot());
  toast("Published.");
  refreshLists();
  showReader(piece);
};

type View = "draft" | "reader";
function setView(v: View) {
  document.body.classList.toggle("view-reader", v === "reader");
  $("scroller").scrollTop = 0;
}

function showReader(p: PublishedPiece) {
  closeSidebar();
  const r = $("reader");
  r.innerHTML = "";
  const page = h("article", { class: "page" });
  const back = h("button", { class: "label" }, "← Back to the draft");
  back.onclick = () => setView("draft");
  const t = h("h1", { class: "title" }, p.title);
  const meta = h("div", { class: "label session" }, `Published · ${day(p.publishedAt)}`);
  page.append(back, h("div", { style: "height:24px" }), t, meta);
  let n = 0;
  for (const b of p.blocks) {
    const el = h("div", { class: "blk", "data-kind": b.kind }, b.text);
    if (b.kind === "heading") el.dataset.label = /^next( steps)?$/i.test(b.text) ? "" : `${String(++n).padStart(2, "0")} · ${b.text}`;
    if (b.theme) el.dataset.theme = b.theme;
    el.style.setProperty("--depth", String(b.depth ?? 0));
    page.appendChild(el);
  }
  r.appendChild(page);
  setView("reader");
}

// ============================================================================ sidebar, menu, settings, theme

function openSidebar() {
  document.body.classList.add("sidebar-open");
  refreshLists();
}
function closeSidebar() {
  document.body.classList.remove("sidebar-open");
}
const toggleSidebar = () => (document.body.classList.contains("sidebar-open") ? closeSidebar() : openSidebar());
$("open-side").onclick = openSidebar;
$("close-side").onclick = closeSidebar;
async function newDraft() {
  await saveNow();
  load(await host.createDraft());
}
$("new-draft").onclick = () => void newDraft();
$("new-draft-2").onclick = () => void newDraft();
$("your-ai").onclick = () => void openSettings();

$("more").onclick = (e) => {
  e.stopPropagation();
  menuEl.classList.toggle("open");
  $("m-theme").textContent = document.documentElement.dataset.theme === "sumi" ? "Paper" : "Sumi";
};
document.addEventListener("click", (e) => {
  if (!menuEl.contains(e.target as Node)) menuEl.classList.remove("open");
});
$("m-transcript").onclick = () => {
  menuEl.classList.remove("open");
  $("transcript").classList.add("open");
  renderTranscript();
};
$("close-transcript").onclick = () => $("transcript").classList.remove("open");
$("m-room").onclick = () => {
  menuEl.classList.remove("open");
  setRoom(true);
};
$("m-theme").onclick = async () => {
  menuEl.classList.remove("open");
  const next = document.documentElement.dataset.theme === "sumi" ? "paper" : "sumi";
  settings = await host.setSettings({ theme: next });
  applyTheme();
};
$("m-ai").onclick = () => {
  menuEl.classList.remove("open");
  void openSettings();
};

function applyTheme() {
  const t = settings?.theme ?? "system";
  const dark = document.body.classList.contains("room") || t === "sumi" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "sumi" : "paper";
  document.querySelectorAll<HTMLImageElement>("img[data-light]").forEach((img) => (img.src = dark ? img.dataset.dark! : img.dataset.light!));
}
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);

const dialog = $<HTMLDialogElement>("settings");
async function openSettings() {
  settings = await host.getSettings();
  const f = dialog.querySelector("form")!;
  (f.elements.namedItem("theme") as HTMLSelectElement).value = settings.theme;
  (f.elements.namedItem("provider") as HTMLSelectElement).value = settings.provider;
  (f.elements.namedItem("compatBaseUrl") as HTMLInputElement).value = settings.compatBaseUrl;
  (f.elements.namedItem("compatModel") as HTMLInputElement).value = settings.compatModel;
  (f.elements.namedItem("compatMode") as HTMLSelectElement).value = settings.compatMode;
  (f.elements.namedItem("compatKey") as HTMLInputElement).value = "";
  const showCompat = () => {
    const v = (f.elements.namedItem("provider") as HTMLSelectElement).value;
    $("compat-fields").style.display = v === "local" ? "none" : "block";
    $("compat-title").textContent = v === "compat" ? "Open model" : "Backup cloud model";
    $("compat-note").style.display = v === "compat" ? "none" : "block";
    $("claude-fields").style.display = v === "claude" ? "block" : "none";
  };
  $("use-openrouter").onclick = () => {
    (f.elements.namedItem("compatBaseUrl") as HTMLInputElement).value = "https://openrouter.ai/api/v1";
    (f.elements.namedItem("compatModel") as HTMLInputElement).value = "openai/gpt-6-luna";
    (f.elements.namedItem("compatMode") as HTMLSelectElement).value = "full";
    (f.elements.namedItem("compatKey") as HTMLInputElement).focus();
  };
  (f.elements.namedItem("provider") as HTMLSelectElement).onchange = showCompat;
  showCompat();
  const ai = settings.ai;
  $("provider-note").textContent =
    settings.provider === "chatgpt"
      ? ai.provider === "chatgpt"
        ? `Connected through Codex · ${ai.callsLast5h} requests in the last 5 hours`
        : ai.coolingUntil
          ? "Plan limit reached. Settling on this Mac until it resets."
          : "Install Codex and run codex login with your ChatGPT account. Until then, Phlo settles with fast rules."
      : settings.provider === "compat"
        ? "Any OpenAI-compatible model. On a Mac: install Ollama, then ollama pull qwen3:8b."
      : settings.provider === "claude"
        ? settings.claude ? "Connected" : "Add a Claude key below."
        : "Nothing leaves this Mac. Placement is simpler.";
  (f.elements.namedItem("claudeKey") as HTMLInputElement).value = "";
  (f.elements.namedItem("openaiKey") as HTMLInputElement).value = "";
  $("claude-note").textContent = settings.claude ? `Connected · ${settings.model}` : "Without a key, Phlo settles with fast local rules.";
  $("openai-note").textContent = settings.openai ? "Connected" : host.isDesktop() ? "Needed to talk in the desktop app." : "Optional in Chrome, which has its own speech service.";
  $("storage-note").textContent = settings.secureStorage ? "Keys are encrypted by your system keychain." : "Keys are kept in memory for this session only.";
  const st = await host.stats().catch(() => null);
  const m = st?.routes.find((r) => r.route === "model");
  if (m?.count) $("stats-meta").textContent = `Claude p50 ${((m.p50 ?? 0) / 1000).toFixed(1)}s · p95 ${((m.p95 ?? 0) / 1000).toFixed(1)}s`.toUpperCase();
  closeSidebar();
  dialog.showModal();
}
dialog.addEventListener("close", async () => {
  if (dialog.returnValue !== "save") return;
  const f = dialog.querySelector("form")!;
  const patch: Record<string, string> = {
    theme: (f.elements.namedItem("theme") as HTMLSelectElement).value,
    provider: (f.elements.namedItem("provider") as HTMLSelectElement).value,
    compatBaseUrl: (f.elements.namedItem("compatBaseUrl") as HTMLInputElement).value.trim(),
    compatModel: (f.elements.namedItem("compatModel") as HTMLInputElement).value.trim(),
    compatMode: (f.elements.namedItem("compatMode") as HTMLSelectElement).value,
  };
  const ck2 = (f.elements.namedItem("compatKey") as HTMLInputElement).value.trim();
  if (ck2) patch.compatKey = ck2;
  const ck = (f.elements.namedItem("claudeKey") as HTMLInputElement).value.trim();
  const ok = (f.elements.namedItem("openaiKey") as HTMLInputElement).value.trim();
  if (ck) patch.claudeKey = ck;
  if (ok) patch.openaiKey = ok;
  settings = await host.setSettings(patch);
  applyTheme();
  toast("Saved.");
});

// ============================================================================ keyboard

window.addEventListener("keydown", (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key === "Enter") {
    e.preventDefault();
    editor.syncFromDom();
    settler.request("force", 0, true);
  } else if (mod && e.key === "\\") {
    e.preventDefault();
    toggleSidebar();
  } else if (mod && e.shiftKey && e.key.toLowerCase() === "r") {
    e.preventDefault();
    setRoom(!document.body.classList.contains("room"));
  } else if (e.key === "Escape") {
    if (menuEl.classList.contains("open")) menuEl.classList.remove("open");
    else if ($("transcript").classList.contains("open")) $("transcript").classList.remove("open");
    else if (document.body.classList.contains("room")) setRoom(false);
    else if (document.body.classList.contains("sidebar-open")) closeSidebar();
    else if (document.body.classList.contains("view-reader")) setView("draft");
  } else if (mod && e.key.toLowerCase() === "z" && !caretInText()) {
    e.preventDefault();
    if (e.shiftKey) engine.redo();
    else undo();
  }
});

docEl.addEventListener("blur", () => {
  // Leaving the page settles whatever you left wet.
  setTimeout(() => {
    if (document.activeElement !== docEl) {
      caretBlock = null;
      settler.request("blur", 250);
    }
  }, 0);
});

// ============================================================================ test + demo hooks

declare global {
  interface Window {
    phlo: {
      simulateSpeech(text: string): void;
      simulateInterim(text: string): void;
      settleNow(): void;
      state(): Draft;
      undo(): void;
      setTalking(on: boolean, lock?: boolean): void;
      showAsk(q: string): void;
      sections(): number;
    };
  }
}
window.phlo = {
  simulateSpeech: (t) => addSpeech(t),
  simulateInterim: (t) => {
    liveEl.textContent = t;
    placeLive();
    document.body.classList.toggle("empty", isEmptyDraft());
  },
  settleNow: () => settler.request("force", 0, true),
  state: () => engine.snapshot(),
  undo: () => undo(),
  // Visual state only (no microphone): for screenshots and tests.
  setTalking: (on, lock = false) => {
    talking = on;
    locked = on && lock;
    document.body.classList.toggle("talking", on);
    voiceBtn.dataset.state = on ? "listening" : "idle";
    setVoiceLabel();
    render();
  },
  showAsk: (q) => showAsk(q),
  sections: () => sections(engine.state.blocks).length,
};

// ============================================================================ boot

(async () => {
  settings = await host.getSettings().catch(() => null);
  applyTheme();
  await openDraft();
  // Say once which brain is settling when it isn't the one you chose.
  if (settings && settings.provider !== "local" && settings.ai.provider === "local" && !routeNoticeShown) {
    routeNoticeShown = true;
    const what = settings.provider === "chatgpt" ? "ChatGPT isn't connected yet" : "Your model isn't connected";
    const via = settings.ai.backup ? `your backup model` : "fast local rules";
    setTimeout(() => toast(`${what}. Phlo is settling with ${via}.`, { label: "Your AI", run: () => void openSettings() }, 8000), 600);
  }
})();
