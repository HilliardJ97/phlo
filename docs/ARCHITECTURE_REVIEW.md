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

## 4. The ChatGPT plan's usage window (corrected)

An earlier version of this section said a talking session could use up a Plus plan's Codex window. **That was overstated, and Justin's testing contradicts it:** usage didn't climb noticeably with the prototype, which settled through Codex the same way.

Why the estimate was wrong: the published "15–160 messages per 5 hours" figures are third-party estimates, and they describe *coding-agent* messages. One of those is often tens of thousands of tokens over many tool steps. A Phlo settle is one turn: about 1.5k tokens in and 300 out at low reasoning, with no tools. Limits are credit-based, so a settle costs a small fraction of one coding "message".

What stays true and what we do about it:
- **Latency, not quota, is the constraint that matters on ChatGPT.** A process per call is the slow part (§3), so the warm app-server is the fix.
- **Keep the cheap habits anyway.** Commands stay local, words fold into one call, calls are counted in Your AI, and a real limit error switches to local settling for 30 minutes.
- **Measure, don't estimate.** The eval and Your AI now report requests per session. If a long session ever shows a problem, confidence-gated local placement and longer batching are ready to add.

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

## 6b. Open-source models

**Yes, and they fit Phlo unusually well**, because Phlo's hardest-to-scale job (deciding where words go) is a small, structured choice, not long-form writing. Built: any OpenAI-compatible endpoint works as a provider (`src/host/ai/compat.ts`), including Ollama and LM Studio on your Mac, llama.cpp or MLX servers, and hosted open models on OpenRouter, Groq or Together.

**What makes it work (and what would sink it):**

| Factor | Reality | What Phlo does |
|---|---|---|
| **Output tokens dominate local speed** | On a laptop, prompt processing is fast and generation is slow. A plan that rewrites every sentence (~300 tokens) can take several seconds; a plan with only ids and labels (~30 tokens) is a fraction of that. | **Route mode** (built): the open model only decides placement; Phlo cleans the words with its own rules. Rewriting (splits, mind changes) still asks the model for text. |
| **Prompt prefix reuse** | Local servers can reuse cached work for an unchanged prompt prefix. | The prompt puts the fixed instructions and the outline first and the new words last, so only the new words are processed fresh. Keep the model loaded (`OLLAMA_KEEP_ALIVE=1h`). |
| **Structured output** | Ollama, LM Studio and llama.cpp support JSON-schema-constrained output; small models still slip sometimes. | A strict `json_schema` request, zod validation, one repair turn, `<think>` and fence stripping, then the local fallback. Tested against a fake server. |
| **The Mac** | Justin's machine is a MacBook Air: fanless, so long sessions throttle, and RAM caps model size. A 4–8B model (≈3–6 GB at 4-bit) is realistic; 20B+ needs 24 GB+ and runs warm. | Recommend starting with a 4B–8B instruct model. The eval tells us whether it's good enough. |
| **Quality** | Small open models are weaker at nuanced judgment and rewriting, and fine at classification. | Use them for **routing**, and keep ChatGPT for **forming** (structure from nothing, Turn into, agents). This is the per-job model choice in EXPRESSION_FOUNDATION §6.2. |
| **Distribution** | Bundling a multi-GB model makes the app huge. | Don't bundle. Detect Ollama or LM Studio and use them; later, a one-click "download a model" in Your AI. |
| **Licenses** | Vary (Apache 2.0 for Qwen and gpt-oss; custom terms for Llama and Gemma). | Fine for personal use. Check before shipping a model inside the app. |

**Candidates to evaluate** (check current versions before choosing): Qwen3 4B / 8B, Gemma 3 4B / 12B, Llama 3.x 8B, gpt-oss-20b (needs more RAM), Mistral Small. Run each through the goldens in route mode and keep the best score per second.

**The architecture this points to: a cascade by job.**
```
explicit command ─► local rules            (<5 ms)
where does it go ─► open model on the Mac  (route mode, small output)
how should it read / new structure / Turn into / agents ─► ChatGPT (or any frontier model)
anything slow or failing ─► local rules, words stay safe
```
Each job gets the cheapest model that passes its goldens. Privacy improves too: in route mode, most of a meeting never leaves the Mac.

## 7. Train our own model?

**No, not now.**
- **Why teams train one:** Cursor trained a model because its apply step had to rewrite whole files fast. Phlo's apply step is code, so the reason doesn't apply.
- **What Phlo asks of the model:** a small, structured judgment (where does this idea go, how should it read). Frontier models plus a strict schema plus engine checks already cover that.
- **No data:** we have zero labeled sessions. The goldens and traces (§5.6) are how we'd get some.
- **Cost on a $20 plan:** training and hosting a model costs far more than the plan, and adds a deployment problem.

**When to revisit:** after a few hundred real sessions, *if* the eval shows routing is the weak or slow link. Open models make this realistic in a way it wasn't for Cursor: **fine-tune a small LoRA adapter on an open 4–8B model** with the accepted and undone settles from traces, on the Mac itself (MLX) or for a few dollars of rented GPU time. That's "our own model" at hobby-project cost: a router trained on exactly how you organize, running free and offline. Apple's on-device model also accepts adapters.

## 8. What changed tonight

- ChatGPT through Codex is the default provider again, as in the prototype: locked down (read-only, no shell, no web, no user config), schema-constrained, ChatGPT sign-in only (API keys stripped from its environment).
- Plan-limit errors switch to local settling for 30 minutes; calls in the last 5 hours are counted.
- Any OpenAI-compatible model (open models via Ollama, LM Studio, OpenRouter…) with route mode: `PHLO_MODEL=qwen3:8b npm run eval -- --open`.
- The eval runs against ChatGPT: `npm run eval -- --chatgpt` (or `PHLO_MODEL=… PHLO_REASONING=minimal` to compare).
- The Codex flags were checked against the current CLI (0.170): all parse. Real runs need your sign-in, so the ChatGPT path is untested here.
