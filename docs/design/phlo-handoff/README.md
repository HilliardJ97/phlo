# Phlo handoff: start here

Everything Claude Code needs to bring the Phlo app in line with the new design direction.

## What's in here

| File | What it is | Read it when |
|---|---|---|
| `DESIGN_DIRECTION.md` | The full context: product, users, architecture, brand, decisions log | First, always |
| `CORE_SCREEN_SPEC.md` | The build target: today vs. target, behavior per screen, acceptance checks, build order | Before writing code |
| `BRAND_BOOK.md` | The design system's brand book (color, type, motion, marks, vocabulary) | For any visual detail |
| `tokens/tokens.json` | Source tokens: colors in both themes, type, spacing, radius | To map into the app's styling |
| `tokens/tokens.css` | Ready-to-use CSS variables, `[data-theme="sumi"]` for dark, `.type-*` classes, motion variables | Drop into the app |
| `brand/` | The symbol, lockup, wordmark (light and dark), app icon, symbol family SVGs, and an overview PNG | Replacing the logo and icons |
| `screens/*.dc.html` | Reference markup for the 4 designed screens (Start, Talking, Room view, Sidebar open). Read them for exact spacing, sizes and copy. They're design files, not app code | Building each screen |
| `CLAUDE_MD_SNIPPET.md` | Design rules to paste into the repo's CLAUDE.md so they stick | Once, at the start |

Live versions:
- Design system: https://claude.ai/artifact/DuA7tgCEcGMy3sfRxr1Y2j
- Screens canvas: https://claude.ai/artifact/CeXJsqgNdGzrR5ufCN349D

## Kickoff prompt for Claude Code

Copy this folder into the repo (for example `docs/design/phlo-handoff/`), then paste:

```
Read docs/design/phlo-handoff/README.md, then DESIGN_DIRECTION.md and CORE_SCREEN_SPEC.md in full.

Then:
1. Audit the current app against section 2 of CORE_SCREEN_SPEC.md (the "Today → Change to" table). For each row, tell me where it lives in the code and how big the change is.
2. Propose a plan that follows the spec's build order (section 7). Keep it to small, reviewable steps. Don't rebuild what already works.
3. After I approve, implement step by step. Commit after each step with a clear message.
4. Use tokens/tokens.css as the single source for color, type, spacing and motion. No hard-coded hex values or font sizes in components.
5. Replace the app logo and icons with the SVGs in brand/.
6. Match the reference screens in screens/*.dc.html for spacing, sizes and copy.
7. At the end, go through the acceptance checks in section 5 of the spec, one by one, and report pass or fail with notes.

Rules: follow the vocabulary (Drafts, Published, Partner, Scribe, Room view, References; never "document," "deliverable" or "clean"). Only one vermilion element on screen at a time. Don't build anything listed as out of scope. If something in the spec is ambiguous or conflicts with how the code works, ask before guessing.
```

## Recommended order for tonight

1. Tokens + type + logo swap. It's the fastest visible win and touches everything.
2. Rail/sidebar collapse and renames.
3. Voice dot + hold space, and remove the talk pill.
4. Ink-wet → settle motion. Spend the most time here and tune it by feel with real speech.
5. Then spotlight, tangent tabs, the trail, Scribe/Room view, typing settle, Publish states.
