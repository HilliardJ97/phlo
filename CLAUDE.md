# Phlo: rules for working in this repo

Read `docs/design/phlo-handoff/README.md` before changing anything visual. `docs/design/phlo-handoff/` is the design source of truth; `docs/design/phlo-system/` is the earlier design-system export, kept for reference.

## Design rules
- Quiet frame, playful marks. Paper and ink do 95% of the work. Flat: hairlines, no shadows, gradients or glass.
- **Vermilion is the voice.** Only the live voice dot (and the brand symbol) uses it. Never buttons, links or highlights.
- Idea colors (cobalt, teal, saffron) are earned: theme discs and Published covers only, max 3 per draft.
- `tab` means "Phlo touched this". `ink-wet` is transient only, for unsettled words.
- Geist for reading, Geist Mono for uppercase labels. Titles are large and regular weight, never bold.
- Motion: settle = color to ink 280ms, then glide 420ms, `cubic-bezier(0.2, 0, 0, 1)`. No bounce. Respect reduced motion.
- Copy: short, verbs. Say Draft, Published, Publish, Partner, Scribe, Room view, References, Tab, Settle.
  Never say document, deliverable, workspace, assistant, generate, clean.
- No Clean/Settle button, no Present button, no control bar. Settling is automatic; ⌘↵ is the only shortcut.
- Don't bring back cream, terracotta, or bold editorial titles.

## Engineering rules
- Every page change goes through `DocEngine.commit` as a transaction. Model output is a plan addressed by block id, compiled into rev-guarded ops. Never let a model write HTML or mutate the page directly.
- Never delete user words: park them, or fold them into a trail.
- Text never moves under the caret.
- Scribe's guarantee is enforced in code (`enforceScribe`), not just in the prompt.
- Keys live in the host only. The renderer calls allow-listed `HOST_METHODS`.
- Run `npm test` and `npx tsc --noEmit -p .` before committing.

## Phlo design rules

- Design source of truth: `docs/design/phlo-handoff/` (DESIGN_DIRECTION.md, CORE_SCREEN_SPEC.md, tokens/).
- **Product:** Phlo turns thinking out loud into a clear page. Users should never manage the tool while thinking.
- **Styling:** use only the CSS variables from `tokens/tokens.css`. No hard-coded hex values, font sizes or easing curves in components.
- **Color:** paper and ink do 95% of the work. **Vermilion is the voice. Only one vermilion element on screen at a time.** Idea colors (cobalt, teal, saffron) appear only once themes exist, max 3 per draft. `tab` means "Phlo touched this."
- **Type:** Geist for text, Geist Mono for uppercase labels. Titles are large and weight 400, never bold.
- **Flat:** no shadows on cards, no gradients, no glass. Hairline borders only.
- **Motion:** unsettled text is `--ink-wet`. Settling is a color change over `--dur-settle-color`, then movement over `--dur-settle-move` with `--ease-settle`. No bounce or spring. Respect `prefers-reduced-motion`.
- **Never move text under the caret.**
- **Vocabulary:** Draft, Published, Publish, Partner, Scribe, Room view, References, Tab. Never "document," "deliverable," "workspace," "clean," "assistant."
- **Copy:** short, warm, verbs over nouns. One-word UI where possible.
- **Scribe mode:** organizing only. Never add content the user didn't say.
- **Logo:** the split-bubble SVGs in `brand/`. Never redraw, recolor or round the square.
