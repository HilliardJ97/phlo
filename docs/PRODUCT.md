# Phlo: product requirements for the MVP

November 19, 2026. What we ship first, what "done" means, and what we deliberately leave out. Design lives in `design/phlo-handoff/`; how it's built lives in `ARCHITECTURE.md`; the full catalog of forms lives in `EXPRESSION_FOUNDATION.md`. This page decides scope.

---

## 1. The bet

**You think out loud, and a clear page builds itself while you keep going.** You never manage the tool.

Every other tool makes you pick one of two:
- **Talk, and get a transcript or chat.** ChatGPT voice, Otter, Granola. The output is a conversation or a summary written afterwards.
- **Organize, and stop thinking.** Notion, Docs, Miro. You're the one filing, formatting and drawing.

Phlo is the first page that **listens and arranges at the same time.** Your words land under the right heading, lists become lists, a sequence becomes a flowchart, "not sixty, forty" fixes the exact number, and nothing you said is lost.

**Why now:** models are finally fast and cheap enough to place each thought in about a second. And as AI writes more of the finished output, the valuable part of work moves to the messy thinking before it. No tool is built for that part.

## 2. Who it's for first

| | The framer (Scribe) | The explorer (Partner) |
|---|---|---|
| Moment | Talking through a problem while someone watches: a product sense interview, a client call, a working session | Working a messy idea alone, across many sessions |
| Must feel | "The page keeps up, and it's only my words." | "I got it all out, I didn't lose the tangents, and I know what to do next." |
| Launch audience | **PM candidates prepping product sense and case interviews.** Phlo's origin, a sharp pain, a tight community, and every session is a demo. | Founders and PMs thinking through a plan |

We launch to the framer first. A narrow, loud audience beats a broad, quiet one.

## 3. What has to feel wild

Distribution comes from moments people screen-record and send to a friend. The MVP has to deliver four of them, every time:

1. **The page builds itself.** Three minutes of talking, no mouse: sections from your own words, lists, a decision, a Next list. *The 30-second demo.*
2. **You change your mind out loud, and the page fixes the exact spot.** "Scratch that, not forty, sixty." The old version folds into a faint trail. *The trust moment.*
3. **Say a shape, get a shape.** "Make that a flowchart." "Chart signups: Jan 120, Feb 180, March 260." "Find a photo of a wedding album." *The expression moment.*
4. **Stuck? Ask out loud, keep thinking.** "Look into how Shutterfly prices photo books." "Any ideas here?" Phlo works in the background and brings back sources and ideas in the margin, without interrupting you. *The flow moment. New in this plan, §5.*

If a feature doesn't make one of these sharper, it isn't in the MVP.

## 4. Product laws

These decide arguments. Most are already enforced in code.

1. **Never manage the tool while thinking.** No naming, filing, buttons to organize, or modes to pick mid-thought.
2. **Never lose a word.** Corrections fold into trails; removed things are parked.
3. **Never put words in your mouth when someone's watching.** Scribe adds nothing, enforced in code.
4. **Never move text under the caret.**
5. **Inputs in the margin, output on the page.** Sources, research, ideas, tangents and suggestions live beside the page until you pull them in. Only your thinking writes the page.
6. **Small and reversible: just do it. Structural: show it, with Undo. Ambiguous: ask once.**
7. **Free to use.** Your ChatGPT plan or on-device rules. Paid models are optional, capped, and never the default.

## 5. The new P0: Look into and Ideas

The flow-breaker today is the moment you hit something you don't know. You leave, open a browser, lose the thread. Phlo should keep you in flow.

**How it works**
- Say **"look into …"**, **"find out …"**, or **"what's the data on …"**. A quiet `LOOKING INTO · Shutterfly pricing` tab appears in the margin beside the line you were on, and you keep talking.
- Say **"any ideas?"** or **"give me ideas on this"**. Phlo reads the section you're in and returns three short ideas in the margin, marked as Phlo's (tab color).
- Results arrive as **References**: each with a one-line finding, its source link, and a date. Click one to read it in the sidebar; that's the "side browser," with no tabs to manage.
- **Pull it in** by voice ("use the second one", "add that") or by clicking. It lands in your section with its source attached. Until then, nothing on the page changes.

**Rules**
- Partner only shows results while you're in flow. In Scribe, results wait privately in the sidebar and never appear on the room's screen.
- Every claim carries its source, or it's marked unverified.
- One errand at a time per section, three at once at most. Each one shows when it's done; nothing beeps.
- Runs on your ChatGPT plan through Codex's web search. Free.
- Page text Phlo reads is data, never instructions.

**What we're not doing**
- **No embedded web browser.** A real browser inside Phlo means tabs, logins and a security surface, and it pulls you out of flow. A reader view of a reference in the sidebar does the job.
- **No autonomous agents running unasked.** Partner may *offer* ("Check this number?") but never starts work on its own.

## 6. Expression, refined

The full design is in `EXPRESSION_SYSTEM.md`. The decisions:

| Idea | Decision |
|---|---|
| Every shape you could need | **Eight families, one word each:** Text, Marks, Compare, Flow, Numbers, Map, Make, Media. Over 40 variants underneath; Phlo picks one (pie or line, cycle or timeline) and you can say a different one. Maximal depth, minimal surface. |
| New: estimates | **Spoken math becomes a live calculation** (`10M × 5% × $40 = $20M`). Change one input, the total updates. Built for sizing questions. P0 for the framer launch. |
| New: your voice, kept | **Hear any line as you said it.** Local only. The strongest proof of the Scribe promise. |
| New: pins | **Point at anything visual** (screenshot, chart, wireframe, Figma) and your words become a numbered note on that spot. |
| Post-its | **Cut.** Marks (Question, Idea, Decision, Note, Risk, Key point) and margin cards already do that job. A post-it would be a third way to say the same thing. |
| Green questions, yellow ideas | **Shape, not color.** Twenty ink marks built from the brand's four parts. Color stays earned for themes. |
| Highlight what's important | **Key point:** "that's really important" marks the line, and key points become the Published summary. |
| Arrows | **Connect**, plus **Map view** (the Obsidian-like view of how ideas link). |
| Phlo chiming in | **One margin card** for asks, suggestions, research and tangents, with strict rules for stacking, answering by voice, and fading. |
| Moving things | **Drag, keys, or voice.** Never copy and paste. |
| Prototypes you comment on | **Make:** talk while looking, notes become pins on exact elements, "update it" runs the next pass. |
| Generated images | **Mostly replaced by marks.** Making images moves to Make and Publish covers, later. |
| A whiteboard | Not in the MVP. A canvas is a second product. |

## 7. MVP scope

**Status:** ✅ built and tested · 🟡 built, not verified live · ⬜ to build

### P0: launch blockers

| Area | Done means | Status |
|---|---|---|
| Talk → settle | Hold Space or double-tap to lock; wet words settle to ink within ~2 s on ChatGPT | ✅ engine · 🟡 real mic, real ChatGPT |
| Speech in the desktop app, free | On-device speech, no key (Apple speech or whisper.cpp). Today the desktop app needs an OpenAI key; Chrome is free. | ⬜ **blocker** |
| Change your mind | Scratch that, not X Y, corrections inside tables and flows, trails | ✅ |
| Restructure by voice | Rename, move, merge, park, "make that a …", fold, with a toast and Undo | ✅ |
| Forms | Headings, subheadings and toggles, lists, question, decision, idea, note, table, flow, timeline, columns, chart, image, find a photo, video | ✅ (generate image needs a paid key: P1) |
| Partner and Scribe | Partner: tabs, one question when you stall, suggestions. Scribe: your words only, Room view | ✅ · 🟡 PHLO ASKS needs a live run |
| **Look into and Ideas** | §5 | ⬜ **new** |
| Margin cards | One component for Ask, Suggest, Found, Later, Working, with stacking and fade rules | 🟡 tangents and asks exist · ⬜ unified system |
| Marks and Key point | Twenty ink marks on Marks, pillars and cards; "that's important" | ⬜ marks drawn (proposal) |
| Chart and Flow variants | Pie, area, scatter, stacked; cycle, branch, steps, funnel, pillars; Phlo picks the variant | 🟡 bar, line, histogram, flow, timeline, columns · ⬜ the rest |
| Move blocks | Drag grip, ⌥⇧↑↓, voice | 🟡 voice · ⬜ drag and keys |
| Long sessions | 60 minutes of talking settles as fast as minute one, and callbacks to minute 3 land | ⬜ memory tiers (`ARCHITECTURE.md` §6b) |
| References | Paste links and screenshots; read them in the sidebar; refer by voice | ✅ paste · ⬜ reader view |
| Publish | A read view, plus **export to a single HTML file and PDF** you can send | ✅ view · ⬜ export |
| Drafts persist | Local-first, atomic saves, journal, selective undo | ✅ |
| Onboarding | First run: sign in to ChatGPT in one step, try a 20-second scripted example | ⬜ |
| Free by default | ChatGPT through Codex, local rules fallback, no paid calls unless you add a capped key | ✅ |

### P1: right after launch

- **Hosted Publish link** with a quiet "Made with Phlo" mark. The growth loop: every shared page is an ad.
- **Connect and Map view.**
- **Make:** wireframes you annotate by voice, then clickable prototypes (ported from `prototype/local-workspace`).
- **Diagrams:** tree, 2×2, mind map.
- **Reader view** for PDF, Markdown and HTML References.
- **Interview mode:** a timer and a product sense frame for the framer audience.

### Not now, and why

| Idea | Why not yet |
|---|---|
| Embedded browser | Pulls you out of flow; big security surface. The sidebar reader covers it. |
| Freeform canvas or whiteboard | A second product. Forms cover the common shapes. |
| Multiplayer editing | The framer shares a screen; the explorer is alone. Needs a sync engine; revisit with demand. |
| Connectors (Drive, Notion, analytics) | Valuable, but each one is integration work. Look into covers "I need information" for launch. |
| Agent roster (`@critic`, `@analyst`…) | Look into and Ideas are the two that earn it first. Add agents from real requests. |
| Publish to slides | After hosted links. |
| Mobile | Thinking out loud happens at a desk first. |
| Training our own model | No data yet; plans are tiny structured outputs. See `ARCHITECTURE.md` §9. |

## 8. Quality bars to ship

| Bar | Target | How we measure |
|---|---|---|
| Settle speed | p50 ≤ 1.5 s, p95 ≤ 3 s from end of speech to ink, on ChatGPT | Your AI panel, eval traces |
| Placement quality | ≥ 90% of golden checks on ChatGPT; ≥ 80% on local rules | `npm run eval` |
| Lost words | 0 | Engine invariant and tests |
| Scribe violations | 0 | `enforceScribe` and goldens |
| Text moved under caret | 0 | e2e acceptance |
| Time to first wow | < 60 s from first open to a settled section | Onboarding test with 5 people |
| Crash-free sessions | ≥ 99% | Local crash log |

## 9. What we measure after launch

- **Activation:** % of new users with a draft of 3+ sections in their first session.
- **The wow:** % of sessions with a voice correction or "make that a…" (people trusting the page).
- **Flow:** minutes talking per session; % of Look into results pulled into the page.
- **Retention:** % returning in week 2 to the same draft (explorers) or a new one (framers).
- **Growth:** published pages shared, and sign-ups from them (once hosted links ship).

## 10. Go-live plan

1. **Private alpha, 10 people** (PM candidates and two founders): the 20-minute test in `TESTING.md`, a 15-minute call after.
2. **Fix the top 3 janky moments.** Re-run the evals.
3. **Record the demo:** one take, no cuts, a product sense answer building itself, with a correction and "look into."
4. **Launch where the framers are:** PM interview communities and newsletters, plus a short video post. Waitlist to a signed download.

## 11. Decisions for Justin

1. **Launch audience:** PM interview prep first? (Recommended.)
2. ~~Look into on your ChatGPT plan~~ **Decided:** ChatGPT through Codex, including web search.
5. **Marks over colors:** approve the ink marks (`design/proposals/marks/`) instead of colored callouts?
3. **Desktop speech:** Apple's on-device speech (best quality, macOS 26 and Apple Silicon only) or whisper.cpp (any Mac, ~150 MB download)? Recommended: Apple speech, whisper.cpp as fallback.
4. **Hosted Publish links:** P1, as above, or pull into launch for the growth loop?
