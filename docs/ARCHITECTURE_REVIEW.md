# Phlo architecture review

November 19, 2026. Is the engine built the way the best AI products are built, is it fast enough, and should we train our own model?

**Short answers:**
- **Shape:** yes. The proposal/apply split matches how the best AI editors work.
- **Bottleneck:** not compute. It's **model calls**: their latency, and on a $20 ChatGPT plan, the usage window.
- **Own model:** no, not now. The design already avoids the reason teams train one, and we have no data yet. Revisit once we have traces.

---

## 1. What Phlo does today

```
words appear wet instantly ──► Settler (one request in flight, folds new words in)
                                   │
                    ┌──────────────┴──────────────┐
             explicit command?                 otherwise
             local rules (<5 ms)        ChatGPT via Codex (your plan)
                                        or Claude (API key), with deadline
                                        → local rules if slow / limited / down
                                   │
                          plan addressed by block id
                                   │
              compilePlan → rev-guarded ops → DocEngine.commit (all or nothing)
                                   │
             stale? rejected, ask again · Scribe? novelty guard · undo: selective
```

## 2. Compared with the best-built AI products

| Pattern | Who does it | Phlo |
|---|---|---|
| **Split plan from apply.** A frontier model decides; a separate fast step applies. | Cursor's [instant apply](https://cursor.com/blog/instant-apply): a chat model plans, a custom fine-tuned 70B model rewrites the file at ~1,000 tok/s with speculative edits. | ✅ Same split, but our apply step is **deterministic code**. The model returns id-addressed ops, not rewritten text, so there's nothing to speed up with a custom model. |
| **AI as a collaborator whose edits are proposals.** | Ink & Switch [Patchwork](https://inkandswitch.com/patchwork/notebook/07): bots edit on branches you accept or reject. | 🟡 Edits are guarded and undoable one by one. A stale plan is retried silently, not yet shown as a proposal. Structural voice edits should arrive as proposals. |
| **The user's notes anchor the model.** | [Granola](https://www.granola.ai/blog/local-first-ai-notetaker-vs-cloud): your typed bullets guide the AI's write-up after the meeting. | ✅ The outline and headings anchor every settle. 🟡 There's no end-of-session quality pass yet (see §5). |
| **One local authority, server only persists.** | Figma, Linear sync engines. | ✅ The engine lives in the app; saves are atomic, version-checked, journaled. |
| **Measure everything, gate on evals.** | Every serious AI team. | 🟡 Built tonight (`evals/`), but not yet run against a real model. |

**Verdict:** the shape is right, and in one way stronger than Cursor's. Because the model proposes structured ops, not prose rewrites, the apply step costs nothing and can't corrupt text. What's missing is mostly measurement and budget control, not architecture.

## 3. Is it fast? Where the time goes

| Step | Cost | Note |
|---|---|---|
| Speech/typing to wet text on screen | ~0 ms | The person sees their words immediately. **This is what makes model latency tolerable.** |
| Engine commit, compile, render | < 5 ms | Measured in tests; not a bottleneck. |
| Local rules | < 5 ms | Explicit commands never wait for a model. |
| Model call through `codex exec` | **Estimated 3–8 s, not measured** | One process per call: start, auth, connect, ~1.5k-token prompt, ~300-token plan at low reasoning. |
| Model call through a warm `codex app-server` | Estimated 1.5–4 s | Saves the process start and keeps the thread's context on the server. |

**What the user feels:** words appear instantly, then settle a moment later. Settling is ambient, not a spinner. Settling within ~2 s feels like water finding its level; 5–8 s starts to feel like the page lagging behind your thinking. Targets:

- **p50 settle ≤ 2 s, p95 ≤ 5 s**, measured from end of utterance to ink. The eval reports p50/p95; the Your AI panel shows live numbers.
- **0 lost words, 0 text moved under the caret.** Already enforced.

## 4. The real constraint: the ChatGPT plan's usage window

Codex on ChatGPT Plus has a rolling 5-hour window, reportedly around **15–160 messages depending on model and task** ([TechRepublic](https://www.techrepublic.com/article/news-openai-five-hour-codex-limit-chatgpt-plus/), [developersdigest](https://www.developersdigest.tech/blog/codex-usage-limits-pricing-2026); third-party estimates, not official numbers).

Rough math: a 30-minute talking session at ~150 words a minute, settling at every pause (~every 15–20 s), is **90–120 model calls**. That's more than the low end of a Plus window in one sitting.

So every model call is budget. Today Phlo:
- sends explicit commands to the local rules,
- folds words that arrive mid-request into one call,
- counts calls in the last 5 hours (shown in Your AI), and
- on a plan-limit error, settles locally for 30 minutes instead of failing.

To get to **≤ 20 model calls per 30-minute session**:
1. **Confidence-gated local placement.** When the local matcher is sure (a strong heading match, an action item, a tangent cue), don't call the model. The meeting scenario shows the local rules are already good at routing into an existing agenda (7/8).
2. **Adaptive batching.** Settle on longer pauses as the window fills: every ~3 utterances instead of every one.
3. **One quality pass per session.** Cheap live placement, then a single higher-effort tidy pass when you stop talking, shown as a proposal you accept. Same idea as Granola's after-meeting pass.
4. **On-device model for routing (later).** See §6.

## 5. Gaps, in priority order

1. **No real-model number yet.** Run `npm run eval -- --chatgpt` on the Mac (about 35 requests). Every prompt or routing change is judged by this score.
2. **Warm Codex.** Swap `codex exec` per call for one `codex app-server` process ([docs](https://developers.openai.com/codex/app-server)): JSON-RPC over stdio, one thread per draft, `outputSchema` per turn. The provider interface stays the same.
3. **Budget-aware cascade:** §4, items 1–3.
4. **Voice restructuring and proposals.** Port rename, move, merge, park and "clarify once" from the prototype (`product-workspace.js:442`); show stale and structural edits as proposals.
5. **Context windowing.** Send headings, the active section and recent blocks, not the whole draft. Fewer tokens is faster and cheaper, and it scales to long drafts.
6. **Traces into goldens.** Log each settle locally (request, plan, latency, whether you undid or moved it). Undo-after-settle is the online quality signal; real sessions become new eval cases.
7. **Prompt-injection hygiene.** Pasted references and transcripts are data, never instructions (the prompts already say so). Keep it that way when references get read.

## 6. The Mac-native path (no API keys at all)

Both on-device pieces need macOS 26 on Apple Silicon. They'd reach Phlo through a small Swift helper the app launches.

- **Speech: Apple SpeechAnalyzer.** On-device and free, with no transcription key. In public tests it was faster than Whisper on long files ([MacStories](https://www.macstories.net/stories/hands-on-how-apples-new-speech-apis-outpace-whisper-for-lightning-fast-transcription/), [MacRumors](https://www.macrumors.com/2025/06/18/apple-transcription-api-faster-than-whisper/)); accuracy reports conflict, and there are no streaming-latency numbers yet. This removes the desktop app's OpenAI-key requirement.
- **Routing: Apple Foundation Models.** On-device LLM with schema-constrained output ([Apple](https://machinelearning.apple.com/research/introducing-apple-foundation-models): ~30 tok/s on an iPhone 15 Pro). Developers report anywhere from ~1 s to 20 s, mostly from schema setup ([forums](https://developer.apple.com/forums/thread/791993)). Good for cheap judgments: which heading, tangent or not, action item or not. Not for rewriting.

**For tomorrow's testing:** run `npm run web` in Chrome. Chrome's speech recognition is free, and with Codex signed in to your ChatGPT plan, nothing needs an API key.

## 7. Train our own model?

**No, not now.**
- **Why teams train one:** Cursor trained a model because its apply step had to rewrite whole files fast. Phlo's apply step is code, so the reason doesn't apply.
- **What Phlo asks of the model:** a small, structured judgment (where does this idea go, how should it read). Frontier models plus a strict schema plus engine checks already cover that.
- **No data:** we have zero labeled sessions. The goldens and traces (§5.6) are how we'd get some.
- **Cost on a $20 plan:** training and hosting a model costs far more than the plan, and adds a deployment problem.

**When to revisit:** after a few hundred real sessions, *if* the eval shows routing quality is fine but latency or the usage window is still the bottleneck. Then the move is to distill: fine-tune a small adapter for the on-device model on accepted settles, so routing is free and instant and ChatGPT only does rewriting. Apple's on-device model is designed to take adapters, so this needs no server.

## 8. What changed tonight

- ChatGPT through Codex is the default provider again, as in the prototype: locked down (read-only, no shell, no web, no user config), schema-constrained, ChatGPT sign-in only (API keys stripped from its environment).
- Plan-limit errors switch to local settling for 30 minutes; calls in the last 5 hours are counted.
- The eval runs against ChatGPT: `npm run eval -- --chatgpt` (or `PHLO_MODEL=… PHLO_REASONING=minimal` to compare).
- The Codex flags were checked against the current CLI (0.170): all parse. Real runs need your sign-in, so the ChatGPT path is untested here.
