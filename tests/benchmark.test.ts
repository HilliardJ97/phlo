/**
 * The first engineering benchmark from the build handoff:
 *
 *   Paste two studies, say the second changes the recommendation, and type in
 *   another section while Phlo thinks. The recommendation and citation should
 *   change together, unrelated typing should survive, and undo should reverse
 *   the intended edit. If the recommendation itself changed mid-request, the
 *   stale plan must not land.
 *
 * The model is a scripted provider with real latency, run through the real
 * orchestrator, compiler and engine.
 */
import { describe, expect, it } from "vitest";
import { DocEngine } from "../src/engine/engine";
import type { Block } from "../src/engine/model";
import { emptyDraft } from "../src/engine/model";
import { buildRequest, compilePlan, type SettlePlan, type SettleRequest } from "../src/engine/settle";
import { Orchestrator } from "../src/host/ai/orchestrator";
import type { SettleProvider } from "../src/host/ai/provider";

const b = (id: string, kind: Block["kind"], text: string, wet = false, origin: Block["origin"] = "typed"): Block => ({ id, kind, text, wet, rev: 0, origin });

function setup() {
  const e = new DocEngine(emptyDraft("bench"));
  e.commit({
    id: "seed",
    actor: "user",
    label: "seed",
    ops: [
      { t: "insert", block: b("h_ev", "heading", "Evidence"), after: null },
      { t: "insert", block: b("s1", "paragraph", "Study A (n=40): voice-first users finished interviews 20% faster."), after: "h_ev" },
      { t: "insert", block: b("s2", "paragraph", "Study B (n=400): typing-first users made 3x fewer wrong edits."), after: "s1" },
      { t: "insert", block: b("h_rec", "heading", "Recommendation"), after: "s2" },
      { t: "insert", block: b("rec", "paragraph", "Ship voice-first (Study A)."), after: "h_rec" },
      { t: "insert", block: b("h_open", "heading", "Open questions"), after: "rec" },
      { t: "insert", block: b("q1", "question", "Who is the first user?"), after: "h_open" },
      { t: "insert", block: b("w1", "paragraph", "actually the second study changes it, recommend typing first and cite study B", true, "voice"), after: "q1" },
    ],
  });
  return e;
}

class ScriptedProvider implements SettleProvider {
  readonly name = "scripted";
  readonly model = "scripted";
  calls = 0;
  constructor(
    private delayMs: number,
    private plan: (req: SettleRequest) => SettlePlan,
  ) {}
  available() {
    return true;
  }
  async ask() {
    return null;
  }
  async settle(req: SettleRequest, { signal }: { signal: AbortSignal }) {
    this.calls++;
    await new Promise<void>((res, rej) => {
      const t = setTimeout(res, this.delayMs);
      signal.addEventListener("abort", () => {
        clearTimeout(t);
        rej(new Error(String(signal.reason)));
      });
    });
    return this.plan(req);
  }
}

const changeRecommendation = (req: SettleRequest): SettlePlan => ({
  title: null,
  new_headings: [],
  placements: [],
  revisions: [{ block_id: "rec", text: "Ship typing-first (Study B, n=400)." }],
  consumed: [req.wet[0].id],
  structure: [],
  question: null,
});

describe("benchmark: evidence changes the recommendation while you type elsewhere", () => {
  it("recommendation + citation change together, unrelated typing survives, undo is selective", async () => {
    const e = setup();
    const orch = new Orchestrator(new ScriptedProvider(60, changeRecommendation));
    const req = buildRequest(e.snapshot(), ["w1"], { currentHeadingId: "h_rec", recent: ["rec"] });
    const t0 = performance.now();
    const pending = orch.settle(req);

    // While Phlo thinks, the user types in a different section.
    e.commit({ id: "typing", actor: "user", label: "Typing", ops: [{ t: "update", id: "q1", patch: { text: "Who is the first user? Probably PMs." } }] });

    const res = await pending;
    const c = compilePlan(e.state, req, res.plan);
    const out = e.commit({ id: "settle", actor: "phlo", label: "Settle", ops: c.ops });
    const ms = performance.now() - t0;

    expect(res.route).toBe("model");
    expect(out.ok).toBe(true);
    // Recommendation and citation changed together, in one block.
    expect(e.block("rec")!.text).toBe("Ship typing-first (Study B, n=400).");
    expect(e.block("rec")!.trail).toEqual(["Ship voice-first (Study A)."]);
    // Unrelated typing survived.
    expect(e.block("q1")!.text).toBe("Who is the first user? Probably PMs.");
    // The spoken instruction was consumed (parked, recoverable), not left on the page.
    expect(e.block("w1")).toBeUndefined();
    expect(e.state.parked.map((x) => x.id)).toContain("w1");

    // Undo reverses exactly the intended edit.
    expect(e.undo("settle")?.ok).toBe(true);
    expect(e.block("rec")!.text).toBe("Ship voice-first (Study A).");
    expect(e.block("q1")!.text).toBe("Who is the first user? Probably PMs.");
    expect(e.block("w1")?.wet).toBe(true);

    // Report the benchmark metrics.
    console.info(`[benchmark] correct=1 wrongTarget=0 interruptions=0 timeToCorrectMs=${Math.round(ms)}`);
  });

  it("if the recommendation itself changed mid-request, the stale plan does not land", async () => {
    const e = setup();
    const orch = new Orchestrator(new ScriptedProvider(40, changeRecommendation));
    const req = buildRequest(e.snapshot(), ["w1"], { currentHeadingId: "h_rec", recent: ["rec"] });
    const pending = orch.settle(req);
    e.commit({ id: "edit-rec", actor: "user", label: "Typing", ops: [{ t: "update", id: "rec", patch: { text: "Ship both, behind a flag." } }] });
    const res = await pending;
    const out = e.commit({ id: "settle", actor: "phlo", label: "Settle", ops: compilePlan(e.state, req, res.plan).ops });
    expect(out.ok).toBe(false);
    expect(e.block("rec")!.text).toBe("Ship both, behind a flag.");
    expect(e.block("w1")!.wet).toBe(true); // still waiting: re-asked with the newer text
  });

  it("a slow model falls back to the local route within the deadline", async () => {
    const e = setup();
    const orch = new Orchestrator(new ScriptedProvider(5000, changeRecommendation), { deadlineMs: 80 });
    const req = buildRequest(e.snapshot(), ["w1"], { currentHeadingId: "h_rec", recent: ["rec"] });
    const t0 = performance.now();
    const res = await orch.settle(req);
    expect(res.route).toBe("fallback");
    expect(performance.now() - t0).toBeLessThan(400);
    expect(e.commit({ id: "s", actor: "phlo", label: "Settle", ops: compilePlan(e.state, req, res.plan).ops }).ok).toBe(true);
  });

  it("explicit commands never wait for a model", async () => {
    const e = setup();
    const p = new ScriptedProvider(5000, changeRecommendation);
    const orch = new Orchestrator(p);
    e.commit({ id: "w2", actor: "voice", label: "Speech", ops: [{ t: "update", id: "w1", patch: { text: "under open questions: what does it cost" } }] });
    const req = buildRequest(e.snapshot(), ["w1"], { currentHeadingId: null, recent: [] });
    const res = await orch.settle(req);
    expect(res.route).toBe("local");
    expect(p.calls).toBe(0);
    e.commit({ id: "s", actor: "phlo", label: "Settle", ops: compilePlan(e.state, req, res.plan).ops });
    const ids = e.state.blocks.map((x) => x.id);
    expect(ids.indexOf("w1")).toBe(ids.indexOf("q1") + 1);
    expect(e.block("w1")!.kind).toBe("question");
  });

  it("scribe guard holds even when the model invents words", async () => {
    const e = setup();
    e.commit({ id: "role", actor: "user", label: "Scribe", ops: [{ t: "meta", patch: { role: "scribe" } }] });
    const orch = new Orchestrator(
      new ScriptedProvider(10, (req) => ({
        title: null,
        new_headings: [],
        placements: [{ wet_id: req.wet[0].id, under: "h_rec", kind: "paragraph", text: "Our analysis strongly favors a phased enterprise rollout.", tangent: false }],
        revisions: [],
        consumed: [],
        structure: [],
        question: "Have you considered pricing?",
      })),
    );
    const req = buildRequest(e.snapshot(), ["w1"], { currentHeadingId: null, recent: [] });
    const res = await orch.settle(req);
    expect(res.plan.question).toBeNull();
    expect(res.plan.placements[0].text.toLowerCase()).toContain("second study changes it");
  });
});
