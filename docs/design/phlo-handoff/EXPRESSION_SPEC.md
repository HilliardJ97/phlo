# Phlo: Expression Spec

The design target for everything beyond the core screens: how a draft is shaped, how Phlo speaks, and how you spread out. Agreed November 19, 2026. Read `DESIGN_DIRECTION.md` first; this builds on it and never overrides the brand rules.

---

## 1. The model: six things to learn

If someone understands these six, they understand Phlo. Everything else is discovered by using it.

1. **Draft:** where you think, across many sessions.
2. **Page and Board:** two views of the same draft. Page for narrowing down, Board for spreading out.
3. **Phlo:** shapes as you go (Settle), as **Partner** (thinks with you) or **Scribe** (your words only, Room view).
4. **The margin:** the only place Phlo speaks.
5. **References:** everything from outside: what you paste, what Phlo finds, what your connections bring.
6. **Publish:** a draft becomes a finished piece you can send or play.

**Three ways in, always equal:** say it, right-click it, or type `/`. Anything you can say, you can click, and the other way round. There is no toolbar.

## 2. Settle, all the time

- **Settle is on by default.** Phlo places your words and, at pauses, tidies the whole draft: merges duplicate sections, reorders into the story you're telling, promotes a recurring idea to a heading, splits a long section, turns a comparable list into a table.
- **Whole-draft changes happen only at pauses**, never in the section you're in, and never to anything on screen while you're mid-sentence. They glide in with the settle motion.
- **One chip reports them:** `PHLO REORGANIZED 3 · SEE · UNDO`, mono label, bottom of the viewport above the dot, fades after 6 s. `SEE` briefly outlines what moved in `tab`.
- **Settle off** (··· → Settle, or ⌥⌘S): just type. Words stay where you put them; Phlo still offers in the margin. Scribe is always on.
- **Quality target: zero fixes.** Every undo, manual move or retype after Phlo touched something counts as a fix. The goal per session is 0.

## 3. The margin: how Phlo speaks

One component for everything Phlo has for you. It sits in the right margin, **aligned to the line it's about**.

**Anatomy**
- Width 240px, `paper-raised`, 1px `hairline` border, `radius-sm`, a 3px `tab` edge on the left. No shadow.
- Label: Geist Mono 11/16, 500, uppercase, +0.08em, `ink-muted`.
- Body: 14/20, `ink`, one line of 14 words or fewer, wraps to 3 lines at most.
- Choices: up to two, as underlined text in `ink`, separated by `·`. Never buttons, never vermilion.
- Padding `space-2` / `space-3`.

**Kinds**

| Label | When | Leaves |
|---|---|---|
| `PHLO ASKS` | Ambiguity that changes the result, a stall, or a contradiction ("Earlier you said 40%") | You answer, or 2 min after you move on |
| `PHLO SUGGESTS` | A better shape ("Reads like a cycle. Flow?") or "Spread these out?" | Accepted, dismissed, or its section changes |
| `LOOKING INTO · PRICING` | Work in progress | Turns into Found |
| `FOUND · 3 SOURCES` | Results of Look into, Push back, Make | Pulled in or dismissed. Never times out |
| `TANGENT · LATER` | "Oh also…" | Pulled in or moved to Later |

**Rules**
- **Phlo speaks only at pauses** (≥ 1.5 s). Unprompted cards (Ask, Suggest): at most **one every ~3 minutes** in Partner. Anything you asked for: no limit.
- **One card per section; three on screen at most.** More collapse into a `+N` chip on the margin edge. Click to fan out.
- **Answer by voice** ("the second one", "yes, as a cycle"), by clicking, or ignore it and keep going.
- **Dismiss:** Esc while hovering, or the `×` that appears on hover. Fade out over `--dur-settle-color`.
- **Earlier from Phlo:** everything that left without being used rests in the sidebar under that heading, newest first.
- **Scribe:** no cards on the room's screen. They wait privately in the sidebar.
- **Motion:** cards arrive in `ink-wet` and settle to `ink` like words do. No slide-ins.

## 4. Verbs: getting work done

Phlo's helpers are **verbs, not names**. Say them, right-click a selection, or type `@` then the verb.

| Verb | Does | Comes back as |
|---|---|---|
| **Look into** | Research on the web and your References | `FOUND`, with sources |
| **Push back** | Pressure-tests the section: weak assumptions, the other side | `PHLO ASKS` cards |
| **Make** | Builds a wireframe or prototype from the draft | A Make block |
| **Follow up** | Uses your connections: drafts the invite, the email, the task | A `FOUND` card with the draft; **always asks before anything is sent** |

- Each runs on the model you've connected. "Look into this **with Claude**" picks a different one for that job.
- Work shows as `LOOKING INTO` in the margin. Nothing writes to the page until you pull it in.
- Anything Phlo finds or makes is added to **References** with a `tab` edge.

## 5. Shapes: seven families

Phlo picks the variant from what you said or selected; say a different one anytime ("as a pie"). Switching never loses a word or number.

| Family | Variants | Notes |
|---|---|---|
| **Text** | Heading, subheading (folds), text, bullets, numbered, checklist, quote, code | Italic, bold, underline, strike, link with the usual shortcuts. Bold in body is Geist 600; titles stay 400 |
| **Marks** | Question, Idea, Decision, Action, Key point | See §6 |
| **Compare** | Table, cards, pillars, pros and cons, ranking | Pillars: 2–4 equal cards with a mark on top |
| **Flow** | Steps, linear, branching, cycle, timeline | Hairline arrows, `ink` nodes |
| **Numbers** | Big number, live estimate, bar, line, pie | Charts only with real values; pie only for parts of a whole (≤ 5). Series use idea colors only if they're themes, otherwise ink and `ink-muted` |
| **Make** | Wireframe, prototype | Talk while looking: notes become numbered pins (`tab` discs, 18px, Geist Mono numerals). "Update it" runs the next pass; pins fold into the trail |
| **Media** | Photo, find a photo, video, Figma, PDF | Credits under media in Geist Mono `ink-muted` |

**Live estimate:** inputs as inline chips (`10M families` × `5%` × `$40`), the result in Title size (40/44, 400). Change an input by voice or click; the old value goes to the trail.

**Big number:** Display size (64/64, 400), one line under it in body, `ink-muted`.

## 6. Marks: meaning by shape, not color

- **Five Marks:** Question, Idea, Decision, Action, Key point. Each is a block with its mark in the left gutter, 16px, `ink`.
  - **Action** takes an owner and a date when you say them, and collects in **Next** at the end of the draft.
  - **Key point** sets its line in Geist 500 and becomes the summary at the top of a Published piece.
  - Risks are topics, not moves in your thinking: they're a section or a Compare column.
- **The icon set:** 20 marks built only from the symbol family's four parts (round, square, tail, gap). Ink only, both themes. Files: `brand/marks/` (`marks.svg` sprite, `preview.html`, `marks.png`).
- **Where marks appear:** Marks, pillar heads, Flow nodes when they help, Board clusters, margin cards. Never as decoration.
- **Emoji:** allowed inline. Typing `:` opens our marks first, then emoji.

## 7. Color: what earns it

Unchanged at heart (paper and ink do 95%; vermilion is the voice), with two clarifications:

- **Coloring text means tagging a theme.** Select text → right-click → a theme color. Each draft has at most three themes (cobalt, teal, saffron), each with a name. The highlight is a 2px underline in the theme color, not a background fill. The heading disc, the Board cluster and the chart series all use the same color for the same theme.
- **No free color.** There's no palette of text colors, and vermilion is never a highlight.

## 8. Connect

A relation between two blocks, with an optional note on it.

- **Make one:** say "connect this to pricing", drag from a block's grip onto another, or right-click → Connect.
- **Both on screen:** a 1px `ink-muted` curve in the **left gutter**, like a bracket, joining the two blocks. Lines never cross text.
- **The note** sits at the curve's midpoint as a Geist Mono label (`BLOCKS LAUNCH`) on `paper`.
- **Far apart:** each end shows a chip in the gutter: `↗ PRICING · BLOCKS LAUNCH`. Click to jump.
- **Hover** one end and the other end's block gets a `tab` outline.
- On the Board, Connects are drawn as straight hairlines between cards, with the same labels.

## 9. Board: spreading out

The Page and the Board are two views of the same blocks. Nothing is copied.

- **Get there:** say "spread it out", press ⌘B, or pinch out. Phlo may *offer* it (`PHLO SUGGESTS · Spread these out?`) when you're firing short, unrelated ideas. **Phlo never flips views on its own.**
- **The surface:** `paper`, a quiet 24px dot grid in `hairline`. Sections become frames (mono label on top); blocks become cards (`paper-raised`, hairline border, 200px wide, `radius-sm`).
- **On the Board you can:** talk and the card lands where the pointer is; click anywhere to type a card; drag, cluster and Connect; say "group these".
- **Clusters:** Phlo groups cards by theme, and each cluster gets its theme color as a 10px disc on its label. This is where idea colors are most at home.
- **Fold back:** say "fold it back", press ⌘B, or pinch in. Clusters become sections, top-left to bottom-right becomes reading order, everything settles with the usual motion.
- **The flip:** cards glide from their page position to their board position over `--dur-settle-move` with `--ease-settle`. With reduced motion, crossfade.
- Scribe works on the Board too; Room view shows the Board at 1.25× scale.

## 10. Right-click and selection

- **Right-click a block:** Turn into (the seven families), Mark as, Connect, Look into, Push back, Theme, Move to…, Copy link.
- **Select words, then right-click:** the same menu, acting on the selection: "Turn into → Chart" builds a chart from the selected numbers; "→ Make" wireframes the selected requirements.
- The menu is `paper-raised`, hairline border, `radius-md`, groups separated by hairlines, group labels in Geist Mono. Keyboard: arrows and Enter; type to filter.

## 11. Publish and Play

- **Publish** turns solid once the draft has 3 sections with content. Key points become the summary at the top.
- **Export** to one HTML file or a PDF. A hosted link follows.
- **Play:** a Published piece can play back. The page builds itself again in sync with your voice, with captions in Geist Mono at the bottom, at 1× or 2×. Voice is kept on your computer only, and you can turn keeping it off.

## 12. Acceptance checks (in addition to the Core Screen Spec)

1. No margin card appears while you're mid-sentence.
2. Never more than three cards on screen.
3. Page → Board → Page returns every block, with nothing lost or duplicated.
4. Switching a shape (bar to line, table to pillars) keeps every word and number.
5. Everything in the `/` menu is also in right-click, and can be said.
6. A whole-draft reorganization never moves the section the caret or voice is in.
7. Only one vermilion element on screen in every view, including the Board.
8. Every mark reads at 16px in Paper and Sumi.
