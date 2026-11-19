/**
 * Phlo renderer: the four screens from docs/design/phlo-handoff/screens
 * (Start, Talking, Room view, Sidebar open) as states of one Draft view.
 */
import { DocEngine, type Op } from "../engine/engine";
import { newId } from "../engine/ids";
import { emptyDraft, sections, substantiveSectionCount, type Block, type Draft, type PublishedPiece, type Role } from "../engine/model";
import { buildRequest, compilePlan, headingOf, type SettleResponse } from "../engine/settle";
import { host, HostError, type HostSettings } from "./bridge";
import { Editor, inPage } from "./editor/view";
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
  </main>
  <dialog class="settings" id="settings">
    <form method="dialog">
      <h2>Your AI</h2>
      <label class="label">Settle with<select name="provider"><option value="chatgpt">ChatGPT · your plan, through Codex</option><option value="claude">Claude · API key</option><option value="local">On this Mac only · fast rules</option></select></label>
      <p class="note" id="provider-note"></p>
      <label class="label">Claude key<input type="password" name="claudeKey" autocomplete="off" placeholder="sk-ant-…" /></label>
      <p class="note" id="claude-note"></p>
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

function renderTabs() {
  const box = $("tabs");
  box.querySelectorAll(".tab-card").forEach((n) => n.remove());
  const tangents = engine.state.role === "partner" ? engine.state.blocks.filter((b) => b.tab === "tangent" && !b.wet && b.text.trim()) : [];
  box.classList.toggle("has", tangents.length > 0);
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
    const out = engine.commit({ id: newId("tx"), actor: "phlo", label: "Settle", ops });
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
    if (caret && document.activeElement === docEl && engine.block(caret.id)) editor.setCaret(caret.id, 0);
    if (hintEl.isConnected && !engine.state.blocks.some((b) => b.wet && b.origin === "typed" && b.text.trim())) hintEl.remove();
    $("stats-meta").textContent = `${res.route === "model" ? "Claude" : res.route === "fallback" ? "Local fallback" : "Local"} · ${(res.latencyMs / 1000).toFixed(1)}s`.toUpperCase();
  }
}
const settler = new Settler();

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

function addSpeech(text: string) {
  const clean = text.trim();
  if (!clean) return;
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
  const ai = settings.ai;
  $("provider-note").textContent =
    settings.provider === "chatgpt"
      ? ai.provider === "chatgpt"
        ? `Connected through Codex · ${ai.callsLast5h} requests in the last 5 hours`
        : ai.coolingUntil
          ? "Plan limit reached. Settling on this Mac until it resets."
          : "Install Codex and run codex login with your ChatGPT account. Until then, Phlo settles with fast rules."
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
  };
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
})();
