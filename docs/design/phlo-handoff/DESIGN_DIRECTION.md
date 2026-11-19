# Phlo: Design Direction

The full context behind every design decision so far: what Phlo is, who it's for, how it should look and feel, and what we tried and rejected along the way. Read this before changing anything visual. When a question comes up that the spec doesn't answer, this file should help you answer it the way we would.

---

## 1. The product

**Phlo turns thinking out loud into a clear page.** You talk (or type messily), and the page organizes itself under the right headings while you keep thinking. An idea can become a paragraph, a table, a flowchart, a graph or a prototype, whichever makes it easiest to understand. The page grows with you across sessions: start with an agenda, talk through a problem, go research it, come back with sources, change your mind.

It's "Notion built for flow." Notion is great for organizing finished thoughts. Phlo is for the messy part before that, which is getting more important as AI handles more of the finished output.

### Origin

Built to talk through a product sense interview. Notion and Word docs put a wall between you and the interviewer: they're hard to read and hard to follow, and you end up managing a doc instead of having a conversation. In Phlo you talk *with* the interviewer, pause when you need to, and the framing builds itself on the page next to you.

### Who it's for (right now)

| | The framer | The explorer |
|---|---|---|
| Situation | Talking through a problem while someone watches: interviews, meetings, client calls | Working through a messy idea alone, over many sessions: a business plan, a product concept |
| Needs | The page keeps up and looks clean to the other person. Phlo never adds words they didn't say | Get thoughts out fast, don't lose tangents, come back without friction |
| Phlo's role | **Scribe** | **Partner** |

Both hate three things: **managing the tool while thinking, the blank page, and a messy result.** Every design choice should remove one of those.

### Not every session ends in something polished

- A **framing session** ends with the framing itself: a clean page you can share right away.
- An **explore session** ends with a messy-but-organized draft you'll come back to. The AI figures out where new thoughts belong next time, so you don't need a "pick up here" step.
- **Publish** is optional. When it happens, a draft becomes a clean doc, a one-pager, a slide deck or a prototype, whichever fits the content.

---

## 2. Architecture

**You think in Drafts, and you show off in Published.**

- **Drafts** are the workshop: live, messy, spoken. One draft lives across many sessions. They get the quiet visual frame.
- **Published** is the shelf of finished pieces. They get the expressive, playful treatment. Each one gets its own cover palette from fixed pairings (vermilion + cobalt, teal + saffron, cobalt + saffron, teal + vermilion), so every cover differs but the shelf reads as one press. A prototype's cover is its live first screen.
- **Publish** is the step between them. It stays quiet until a draft has substance.

### Phlo's two roles

- **Partner** (the default when you're alone) helps you think. It catches tangents as tabs in the margin, asks one question when you stall, and suggests structure.
- **Scribe** (when someone's watching) only organizes your words: headings, order, lists, cleaned-up speech. It adds no ideas, prompts or research. Every line traces back to the transcript. It turns on **Room view**: large type, no chrome, and a `SCRIBE · YOUR WORDS ONLY` label so the room knows the rule.
- The principle: **Phlo never puts words in your mouth when someone's watching.** This trust is part of the brand.

### Inside a draft (agreed Nov 19; full spec in `EXPRESSION_SPEC.md`)

- **Page and Board** are two views of the same draft. The Page is for narrowing down: a clear column, in order. The Board is for spreading out: the same blocks as cards on a free surface, clustered by theme. Flip with "spread it out" or ⌘B. Phlo may offer the Board but never flips on its own.
- **The margin is the only place Phlo speaks.** One card component for asks, suggestions, work in progress, findings and tangents, with strict rules: only at pauses, one per section, three on screen.
- **Verbs, not agents.** Look into, Push back, Make, Follow up. Say them, right-click, or type `@`. Each runs on the model you've connected. Results arrive in the margin; nothing writes to the page until you pull it in.
- **References** hold everything from outside: what you paste, what Phlo finds, what your connections bring.
- **Settle keeps the whole draft in shape**, not just new words: at pauses it merges, reorders and reshapes, then reports it in one chip with Undo. The goal is zero fixes. Settle can be turned off to just type.
- **Three ways in, always equal:** say it, right-click it, or type `/`.

### Flow rules

1. **One key to talk.** Hold space, release to stop. No control bar.
2. **Never ask the user to organize.** No naming drafts, no filing, no Clean button.
3. **Typing gets the same magic.** Free-written text stays wet (light gray) until you finish the paragraph or move away, then settles. No button. Text never moves under the caret.
4. **Changing your mind is first-class.** "Scratch that" folds the old version into a faint trail. Nothing is deleted.
5. **Spotlight** the section you're working in and dim the rest.
6. **The sidebar starts collapsed.** It's there when you need it.
7. **References** (pasted links and screenshots) are things to think against, not embeds. Phlo reads them so you can refer to them by voice.

---

## 3. The brand

### The thesis: quiet frame, playful symbols

The reference is modern Japanese graphic design: a page from a lettering and emblem book. White paper, a tiny gray "01," a lot of air, and then one mark with real personality. The frame is restrained, and the symbols carry the play. **Playful, modern, focused, and wildly expansive when it's creative.**

Japanese design is at its best in symbols (crests, emblems, seals), so Phlo's distinctiveness lives in its **symbol**, not in decorated type.

### Principles

1. **Quiet until it isn't.** While you think, it's paper and ink. Color and play arrive once ideas connect, or on Published pieces.
2. **Color is earned.** A blank draft is monochrome. A rich session is vivid.
3. **One twist per mark.** Each playful element gets exactly one move.
4. **Flat, like print.** Solid color, hairline rules, paper. No gradients, glass or drop shadows.
5. **Ma.** Empty space is a material. When in doubt, add space.
6. **Show the idea, not the information.** Fewer words everywhere.

### The symbol: the split bubble

A speech bubble split in two:
- On the left, a **vermilion half-circle**: your voice, the raw idea.
- A small **gap**: the moment Phlo organizes you.
- On the right, an **ink square with a tail**: the page, the structure.

Everyone reads it as "talk" without being taught. The split says the rest: round becomes square, voice becomes page.

- **Geometry:** half-circle radius 50, gap 7, square 60×100, tail a 30-unit triangle off the square's bottom-right. Viewbox 117×130.
- **Rules:** never round the square, close the gap, flip it, outline it, or color it in idea colors. Minimum size 16px.
- **The symbol family** uses the same grammar (round = voice, square = page, tail = speech, gap = transformation). **Talk** is a full vermilion dot. **Partner** is two round halves. **Scribe** is the bubble with three lines. **Settle** is the bubble with a wet-gray voice half. **Publish** is an ink square with a vermilion seal. New symbols use only these four parts.
- **Wordmark:** lowercase **phlo** in Geist Medium, −3% tracking, deliberately quiet. In the lockup, the wordmark's x-height is 46% of the symbol's height and its baseline sits on the square's bottom edge.
- **App icon:** the dark-theme symbol on a sumi tile.

### Color

Two themes: **Paper** (light) and **Sumi** (dark, the hero for demos and Room view).

| Token | Paper | Sumi | Use |
|---|---|---|---|
| paper | #f7f7f4 | #121316 | The page. Stays almost empty |
| paper-raised | #ffffff | #1b1c20 | Cards, references, inline diagrams |
| hairline | #e4e4df | #2a2b30 | Rules, dividers. Borders, not shadows |
| ink | #16171a | #f2f1ec | Settled text |
| ink-muted | #66665f | #9d9c95 | Labels, metadata |
| ink-wet | #b9b9b2 | #55554f | Unsettled text, spoken or typed. Transient only |
| vermilion | #e5432a | #ff5b3d | **The voice. Only one vermilion thing on screen** |
| cobalt / teal / saffron | #2848d8 / #13a38a / #f2b01e | #6683ff / #33c7ac / #ffc340 | Idea colors: themes only. Theme discs, text tagged with a theme (2px underline), Board clusters, chart series of a theme, Published covers. Max 3 per draft |
| tab | #5cc9e9 | #6fd4ef | "Phlo touched this": margin cards, tangents, pulled-out ideas, things Phlo added to References, pins |

### Type

- **Geist** for everything you read, and **Geist Mono** for labels. Both are free (`npm i geist`).
- **Titles are big and regular weight, never bold.** Title 40/44 at 400, −0.025em. Display 64/64 at 400, −0.035em.
- Heading 20/28 at 500. Body 16/26. Small 14/20.
- **Mono labels** do the modern work: 11/16 at 500, uppercase, +0.08em ("01 · MISSION", "SCRIBE · YOUR WORDS ONLY").
- **Emphasis in body:** italic, underline, and bold at 600. A Key point line is 500. Titles and headings never go bold.

### Marks

Meaning on the page is carried by **shape, not color**: 20 ink marks built only from the symbol family's four parts (round, square, tail, gap), in `brand/marks/`. Five of them head the thinking blocks (Question, Idea, Decision, Action, Key point). They label a category and are never decoration. Emoji are allowed inline, with our marks offered first.

### Space

Writing column of 680px max. 48px between sections. 72px side margins on desktop. 120px around covers. 8pt rhythm.

### Motion: ink settling (the signature)

- Live words appear in `ink-wet`.
- When placed, they settle: color to `ink` in 280ms, then a glide into place in 420ms, with `cubic-bezier(0.2, 0, 0, 1)`.
- No bounce, no spring. It moves like water finding its level.
- The voice dot breathes between scale 1 and 1.25 with input level.
- With reduced motion: the color still changes, and the glide is skipped.

### Voice and copy

Short, warm, plainspoken. Verbs over nouns. One-word UI where possible: **Start talking. Publish. Scribe.**

| Use | Never say |
|---|---|
| Draft, Published, Publish | Document, deliverable, workspace |
| Partner, Scribe, Room view | Interview mode, assistant, AI off |
| References, Tab | Context, attachments |
| Settle (a behavior, not a button) | Clean, generate, polish |
| Page, Board | Whiteboard mode, canvas, doc view |
| Look into, Push back, Make, Follow up | Agent, bot, run, task |
| Play | Replay, presentation, video |

---

## 4. Decisions log (what we tried and why we moved on)

| We tried | Why we moved on | Where we landed |
|---|---|---|
| The first build's look: warm cream, terracotta, bold editorial titles | It reads as a Claude reskin, and vintage/editorial is the opposite of the target | Cool paper, ink, one vermilion. Regular-weight titles |
| "Futuristic 2070" as cold sci-fi minimalism | Too austere. The target is playful and expansive, not chrome | The Japanese lettering/emblem reference: quiet frame, playful marks |
| Striped and multi-color drawn wordmarks (Wave, Dot, Seal, Pop) | Bubbly, not precise. Red-blue stripes read as Pepsi, and the multi-color one as Google | A quiet Geist wordmark, with the personality moved into a symbol |
| A letter-p symbol | A speech-bubble p is too close to Parler, dot + stem to Patreon, a P in a square reads as parking, and split circles read as "S" | The split bubble: understood without teaching, and it carries the meaning |
| Out of ~30 symbol studies | Scored on learnability, ownability, 16px legibility, Japanese restraint, and whether it extends into a family | The split bubble won on all five |
| A "Clean" button, then a "Settle" button and screen | A button makes organizing a chore you trigger | Settling is automatic on paragraph end or caret leave. ⌘↵ shortcut only |
| "Interview mode" | Names the situation, not what Phlo does | Partner / Scribe roles, plus Room view |
| A "Pick up here" ending | The model can work out where new thoughts belong | Dropped |
| "Flows" as the name for drafts | Muddies the brand, and Wispr Flow already owns "flow" in voice-to-text | Drafts |
| Present button, four-control talk pill | Too much UI for a hands-free product | Room view and a single voice dot |
| Colored callouts (green questions, yellow ideas) | Color stops meaning anything, and the page turns into a sticky-note wall | Ink marks from the symbol family's four parts; color stays for themes |
| Post-its on the page | A third way to say what Marks and margin cards already say | Cards on the Board, where unplaced thoughts belong |
| A separate whiteboard, then a Map view | Two products, or a view that only shows | Board: the same blocks, spread out, clustered and connected, and folded back |
| A "Clean" mode for typing | A mode you manage, and a banned word | Settle is on by default and tidies the whole draft at pauses; it can be turned off |
| Named agents (`@critic`, `@analyst`) | A voice-first user shouldn't learn a roster | Four verbs: Look into, Push back, Make, Follow up |
| Free text colors | Turns the page into a highlighter mess | Coloring text tags it with one of the draft's three themes |
| Risk as a Mark | Risks are topics, not moves in your thinking | A section or a Compare column; Action joins the Marks |
| Generated illustrations | Rarely clearer than a precise mark, and never in the house style | Marks; concept sketches later, in ink only, inside Make |

---

## 5. Open questions (decide while building)

1. **The space key conflict.** Hold space only triggers talk when the caret isn't in text. Fall back to ⌥Space if it feels wrong.
2. **Auto-title timing.** Around 30 seconds of content, or the first settled section?
3. **The Publish threshold.** The spec says 3 sections with content. Tune it by feel.
4. **The final symbol pass.** The geometry is locked for the build. A professional identity designer can refine the optics later.

## 6. What comes after this pass

Now specified in `EXPRESSION_SPEC.md`: Page and Board, the margin, the four verbs, the seven shape families, marks, theme colors, Connect, right-click parity, Publish and Play.

Still after that: Published covers and the shelf, Publish to deck, sound (a soft tick when you start talking and a quiet settle), multiplayer Room view, and mobile.
