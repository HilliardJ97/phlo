import { DocEngine, type Op } from "../engine/engine";
import { newId } from "../engine/ids";
import { emptyDraft, substantiveSectionCount, type Block, type Draft, type PublishedPiece, type Role } from "../engine/model";
import { buildRequest, compilePlan, headingOf, type SettleResponse } from "../engine/settle";
import { host, HostError, type HostSettings } from "./bridge";
import { Editor } from "./editor/view";
import { BrowserSTT, browserSttAvailable, UtteranceSTT, type Stt } from "./voice/stt";

// ============================================================================ marks

const SYMBOL = `<svg viewBox="0 0 117 130" aria-hidden="true"><path d="M50 0 A50 50 0 0 0 50 100 Z" fill="var(--vermilion)"/><path d="M57 0 H117 V130 L87 100 H57 Z" fill="var(--ink)"/></svg>`;
const PUBLISH_MARK = `<svg viewBox="0 0 130 130" aria-hidden="true"><rect x="8" y="10" width="100" height="100" fill="currentColor"/><circle cx="98" cy="100" r="22" fill="var(--vermilion)"/></svg>`;

const PALETTE_VAR: Record<string, string> = {
  vermilion: "var(--vermilion)",
  cobalt: "var(--cobalt)",
  teal: "var(--teal)",
  saffron: "var(--saffron)",
};

// ============================================================================ dom

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, html = ""): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (html) el.innerHTML = html;
  return el;
}

const app = document.getElementById("app")!;
app.innerHTML = `
  <header class="chrome">
    <div class="left">
      <button class="mark-btn" id="menu" aria-label="Drafts" title="Drafts (⌘\\)">${SYMBOL}<span class="wordmark">phlo</span></button>
    </div>
    <div class="right">
      <div class="role" role="group" aria-label="Role">
        <button class="chip" id="role-partner" aria-pressed="true" title="Phlo helps you think">Partner</button>
        <span class="sep"></span>
        <button class="chip" id="role-scribe" aria-pressed="false" title="Organizes only your words">Scribe</button>
      </div>
      <button class="chip" id="room" aria-pressed="false" title="Room view (⌘⇧R)">Room view</button>
      <button class="publish" id="publish">${PUBLISH_MARK}Publish</button>
    </div>
  </header>
  <aside class="sidebar" aria-label="Drafts and references">
    <section>
      <h2 class="label">Drafts</h2>
      <button class="new" id="new-draft">New draft</button>
      <div id="draft-list"></div>
    </section>
    <section>
      <h2 class="label">Published</h2>
      <button class="new" id="open-shelf">Open shelf</button>
    </section>
    <section>
      <h2 class="label">References</h2>
      <div id="ref-list"><div class="meta">Paste a link or screenshot.</div></div>
    </section>
    <div class="foot">
      <button class="chip" id="open-settings">Settings</button>
      <span class="meta" id="engine-meta"></span>
    </div>
  </aside>
  <div class="scrim" id="scrim"></div>
  <main class="scroller" id="scroller">
    <article class="page" id="page">
      <div class="running"><span class="label" id="running-label">Draft</span><span class="meta" id="running-meta"></span></div>
      <h1 class="title" id="title" contenteditable="true" spellcheck="true" data-placeholder="Untitled"></h1>
      <div class="doc" id="doc"></div>
      <div class="live" id="live" aria-live="polite"></div>
      <div class="empty" id="empty">
        <p class="display">Start talking.</p>
        <p class="hint label">Hold <kbd>Space</kbd> or click the dot · or just type</p>
      </div>
      <div class="cards" id="cards"></div>
    </article>
    <section class="shelf" id="shelf"><div class="shelf-inner"><h1>Published</h1><div class="covers" id="covers"></div></div></section>
    <section class="reader" id="reader"></section>
  </main>
  <button class="voice" id="voice" data-state="idle" aria-label="Talk"><span class="ring"></span></button>
  <div class="voice-tip label" id="voice-tip">Hold space to talk</div>
  <div class="room-label label" id="room-label"><span class="dot"></span><span id="room-text">Scribe · Your words only</span></div>
  <div class="toast" id="toast" role="status"></div>
  <dialog class="settings" id="settings">
    <form method="dialog">
      <h2>Settings</h2>
      <label class="label">Claude key
        <input type="password" name="claudeKey" autocomplete="off" placeholder="sk-ant-…" />
      </label>
      <p class="note" id="claude-note"></p>
      <label class="label">Transcription key (OpenAI)
        <input type="password" name="openaiKey" autocomplete="off" placeholder="sk-…" />
      </label>
      <p class="note" id="openai-note"></p>
      <label class="label">Theme
        <select name="theme"><option value="system">System</option><option value="paper">Paper</option><option value="sumi">Sumi</option></select>
      </label>
      <p class="note" id="storage-note"></p>
      <div class="row"><span class="meta" id="stats-meta"></span><button class="primary" value="save">Save</button></div>
    </form>
  </dialog>
`;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const titleEl = $<HTMLHeadingElement>("title");
const docEl = $<HTMLDivElement>("doc");
const liveEl = $<HTMLDivElement>("live");
const voiceBtn = $<HTMLButtonElement>("voice");
const voiceTip = $<HTMLDivElement>("voice-tip");
const toastEl = $<HTMLDivElement>("toast");
const cardsEl = $<HTMLDivElement>("cards");
const publishBtn = $<HTMLButtonElement>("publish");

if (host.platform() === "darwin") document.body.classList.add("desktop-mac");

// ============================================================================ state

let engine = new DocEngine(emptyDraft("boot"));
let unsubscribe: (() => void) | null = null;
let settings: HostSettings | null = null;
let currentHeading: string | null = null;
let caretBlock: string | null = null;
const recentSettled: string[] = [];
let lastVoiceAnchor: string | null = null;

const editor = new Editor(docEl, () => engine, {
  onParagraphEnd: () => settler.request("paragraph"),
  onCaretBlock: (id) => {
    const prev = caretBlock;
    caretBlock = id;
    if (id) {
      const b = engine.block(id);
      currentHeading = b?.kind === "heading" ? b.id : headingOf(engine.state.blocks, id);
    }
    // Caret left a wet run: settle what you left behind.
    const prevBlock = prev ? engine.block(prev) : null;
    const nowBlock = id ? engine.block(id) : null;
    if (prevBlock?.wet && !(nowBlock?.wet && adjacentWet(prev!, id!))) settler.request("caret-left", 350);
    paintSpotlight();
  },
  onPaste: (e) => handlePaste(e),
  onUndo: () => undo(),
  onRedo: () => {
    engine.redo();
  },
});

function adjacentWet(a: string, b: string): boolean {
  // Same contiguous wet run?
  const blocks = engine.state.blocks;
  let i = blocks.findIndex((x) => x.id === a);
  let j = blocks.findIndex((x) => x.id === b);
  if (i < 0 || j < 0) return false;
  if (i > j) [i, j] = [j, i];
  for (let k = i; k <= j; k++) if (!blocks[k].wet) return false;
  return true;
}

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
  saveTimer = window.setTimeout(() => {
    saving = saving.then(saveNow);
  }, delay);
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
      toast("This draft changed in another window.", { label: "Reload", run: () => openDraft(snap.id) }, 8000);
    } else {
      toast("Couldn't save. Retrying.");
      // Put the journal back so nothing is lost; retry soon.
      scheduleSave(2000);
    }
  }
}
window.addEventListener("beforeunload", () => {
  clearTimeout(saveTimer);
  void saveNow();
});

// ============================================================================ render

function render(settled?: string[]) {
  const d = engine.state;
  if (document.activeElement !== titleEl && titleEl.textContent !== d.title) titleEl.textContent = d.title;
  editor.render(d, { settled, dim: dimSet() });
  const hasContent = d.blocks.some((b) => b.text.trim()) || !!d.title || !!liveEl.textContent;
  document.body.classList.toggle("has-content", hasContent);
  publishBtn.classList.toggle("ready", substantiveSectionCount(d.blocks) >= 3 && !d.blocks.some((b) => b.wet));
  $("running-label").textContent = d.role === "scribe" ? "Scribe" : "Draft";
  $("running-meta").textContent = new Date(d.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }).toUpperCase();
  $("role-partner").setAttribute("aria-pressed", String(d.role === "partner"));
  $("role-scribe").setAttribute("aria-pressed", String(d.role === "scribe"));
  renderCards();
  renderRefs();
}

function dimSet(): Set<string> {
  const out = new Set<string>();
  if (!document.body.classList.contains("spotlight") || !currentHeading) return out;
  let inSection = false;
  for (const b of engine.state.blocks) {
    if (b.kind === "heading") inSection = b.id === currentHeading;
    if (!inSection && !b.wet) out.add(b.id);
  }
  return out;
}

function paintSpotlight() {
  const on = talking || document.body.classList.contains("room");
  document.body.classList.toggle("spotlight", on && !!currentHeading);
  if (on) editor.render(engine.state, { dim: dimSet() });
}

function renderCards() {
  cardsEl.innerHTML = "";
  const d = engine.state;
  if (d.role === "scribe") return;
  const card = d.cards[d.cards.length - 1];
  if (!card) return;
  const el = h("div", { class: "card" });
  el.innerHTML = `<div class="label"><span>${card.kind === "question" ? "Question" : "Suggestion"}</span><button aria-label="Dismiss">×</button></div>`;
  el.appendChild(document.createTextNode(card.text));
  el.querySelector("button")!.onclick = () =>
    engine.commit({ id: newId("tx"), actor: "user", label: "Dismiss", ops: [{ t: "card.remove", id: card.id }], noHistory: true });
  cardsEl.appendChild(el);
}

function renderRefs() {
  const list = $("ref-list");
  const refs = engine.state.references;
  if (!refs.length) {
    list.innerHTML = `<div class="meta">Paste a link or screenshot.</div>`;
    return;
  }
  list.innerHTML = "";
  for (const r of refs) {
    const row = h("div", { class: "ref-item" });
    if (r.kind === "image" && r.dataUrl) row.appendChild(Object.assign(document.createElement("img"), { src: r.dataUrl, alt: "" }));
    else row.appendChild(h("span", { class: "flag" }));
    const t = h("span");
    t.textContent = r.title;
    row.appendChild(t);
    list.appendChild(row);
  }
}

// ============================================================================ drafts

async function openDraft(id?: string) {
  await saving;
  clearTimeout(saveTimer);
  await saveNow();
  const d = id ? await host.openDraft(id) : await host.openDraft();
  load(d);
}

function load(d: Draft) {
  unsubscribe?.();
  engine = new DocEngine(d);
  recentSettled.length = 0;
  currentHeading = null;
  lastVoiceAnchor = null;
  // Always have a line to type into.
  if (!d.blocks.length) {
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
    void refreshDraftList();
  });
  setView("draft");
  render();
  document.body.classList.toggle("room", false);
  $("room").setAttribute("aria-pressed", "false");
  void refreshDraftList();
  requestAnimationFrame(() => {
    if (!engine.state.title && !engine.state.blocks.some((b) => b.text)) editor.focusEnd();
  });
}

let listTimer = 0;
async function refreshDraftList() {
  clearTimeout(listTimer);
  listTimer = window.setTimeout(async () => {
    const list = await host.listDrafts().catch(() => []);
    const el = $("draft-list");
    el.innerHTML = "";
    for (const s of list.slice(0, 40)) {
      const b = h("button", { class: "draft-link" });
      if (s.id === engine.state.id) b.setAttribute("aria-current", "true");
      const t = h("span", { class: "t" });
      t.textContent = s.id === engine.state.id ? engine.state.title || "Untitled" : s.title || "Untitled";
      const m = h("span", { class: "meta" });
      m.textContent = `${new Date(s.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }).toUpperCase()} · ${s.words} WORDS`;
      b.append(t, m);
      b.onclick = () => {
        closeSidebar();
        void openDraft(s.id);
      };
      el.appendChild(b);
    }
  }, 300);
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

// ============================================================================ settle

/**
 * One request in flight per draft; anything that arrives meanwhile is folded
 * into the next request. Words containing the caret never move (unless you
 * press ⌘↵). If a plan comes back after you kept typing, the engine rejects it
 * and we simply ask again with what's on the page now.
 */
class Settler {
  private inflight = false;
  private again = false;
  private force = false;
  private timer = 0;
  private conflicts = 0;

  request(_reason: string, delay = 0, force = false) {
    if (force) this.force = true;
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.run(), delay);
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
    const draft = engine.snapshot();
    const req = buildRequest(draft, ids, { currentHeadingId: currentHeading, recent: recentSettled.slice(0, 5) });
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
    // Never move text under the caret: if you've since clicked into a wet block in this plan, wait.
    if (!force && caretBlock && req.wet.some((w) => w.id === caretBlock)) {
      this.again = true;
      return;
    }
    const compiled = compilePlan(engine.state, req, res.plan);
    const ops: Op[] = [...compiled.ops];
    // Sweep empty wet lines left behind (never the one you're on, never the last line).
    const blocks = engine.state.blocks;
    for (const b of blocks) {
      if (b.wet && !b.text.trim() && b.id !== caretBlock && blocks.length > 1 && !req.wet.some((w) => w.id === b.id)) {
        ops.push({ t: "delete", id: b.id, expectRev: b.rev });
      }
    }
    if (compiled.question && engine.state.role === "partner" && !engine.state.cards.length) {
      ops.push({ t: "card.add", card: { id: newId("c"), kind: "question", text: compiled.question, createdAt: Date.now() } });
    }
    const out = engine.commit({ id: newId("tx"), actor: "phlo", label: "Settle", ops });
    if (!out.ok) {
      // You typed into those words while Phlo was thinking. Ask again with the newer text.
      if (++this.conflicts < 4) this.again = true;
      return;
    }
    this.conflicts = 0;
    for (const id of compiled.settledIds.slice().reverse()) {
      recentSettled.unshift(id);
    }
    recentSettled.splice(12);
    const placed = compiled.settledIds[compiled.settledIds.length - 1];
    if (placed) {
      const ph = headingOf(engine.state.blocks, placed);
      if (talking && ph) currentHeading = ph;
    }
    render(compiled.settledIds);
    paintSpotlight();
    updateEngineMeta(res);
  }
}
const settler = new Settler();

function setSettling(on: boolean) {
  voiceBtn.classList.toggle("settling", on);
}

function updateEngineMeta(res: SettleResponse) {
  const route = res.route === "model" ? "Claude" : res.route === "fallback" ? "Local (fallback)" : "Local";
  $("engine-meta").textContent = `${route} · ${(res.latencyMs / 1000).toFixed(1)}s`.toUpperCase();
}

// ============================================================================ voice

let talking = false;
let stt: Stt | null = null;
let interim = "";

function chooseStt(): Stt | null {
  if (host.isDesktop()) return settings?.openai ? new UtteranceSTT() : browserSttAvailable() ? new BrowserSTT() : null;
  if (browserSttAvailable()) return new BrowserSTT();
  return settings?.openai ? new UtteranceSTT() : null;
}

/** Where spoken words appear: end of the section you're in, else end of page. */
function voiceAnchor(): string | null {
  const blocks = engine.state.blocks;
  if (lastVoiceAnchor && blocks.some((b) => b.id === lastVoiceAnchor && b.wet)) return lastVoiceAnchor;
  if (currentHeading && blocks.some((b) => b.id === currentHeading)) {
    let i = blocks.findIndex((b) => b.id === currentHeading);
    while (i + 1 < blocks.length && blocks[i + 1].kind !== "heading") i++;
    return blocks[i].id;
  }
  const last = blocks[blocks.length - 1];
  return last?.id ?? null;
}

function addSpeech(text: string) {
  const clean = text.trim();
  if (!clean) return;
  const blocks = engine.state.blocks;
  const segId = newId("t");
  const ops: Op[] = [{ t: "transcript", segment: { id: segId, at: Date.now(), text: clean } }];
  // Reuse a lone empty starter line rather than leaving it dangling.
  const empty = blocks.length === 1 && !blocks[0].text ? blocks[0] : null;
  let id: string;
  if (empty) {
    id = empty.id;
    ops.push({ t: "update", id, patch: { text: clean, origin: "voice", wet: true, sources: [segId] } });
  } else {
    id = newId("b");
    const block: Block = { id, kind: "paragraph", text: clean, wet: true, rev: 0, origin: "voice", sources: [segId] };
    ops.push({ t: "insert", block, after: voiceAnchor() });
  }
  engine.commit({ id: newId("tx"), actor: "voice", label: "Speech", ops });
  lastVoiceAnchor = id;
  // Batch phrases that arrive close together into one settle.
  settler.request("speech", 900);
}

async function startTalking() {
  if (talking) return;
  if (!settings) settings = await host.getSettings().catch(() => null);
  stt = chooseStt();
  if (!stt) {
    toast("Add a transcription key in Settings to talk.", { label: "Settings", run: openSettings }, 6000);
    return;
  }
  talking = true;
  document.body.classList.add("talking");
  voiceBtn.dataset.state = "listening";
  voiceBtn.setAttribute("aria-label", "Stop talking");
  paintSpotlight();
  try {
    await stt.start({
      onInterim: (t) => {
        interim = t;
        liveEl.textContent = t;
        document.body.classList.toggle("has-content", true);
      },
      onFinal: (t) => {
        liveEl.textContent = "";
        interim = "";
        addSpeech(t);
      },
      onLevel: (l) => voiceBtn.style.setProperty("--level", String(1 + Math.min(0.25, l * 0.6))),
      onError: (m) => {
        toast(m, m.includes("Settings") ? { label: "Settings", run: openSettings } : undefined, 6000);
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
  stt?.stop();
  stt = null;
  if (interim) addSpeech(interim);
  interim = "";
  liveEl.textContent = "";
  document.body.classList.remove("talking");
  voiceBtn.dataset.state = "idle";
  voiceBtn.setAttribute("aria-label", "Talk");
  voiceBtn.style.removeProperty("--level");
  settler.request("stop", 200);
  paintSpotlight();
}

voiceBtn.addEventListener("click", () => (talking ? stopTalking() : void startTalking()));

// Hold space to talk (when the caret isn't in text), release to stop; tap toggles. ⌥Space works anywhere.
let spaceDownAt = 0;
let spaceHeld = false;
function caretInText(): boolean {
  const a = document.activeElement as HTMLElement | null;
  return !!a && (a.isContentEditable || a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT");
}
window.addEventListener("keydown", (e) => {
  const isSpace = e.code === "Space";
  if (!isSpace || e.repeat) return;
  if (!(e.altKey || !caretInText())) return;
  if (document.body.classList.contains("view-shelf") || document.body.classList.contains("view-reader")) return;
  e.preventDefault();
  spaceDownAt = performance.now();
  spaceHeld = true;
  if (!talking) void startTalking();
  else spaceHeld = false; // a tap while talking stops on keyup
});
window.addEventListener("keyup", (e) => {
  if (e.code !== "Space" || !spaceDownAt) return;
  const held = performance.now() - spaceDownAt;
  spaceDownAt = 0;
  if (!spaceHeld) {
    stopTalking();
    return;
  }
  spaceHeld = false;
  // Short tap = toggle (keep talking). Long hold = push-to-talk.
  if (held > 350) stopTalking();
});

// ============================================================================ paste: references

function handlePaste(e: ClipboardEvent): boolean {
  const items = Array.from(e.clipboardData?.items ?? []);
  const img = items.find((i) => i.type.startsWith("image/"));
  if (img) {
    e.preventDefault();
    const file = img.getAsFile();
    if (!file) return true;
    const reader = new FileReader();
    reader.onload = () => {
      addReference({ kind: "image", title: `Screenshot ${engine.state.references.length + 1}`, dataUrl: String(reader.result) });
    };
    reader.readAsDataURL(file);
    return true;
  }
  const text = (e.clipboardData?.getData("text/plain") ?? "").trim();
  if (/^https?:\/\/\S+$/.test(text)) {
    e.preventDefault();
    let title = text;
    try {
      const u = new URL(text);
      title = `${u.hostname.replace(/^www\./, "")}${u.pathname !== "/" ? u.pathname : ""}`;
    } catch {
      /* keep raw */
    }
    addReference({ kind: "link", title, url: text });
    return true;
  }
  return false;
}

function addReference(r: { kind: "link" | "image"; title: string; url?: string; dataUrl?: string }) {
  engine.commit({
    id: newId("tx"),
    actor: "user",
    label: "Add reference",
    ops: [{ t: "ref.add", ref: { id: newId("r"), addedAt: Date.now(), ...r } }],
  });
  toast(`Added to references: ${r.title}`);
}

// ============================================================================ undo

function undo() {
  const res = engine.undo();
  if (res && !res.ok) toast("That changed since. Nothing undone.");
  else if (res) render();
}

// ============================================================================ role, room, publish, views

function setRole(role: Role) {
  if (engine.state.role === role) return;
  engine.commit({ id: newId("tx"), actor: "user", label: role === "scribe" ? "Scribe" : "Partner", ops: [{ t: "meta", patch: { role } }] });
  if (role === "scribe") setRoom(true);
}
$("role-partner").onclick = () => setRole("partner");
$("role-scribe").onclick = () => setRole("scribe");

function setRoom(on: boolean) {
  document.body.classList.toggle("room", on);
  $("room").setAttribute("aria-pressed", String(on));
  $("room-text").textContent = engine.state.role === "scribe" ? "Scribe · Your words only" : "Partner";
  if (on) closeSidebar();
  paintSpotlight();
}
$("room").onclick = () => setRoom(!document.body.classList.contains("room"));

type View = "draft" | "shelf" | "reader";
function setView(v: View) {
  document.body.classList.toggle("view-shelf", v === "shelf");
  document.body.classList.toggle("view-reader", v === "reader");
  $("scroller").scrollTop = 0;
}

publishBtn.onclick = async () => {
  await saveNow();
  const piece = await host.publish(engine.snapshot());
  toast("Published.");
  await showShelf(piece.id);
};

function coverArt(p: PublishedPiece, i: number): string {
  const [a, b] = p.palette.map((c) => PALETTE_VAR[c]);
  // The symbol's grammar (round = voice, square = page, tail, gap), one twist per cover.
  const v = i % 4;
  const shapes = [
    `<path d="M150 -10 A90 90 0 0 0 150 170 Z" fill="${a}"/><path d="M164 -10 H260 V220 L216 170 H164 Z" fill="${b}"/>`,
    `<circle cx="200" cy="90" r="70" fill="${a}"/><rect x="40" y="40" width="96" height="96" fill="${b}"/>`,
    `<rect x="120" y="20" width="140" height="140" fill="${a}"/><circle cx="240" cy="150" r="34" fill="${b}"/>`,
    `<path d="M60 40 A70 70 0 0 1 60 180 Z" fill="${a}"/><path d="M48 40 A70 70 0 0 0 48 180 Z" fill="${b}"/>`,
  ][v];
  return `<svg viewBox="0 0 300 400" preserveAspectRatio="xMidYMin slice" aria-hidden="true">${shapes}</svg>`;
}

async function showShelf(highlight?: string) {
  closeSidebar();
  setRoom(false);
  setView("shelf");
  const pieces = await host.listPublished();
  const covers = $("covers");
  covers.innerHTML = "";
  if (!pieces.length) {
    covers.innerHTML = `<p class="empty-shelf">Nothing published yet. Publish appears once a draft has substance.</p>`;
  }
  pieces.forEach((p, i) => {
    const b = h("button", { class: "cover" });
    b.innerHTML = `<div class="art">${coverArt(p, pieces.length - 1 - i)}<div class="name"></div></div><span class="meta">DOC · ${new Date(p.publishedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }).toUpperCase()}</span>`;
    b.querySelector(".name")!.textContent = p.title;
    b.onclick = () => showReader(p);
    covers.appendChild(b);
    if (p.id === highlight) b.querySelector(".art")!.animate([{ transform: "translateY(12px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 420, easing: "cubic-bezier(0.2,0,0,1)" });
  });
}
$("open-shelf").onclick = () => void showShelf();

function showReader(p: PublishedPiece) {
  const r = $("reader");
  r.innerHTML = "";
  const page = h("article", { class: "page" });
  const running = h("div", { class: "running" }, `<button class="chip" id="back-shelf">← Published</button>`);
  const t = h("h1", { class: "title" });
  t.textContent = p.title;
  page.append(running, t);
  let n = 0;
  for (const b of p.blocks) {
    const el = h("div", { class: "blk", "data-kind": b.kind });
    if (b.kind === "heading") el.dataset.num = String(++n).padStart(2, "0");
    if (b.theme) el.dataset.theme = b.theme;
    el.style.setProperty("--depth", String(b.depth ?? 0));
    el.textContent = b.text;
    page.appendChild(el);
  }
  r.appendChild(page);
  setView("reader");
  $("back-shelf").onclick = () => void showShelf();
}

// ============================================================================ sidebar, settings, theme

function openSidebar() {
  document.body.classList.add("sidebar-open");
  void refreshDraftList();
}
function closeSidebar() {
  document.body.classList.remove("sidebar-open");
}
$("menu").onclick = () => (document.body.classList.contains("sidebar-open") ? closeSidebar() : openSidebar());
$("scrim").onclick = closeSidebar;
$("new-draft").onclick = async () => {
  closeSidebar();
  await saveNow();
  load(await host.createDraft());
};

function applyTheme(t: "paper" | "sumi" | "system") {
  const dark = t === "sumi" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "sumi" : "paper";
}
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => applyTheme(settings?.theme ?? "system"));

const dialog = $<HTMLDialogElement>("settings");
async function openSettings() {
  settings = await host.getSettings();
  const f = dialog.querySelector("form")!;
  (f.elements.namedItem("theme") as HTMLSelectElement).value = settings.theme;
  (f.elements.namedItem("claudeKey") as HTMLInputElement).value = "";
  (f.elements.namedItem("openaiKey") as HTMLInputElement).value = "";
  $("claude-note").textContent = settings.claude ? `Connected · ${settings.model}` : "Without a key, Phlo settles with fast local rules.";
  $("openai-note").textContent = settings.openai ? "Connected" : host.isDesktop() ? "Needed to talk in the desktop app." : "Optional in Chrome, which has its own speech service.";
  $("storage-note").textContent = settings.secureStorage ? "Keys are encrypted by your system keychain." : "Keys are kept in memory for this session only.";
  const st = await host.stats().catch(() => null);
  const m = st?.routes.find((r) => r.route === "model");
  $("stats-meta").textContent = m?.count ? `MODEL P50 ${((m.p50 ?? 0) / 1000).toFixed(1)}S · P95 ${((m.p95 ?? 0) / 1000).toFixed(1)}S` : "";
  closeSidebar();
  dialog.showModal();
}
$("open-settings").onclick = () => void openSettings();
dialog.addEventListener("close", async () => {
  if (dialog.returnValue !== "save") return;
  const f = dialog.querySelector("form")!;
  const patch: Record<string, string> = { theme: (f.elements.namedItem("theme") as HTMLSelectElement).value };
  const ck = (f.elements.namedItem("claudeKey") as HTMLInputElement).value.trim();
  const ok = (f.elements.namedItem("openaiKey") as HTMLInputElement).value.trim();
  if (ck) patch.claudeKey = ck;
  if (ok) patch.openaiKey = ok;
  settings = await host.setSettings(patch);
  applyTheme(settings.theme);
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
    document.body.classList.contains("sidebar-open") ? closeSidebar() : openSidebar();
  } else if (mod && e.shiftKey && e.key.toLowerCase() === "r") {
    e.preventDefault();
    setRoom(!document.body.classList.contains("room"));
  } else if (e.key === "Escape") {
    if (document.body.classList.contains("room")) setRoom(false);
    else if (document.body.classList.contains("sidebar-open")) closeSidebar();
    else if (document.body.classList.contains("view-shelf") || document.body.classList.contains("view-reader")) setView("draft");
  } else if (mod && e.key.toLowerCase() === "z" && !caretInText()) {
    e.preventDefault();
    e.shiftKey ? engine.redo() : undo();
  }
});

docEl.addEventListener("blur", () => {
  // Leaving the page settles whatever you left wet.
  setTimeout(() => {
    if (document.activeElement !== docEl) {
      caretBlock = null;
      settler.request("blur", 300);
    }
  }, 0);
});

// ============================================================================ test + demo hooks

declare global {
  interface Window {
    phlo: {
      simulateSpeech(text: string): void;
      settleNow(): void;
      state(): Draft;
      undo(): void;
    };
  }
}
window.phlo = {
  simulateSpeech: (t) => addSpeech(t),
  settleNow: () => settler.request("force", 0, true),
  state: () => engine.snapshot(),
  undo: () => undo(),
};

// ============================================================================ boot

(async () => {
  settings = await host.getSettings().catch(() => null);
  applyTheme(settings?.theme ?? "system");
  await openDraft();
  setTimeout(() => voiceTip.classList.remove("show"), 4000);
})();
