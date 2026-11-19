# phlo

**Think out loud. Watch it take shape.**

Phlo turns thinking out loud into a clear page. You talk (or type messily) and the page organizes itself under the right headings while you keep thinking.

## Run it

```bash
npm install
npm run desktop      # the Mac/Windows/Linux app (Electron)
npm run web          # same app in Chrome at http://127.0.0.1:8765 (uses Chrome's speech service)
npm test             # engine, settle and benchmark tests
npm run eval         # live settle-quality eval (set ANTHROPIC_API_KEY to use Claude)
```

Open **Settings** from the sidebar (click the symbol, or ⌘\\):

- **Claude key**: Phlo settles with Claude. Without one, it settles with fast local rules.
- **Transcription key (OpenAI)**: needed to talk in the desktop app. In Chrome (`npm run web`), Chrome's built-in speech works without it.

Keys are encrypted with the system keychain in the desktop app and never reach the page.

## Use it

| Do | How |
| --- | --- |
| Talk | Hold **Space** (when the caret isn't in text), or **⌥Space** anywhere. Tap to toggle. Or click the dot. |
| Type | Just type. New lines stay wet (light gray) until you finish the paragraph (**Enter twice**) or move away. **⌘↵** settles now. |
| Structure by hand | `# ` heading · `- ` bullet · `? ` open question · Tab / ⇧Tab for list depth |
| Change your mind | Say "scratch that, …". The old version folds into a faint trail (hover to see it). |
| Direct it | "new section pricing: …", "under risks: …" are handled instantly, on-device. |
| References | Paste a link or a screenshot. It goes to References, not into the page. |
| Partner / Scribe | Partner helps you think. Scribe organizes only your words and turns on Room view. |
| Room view | ⌘⇧R. Large type, no chrome. Esc to leave. |
| Publish | Appears once a draft has 3 sections with substance. |
| Undo | ⌘Z undoes the last change, including a settle, without touching what you typed elsewhere. |

## Architecture

```
renderer (sandboxed)                         host (Electron main / loopback server)
┌────────────────────────────────┐   IPC    ┌───────────────────────────────────────┐
│ Editor ──▶ DocEngine (authority)│ ◀──────▶ │ HostApi (allow-listed methods)        │
│   keyboard, voice, phlo all     │          │  ├ Orchestrator ─ route ─▶ local rules│
│   commit guarded transactions   │          │  │   deadline, supersede,  └▶ Claude  │
│ Settler: one request in flight, │          │  │   fallback, Scribe guard, traces   │
│   folds new words into the next │          │  ├ Store: atomic snapshot + journal   │
│ STT: browser | utterance (VAD)  │          │  └ Keys: OS keychain (safeStorage)    │
└────────────────────────────────┘          └───────────────────────────────────────┘
```

**One document engine for every edit** (`src/engine/engine.ts`). A draft is an ordered list of blocks with stable ids and a `rev`. Keyboard, voice and the model all submit transactions of small ops (`insert`, `update`, `move`, `park`, …), each carrying the rev it was computed against. The engine checks every precondition, then applies all-or-nothing. A stale op never overwrites newer typing. Every transaction stores its inverse, so undo is selective: undoing a settle restores the wet words without touching what you typed elsewhere afterwards.

**The model proposes; the engine decides** (`src/engine/settle.ts`). Settling sends the outline and the wet words, with their revs, to the host. The model returns a structured plan addressed by block id (placements, new headings, revisions, consumed instructions, one optional question), constrained by a JSON schema. `compilePlan` turns it into guarded ops. Unknown ids are dropped, never guessed. Anything the plan forgot settles in place. Nothing is deleted: instructions and removed blocks are parked.

**Routing** (`src/host/ai/orchestrator.ts`). Explicit instructions take the local route (<5ms, offline). Everything else goes to Claude (`claude-opus-5-5`, low effort, cached system prompt, structured output, server-side refusal fallback) under a hard deadline, with the local plan as fallback. A newer request supersedes an older one. Every request is traced (route, latency, outcome); p50/p95 show in Settings.

**Scribe is enforced, not prompted.** `enforceScribe` runs on every plan in Scribe, whoever produced it. Placements that introduce words the speaker didn't say fall back to their own cleaned speech. Invented headings, titles and questions are dropped.

**Text never moves under the caret.** The block you're in is excluded from settling, and a plan that arrives after you clicked into its words waits.

**Local-first storage** (`src/host/store.ts`). Each draft is an atomic snapshot (write, fsync, rename) plus an append-only journal of who changed what. Saves are version-checked, so a stale window can't overwrite newer work. Delete is soft.

## Benchmark

`tests/benchmark.test.ts` encodes the first engineering benchmark: paste two studies, say the second changes the recommendation, and type in another section while Phlo thinks. It checks that the recommendation and its citation change together, that the unrelated typing survives, that undo reverses only that edit, that a recommendation edited mid-request is not overwritten, that a slow model falls back within the deadline, and that Scribe holds when the model invents words.

## Layout

```
src/engine/    model, transactions, settle plan + compiler, local rules (pure TS, shared)
src/host/      HostApi, orchestrator + Claude provider, store, loopback server
src/desktop/   Electron main + preload
src/renderer/  editor, voice, UI, styles (tokens from the design system)
docs/design/   Phlo design system (tokens, brand, components)
tests/ evals/  unit + benchmark tests, live quality eval
```
