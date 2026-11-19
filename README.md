# phlo

**Think out loud. Watch it take shape.**

Phlo turns thinking out loud into a clear page. You talk (or type messily) and the page organizes itself under the right headings while you keep thinking.

## Run it

```bash
npm install
npm run desktop      # the Mac/Windows/Linux app (Electron)
npm run web          # same app in Chrome at http://127.0.0.1:8765 (uses Chrome's speech service)
npm test             # engine, settle and benchmark tests
npm run eval -- --chatgpt     # settle quality on your ChatGPT plan (Codex signed in)
./evals/sweep.sh              # compare models on OpenRouter (PHLO_API_KEY=sk-or-…; cents per run)
```

**AI, no API key:** Phlo settles with ChatGPT on your plan through the Codex CLI, like the prototype. Install Codex and sign in once: `npm i -g @openai/codex && codex login` (choose ChatGPT). Without it, Phlo settles with fast local rules. **Your AI** in the sidebar switches to Claude (API key) or on-this-Mac only.

**Talking with no keys:** use `npm run web` in Chrome, which has free built-in speech. The desktop app needs an OpenAI transcription key until on-device speech lands (see `docs/ARCHITECTURE_REVIEW.md`).

Keys are encrypted with the system keychain in the desktop app and never reach the page.

## Use it

| Do | How |
| --- | --- |
| Talk | Hold **Space** to talk, release to stop. **Tap Space twice** to lock it on (tap again to stop). Space talks when the caret isn't in text, on an empty draft, or with **⌥Space** anywhere. Or click the dot. |
| Type | Just type. New lines stay wet (light gray) until you finish the paragraph (**Enter twice**) or move away. **⌘↵** settles now. |
| Structure by hand | `# ` heading · `- ` bullet · `? ` open question · Tab / ⇧Tab for list depth |
| Change your mind | Say "scratch that, …" or "not forty, sixty". The old version folds into an `EARLIER:` trail. Nothing is deleted. |
| Restructure by voice | "rename pricing to business model", "move risks under pricing", "put goals before hiring", "park other trends", "make that a decision", "make these a table". A toast names the change, with Undo. |
| Forms | Type `/` on a new line to add one, or right-click any line to **Turn into**: text, heading, bullets, numbered, open question, decision, idea, note, table, flow. Tab / Enter move through table cells and flow steps. Say "make that a flowchart" or "make these a table". |
| Direct it | "new section pricing: …", "under risks: …" are handled instantly, on-device. |
| Tangents | "oh also, …" becomes a `TANGENT · LATER` tab in the margin. Click it to bring it into the section you're in. |
| Action items | "talk to 5 couples" goes to the **Next** list at the end. |
| References | ⌘V a link or a screenshot. It goes to References in the sidebar, not into the page. |
| Partner / Scribe | Partner helps you think (tabs, one `PHLO ASKS` question after ~8s of locked-on silence). Scribe organizes only your words and opens Room view. |
| Room view | ⌘⇧R or ··· → Room view. Sumi, large type, no chrome. Esc to leave. |
| Transcript | ··· → Transcript, with time codes. |
| Publish | A ghost button until the draft has 3 sections with content, then solid. |
| Undo | ⌘Z undoes the last change, including a settle, without touching what you typed elsewhere. |

## The design test

`e2e/design-test.cjs` runs the handoff's test in the real app: speak, change an idea into a flowchart, paste evidence, correct a mistake by voice ("not sixty, forty" fixes the step inside the diagram, with the old version in its trail), without losing your place. It passes in about 7 seconds.

## Acceptance checks

`e2e/acceptance.cjs` runs CORE_SCREEN_SPEC section 5 against the running app (`npm run web`, then `NODE_PATH=$(npm root -g) node e2e/acceptance.cjs`). All 9 pass; checks 3–5 are covered by unit tests, and check 1 is verified up to the microphone prompt.

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
docs/design/   phlo-handoff/ (spec, screens, tokens, brand: the source of truth) and phlo-system/ (earlier export)
tests/ evals/  unit + benchmark tests, live quality eval
```
