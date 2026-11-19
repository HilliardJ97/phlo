# Phlo: product requirements

November 19, 2026. The agreed MVP. Design lives in `design/phlo-handoff/` (the source of truth for how it looks: `EXPRESSION_SPEC.md` for everything beyond the core screens). How it's built lives in `ARCHITECTURE.md`. `EXPRESSION_SYSTEM.md` keeps the reasoning behind the expression decisions.

---

## 1. Mission

- **Phlo is where thinking out loud becomes something clear.** You talk; Phlo shapes; you never manage the tool.
- **The promise:** never manage the tool, never lose a word, never get words put in your mouth.
- **Why it wins:** other tools give you a transcript, a chat or a blank canvas. Phlo is the only page that listens and arranges at the same time.
- **Taste:** do a lot, show a little. Many shapes underneath, a handful of words on the surface. Every feature is judged by one question: does it keep you in flow?

## 2. Who it's for

- **Launch: the framer.** PM candidates in product sense and case interviews, in Scribe and Room view. A sharp pain, a tight community, and every session is a demo.
- **Next: the explorer.** Founders and PMs thinking alone in Partner (the morning chief-of-staff session is the reference).
- **Not yet:** teams, students, meeting notes.

## 3. The model: six things to learn

1. **Draft:** where you think, across many sessions.
2. **Page and Board:** two views of the same draft. Page for narrowing down, Board for spreading out.
3. **Phlo:** shapes as you go (Settle), as Partner or Scribe.
4. **The margin:** the only place Phlo speaks.
5. **References:** everything from outside.
6. **Publish:** a finished piece you can send or play.

Three ways in, always equal: **say it, right-click it, or type `/`.**

## 4. One session

1. **Start:** a blank page and a dot. Hold Space and talk, or just type.
2. **Spread out (optional):** flip to the Board, scatter, cluster, connect; flip back and clusters become sections.
3. **Settle:** words land in the right place; the whole draft stays in shape at pauses; you correct by talking.
4. **Shape:** say a shape or right-click; Phlo picks the variant.
5. **Pull in:** Look into, Push back, Make, Follow up. Results arrive in the margin.
6. **Finish:** Publish. Send the link or let them Play it.

## 5. Requirements

Status: ✅ built and tested · 🟡 partly built or not verified live · ⬜ to build.

### Talk
- Hold Space to talk; tap twice to lock; ⌥Space anywhere. The voice dot is the only vermilion. ✅
- Words appear wet within ~150 ms of being heard. ✅ (browser)
- **Desktop speech on-device and free: Apple speech (SpeechAnalyzer), benchmarked against Parakeet and whisper on our recordings.** ⬜ launch blocker
- **Finished-thought detection:** settle on a finished thought, not just silence (on-device turn model, ~8 MB), plus a 600 ms grace window so "scratch that" folds in before anything is sent. ⬜
- Every utterance is time-coded and linked to the lines it became. 🟡

### Settle
- p50 ≤ 1.5 s, p95 ≤ 3 s on ChatGPT; commands on-device in < 5 ms. 🟡
- Text never moves under the caret; a stale edit never overwrites typing. ✅ **Non-conflicting parts of a plan still apply.** ⬜
- Sections from your cue words, lists from "one, two…", tangents to the margin, Actions to Next. ✅
- **The whole draft stays in shape:** at pauses, Phlo merges duplicate sections, reorders into the story, promotes recurring ideas, splits long sections, turns comparable lists into tables. One chip with Undo. Never touches the section you're in. ⬜
- **Settle off:** just type; Phlo only offers in the margin. Scribe is always on. ⬜
- Typing settles like speech (Enter twice, caret leaves, ⌘↵). ✅

### Change your mind and move things
- "Scratch that", "not forty, sixty", corrections inside tables and flows; the old version in a trail; nothing deleted. ✅
- Rename, move, merge, park by voice, with Undo. ✅
- Drag grip; ⌥⇧↑↓; dragging a heading carries its section. ⬜

### Shape (seven families)
- **Text:** heading, subheading (folds), text, bullets, numbered, checklist, quote, code; italic, bold, underline, strike, link. 🟡
- **Marks:** Question, Idea, Decision, Action (owner and date), Key point (becomes the Published summary). 🟡 (question, idea, decision exist)
- **Compare:** table, cards, pillars, pros and cons, ranking. 🟡 (table, columns)
- **Flow:** steps, linear, branching, cycle, timeline. 🟡 (linear, timeline)
- **Numbers:** big number, **live estimate**, bar, line, pie. 🟡 (bar, line, histogram)
- **Make:** wireframe and prototype; talk while looking and notes become pins; "update it" runs the next pass. ⬜
- **Media:** photo, find a photo, video, Figma, PDF. ✅ (PDF ⬜)
- Phlo picks the variant; you can say another. Switching keeps every word and number. No numbers, no chart. Phlo converts only when asked; otherwise it suggests. ✅ for built forms
- **20 ink marks** on Marks, pillars, clusters and cards; `:` offers marks then emoji. ⬜ (drawn)
- **Theme colors:** coloring text tags it with one of three themes. ⬜

### Board
- Page ⇄ Board by voice, ⌘B or pinch. Same blocks, nothing copied. ⬜
- Talk and the card lands at the pointer; click anywhere to type; drag, cluster, Connect. ⬜
- Phlo clusters by theme; fold back turns clusters into sections in reading order. ⬜
- Phlo can offer the Board; it never flips on its own. ⬜

### Connect
- Say it, drag between grips, or right-click. A gutter curve with an optional note; chips at both ends when far apart. Shown on the Board too. ⬜

### The margin
- One card for Ask, Suggest, Looking into, Found, Tangent. 🟡 (tangent and ask exist)
- Only at pauses; unprompted at most one per ~3 min; one per section; three on screen; `+N` for more. ⬜
- Answer by voice or click, or ignore. Earlier from Phlo keeps everything that faded. Nothing on the room's screen in Scribe. ⬜

### Verbs
- **Look into:** web and References research with sources. ⬜
- **Push back:** pressure-tests a section as Ask cards. ⬜
- **Make:** see Shape. ⬜
- **Follow up:** uses connections to draft invites, emails and tasks; always asks before sending. ⬜
- Each runs on your connected model; "with Claude" picks another for one job. 🟡 (provider chain exists)
- Results are proposals; nothing writes to the page until you pull it in. Phlo adds what it finds or makes to References. ⬜

### References and connections
- ⌘V links and screenshots into References. ✅
- Reader view in the sidebar; refer to a source by voice. ⬜
- Sources are immutable: quoted and cited, never paraphrased into the page. ⬜
- **Connections to Phlo:** Google Calendar, Gmail and Google Drive at launch, through MCP, held by Phlo's host. Read-only unless Phlo asks. ⬜

### Memory (a differentiator; deep dive in `ARCHITECTURE.md` §6b)
- Settling at minute 60 is as fast as at minute 1, and callbacks to minute 3 land. ⬜
- The draft's aim, standing instructions ("keep it to three pillars"), and a ledger of people and numbers. ⬜
- **What Phlo remembers** is visible and editable in the sidebar. ⬜
- Contradictions surface as one Ask card in Partner. ⬜

### Publish and Play
- Publish turns solid at 3 sections with content; Key points become the summary. 🟡
- Export to one HTML file and PDF; hosted link right after. ⬜
- **Play:** the page builds itself again to your voice, with captions, at 1× or 2×. Voice kept on your computer only, and you can turn it off. ⬜

### Trust and cost
- Scribe adds nothing (enforced in code); never delete user words; local-first; keys in the host. ✅
- Free by default: ChatGPT through Codex, then on-device rules. Paid models opt-in and capped. ✅ (cap ⬜)

### First run
- From opening the app to a settled section in under 60 s; one-step ChatGPT sign-in; a 20-second "say this" example. ⬜

## 6. Release order (all of it is the MVP)

1. **Alpha (the core loop):**
   - Apple speech and finished-thought detection.
   - Settle with whole-draft shaping and the zero-fixes metric.
   - The margin, Look into, memory.
   - Text, Marks, Compare, Flow, Numbers with the live estimate.
   - Drag to move, right-click parity, marks and themes.
2. **Beta (the open world):**
   - Board, Connect, Make with pins.
   - Push back and Follow up.
   - Calendar, Gmail and Drive.
   - Reader view.
3. **Launch (the growth loop):**
   - Publish export and hosted links.
   - Play.
   - "With Claude" for any verb.

## 7. Not in the MVP

- Map view (Board replaces it).
- Kanban, post-its on the Page, free text colors, styling controls.
- Image creation (marks instead; ink concept sketches later in Make).
- Multiplayer, mobile, Publish to slides (though Numbers and Compare borrow the best slide patterns).
- Outside agents working in a draft over MCP (later, as guests that only propose).

## 8. Quality bars to ship

- Settling: p50 ≤ 1.5 s and p95 ≤ 3 s on ChatGPT.
- **Fixes per session:** median 0, and fewer than 2 at the 90th percentile.
- 0 lost words, 0 Scribe violations, 0 text moved under the caret.
- Edits landing on the wrong block: < 1%. Sources kept exactly: 100%.
- Phlo interrupting mid-thought: < 5%.
- Test sessions: ≥ 90% of checks on ChatGPT, ≥ 80% on-device, 3 runs out of 3, including a 45-minute session.
- Time to first wow under 60 s, with 5 new people.

## 9. What we measure after launch

- **Activation:** a 3-section draft in the first session.
- **Trust:** sessions with a voice correction or a shape change.
- **Flow:** minutes talking per session; Found cards pulled in.
- **Retention:** week-2 return.
- **Growth:** Published pieces played and shared.

## 10. Go-live

1. **Private alpha with 10 people** (PM candidates and two founders), using `TESTING.md` and a 15-minute call each.
2. **Fix the top three janky moments**, then re-run the evals.
3. **Record the demo:** one take, a product sense answer building itself, with a correction, an estimate and Look into.
4. **Launch where framers are:** PM interview communities and newsletters. Every Published piece can be played, so every share is a demo.
