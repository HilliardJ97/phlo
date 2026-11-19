# Paste into the repo's CLAUDE.md

## Phlo design rules

- Design source of truth: `docs/design/phlo-handoff/` (DESIGN_DIRECTION.md, CORE_SCREEN_SPEC.md, tokens/).
- **Product:** Phlo turns thinking out loud into a clear page. Users should never manage the tool while thinking.
- **Styling:** use only the CSS variables from `tokens/tokens.css`. No hard-coded hex values, font sizes or easing curves in components.
- **Color:** paper and ink do 95% of the work. **Vermilion is the voice. Only one vermilion element on screen at a time.** Idea colors (cobalt, teal, saffron) appear only once themes exist, max 3 per draft. `tab` means "Phlo touched this."
- **Type:** Geist for text, Geist Mono for uppercase labels. Titles are large and weight 400, never bold.
- **Flat:** no shadows on cards, no gradients, no glass. Hairline borders only.
- **Motion:** unsettled text is `--ink-wet`. Settling is a color change over `--dur-settle-color`, then movement over `--dur-settle-move` with `--ease-settle`. No bounce or spring. Respect `prefers-reduced-motion`.
- **Never move text under the caret.**
- **Vocabulary:** Draft, Published, Publish, Partner, Scribe, Room view, References, Tab, Page, Board, Look into, Push back, Make, Follow up, Play. Never "document," "deliverable," "workspace," "clean," "assistant," "agent."
- **Phlo speaks only in the margin**, only at pauses, one card per section, three on screen. Meaning is carried by ink marks (`brand/marks/`), not colors; idea colors mark themes only.
- **Copy:** short, warm, verbs over nouns. One-word UI where possible.
- **Scribe mode:** organizing only. Never add content the user didn't say.
- **Logo:** the split-bubble SVGs in `brand/`. Never redraw, recolor or round the square.
