# Handoff: where the alpha build stands

Read this first, then `CLAUDE.md`, `docs/PRODUCT.md` (what) and `docs/ARCHITECTURE.md` (how). Design source of truth: `docs/design/phlo-handoff/` (`EXPRESSION_SPEC.md` beyond the core screens).

Branch: `claude/mvp-design-backend-arch-vu489h`. Commit and push there only. No PRs unless asked.

## How to work with Justin

- **Elite bar.** Design-focused PM plus principal-architect quality. Push back with taste; don't be a yes-man. "Maximalism through minimalism": open world underneath, simple surface.
- **Test before handing over.** Run the real app and the evals yourself. Never hand over something you haven't run end to end. Justin tests on a real voice; you test everything else first.
- **Know the setup.** Check prerequisites on this Mac (Codex signed in, mic permission, model downloads) before asking Justin to try anything.
- **Cost close to $0.** ChatGPT through Codex on Justin's plan is the default brain. No paid API spend unless he says so. OpenRouter: don't use it.
- **Be token-efficient,** without cutting quality.
- **Every real session Justin shares becomes an eval case** in `evals/goldens.ts`. Log the case and its target first, then change code, then re-run.

## Product model (agreed)

- **The six things:** Draft; Page and Board (two views of the same blocks); Phlo shaping as Partner or Scribe; the margin (the only place Phlo speaks); References; Publish (plus Play).
- **Three ways in:** voice, right-click, `/`.
- **Verbs, not agents:** Look into, Push back, Make, Follow up.
- **Shapes:** seven families: Text, Marks, Compare, Flow, Numbers, Make, Media.
- **Marks:** five: Question, Idea, Decision, Action, Key point.
- **Themes:** max three, shown as a 2px underline.
- **Memory is the differentiator.**
- **North star:** zero fixes per session.
- **Vocabulary:** see `CLAUDE.md`. Never "agent", "clean", "document".

## Alpha build order (ARCHITECTURE §18)

**Done and pushed:**
1. SQLite store (`node:sqlite`, one `phlo.db`), per-author journal, FTS5 search, legacy import, per-author undo.
2. Partial apply: dependency groups; stale groups are dropped and re-asked.
3. Lanes scheduler: hot, warm and cold; turnId idempotency; supersede; deadlines; cold waits while talking.
4. Context packet: fixed size (hot sections in full, digests elsewhere) plus FTS Recall on cues. Has a 45-minute golden.
5. Memory keeper:
   - aim and standing instructions from speech (instructions park off the page);
   - Ledger of numbers pushed into requests;
   - contradiction asks;
   - "What Phlo remembers" in the sidebar.

**Also done today:**
- **Desktop voice runs on-device:** Moonshine via transformers.js in `src/renderer/voice/asr.worker.ts`. CPU 8-bit, ~60 MB one-time download, no key. `LocalSTT` lives in `stt.ts`. The worklet is in `src/renderer/public/voice-tap.js`, because Electron blocks blob worklets.
- **macOS mic permission** is requested on first talk.
- **Codex ships as an npm dependency,** and in-app **Connect** runs `codex login`.

**Remaining:**
6. Margin cards.
7. Look into.
8. Apple speech (optional upgrade over Moonshine).
9. Gardener.
10. Shapes, marks, themes, drag, right-click.
11. Replay suite.

## What the first real sessions showed (Nov 20). Do this next, before margin cards

Justin riffed in Partner (screenshots: a "Lumen" riff and a "Coffee table books" riff). The result was a transcript with a heading on it, not a page.

1. **Thoughts get cut into scraps.**
   - `LocalSTT` ends an utterance after 700 ms of silence, so mid-sentence pauses produce lines like "That" and "Give me a way to…".
   - Fix: a longer cut (~1.2–1.5 s). Fold trailing fragments (ending in "to…", "that", "about…") into the next utterance before settling. ARCHITECTURE §5's thought gate is the full version.
2. **Partner never distills.**
   - Settle only places your words and cleans fillers ("meaning unchanged").
   - Agreed direction: in Partner, the page is the distilled version in the speaker's own words. Merge repeats, drop false starts, keep the best phrasing, invent nothing.
   - The raw words stay in the transcript, plus a folded "What you said" per section.
   - Distill at pauses on the warm lane (the Gardener, made Partner-capable rather than structure-only). Never touch the section you're in. Show one chip: "Phlo tightened X · See · Undo".
   - Scribe stays near-verbatim.
3. **Riffs have no structure.**
   - Phlo should find sections itself (Problem, Idea, What it does, Why it's different, Open questions) without templates.
   - The Board is not the answer to this.
4. **Bug:** the local rules made "Just riffing" a heading.
5. **ChatGPT wasn't connected** in the Coffee table books session (Codex wasn't installed). It is now; re-test with it.

**Target page for the Lumen riff** (Justin: "that's closer for sure"):
- Title: Lumen.
- Aim: a chief of staff that brings your life to you, simply.
- **The problem:**
  - Metamuse chief of staff "Justy" handles to-dos, calendar, statuses, mail and ideas.
  - It pulls from me and blasts updates; hard to manage; doesn't simplify.
  - Running your life through text is complicated.
- **The idea:**
  - Get up to speed on everything.
  - Organize thoughts and delegate.
  - A living, breathing dashboard of my life.
- **Why it's different:** a real chief of staff handles the back end and presents what matters beautifully (slides, reports).
- **Next:** talk through the design.

**Real transcripts are on this Mac.** Every utterance is stored in the draft (`transcript`), so build eval cases from what was actually heard, not from screenshots:

```bash
sqlite3 ~/Library/Application\ Support/phlo/data/phlo.db \
  "select title, json_extract(doc,'$.transcript') from drafts order by updated_at desc limit 3"
```

Audio isn't stored yet (planned for Play).

**Eval case:** `evals/goldens.ts` → `riff-lumen`. Distill checks are marked `gap: true`; flip them as features land. Add a `riff-coffee` case from the second screenshot the same way.

## Commands

```bash
npm install
npm run desktop                                   # the app (Electron)
npm test && npx tsc --noEmit -p .                 # before every commit
npm run eval -- --chatgpt --only riff             # quality on ChatGPT (needs codex login)
npm run eval -- --local                           # on-device rules, no model
npm run build && node e2e/desktop-voice.cjs <clip.wav> [holdMs]   # real app, fake mic, recorded speech
npm run build && node e2e/desktop-type.cjs        # real app, typing
```

On Linux CI, prefix the e2e scripts with `NODE_PATH=$(npm root -g) xvfb-run -a`.

Test clips: make them with any TTS (e.g. `say -o clip.aiff "…"` on a Mac), then `ffmpeg -i clip.aiff -ar 48000 -ac 1 clip.wav`. Add silence between sentences to exercise the pause cutting.

## Guardrails

- Every page change goes through `DocEngine.commit`.
- Never delete user words: park them or fold them into a trail.
- Text never moves under the caret.
- Scribe is enforced in code.
- Keys stay in the host.
- Commit messages end with the Co-Authored-By line. Never put a model name in repo files.
