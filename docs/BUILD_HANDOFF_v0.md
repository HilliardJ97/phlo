# Phlo build handoff

November 18, 2026 · Local desktop prototype

## What Phlo is

Phlo is a local-first workspace for thinking out loud and building a document as your ideas take shape. It started as a way to work through product interviews in real time. The author wanted to write their own framework on a blank page, talk through the problem, and shape the material while staying present in the conversation. The same workflow now applies to business ideas, research, creative planning, and meetings.

The core loop is **talk → add evidence → revise the same page**. Start with an agenda or rough idea, speak naturally, leave to research something, then return with a source and change your mind. In a meeting, the page is the work people can react to while the decision is still open. The transcript is available as a reference. The working document is the thing worth keeping.

The current build runs on one Mac. Bring-your-own AI is part of the app today. A provider-independent editing engine and optional on-device models are longer-term architecture goals.

## See the current product

[Open Phlo](http://127.0.0.1:8765/) on the Mac running its local server. If it is down, double-click [Open Workspace.command](</Users/justy/Code/career-engine/Open Workspace.command>). Leave the launcher’s Terminal window running. The server has no public URL.

These screenshots came from the current app in Chrome using a sample document. They are suitable to share with a designer.

- [Document editor](phlo-current-editor.png)
- [Talk panel](phlo-current-talk.png)
- [Context](phlo-current-context.png)
- [Deliverables list](phlo-current-deliverables.png)
- [Finished document](phlo-current-finished-document.png)
- [AI connection](phlo-current-ai-connection.png)

[Future visual concept](phlo-future-direction.html) is separate from these screens. Its Talk button demonstrates a scripted interaction.

## Current workflows

### Write and format

- Start blank and supply your own structure. The title and outline reflect what you actually write.
- Type `/` or click the slash button beside **On this page**. H1, H2, and H3 appear first. `/h1`, `/h2`, and `/h3` work from the keyboard.
- Highlight a line or right-click it to change its heading level or return it to body text. A recent fix lets this work on lines Chrome nested inside a text block. The resulting heading appears in the outline.
- Highlight text for bold, italic, underline, strikethrough, highlight, font, and text color. Type `:` for searchable emoji. Tab and Shift+Tab change list depth.
- Right-click for notes such as **Mark as question** and pinned annotations. **Present** hides navigation.
- **Context** lives in the left sidebar and holds screenshots and notes scoped to the document.

### Talk

- In desktop Chrome, click **Talk**, allow microphone access, and start speaking. The dock shows listening or processing status. Open **Transcript** to see the raw speech.
- Finalized phrases are batched. Talk organizes notes under relevant headings, fills outline placeholders when it has the information, and treats spoken edit instructions separately from brainstorm content.
- Voice can add, rename, revise, reorder, nest, merge, and park sections. It can also change heading levels and move, replace, or park individual notes or bullets. Explicit commands such as matching two uniquely named headings can take a local route.
- Talk uses the selection, outline, and nearby note targets for context. Structural or destructive changes appear as proposals. Park keeps removed material recoverable. Questions show in dismissible translucent gray side cards, with at most one general clarification visible. Ambiguous passages and live model judgment remain areas to improve.
- You can ask for a prototype or image and respond to a follow-up question before building it. Talk can also open the upload picker for a named section or move an existing image by name.
- Transcription can reconnect after temporary drops. Generation retries preserve finalized speech while the page remains open. Browser speech recognition may use an online service.

### Create, clean, and share

- Create an inline diagram, metric tree, clickable wireframe, summary, or edit from a passage. Use the selection tools or commands such as `/diagram`, `/metrics`, `/wireframe`, `/prototype`, `/summary`, and `/clean`.
- **Clean** can tidy a selected passage or the whole document. Whole-document cleanup can propose a diagram, metric tree, or prototype where the supplied material supports it. If the text changed during generation, Phlo can leave a suggestion instead of replacing the newer writing.
- Wireframes first review requirements and attached screenshots, then generate screens using the app’s supported controls. Navigation, required inputs, search, selection, and completion can be interactive. Real authentication, payments, and submissions are simulated.
- `/image` uploads a local PNG, JPG, or WebP. `/ai-image` requests one Gemini-generated preview from the prompt and section context. Review and insert it explicitly. Image generation needs a Gemini API key.
- Generated items live in the document. **Create deliverable** saves a finished snapshot of the whole page, with the visual versions it contained. Open the snapshot from **Deliverables**. Individual visuals can be refined and exported. Workspace JSON supports backup and import.

## Design direction

The current app has a cream workspace, orange accents and heading styling, and a translucent gray Talk dock. It can read as a blend of Notion and Claude. The desired identity is **modern Japanese design imagined in 2070**. Think cool neutrals, precise modern typography, deliberate spacing, simple geometry, and restrained orange as a signal. The poster and report references inform composition and hierarchy. The earlier print-inspired editorial mockup was rejected.

A page should make its main idea legible quickly and have room for people to go deeper. Use a paragraph for reasoning, a table for comparison, a flowchart for sequence or branching, and a chart when there are real values, units, and a source. Use a question block for the decision that is still open. A clickable prototype earns its place when someone needs to try the interaction. These formats should feel native to the same document.

The proposed manual interface is **Turn into** for changing how existing information is expressed and **Add** for inserting something new. Talk should understand the same intent without making people memorize commands. A useful design test is one session where the author speaks, changes an idea into a flowchart, pastes evidence, and corrects a mistake without losing their place.

## Implementation and testing

| Area | Code |
| --- | --- |
| Editor shell and styles | [product-workspace.html](/Users/justy/Code/career-engine/product-workspace.html) |
| Editing, voice, rendering, and saving | [product-workspace.js](/Users/justy/Code/career-engine/product-workspace.js) |
| Local server, provider calls, schemas, and persistence | [product_workspace.py](/Users/justy/Code/career-engine/career_engine/product_workspace.py) |
| Backend contract tests | [test_product_workspace.py](/Users/justy/Code/career-engine/tests/test_product_workspace.py) |

The stack is browser HTML, CSS, and JavaScript with a Python loopback server. Local saves are validated and atomically written to `work/product-workspace.json`. A stale tab cannot silently overwrite a newer saved version. Undo is currently browser-session history and restores document snapshots. Some Talk commands separately check the targeted section or note before applying. Those checks are useful, but there is no shared transaction engine across all editing paths yet.

Default text generation uses the local Codex connection signed in with ChatGPT. Gemini API is optional and its key is held in server memory. Gemini app subscriptions are separate from API access. Chosen model providers receive the context needed for requests, so local storage alone does not make the full workflow offline. The local server uses origin and token checks for writes. Credentials stay out of workspace exports.

The observed repository suite passed 357 tests. Chrome checks covered formatting and nested headings, Talk command routing, preserving surrounding notes, inline image and prototype persistence, and the main screens. Several checks simulated speech or model results. Live Gemini image generation and the quality of recent Talk judgment changes have not been established by those checks. There is no hosted deployment or simultaneous multi-user editing in this build.

## Roadmap and open decisions

**Current priority is editor configurability.** The larger architecture build is on hold. First make headings, block formats, tables, diagrams, and citations easy to understand and control. Use the Talk workflow as the design test and map projects after the controls are clear.

**Architecture direction for later.** Give voice, keyboard, and agents a shared document engine with stable IDs, targeted conflict checks, provenance for pasted sources, and selective undo. Model responses propose structured edits. The editor validates them and protects newer typing. The research supports a local document authority. Database migration, peer-to-peer sync, and more complex speech or retrieval systems should earn their place with evidence. [Architecture research](</Users/justy/Downloads/phlo_living_document_architecture_principal_systems_recommendation.html>)

First engineering benchmark: paste two studies, say the second changes the recommendation, and type in another section while Phlo thinks. The recommendation and citation should change together, unrelated typing should survive, and undo should reverse the intended edit. If the recommendation or source itself changed mid-request, show a proposal. Track correct edits completed, wrong-target edits, interruptions, and time to the correct change together.

**Explorations.** Agent mentions could delegate a tightly scoped task and bring back a suggestion anchored to the original passage. Personal ChatGPT connectivity is a candidate starting point, with Claude, Grok Bot, and Muse as possible integrations. Shared meetings, live human co-editing, and camera gestures for presentation navigation are ideas at this stage.

**Closest reference products.** [Floatboat Flow Mode](https://floatboat.ai/flow-mode) shows the most direct overlap with live voice and a working document. [Wispr Flow Command Mode](https://docs.wisprflow.ai/articles/4816967992-How-to-use-Command-Mode) is a reference for fast voice edits on selected text. Phlo’s opportunity is making the entire talk, research, and revision loop dependable enough that people return to the same document.
