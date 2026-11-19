# Phlo: the expression foundation

What a Phlo page can become, how ideas move between forms, how agents work on a page, and which tools and models it can use. The design source for every block, agent, connector and model choice that comes next.

> **Principle.** Phlo separates **what you mean** from **how it's shown.** Every idea is stored once as structured meaning (items, values, relations, sources) and drawn by whichever form makes it easiest to understand. "Turn into" changes the form, never the meaning. That's what lets one idea be a paragraph in a draft, a flowchart in Room view and a slide when published, without retyping.

---

## 1. The block model

Every block is the same shape. This is the one engineering decision everything below rests on.

```
Block
  id, rev, origin (typed | voice | phlo | agent:<name>)    ← already in the engine
  kind      what form it takes: paragraph, table, flow, chart, decision…
  data      the meaning, validated by a schema for that kind
  view      display options for the form (columns, emphasis, layout)
  sources   transcript segments, references, agent runs it came from
  state     wet | settled | proposed (an agent or Phlo suggestion not yet accepted)
```

- **Models produce `data`, never HTML or code.** A renderer for each kind draws it from tokens. A model can't break the page's look or run code, and a new model works on day one.
- **Turn into = a data mapping.** Lists, tables, flows, trees and charts mostly share one shape underneath: *items with attributes and relations*. A bulleted list → table → flowchart conversion is deterministic when the structure exists, and a model call only when it has to infer it ("these steps branch here").
- **Proposed is a first-class state.** Agent work, structural changes and form suggestions arrive as proposed blocks or ghost previews: visible, attributed and reversible. Accept merges them through the same guarded transaction as everything else.

---

## 2. The catalog

Grouped by the job the form does, not by widget. ★ marks the foundation set (§7).

### 2.1 Words
| Form | Use it for |
|---|---|
| ★ Paragraph | Reasoning. The default. |
| ★ Heading (levels 1–3) + mono section label (`01 · MISSION`) | Structure. Numbering is automatic and stays correct as sections move. |
| ★ Bulleted / numbered / checklist | Parallel points, ordered steps, things to do. Numbering styles: 1. · a. · i. · `01` |
| ★ Callout / text box | Something the reader must not miss. Raised paper, hairline, mono label (`NOTE`, `WARNING`, `KEY IDEA`). |
| ★ Key idea | One sentence pulled out large. Phlo-made ones carry the tab color. |
| Pull quote | A line from the transcript or a source, attributed. |
| Definition | Term → meaning. A glossary builds itself from them. |
| Toggle | Detail people can open. Keeps the main idea legible (*show the idea, not the information*). |
| Footnote / citation | Small reference marks that open the source. |
| Inline | bold · italic · highlight · link · @mention (person, agent, draft) · #tag · date · inline math · code |

### 2.2 Thinking: Phlo's signature forms
These are what make Phlo different from a document editor. They model thinking, not formatting.

| Form | Structure | Why it matters |
|---|---|---|
| ★ **Question** | The open question · why it matters · who decides · by when | The decision that's still open. Pinned in the margin until answered. |
| ★ **Decision** | Chosen · why · alternatives considered · decided by/when | Turns a debate into a record. A question becomes a decision when it's answered. |
| ★ **Idea** | The idea · maturity (spark → shaped → tested) · related | Ideas grow across sessions instead of being lost. |
| ★ **Assumption** | Belief · confidence · how we'd test it | Makes the risky beliefs visible. |
| **Hypothesis + evidence** | Claim · evidence for · evidence against · confidence | Where the "paste two studies" loop lands. New evidence attaches to a claim and can flip it. |
| ★ **Options / pros and cons** | 2–5 options × pros, cons, cost | Comparing without a table's weight. Turns into a table or 2×2. |
| **Tradeoff** | X vs Y, what each costs | A two-column compare with one sentence on why. |
| **Risk** | Risk · likelihood · impact · mitigation | Turns into a heat matrix. |
| ★ **Next** | Action · owner · due · status | Already built as the Next list. Syncs to Todoist or Linear (§5). |
| **Tangent** | The aside, kept in the margin | Already built. |
| **Trail** | Earlier versions of a line | Already built. Changing your mind is first-class. |

### 2.3 Compare
| Form | Use it for |
|---|---|
| ★ **Table** | Real comparison: rows × attributes. Sortable, with a total row. Phlo fills cells from speech: "for Notion, price is ten dollars". |
| ★ **2×2 matrix** | Impact vs effort, value vs risk, urgency vs importance. Items are dots you can drag. |
| Scorecard | Options scored on weighted criteria, with the totals shown. |
| Feature compare | ✓ / ✗ / partial grid against competitors. |
| Before / after | Two columns: today vs target (the spec's "Today → Change to" table). |

### 2.4 Sequence and flow
| Form | Use it for |
|---|---|
| ★ **Flowchart** | Branching: decisions and paths. |
| ★ **Steps / journey** | A linear sequence with stages, feelings and pain points per step (the user journey). |
| ★ **Timeline / roadmap** | Dates or phases: now / next / later, or quarters. |
| Swimlane | Who does what, in what order, across roles. |
| Funnel | Stages with drop-off. A chart if there are real numbers. |
| State diagram | Statuses and the transitions between them. |
| Cycle | A loop: flywheel, feedback loop. |

### 2.5 Hierarchy and relationships
| Form | Use it for |
|---|---|
| ★ **Tree** | True hierarchy: org, taxonomy, issue tree (MECE breakdown for interviews). |
| ★ **Metric tree** | North Star → drivers → inputs, with guardrails as a separate branch. From the prototype. |
| Mind map | Free association around a center. A good first form for the blank page. |
| Concept map | Nodes with labeled relations ("causes", "blocks", "depends on"). |
| Venn | Overlap between 2–3 groups. |
| Layer stack | Architecture or capability layers. |
| System diagram | Boxes and arrows with data flow (the README's architecture diagram as a real block). |

### 2.6 Charts (only with real values, units and a source)
The rule from the original direction stays: **a chart needs real numbers, units and a source.** Without them, Phlo offers a table or a sketch and puts the missing data in a Question. Charts use only the idea colors (cobalt, teal, saffron), one series highlighted and the rest in ink.

| Chart | Data shape | Use |
|---|---|---|
| ★ **Stat / big number** | value · unit · delta · source | One number that matters. The slide favorite. |
| ★ **Bar** (+ grouped, stacked) | category × value | Compare amounts. The default chart. |
| ★ **Line** (+ area) | time × value | Trends. |
| Sparkline | short series | Inline in a sentence or table cell. |
| Scatter / bubble | x × y (× size) | Relationships, outliers, segments. |
| Histogram / distribution | values | Spread, not just the average. |
| Waterfall | start → changes → end | What moved a number (revenue bridge). |
| Funnel chart | stage × count | Conversion with real drop-off. |
| Cohort heatmap | cohort × period | Retention. |
| Sankey | flows between states | Where users or money go. |
| Map | region × value | Only when geography is the point. |
| Slope | two points per item | Before/after per item. |

Never: 3D charts, pie charts with more than 3 slices, dual axes, gauges, decorative dashboards.

### 2.7 Space and layout
| Form | Use it for |
|---|---|
| ★ **Columns (2–3)** | Side by side: compare, before/after, text + image. On narrow screens they stack. |
| ★ **Cards grid** | A set of peers (personas, options, competitors) as cards. |
| Divider / section break | A pause. In Room view and Publish, a slide break. |
| Margin notes | Already have Tabs. Add pins: notes attached to a word or a point on an image. |
| Frame | A bounded area on a canvas (see 2.8) that becomes a slide when published. |

### 2.8 Visual and canvas: patterns from design and 3D collaboration tools
Borrowed from Figma, FigJam, Miro, Spline and 3D review tools, but only where it serves thinking:

| Pattern | In Phlo |
|---|---|
| ★ **Image / screenshot with pins** | Numbered pins on an image, each with a note (critique, "this is the wall"). From the prototype's references. |
| **Infinite canvas region** | A block that opens into a canvas: sticky notes, arrows, frames. For when a line of text is the wrong shape. |
| **Sticky clustering (affinity map)** | Say ten ideas, then "group these". Phlo clusters them into themes, and the themes become sections. |
| **Dot voting** | In Room view, people vote on options. Results become a ranked list. |
| **Frames → slides** | Any frame or section publishes as a slide. |
| **Components and variants** | A persona card or option card defined once, reused, kept consistent. |
| **Comments pinned to coordinates** | On images, canvases and 3D views. |
| **Presence, follow and spotlight** | Room view already spotlights. Multiplayer adds cursors and "follow the speaker". |
| **Branches and versions** | Try an alternative structure without losing the current one (Patchwork-style). Agents always work on a branch. |
| **3D / model viewer** | A glTF model with saved viewpoints and pinned notes. For product and hardware people. Later. |
| ★ **Clickable prototype** | Screens, fields, actions, a happy path. From the prototype, rebuilt on tokens. |
| Sketch | Freehand on a canvas or image. Later. |

### 2.9 Slide patterns: what Publish → deck uses
A deck is the same blocks laid out one idea per screen. These layouts should exist so Publish can pick the right one from the block's kind:

Title · Agenda · Section divider (big mono `02`) · **One big idea** (display type) · **Big number** · Quote · Three-up (3 cards) · Before / after · Two-column compare · Chart + takeaway headline · Timeline · Diagram full-bleed · Question to the room · Next steps with owners · Appendix.

The slide rule Phlo enforces: **the headline states the takeaway, not the topic** ("Retention drops after week 2", not "Retention"). Every slide has speaker notes from the transcript.

---

## 3. How people get forms: Talk, Turn into, Add

Three ways in, one intent model:

| Way | Example |
|---|---|
| **Talk** | "Make that a flowchart." · "Compare Notion, Granola and Phlo on price and privacy." · "That's a decision: we're going with usage pricing." |
| **Turn into** (select → menu) | Paragraph ↔ list ↔ table ↔ flow ↔ chart. Only forms the data supports are shown, each with a live preview. |
| **Add** (`/` or the `+` in the rail) | Insert any block empty, or seeded from the current section. |
| **Phlo suggests** (Partner) | "This reads like a sequence. Flowchart?" A quiet ghost preview in the margin; one click accepts. Never more than one at a time. |

### Clarify and approve: what the prototype did, made a principle
- **Small and reversible → just do it** (place a line, fix grammar). Undo is always there.
- **Structural or destructive → propose** (merge sections, convert a section to a table, remove anything). Show a ghost preview with the exact target named; accept or dismiss.
- **Ambiguous in a way that changes the result → ask once.** One short question in the margin (`PHLO ASKS · Which "pricing": the section or the table?`). Never ask permission just because wording was informal.
- **Scribe:** proposals and questions go to the person only, never to the room's screen.

---

## 4. Agents

### 4.1 Tagged agents: you delegate
Type or say `@` + an agent on any block, the way you'd mention a colleague. The agent works in the background **on a branch**, and its result comes back as a **proposal anchored to that block**, marked with the tab color and its name. Nothing it does touches the page until you accept it.

| Agent | Does | Returns |
|---|---|---|
| **@research** | Finds and reads sources on the claim | Evidence cards with citations, attached to the claim (for or against) |
| **@analyst** | Pulls numbers from a connected source or a pasted file, runs the math | A table or chart with units and source, plus the method |
| **@critic** | Steelmans the other side; finds weak assumptions and gaps | Questions and assumptions in the margin |
| **@designer** | Turns a section into a visual: flow, wireframe, prototype | A proposed visual block |
| **@editor** | Tightens a section to the house style without changing meaning | A suggested edit with a diff |
| **@interviewer** | Preps or runs a mock interview on the draft (product sense, case) | Questions, then feedback on your answers |
| **@scout** | Watches a topic or competitor over time (connectors, web) | A dated update card when something changes |
| **@builder** | Produces the published artifact: deck, one-pager, prototype | A Published piece |

### 4.2 Phlo spins up agents itself (Partner only)
When Phlo notices work it could do for you, it **offers** it, quietly, never runs it unasked:
- An unverified number → "Check this with @research?"
- A comparison with no data → "Fill the table from the three sites you pasted?"
- A stall on a decision → "Have @critic argue the other option?"

Accepting starts the agent. A small **Agents** strip in the margin shows what's running, what it costs, and what came back.

### 4.3 Rules agents follow
1. **Proposals only.** Agents never write to the page directly; everything merges through the guarded engine.
2. **Cited or it doesn't ship.** A claim from an agent links to its source or is marked unverified.
3. **Scoped access.** Each agent gets only the connectors you grant, read-only by default. Writing outside Phlo (sending email, filing a ticket) always asks first.
4. **Budgeted.** Each run shows its model and cost or usage, and stops at a cap.
5. **Off in Scribe.** In Scribe, agents can work for you privately but nothing appears on the room's screen.
6. **Pasted content is data.** Instructions inside a pasted page or email are never followed.

### 4.4 How it's built
An agent run = `{agent, anchor block id, instructions, granted connectors, model, budget}` → runs off the main loop in a worker → returns `proposed` blocks plus a trace. Same proposal → accept → guarded-commit path as settling. Agents can use the model of your choice (§6), and connectors arrive through MCP (§5).

---

## 5. Data connectors

All through **MCP**, the standard most tools now speak, so any connector you already use in Claude or ChatGPT can plug in. Read-only by default; writes ask first.

| Job | Connectors | What they make possible |
|---|---|---|
| **Meetings** | Google / Apple Calendar, Zoom, Google Meet, Granola | A draft opens with the meeting's attendees and agenda already in place. Next items go back to invitees. |
| **Your knowledge** | Google Drive / Docs, Notion, Apple Notes, Dropbox, Obsidian | "Like the Assouline doc": pull a prior draft or doc in as a reference. |
| **Conversations** | Gmail, Slack | Pull a thread in as evidence; draft the follow-up (asks before sending). |
| **Work tracking** | Linear, Jira, GitHub, Asana, Todoist | Next items become tickets or tasks, and status flows back. |
| **Design** | Figma | Frames as references; publish a prototype; pins on frames. |
| **Product data** | Amplitude, Mixpanel, PostHog, Google Analytics | @analyst draws real charts: funnels, retention, with units and source. |
| **Business data** | Stripe, HubSpot / Salesforce, Airtable, Google Sheets, a CSV | Revenue bridges, pipeline tables, scorecards from real rows. |
| **Research** | Web search and fetch, arXiv / Semantic Scholar, Zotero | @research evidence with citations. |
| **Media** | YouTube / podcast transcripts, PDF | Reference by voice: "the part where she talks about churn". |

**First three to build:** Calendar (sets up meetings), web search/fetch (makes @research real), and Google Drive or Notion (your existing thinking).

---

## 6. Bring your own model: any model

Phlo is model-agnostic by design: models produce schema-validated data, and the engine applies it. So **any model that can return structured output can power Phlo**, and the picker should say how good each one is *at Phlo*.

### 6.1 Providers
| Provider | How | Cost to you |
|---|---|---|
| **ChatGPT** (built) | Codex CLI signed in with your plan | Your subscription |
| **Claude** (built) | API key | Per use |
| **Gemini** | API key (the prototype had it) | Per use |
| **Any OpenAI-compatible endpoint** | Base URL + key: OpenRouter (hundreds of models), Groq, Together, Mistral, DeepSeek… | Per use |
| **Local models** | Ollama or LM Studio on your Mac (OpenAI-compatible) | Free, private, offline |
| **Apple on-device** | Foundation Models (macOS 26) | Free, private, instant routing |

### 6.2 Pick a model per job, not one for everything
| Job | Needs | Sensible default |
|---|---|---|
| **Route** (where does this go?) | Fast, cheap, many calls | On-device or a small fast model |
| **Write** (clean speech, revise) | Faithful wording | Your main model (ChatGPT) |
| **Form** (turn into a table or flow) | Structure, reasoning | Your main model |
| **Agents** | Tools, long context, reasoning | Your strongest model |
| **Images** | An image model | Gemini or OpenAI image models |

### 6.3 Every model is measured on Phlo's own evals
The model picker shows, for each model you connect: **eval score, p50 speed, and cost or usage per session.** For example: `ChatGPT (plan) · 31/34 · 2.1s · ~18 requests/session`. When you connect a new model, Phlo runs the goldens once and tells you how it does. No other tool does this, and it turns "bring your own model" from a settings page into an informed choice.

---

## 7. What to build first

The foundation set (★) chosen for the three jobs Phlo serves now:

| Job | Forms that matter most |
|---|---|
| **Framer** (interview, client call) | Heading + numbering, table, 2×2, tree (issue tree), metric tree, flowchart, question, decision, stat |
| **Explorer** (business idea, research) | Idea, assumption, options / pros and cons, hypothesis + evidence, timeline, mind map, references with pins |
| **Meeting** | Decision, Next with owners, table, callout, timeline |

**Order:**
1. **Block model with data, view and state** (§1) + Turn into for list ↔ table ↔ numbered steps. Unlocks everything else.
2. **Thinking forms:** question, decision, idea, assumption, options. Mostly text with structure; fast to build; most differentiating.
3. **Table and 2×2**, filled by voice.
4. **Flowchart, tree, metric tree, timeline**: one diagram renderer with several layouts.
5. **Charts:** stat, bar, line, with the "real numbers, units, source" rule enforced.
6. **Columns, callouts, cards.**
7. **Proposals and clarify** as the universal mechanism (§3), then the **agents** that use it (§4): @research and @critic first.
8. **Connectors:** Calendar, web, Drive or Notion.
9. **Providers:** OpenAI-compatible (covers OpenRouter and local models) + the per-model eval scores.
10. **Publish to deck** using the slide patterns (§2.9). **Canvas, prototype and pins** after that.

## 8. Decisions for Justin
1. **Thinking forms vs formatting:** should Question, Decision, Idea and Assumption be the hero of the Add menu, ahead of tables and charts? (Recommended: yes. They're Phlo's identity.)
2. **Agents by default:** offered by Phlo in Partner (recommended), or only when you @-tag them?
3. **First connector:** Calendar, Notion, or Google Drive?
4. **Canvas:** a block inside the page (recommended: keeps one place to think), or a separate canvas view?
