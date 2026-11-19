# Phlo: Core Screen Spec

The build target for refining Phlo end to end. It's grounded in what exists today and changes only what moves the core experience.

- Design system: https://claude.ai/artifact/DuA7tgCEcGMy3sfRxr1Y2j (tokens, symbol, voice, vocabulary)
- Screens: https://claude.ai/artifact/CeXJsqgNdGzrR5ufCN349D (01 Start, 02 Talking, 03 Room view, 04 Sidebar open)

---

## 1. The job

**Phlo turns thinking out loud into a clear page.** The person talks (or types messily), and the page organizes itself without them ever managing it.

Who we're designing for right now:

1. **The framer.** Talking through a problem with someone watching: a product sense interview, a meeting, a client call. They need the page to keep up with them and look clean to the other person, without Phlo putting words in their mouth.
2. **The explorer.** Working through a messy idea alone over several sessions: a business plan, a product concept. They need to get thoughts out fast, not lose tangents, and pick back up easily.

Both of them hate the same three things: **managing the tool while thinking, a blank page, and a messy result.**

## 2. What exists today, and what changes

| Today | Change to | Why |
| --- | --- | --- |
| "Documents" | **Drafts** | Gives permission to be messy, and pairs with Published |
| "Deliverables" | **Published** | The shelf of finished pieces |
| "Context" (sidebar box) | **References** (per draft, in the sidebar) | Links and screenshots you think against |
| Sidebar always open | **64px rail by default**, full sidebar on demand | Less on screen while you're in flow |
| Talk pill (Mic off / Transcript / Resume talking / ×) | **One voice dot + hold space** | Four controls for one action. The transcript moves to the ··· menu |
| "Talk" button in the top bar | Remove (the dot is the talk control) | One way to talk |
| "Clean" button | **Remove.** Typed text settles on its own (see 3. Typing) | Organizing should never be a chore you trigger |
| "Present" | **Scribe → Room view** | Presenting is really "someone's watching" |
| "Create deliverable" (big terracotta button) | **Publish** (ghost button → solid when the draft has substance) | Don't push people to finish while they're still thinking |
| Terracotta + cream, bold titles | Tokens from the design system: paper/ink, vermilion for voice only, Geist 400 titles | The current look reads like a Claude reskin |
| Section headings in terracotta | Ink headings, mono section labels ("01 · MISSION"), idea-color discs | Color is earned |
| "Your ideas first. Select a passage or type / when you want a hand." | Removed. Start screen says **"Start talking."** | Fewer words |
| P app logo | Split-bubble symbol | New identity |

## 3. Screens and behavior

### 01 Start (empty draft)

- Creating a draft never asks for a name. The title is generated after the first ~30 seconds of content and can be edited by clicking it.
- Display line: **"Start talking."** (64px, Geist 400). Sub-line: "Or just type. Phlo will organize it as you go." (muted)
- Mono hints: `SPACE · HOLD TO TALK` and `⌘V · PASTE A REFERENCE`.
- The voice dot is idle: a hairline ring, 40px, centered 36px from the bottom.
- The caret is in the page, so typing works immediately.

### 02 Talking (Partner, the default)

- **Hold space** to talk and release to stop. **Tap space twice** to lock talking on. Space only triggers talk when the caret isn't in an editable text field, or when Talk mode is locked. *(Decide: a modifier like ⌥Space if conflicts show up in testing.)*
- **Voice dot, listening:** solid vermilion, scaling 1 to 1.25 with input level, plus a soft 10px halo. Label: `LISTENING · RELEASE SPACE TO STOP`.
- **Ink-wet:** live words show immediately in `ink-wet` under the section Phlo thinks they belong to. When they're placed, they settle: 280ms color change to `ink` plus a 420ms glide, `cubic-bezier(0.2,0,0,1)`. If the speech-to-text revises a word, the revision happens while the text is still wet, never after it has settled.
- **Spotlight:** the section being added to is at 100% opacity. Other sections sit at 38%. Everything returns to 100% when talking stops.
- **Tangents:** when the person goes off-topic ("oh also…"), the thought becomes a **tab card** in the right margin (label `TANGENT · LATER`, tab-colored edge) instead of breaking the current section. Clicking one opens it in place.
- **Mind changes:** "scratch that" or "actually, X" replaces the line, and the old version folds into a collapsed mono trail (`EARLIER: $150–$200`). Nothing is deleted.
- **Stall question (Partner only):** after about 8 seconds of silence while Talk mode is locked on, one question appears under the active section in muted text with the mono label `PHLO ASKS`. Only one at a time. It disappears when talking resumes.
- **Idea discs:** when Phlo detects a theme, the section heading gets a 10px disc in cobalt, saffron or teal, with at most 3 per draft.
- **Publish** shows as a ghost (hairline) button until the draft has at least 3 sections with content.

### 03 Room view (Scribe)

- Turned on by the Partner/Scribe switch, or by ··· → Room view.
- **Scribe rules:** organize only. Use headings, ordering and lists, and remove filler ("um," restarts). Never add facts, ideas, questions, research or rewording beyond grammar. Every line links to its transcript timestamp, which you can see via the ··· menu.
- **Room view:** Sumi theme by default, body 22/34, headings 32/40, max width 860, and no rail, switch or Publish button. Top-left shows the draft title in mono. Top-right shows the `SCRIBE · YOUR WORDS ONLY` label with an 8px vermilion dot while listening. Spotlight is on.
- Esc leaves Room view. Scribe stays on until switched back.

### Typing (a state of the Draft screen: no separate screen, no button)

- Free-typed text that hasn't been organized yet renders in `ink-wet` while it's still yours to shape.
- **It settles when you finish a thought:**
  - **Enter twice** (finishing a paragraph): that paragraph settles.
  - **Moving the caret or clicking elsewhere:** the block you left settles.
  - **⌘↵:** settle now. Shortcut only, nothing on screen.
- **Never move or restyle text while the caret is inside it.** No settling on a timer while someone is mid-sentence.
- Settling uses the same motion as voice: wet → ink, then a glide into the right section. Action items ("talk to 5 couples") go to a **Next** list at the end of the draft.
- The first time someone free-writes, a single mono hint appears below the block: `FINISH THE PARAGRAPH TO SETTLE · ⌘↵ NOW`. It never shows again.

### 04 Sidebar open

- Opened from the rail symbol or ⌘\\. Closes with the same shortcut, `CLOSE` or Esc.
- Sections: **Drafts** (active draft marked with a vermilion dot), **Published · N**, **References · this draft** (link cards and screenshot thumbnails with tab edges), and at the bottom, **Your AI** and the workspace.
- Pasting anywhere (⌘V) with a URL or image adds it to References. Phlo reads it (fetches the page text, or looks at the image) so it can be referred to by voice ("like the Assouline one").

## 4. Visual rules (from the design system)

- **Color:** paper `#f7f7f4`, raised `#ffffff`, hairline `#e4e4df`, ink `#16171a`, muted `#66665f`, ink-wet `#b9b9b2`, vermilion `#e5432a` (voice only), cobalt `#2848d8`, teal `#13a38a`, saffron `#f2b01e`, tab `#5cc9e9`. Sumi (dark) values are in tokens.json.
- **Type:** Geist (title 40/44 at 400, −0.025em; heading 20/28 at 500; body 16/26) and Geist Mono (labels 11/16 at 500, uppercase, +0.08em).
- **Space:** 680px writing column, 48px between sections, 56px above the title block, 200px bottom padding so the dot never covers text.
- **Never:** shadows on cards, gradients, terracotta, bold titles, more than one vermilion element on screen.

## 5. Acceptance checks

1. A new user can go from opening the app to talking in under 5 seconds with zero clicks: open, hold space, talk.
2. While talking, nothing on screen other than the page and the dot changes position.
3. A tangent never lands inside the section being worked on.
4. "Scratch that" never loses text. The old version is in the trail.
5. In Scribe, compare the page against the transcript: zero words or ideas that weren't spoken (filler removal and grammar excepted).
6. Room view is readable from 2 meters on a laptop. Body text is at least 22px.
7. Messy typing settles into the same structure as saying it out loud, with no button pressed, and text never moves under the caret.
8. Light and dark both pass 4.5:1 for all text except `ink-wet`, which is transient by design.
9. With reduced motion on, the color change still happens and the glides are skipped.

## 6. Out of scope for this pass

Published covers, decks and prototypes from Publish, sound design, agents and research, multiplayer, and the Published shelf design. These come next, once the core loop feels like water.

## 7. Build order

1. Tokens and type swap (fastest visible win)
2. Rail + sidebar collapse, renames (Drafts, Published, References)
3. Voice dot + hold space, remove the Talk pill
4. Ink-wet → settle motion (spend the most time here and tune it by feel)
5. Spotlight, tangent tabs, mind-change trail
6. Scribe + Room view
7. Typing settles (paragraph end / caret leaves / ⌘↵)
8. Publish button states
