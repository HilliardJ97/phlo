# Phlo

**Think out loud. Watch it take shape.**

Phlo is a place to think out loud and build a document as your ideas take shape. You talk, and the page organizes itself. An idea can become a paragraph, a table, a flowchart or a prototype, whichever makes it easiest to understand. This system is the visual and verbal foundation. Everything we build sits on top of it.

## The idea in one line

**A quiet frame with playful marks.** The reference is a page from an East Asian lettering book: white paper, a tiny gray "01," lots of air, and then one word set in stripes, dots or a rainbow fill. The frame is restrained. The marks have the personality.

## Principles

1. **Quiet until it isn't.** While you're talking, the screen is paper and ink and almost nothing else. Color and play show up once ideas start connecting.
2. **Color is earned.** A blank doc is monochrome. A rich session is vivid. Color comes from your ideas, never from the UI's decoration.
3. **One twist per mark.** Every playful element gets exactly one move: stripes, a dot, a flag. Never two at once.
4. **Flat, like print.** Solid colors, hairline rules and paper. No gradients, no glass, no drop shadows.
5. **Ma.** Empty space is a material. When in doubt, add space before you add anything else.
6. **Show the idea, not the information.** Fewer words everywhere: in the UI, in empty states, in what Phlo writes.

## Color

Two themes: **Paper** (light) and **Sumi** (dark). Sumi is the hero for demos and covers.

- **Neutrals do 95% of the work.** `paper`, `paper-raised`, `hairline`, `ink` and `ink-muted` make up the whole writing surface.
- **`vermilion` is the voice.** Only one vermilion thing is on screen at a time: the live mic dot. If vermilion appears anywhere else, the voice loses its meaning.
- **`cobalt`, `teal` and `saffron` are idea colors.** When Phlo detects themes, each theme gets one of these as a small round mark beside its heading and in any chart built from it. Maximum three on a page.
- **`tab` means Phlo touched this.** Callouts, pulled-out key ideas and agent results get a sticky-tab flag in `tab`.
- **`ink-wet` is speech in motion.** Live words appear in `ink-wet` and settle into `ink`. It's the only token allowed below 4.5:1, because it never stays on screen.

| Do | Don't |
| --- | --- |
| A single vermilion dot on an empty page | Vermilion buttons, links or highlights |
| Ink text on `saffron`, `tab`, `teal` | White text on saffron or tab |
| Up to three idea colors per doc | Rainbow tag clouds |

## Type

**Geist** for the page, **Geist Mono** for labels. Both are free (Google Fonts), which fits the MVP. Planned upgrade: ABC Diatype + Diatype Mono.

- **Titles are regular weight, set large.** `title` is 40px at 400. Size and space carry the hierarchy, not bold.
- **Mono labels make it modern.** `label` is uppercase 11px with +0.08em letter-spacing, like the "01" running header on a book page. Use them for metadata, section numbers and states.
- **Body is calm.** `body` is 16/26 and nothing else competes with it.
- The playful lettering lives in **marks** (wordmark, doc covers), never in body text.

## Space

8pt rhythm, with generous steps at the top: `space-5` (48px) between sections, `space-6` (72px) side margins, `space-7` (120px) above titles. The writing column maxes out around 680px. In Talk mode, every piece of UI chrome hides except the voice dot.

## Motion: ink settling

Motion is the signature.

- **Live speech** fades in at `ink-wet`.
- **When Phlo organizes it**, the text settles to `ink` (280ms) and glides into place under its heading (420ms, `cubic-bezier(0.2, 0, 0, 1)`).
- **No bounce, no spring.** It moves like water finding its level.
- **The voice dot breathes** with your input level: scale 1 to 1.25, never faster than the voice itself.
- **Respect reduced motion:** with `prefers-reduced-motion`, skip the glide and just swap colors.

## Marks

**The symbol does the talking. The wordmark stays quiet.** Like a Japanese crest, the symbol is what people learn to recognize, and the name sits beside it in plain type.

### The symbol: the split bubble

A speech bubble split in two. On the left is a **vermilion half-circle**: your voice, the raw idea. A small gap separates it from an **ink square with a tail**: the page, the structure. The gap is the moment Phlo organizes you. Everyone reads it as "talk" on sight, and the split says the rest: round becomes square, voice becomes page.

- **Construction:** half-circle radius 50, gap 7, square 60 × 100, tail a 30-unit right triangle off the square's bottom-right corner. Viewbox 117 × 130. Never round the square's corners, close the gap, or move the tail.
- **Colors:** vermilion + ink on Paper. Vermilion + `#f2f1ec` on Sumi. On a vermilion ground, use paper + ink. It never appears in idea colors.
- **Minimum size:** 16px tall. Below 24px, the gap is allowed to disappear optically.
- **App icon:** the Sumi-theme symbol on a sumi tile, scaled to 82%.

### The wordmark

Lowercase **phlo** in Geist Medium, tracked −3%, outlined in the asset files. In the lockup, the wordmark's x-height is 46% of the symbol's height, its baseline sits on the square's bottom edge, and the gap between symbol and word is 28 units. The wordmark never appears in color or with effects.

### The symbol family

The same grammar (round = voice, square = page, tail = speech, gap = transformation) draws the product's own symbols:

| Symbol | Construction | Means |
| --- | --- | --- |
| **Talk** | A full vermilion circle | The voice dot: mic and recording state |
| **Partner** | Vermilion half + ink half, both round | Two minds thinking together |
| **Scribe** | The split bubble with three paper lines in the square | Writes only your words |
| **Settle** | The split bubble with the round half in `ink-wet` | Wet ink settling into the page |
| **Publish** | An ink square stamped with a vermilion seal | A finished piece |

New symbols use only these four parts. If an idea needs a fifth shape, it doesn't get a symbol.

### Other marks

- **Sticky tab:** a flat `tab` flag with `radius-sm` corners that sticks out past the column edge. It marks callouts, tangents and agent results.
- **Idea marks:** small solid discs in `cobalt`, `teal` and `saffron` that label themes.

Earlier wordmark explorations (Wave, Dot, Seal, Pop) are kept in the Explorations asset group for reference only.

## Architecture

Phlo has two places, and the brand rule follows them: **you think in Drafts, and you show off in Published.**

- **Drafts are the workshop.** They're live, messy and spoken. They get the quiet frame: paper, ink, ink-wet settling. A draft lives across many sessions, and Phlo works out where new thoughts belong without being told.
- **Published is the shelf.** Finished docs, decks, one-pagers and prototypes. They get the playful marks. Each published piece gets its own cover palette, chosen from fixed riso-style pairings (vermilion + cobalt, teal + saffron, cobalt + saffron, teal + vermilion), so every cover is different and the shelf still reads as one press. A prototype's cover is its live first screen.
- **Publish** is the moment between them. It only appears once a draft has substance.

### Phlo's two roles

- **Partner** is the default when you're alone. Phlo helps you think: it catches tangents as tabs, asks one question when you stall, and suggests structure.
- **Scribe** is for when someone's watching (interviews, meetings, client calls). Phlo only organizes your words: headings, order, lists and cleaned-up speech. It adds no ideas, prompts or research. The corner label reads `SCRIBE · YOUR WORDS ONLY`, and every line traces back to the transcript. Scribe turns on **Room view** by default.
- **Room view** is the display for an audience: larger type, zero chrome, and the current section spotlighted.
- The principle behind it: **Phlo never puts words in your mouth when someone's watching.**

### Flow rules

- **One key to talk.** Hold space to talk, release to stop. Tap to toggle. The voice dot shows state, and there's no control bar.
- **Never ask the user to organize.** No naming, no filing. Speech settles on its own.
- **Typing gets the same magic, with no button.** Free-written text stays in `ink-wet` while it's still yours to shape. It settles into organized ink when you finish a paragraph (Enter twice), when you move the caret away, or on ⌘↵. Text never moves while the caret is in it.
- **The sidebar starts collapsed** and opens from the edge when needed.
- **Changing your mind is first-class.** "Scratch that" folds the old version into a faint trail. Nothing is deleted.
- **Spotlight the current section;** the rest dims slightly.

## Vocabulary

| Word | Means |
| --- | --- |
| Draft | A living page you talk into, across many sessions |
| Session | One stretch of talking |
| Partner / Scribe | Phlo's two roles: thinking with you, or writing only what you say |
| Room view | Large, chrome-free display for an audience |
| References | Links, images and screenshots you think against |
| Tab | Anything Phlo pinned to the margin |
| Settle | What happens when wet text (spoken or typed) becomes organized ink. A behavior, not a button |
| Publish | Turn a draft into a doc, deck, one-pager or prototype |
| Published | The shelf of finished pieces |

Never say: document, deliverable, workspace, AI assistant, generate, clean.

## Voice

Short, warm, plainspoken. Verbs over nouns. One-word UI copy where possible: **Start talking. Publish. Scribe.** Empty state: **"Start talking."** If a label needs a second sentence, it's the wrong label.

## Not this

Warm cream and terracotta (that's another AI's look). A Present button, a button named Clean, or a four-control talk bar. Heavy, tightly tracked editorial titles. Vintage or retro textures. Sci-fi chrome, glow or glass. Blue-purple gradients. Emoji.
