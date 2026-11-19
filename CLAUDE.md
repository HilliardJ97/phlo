# Phlo: rules for working in this repo

Read `docs/design/phlo-system/README.md` before changing anything visual.

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
